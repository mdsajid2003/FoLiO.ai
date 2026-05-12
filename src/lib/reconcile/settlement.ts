import { AmazonTransactionMetrics, SellerOrderRow, SkuProfit, MonthlyTrend } from '../../types/index.ts';
import {
  isSaleRowForCogs,
  sumLineProfit,
  sumLineTotalRevenue,
  usesLineProfit,
  usesLineTotalFees,
  usesLineTotalRevenue,
} from './seller-dataset-basis.ts';

/**
 * Returns total COGS for a row.
 * - Uses `totalCost` directly (already quantity-adjusted) when present.
 * - Falls back to `costPrice × quantity` for per-unit prices.
 */
export function getRowCogs(row: SellerOrderRow): number {
  if (row.totalCost != null && row.totalCost > 0) return row.totalCost;
  if (row.costPrice != null && row.costPrice > 0) return row.costPrice * Math.max(1, row.quantity);
  return 0;
}

/**
 * Dashboard totals from Amazon flat transaction settlement aggregates
 * (Σ TransactionAmount for Capture, Σ TotalTransactionFee, Σ NetTransactionAmount, etc.)
 */
export function computeTotalsFromAmazonTransactionMetrics(m: AmazonTransactionMetrics): {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  expectedPayout: number;
  actualPayout: number;
  payoutDiff: number;
} {
  const totalRevenue = m.totalCaptureTransactionAmount;
  const refundExpense =
    m.totalRefundTransactionAmount <= 0 ? -m.totalRefundTransactionAmount : m.totalRefundTransactionAmount;
  const chargeExpense =
    m.totalChargebackTransactionAmount <= 0 ? -m.totalChargebackTransactionAmount : m.totalChargebackTransactionAmount;
  const adjPositive = Math.max(0, m.totalAdjustmentTransactionAmount);
  // Positive adjustments = Amazon reimbursing the seller (e.g. lost inventory credits).
  // They REDUCE net expenses, not increase them. Subtracting here ensures expectedPayout
  // aligns with netSettlementTotal when there are no reserves or undisclosed deductions.
  const totalExpenses = m.totalTransactionFees + refundExpense + chargeExpense - adjPositive;
  const netProfit = m.netSettlementTotal;
  // expectedPayout: what should have been paid out (revenue minus all costs)
  const expectedPayout = totalRevenue - totalExpenses;
  // actualPayout: what Amazon actually transferred (netSettlementTotal, excluding reserves/carryovers)
  const actualPayout = netProfit;
  // payoutDiff: non-zero when expected and actual diverge (e.g. reserves, undisclosed deductions)
  const payoutDiff = expectedPayout - actualPayout;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    expectedPayout: Math.round(expectedPayout * 100) / 100,
    actualPayout: Math.round(actualPayout * 100) / 100,
    payoutDiff: Math.round(payoutDiff * 100) / 100,
  };
}

/** Deferred / reserve rows: excluded from cash settlement totals — not yet paid out */
export function computeDeferredAmount(rows: SellerOrderRow[]): number {
  return Math.round(
    rows.filter(r => r.isDeferred === true).reduce((s, r) => s + Math.max(0, r.settlement), 0) * 100,
  ) / 100;
}

