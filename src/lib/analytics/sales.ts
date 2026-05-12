import { AmazonTransactionMetrics, SellerOrderRow, SalesAnalytics, MonthlyTrend } from '../../types/index.ts';
import { computeMonthlyTrendsForAmazonTransactionRows, computeSkuProfitabilityForAmazonTransactionRows, getRowCogs, getMonthKeyWithEstimated } from '../reconcile/settlement.ts';
import {
  isSaleRowForCogs,
  materialSellerRows,
  sumLineProfit,
  sumLineTotalFees,
  sumLineTotalRevenue,
  usesLineProfit,
  usesLineTotalFees,
  usesLineTotalRevenue,
} from '../reconcile/seller-dataset-basis.ts';

export function computeSalesAnalytics(
  rows: SellerOrderRow[],
  amazonTransactionMetrics?: AmazonTransactionMetrics,
  gstNetLiability = 0,
): SalesAnalytics {
  if (
    rows.length > 0 &&
    rows.every(r => r.rowSource === 'amazon_transaction_line') &&
    amazonTransactionMetrics
  ) {
    return computeSalesAnalyticsForAmazonFlat(rows, amazonTransactionMetrics, gstNetLiability);
  }

  const lineRev = usesLineTotalRevenue(rows);
  const lineFees = usesLineTotalFees(rows);
  const lineProfit = usesLineProfit(rows);

  const grossRevenue = lineRev
    ? sumLineTotalRevenue(rows)
    : rows.reduce((s, r) => {
        if (r.isDeferred === true) return s;
        if (r.settlement <= 0) return s;
        const feePart =
          r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
        return s + r.settlement + feePart;
      }, 0);

  const totalReturns = rows.reduce((s, r) => s + r.returnAmount, 0);
  const netRevenue = grossRevenue - totalReturns;

  const totalFees = lineFees
    ? sumLineTotalFees(rows)
    : rows.reduce(
        (s, r) => s + r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0),
        0,
      );

  // Deduct COGS when available in the dataset (cost_price / total_cost columns).
  // getRowCogs uses totalCost directly (qty-adjusted) or falls back to costPrice × qty.
  const totalCogs = rows.reduce((s, r) => {
    if (r.isDeferred === true) return s;
    if (!isSaleRowForCogs(r)) return s;
    return s + getRowCogs(r);
  }, 0);
  const cogsAvailable = totalCogs > 0;
  const grossProfit = lineProfit
    ? sumLineProfit(rows)
    : cogsAvailable
      ? netRevenue - totalFees - totalCogs
      : netRevenue - totalFees;
  const netProfit = grossProfit;
  const netProfitAfterGst = Math.round((grossProfit - gstNetLiability) * 100) / 100;
  // profitMarginPct: Σprofit / Σtotal_revenue when CSV carries both; else legacy margin
  const profitMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  // ── Product analytics ──
  const skuMap = new Map<string, { revenue: number; profit: number; returns: number; orders: number; returnOrders: number }>();
  for (const row of rows) {
    if (row.isDeferred === true) continue;
    const entry = skuMap.get(row.sku) ?? { revenue: 0, profit: 0, returns: 0, orders: 0, returnOrders: 0 };
    const fp =
      row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);
    const cogs = isSaleRowForCogs(row) ? getRowCogs(row) : 0;
    if (lineRev) {
      entry.revenue += row.datasetTotalRevenue ?? 0;
    } else if (row.settlement > 0) {
      entry.revenue += row.settlement + fp;
    }
    if (lineProfit) {
      entry.profit += row.datasetProfit ?? 0;
    } else {
      entry.profit += (row.settlement > 0 ? row.settlement : 0) - row.returnAmount - (row.settlement > 0 ? fp : 0) - cogs;
    }
    entry.returns += row.returnAmount;
    entry.orders += 1;
    if (row.returnAmount > 0) entry.returnOrders += 1;
    skuMap.set(row.sku, entry);
  }

  const skuList = Array.from(skuMap.entries()).map(([sku, v]) => ({ sku, ...v }));

  const topProductsByRevenue = [...skuList]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(s => ({ sku: s.sku, revenue: Math.round(s.revenue * 100) / 100 }));

  const topProductsByProfit = [...skuList]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)
    .map(s => ({ sku: s.sku, profit: Math.round(s.profit * 100) / 100 }));

  const worstPerformers = [...skuList]
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5)
    .map(s => ({ sku: s.sku, profit: Math.round(s.profit * 100) / 100 }));

  // Return rate = return orders / total orders (not return amount / revenue)
  const returnRateBySku = skuList
    .filter(s => s.orders > 0 || s.returns > 0)
    .map(s => ({
      sku: s.sku,
      returnRate: s.orders > 0
        ? Math.round((s.returnOrders / s.orders) * 10000) / 100
        : s.returns > 0
          ? -1
          : 0,
      returnAmount: Math.round(s.returns * 100) / 100,
      orders: s.orders,
      returnOrders: s.returnOrders,
    }))
    .sort((a, b) => {
      const aNA = a.returnRate < 0 ? 1 : 0;
      const bNA = b.returnRate < 0 ? 1 : 0;
      if (aNA !== bNA) return bNA - aNA;
      if (aNA === 1) return b.returnAmount - a.returnAmount;
      return b.returnRate - a.returnRate;
    });

  // ── Fee breakdown ──
  const feeBreakdown = [
    { type: 'Referral/Commission', amount: Math.round(rows.reduce((s, r) => s + r.referralFee, 0) * 100) / 100 },
    { type: 'Fulfillment/Shipping', amount: Math.round(rows.reduce((s, r) => s + r.fulfillmentFee, 0) * 100) / 100 },
    { type: 'Storage', amount: Math.round(rows.reduce((s, r) => s + r.storageFee, 0) * 100) / 100 },
    { type: 'Other', amount: Math.round(rows.reduce((s, r) => s + r.otherFees, 0) * 100) / 100 },
    { type: 'Closing', amount: Math.round(rows.reduce((s, r) => s + (r.closingFee ?? 0), 0) * 100) / 100 },
  ].filter(f => f.amount > 0);

  // ── Order metrics ──
  const totalOrders = lineRev ? materialSellerRows(rows).length : rows.filter(r => r.settlement > 0 && r.isDeferred !== true).length;
  const avgOrderValue = totalOrders > 0 ? Math.round(grossRevenue / totalOrders) : 0;

  // Days span from order dates
  const dates = rows
    .map(r => r.orderDate ? new Date(r.orderDate) : null)
    .filter((d): d is Date => d !== null && !isNaN(d.getTime()));

  let daySpan = 30;
  if (dates.length >= 2) {
    const minDate = Math.min(...dates.map(d => d.getTime()));
    const maxDate = Math.max(...dates.map(d => d.getTime()));
    daySpan = Math.max(1, Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24)));
  }
  const ordersPerDay = Math.round((totalOrders / daySpan) * 10) / 10;

  // ── Monthly trends (real dates) ──
  const monthlyTrends = computeMonthlyTrendsFromDates(rows, lineRev, lineFees, lineProfit);

  // MoM growth from trends
  let momGrowthPct = 0;
  if (monthlyTrends.length >= 2) {
    const prev = monthlyTrends[monthlyTrends.length - 2].revenue;
    const curr = monthlyTrends[monthlyTrends.length - 1].revenue;
    momGrowthPct = prev > 0 ? Math.round(((curr - prev) / prev) * 10000) / 100 : 0;
  }

  // ── Category breakdown (from SKU prefix as proxy) ──
  const categoryMap = new Map<string, number>();
  for (const row of rows) {
    if (row.isDeferred === true) continue;
    const cat = categorizeFromSku(row.sku);
    const feePart =
      row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);
    const add = lineRev ? (row.datasetTotalRevenue ?? 0) : row.settlement > 0 ? row.settlement + feePart : 0;
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + add);
  }
  const totalCatRev = Array.from(categoryMap.values()).reduce((s, v) => s + v, 0) || 1;
  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue * 100) / 100,
      percentage: Math.round((revenue / totalCatRev) * 10000) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    grossRevenue: Math.round(grossRevenue * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
    momGrowthPct,
    grossProfit: Math.round(grossProfit * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    netProfitAfterGst,
    profitMarginPct: Math.round(profitMarginPct * 100) / 100,
    topProductsByRevenue,
    topProductsByProfit,
    worstPerformers,
    returnRateBySku,
    totalPlatformFees: Math.round(totalFees * 100) / 100,
    feePctOfRevenue: grossRevenue > 0 ? Math.round((totalFees / grossRevenue) * 10000) / 100 : 0,
    feeBreakdown,
    avgOrderValue,
    ordersPerDay,
    totalOrders,
    monthlyTrends,
    categoryBreakdown,
  };
}