export function computeTotals(rows: SellerOrderRow[]): {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  expectedPayout: number;
  actualPayout: number;
  payoutDiff: number;
} {
  let totalRevenue = 0;
  let totalExpenses = 0;

  if (usesLineTotalRevenue(rows)) {
    totalRevenue = sumLineTotalRevenue(rows);
    for (const row of rows) {
      if (row.isDeferred === true) continue;
      const feePart =
        row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);
      if (usesLineTotalFees(rows)) {
        totalExpenses += row.datasetTotalFees ?? 0;
      } else {
        totalExpenses += feePart;
      }
      if (row.returnAmount > 0) totalExpenses += row.returnAmount;
      if (isSaleRowForCogs(row)) {
        totalExpenses += getRowCogs(row);
      }
    }
  } else {
    for (const row of rows) {
      // Cash layer: exclude deferred / reserve — not yet credited to bank
      if (row.isDeferred === true) continue;

      const feePart =
        row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);

      // BUG FIX #2: settlement = NET payout (gross minus all fees already deducted by Amazon).
      // totalRevenue must be GROSS sale price = settlement + fees, not just settlement.
      // Using settlement alone caused fees to be double-deducted (once here, once in totalExpenses).
      if (row.settlement > 0) {
        totalRevenue += row.settlement + feePart;
      }
      totalExpenses += feePart;
      if (row.returnAmount > 0) totalExpenses += row.returnAmount;
      // Include COGS so netProfit matches computeSkuProfitability and monthly trends.
      // COGS and returnAmount are independent: a partial-return row (settlement > 0,
      // returnAmount > 0) incurred both — skipping COGS would understate expenses.
      if (row.settlement > 0) {
        totalExpenses += getRowCogs(row);
      }
    }
  }

  const netProfit = usesLineProfit(rows)
    ? Math.round(sumLineProfit(rows) * 100) / 100
    : Math.round((totalRevenue - totalExpenses) * 100) / 100;

  const expectedPayout = Math.round((totalRevenue - totalExpenses) * 100) / 100;
  // BUG FIX #3: actualPayout = Σ max(0, settlement) only.
  // Prior code subtracted fees from each row, but settlement is ALREADY net of fees.
  // This caused zero-settlement rows that still carry a fee (e.g. duplicate charge rows)
  // to contribute a NEGATIVE value to actualPayout.
  const actualPayout = rows.reduce((s, r) => {
    if (r.isDeferred === true) return s;
    return s + Math.max(0, r.settlement);
  }, 0);
  // When using line-level total_revenue, expectedPayout is based on gross revenue
  // while actualPayout is SUM(settlement) which is net — the diff is meaningless.
  const payoutDiff = usesLineTotalRevenue(rows) ? 0 : expectedPayout - actualPayout;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netProfit,
    expectedPayout: Math.round(expectedPayout * 100) / 100,
    actualPayout: Math.round(actualPayout * 100) / 100,
    payoutDiff: Math.round(payoutDiff * 100) / 100,
  };
}

export function computeSkuProfitability(rows: SellerOrderRow[]): SkuProfit[] {
  if (rows.length > 0 && rows.every(r => r.rowSource === 'amazon_transaction_line')) {
    return computeSkuProfitabilityForAmazonTransactionRows(rows);
  }

  const lineRev = usesLineTotalRevenue(rows);
  const lineFees = usesLineTotalFees(rows);
  const lineProfit = usesLineProfit(rows);

  const map = new Map<string, { sku: string; revenue: number; fees: number; returns: number; lineProfitSum: number }>();

  for (const row of rows) {
    if (row.isDeferred === true) continue;
    const e = map.get(row.sku) ?? { sku: row.sku, revenue: 0, fees: 0, returns: 0, lineProfitSum: 0 };

    const feePart =
      row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);
    const feeAmount = lineFees ? (row.datasetTotalFees ?? 0) : feePart;
    const cogs = isSaleRowForCogs(row) ? getRowCogs(row) : 0;

    if (lineRev) {
      e.revenue += row.datasetTotalRevenue ?? 0;
      e.fees += feeAmount;
    } else {
      if (row.settlement > 0) {
        e.revenue += row.settlement + feePart;
      }
      e.fees += feePart;
    }

    e.returns += row.returnAmount + (row.settlement > 0 ? cogs : 0);
    if (lineProfit) e.lineProfitSum += row.datasetProfit ?? 0;
    map.set(row.sku, e);
  }

  return Array.from(map.values())
    .map(v => {
      const netProfit = lineProfit
        ? Math.round(v.lineProfitSum * 100) / 100
        : Math.round((v.revenue - v.fees - v.returns) * 100) / 100;
      return {
        sku: v.sku,
        revenue: Math.round(v.revenue * 100) / 100,
        fees: Math.round(v.fees * 100) / 100,
        returns: Math.round(v.returns * 100) / 100,
        netProfit,
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit);
}

/** Transaction lines: revenue = Σ Capture TransactionAmount; fees = Σ TotalTransactionFee; net = Σ NetTransactionAmount per SKU */
export function computeSkuProfitabilityForAmazonTransactionRows(rows: SellerOrderRow[]): SkuProfit[] {
  const map = new Map<string, { revenue: number; fees: number; returns: number; net: number }>();
  for (const row of rows) {
    const e = map.get(row.sku) ?? { revenue: 0, fees: 0, returns: 0, net: 0 };
    if (row.amazonTxKind === 'capture') e.revenue += row.sellingPrice;
    e.fees += row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);
    e.returns += row.returnAmount;
    e.net += row.settlement;
    map.set(row.sku, e);
  }
  return Array.from(map.entries())
    .map(([sku, v]) => ({
      sku,
      revenue: Math.round(v.revenue * 100) / 100,
      fees: Math.round(v.fees * 100) / 100,
      returns: Math.round(v.returns * 100) / 100,
      netProfit: Math.round(v.net * 100) / 100,
    }))
    .sort((a, b) => b.netProfit - a.netProfit);
}