/** Amazon flat settlement: aggregates from metrics; SKU / charts from transaction rows */
function computeSalesAnalyticsForAmazonFlat(
  rows: SellerOrderRow[],
  m: AmazonTransactionMetrics,
  gstNetLiability = 0,
): SalesAnalytics {
  const grossRevenue = m.totalCaptureTransactionAmount;
  const totalReturns =
    (m.totalRefundTransactionAmount <= 0 ? -m.totalRefundTransactionAmount : m.totalRefundTransactionAmount) +
    (m.totalChargebackTransactionAmount <= 0 ? -m.totalChargebackTransactionAmount : m.totalChargebackTransactionAmount);
  const totalFees = m.totalTransactionFees;
  const netRevenue = Math.round((grossRevenue - totalReturns) * 100) / 100;
  const netProfit = m.netSettlementTotal;
  const grossProfit = netProfit;
  const netProfitAfterGst = Math.round((netProfit - gstNetLiability) * 100) / 100;
  const profitMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  const skuList = computeSkuProfitabilityForAmazonTransactionRows(rows).map(s => ({
    sku: s.sku,
    revenue: s.revenue,
    profit: s.netProfit,
    returns: s.returns,
    orders: rows.filter(r => r.sku === s.sku).length,
  }));

  const topProductsByRevenue = [...skuList]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(s => ({ sku: s.sku, revenue: Math.round(s.revenue * 100) / 100 }));

  const topProductsByProfit = [...skuList]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)
    .map(s => ({ sku: s.sku, profit: Math.round(s.profit * 100) / 100 }));

  const worstPerformers = [...skuList]
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5)
    .map(s => ({ sku: s.sku, profit: Math.round(s.profit * 100) / 100 }));

  const returnRateBySku = skuList
    .filter(s => s.orders > 0 || s.returns > 0)
    .map(s => ({
      sku: s.sku,
      // Return rate = return orders / total orders (monetary ratio is not meaningful)
      returnRate: s.orders > 0
        ? Math.round(
            (rows.filter(r => r.sku === s.sku && r.returnAmount > 0).length / s.orders) * 10000,
          ) / 100
        : s.returns > 0
          ? -1
          : 0,
      returnAmount: Math.round(s.returns * 100) / 100,
      orders: s.orders,
      returnOrders: rows.filter(r => r.sku === s.sku && r.returnAmount > 0).length,
    }))
    .sort((a, b) => {
      const aNA = a.returnRate < 0 ? 1 : 0;
      const bNA = b.returnRate < 0 ? 1 : 0;
      if (aNA !== bNA) return bNA - aNA;
      if (aNA === 1) return b.returnAmount - a.returnAmount;
      return b.returnRate - a.returnRate;
    });

  const feeBreakdown =
    totalFees > 0 ? [{ type: 'Total transaction fee (per settlement line)', amount: Math.round(totalFees * 100) / 100 }] : [];

  const captureRows = rows.filter(r => r.amazonTxKind === 'capture');
  const totalOrders = captureRows.length;
  const avgOrderValue = totalOrders > 0 ? Math.round((grossRevenue / totalOrders) * 100) / 100 : 0;

  const dates = rows
    .map(r => r.orderDate ? new Date(r.orderDate) : null)
    .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
  let daySpan = 30;
  if (dates.length >= 2) {
    const minDate = Math.min(...dates.map(d => d.getTime()));
    const maxDate = Math.max(...dates.map(d => d.getTime()));
    daySpan = Math.max(1, Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24)));
  }
  const ordersPerDay = Math.round((totalOrders / daySpan) * 10) / 10;

  const monthlyTrends = computeMonthlyTrendsForAmazonTransactionRows(rows);

  let momGrowthPct = 0;
  if (monthlyTrends.length >= 2) {
    const prev = monthlyTrends[monthlyTrends.length - 2].revenue;
    const curr = monthlyTrends[monthlyTrends.length - 1].revenue;
    momGrowthPct = prev > 0 ? Math.round(((curr - prev) / prev) * 10000) / 100 : 0;
  }

  const categoryMap = new Map<string, number>();
  for (const row of rows) {
    if (row.amazonTxKind !== 'capture') continue;
    const cat = categorizeFromSku(row.sku);
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + row.sellingPrice);
  }
  const totalCatRev = Array.from(categoryMap.values()).reduce((s, v) => s + v, 0) || 1;
  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue * 100) / 100,
      percentage: Math.round((revenue / totalCatRev) * 10000) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    grossRevenue: Math.round(grossRevenue * 100) / 100,
    netRevenue,
    momGrowthPct,
    grossProfit: Math.round(grossProfit * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    netProfitAfterGst,
    profitMarginPct: Math.round(profitMarginPct * 100) / 100,
    topProductsByRevenue,
    topProductsByProfit,
    worstPerformers,
    returnRateBySku,
    totalPlatformFees: Math.round(totalFees * 100) / 100,
    feePctOfRevenue: grossRevenue > 0 ? Math.round((totalFees / grossRevenue) * 10000) / 100 : 0,
    feeBreakdown,
    avgOrderValue,
    ordersPerDay,
    totalOrders,
    monthlyTrends,
    categoryBreakdown,
  };
}

function computeMonthlyTrendsFromDates(
  rows: SellerOrderRow[],
  lineRev: boolean,
  lineFees: boolean,
  lineProfit: boolean,
): MonthlyTrend[] {
  const monthMap = new Map<string, { rows: SellerOrderRow[]; isEstimated: boolean }>();

  for (const row of rows) {
    const { key, isEstimated } = getMonthKeyWithEstimated(row.orderDate, row.rowIndex, rows.length);
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

function formatMonthLabel(key: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = key.split('-');
  if (parts.length === 2) {
    const mi = parseInt(parts[1], 10) - 1;
    if (mi >= 0 && mi < 12) return `${months[mi]} ${parts[0]}`;
  }
  return key;
}

function categorizeFromSku(sku: string): string {
  const s = sku.toLowerCase();
  if (s.includes('phone') || s.includes('mobile') || s.includes('case') || s.includes('cover')) return 'Mobile Accessories';
  if (s.includes('screen') || s.includes('guard') || s.includes('temper')) return 'Screen Protection';
  if (s.includes('cable') || s.includes('usb') || s.includes('charger') || s.includes('adapter')) return 'Cables & Chargers';
  if (s.includes('ear') || s.includes('headphone') || s.includes('audio') || s.includes('speaker')) return 'Audio';
  if (s.includes('book') || s.includes('notebook')) return 'Books & Stationery';
  if (s.includes('cloth') || s.includes('shirt') || s.includes('pant') || s.includes('dress')) return 'Clothing';
  return 'General';
}