export function computeMonthlyTrends(rows: SellerOrderRow[]): MonthlyTrend[] {
  if (rows.length > 0 && rows.every(r => r.rowSource === 'amazon_transaction_line')) {
    return computeMonthlyTrendsForAmazonTransactionRows(rows);
  }

  const lineRev = usesLineTotalRevenue(rows);
  const lineFees = usesLineTotalFees(rows);
  const lineProfit = usesLineProfit(rows);

  const monthMap = new Map<string, { rows: SellerOrderRow[]; isEstimated: boolean }>();

  for (const row of rows) {
    const { key, isEstimated } = getMonthKeyWithEstimated(row.postedDate ?? row.orderDate, row.rowIndex, rows.length);
    const entry = monthMap.get(key) ?? { rows: [], isEstimated };
    entry.rows.push(row);
    if (isEstimated) entry.isEstimated = true;
    monthMap.set(key, entry);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { rows: monthRows, isEstimated }]) => {
      let revenue = 0;
      let fees = 0;
      let returns = 0;
      let lineProfitMonth = 0;
      for (const r of monthRows) {
        if (r.isDeferred === true) continue;
        const feePart =
          r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
        if (lineRev) {
          revenue += r.datasetTotalRevenue ?? 0;
          fees += lineFees ? (r.datasetTotalFees ?? 0) : feePart;
        } else {
          if (r.settlement > 0) {
            revenue += r.settlement + feePart;
          }
          fees += feePart;
        }
        if (r.returnAmount > 0) returns += r.returnAmount;
        if (isSaleRowForCogs(r)) {
          const rowCogs = getRowCogs(r);
          if (rowCogs > 0) returns += rowCogs;
        }
        if (lineProfit) lineProfitMonth += r.datasetProfit ?? 0;
      }
      const expenses = fees + returns;
      const profit = lineProfit ? lineProfitMonth : revenue - expenses;
      const feePercent = revenue > 0 ? (fees / revenue) * 100 : 0;

      return {
        month: formatMonthLabel(month),
        revenue: Math.round(revenue * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        leakage: 0,
        feePercent: Math.round(feePercent * 100) / 100,
        orderCount: monthRows.length,
        isEstimated: isEstimated || undefined,
      };
    });
}

/** Amazon flat settlement: monthly revenue = Σ Capture TransactionAmount; profit = Σ NetTransactionAmount in month */
export function computeMonthlyTrendsForAmazonTransactionRows(rows: SellerOrderRow[]): MonthlyTrend[] {
  const monthMap = new Map<string, SellerOrderRow[]>();
  for (const row of rows) {
    const key = getMonthKey(row.orderDate, row.rowIndex, rows.length);
    const list = monthMap.get(key) ?? [];
    list.push(row);
    monthMap.set(key, list);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthRows]) => {
      let revenue = 0;
      let fees = 0;
      let returns = 0;
      let netSum = 0;
      for (const r of monthRows) {
        if (r.amazonTxKind === 'capture') revenue += r.sellingPrice;
        fees += r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
        returns += r.returnAmount;
        netSum += r.settlement;
      }
      const expenses = fees + returns;
      const feePercent = revenue > 0 ? (fees / revenue) * 100 : 0;
      return {
        month: formatMonthLabel(month),
        revenue: Math.round(revenue * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        profit: Math.round(netSum * 100) / 100,
        leakage: 0,
        feePercent: Math.round(feePercent * 100) / 100,
        orderCount: monthRows.length,
      };
    });
}

/** Returns { key, isEstimated } — isEstimated is true when bucketing by row order (no real date) */
export function getMonthKeyWithEstimated(dateStr: string | undefined, rowIndex: number, totalRows: number): { key: string; isEstimated: boolean } {
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, isEstimated: false };
      }
    } catch { /* fall through */ }
  }
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const monthNames = Array.from({ length: 4 }, (_, i) => {
    const mo = m - 3 + i;
    const adjYear = mo < 1 ? y - 1 : y;
    const adjMonth = ((mo - 1 + 12) % 12) + 1;
    return `${adjYear}-${String(adjMonth).padStart(2, '0')}`;
  });
  const batchSize = Math.max(1, Math.ceil(totalRows / 4));
  const zeroBasedPos = Math.max(0, rowIndex - 2);
  const idx = Math.min(Math.floor(zeroBasedPos / batchSize), 3);
  return { key: monthNames[idx], isEstimated: true };
}

function getMonthKey(dateStr: string | undefined, rowIndex: number, totalRows: number): string {
  return getMonthKeyWithEstimated(dateStr, rowIndex, totalRows).key;
}

function formatMonthLabel(key: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = key.split('-');
  if (parts.length === 2) {
    const mi = parseInt(parts[1], 10) - 1;
    if (mi >= 0 && mi < 12) return `${months[mi]} ${parts[0]}`;
  }
  return key;
}
