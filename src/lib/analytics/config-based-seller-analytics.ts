import type { AmazonTransactionMetrics, SellerOrderRow } from '../../types/index.ts';
import type { ConfigBasedSellerAnalytics, ConfigAnalyticsReportQuality } from '../../types/index.ts';
import type { SellerAnalyticsConfig } from '../../config/sellerAnalytics.config.ts';
import { materialSellerRows, sumLineProfit, usesLineProfit, usesLineTotalRevenue } from '../reconcile/seller-dataset-basis.ts';

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthKeyFromRow(row: SellerOrderRow, totalRows: number): string {
  const dateStr = row.postedDate ?? row.orderDate;
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!Number.isNaN(d.getTime())) {
        // Use UTC methods — dates are stored as UTC midnight ISO strings
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      }
    } catch {
      /* fall through */
    }
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
  const batchSize = Math.ceil(totalRows / 4);
  // row.rowIndex is the CSV line number (starts at 2); subtract 2 for 0-based bucketing
  const zeroBasedPos = Math.max(0, row.rowIndex - 2);
  const idx = Math.min(Math.floor(zeroBasedPos / batchSize), 3);
  return monthNames[idx];
}

function formatMonthLabel(key: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = key.split('-');
  if (parts.length === 2) {
    const mi = Number.parseInt(parts[1], 10) - 1;
    if (mi >= 0 && mi < 12) return `${months[mi]} ${parts[0]}`;
  }
  return key;
}

/** Parse `selling_price * 0.50` style rules (multiplier on unit selling price × quantity). */
function costFromRule(rule: string, sellingPrice: number, quantity: number): number | null {
  const norm = rule.replace(/\s+/g, '').toLowerCase();
  const m = norm.match(/^selling_price\*([\d.]+)$/);
  if (!m) return null;
  const mult = Number.parseFloat(m[1]);
  if (!Number.isFinite(mult) || sellingPrice <= 0) return null;
  const q = Math.max(quantity, 1);
  return r2(sellingPrice * mult * q);
}

function isMaterialRow(r: SellerOrderRow): boolean {
  if (r.isDeferred === true) return false;
  return r.settlement > 0 || r.sellingPrice > 0 || r.returnAmount > 0;
}

function rowGrossRevenue(r: SellerOrderRow): { revenue: number; note?: string } {
  if (r.datasetTotalRevenue != null && Number.isFinite(r.datasetTotalRevenue)) {
    return { revenue: r2(r.datasetTotalRevenue) };
  }
  const q = Math.max(r.quantity, 1);
  if (r.sellingPrice > 0) return { revenue: r2(r.sellingPrice * q) };
  if (r.settlement > 0) {
    const feePart =
      r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
    return {
      revenue: r2(r.settlement + feePart),
      note: 'revenue reconstructed from settlement + fees (selling price missing)',
    };
  }
  return { revenue: 0 };
}

function refundForRow(r: SellerOrderRow, revenue: number, config: SellerAnalyticsConfig): number {
  if (r.returnAmount > 0) return r2(r.returnAmount);
  const rule = config.refund_rule.toLowerCase();
  if (rule.includes('return_flag')) {
    // No return_flag column on SellerOrderRow — cannot apply rule strictly
    return 0;
  }
  return 0;
}

interface RowComputed {
  sku: string;
  revenue: number;
  referral: number;
  referralEstimated: boolean;
  fba: number;
  fbaEstimated: boolean;
  shipping: number;
  shippingEstimated: boolean;
  storage: number;
  storageEstimated: boolean;
  other: number;
  otherEstimated: boolean;
  refund: number;
  totalFees: number;
  netPayout: number;
  cost: number | null;
  netProfit: number | null;
  monthKey: string;
}

function computeRow(
  r: SellerOrderRow,
  config: SellerAnalyticsConfig,
  totalRows: number,
  dataGaps: Set<string>,
): RowComputed | null {
  if (!isMaterialRow(r)) return null;

  const { revenue } = rowGrossRevenue(r);
  if (revenue <= 0 && r.returnAmount <= 0) return null;

  let referralEstimated = false;
  let referral = r.referralFee;
  if (referral <= 0 && revenue > 0) {
    referral = r2(revenue * config.referral_fee_rate);
    referralEstimated = true;
  }

  const countsOrder = r.settlement > 0 || r.amazonTxKind === 'capture';

  let fbaEstimated = false;
  let fba = r.fulfillmentFee;
  if (fba <= 0 && countsOrder && config.fba_fee_per_order > 0) {
    fba = config.fba_fee_per_order;
    fbaEstimated = true;
  }

  let shippingEstimated = false;
  let shipping = 0;
  // No separate shipping column — apply CONFIG only when fulfillment (incl. FBA) is absent
  if (config.shipping_fee_per_order > 0 && countsOrder && r.fulfillmentFee <= 0 && fba <= 0) {
    shipping = config.shipping_fee_per_order;
    shippingEstimated = true;
  }

  let storageEstimated = false;
  let storage = r.storageFee;
  if (storage <= 0 && countsOrder && config.storage_fee_per_order > 0) {
    storage = config.storage_fee_per_order;
    storageEstimated = true;
  }

  let otherEstimated = false;
  let other = r.otherFees;
  if (other <= 0 && countsOrder && config.other_fees > 0) {
    other = config.other_fees;
    otherEstimated = true;
  }

  const refund = refundForRow(r, revenue, config);
  if (config.refund_rule.toLowerCase().includes('return_flag')) {
    dataGaps.add('return_flag column not mapped — refund_rule only partially applied; using returnAmount when present');
  }

  const closing = r.closingFee ?? 0;
  const totalFees =
    r.datasetTotalFees != null && Number.isFinite(r.datasetTotalFees)
      ? r2(r.datasetTotalFees)
      : r2(referral + fba + shipping + storage + other + closing);
  const netPayout = r2(revenue - totalFees - refund);

  let cost: number | null = null;
  if (r.sellingPrice > 0) {
    cost = costFromRule(config.cost_price_rule, r.sellingPrice, Math.max(r.quantity, 1));
    if (cost === null) dataGaps.add(`Unrecognised cost_price_rule: ${config.cost_price_rule}`);
  } else if (revenue > 0) {
    dataGaps.add('cost_price_rule requires selling_price — missing on one or more rows');
  }

  const netProfit = cost !== null ? r2(netPayout - cost) : null;

  return {
    sku: r.sku || 'UNKNOWN',
    revenue,
    referral,
    referralEstimated,
    fba,
    fbaEstimated,
    shipping,
    shippingEstimated,
    storage,
    storageEstimated,
    other,
    otherEstimated,
    refund,
    totalFees,
    netPayout,
    cost,
    netProfit,
    monthKey: monthKeyFromRow(r, totalRows),
  };
}

function qualityFromFlags(
  anyEstimate: boolean,
  anyMissingCost: boolean,
): ConfigAnalyticsReportQuality {
  if (anyMissingCost) return 'incomplete';
  if (anyEstimate) return 'estimated';
  return 'exact';
}

/**
 * CONFIG-first analytics: prefers parsed CSV fields; fills gaps from CONFIG only when needed.
 * Net payout (cash-like before COGS) is never merged with net profit.
 */
export function computeConfigBasedSellerAnalytics(
  rows: SellerOrderRow[],
  config: SellerAnalyticsConfig,
  amazonTransactionMetrics?: AmazonTransactionMetrics,
): ConfigBasedSellerAnalytics | null {
  if (rows.length === 0) return null;

  const dataGaps = new Set<string>();
  const explanations: string[] = [];

  const formulasUsed: Record<string, string> = {
    revenue:
      'SUM(total_revenue) from CSV when that column is present on all rows; else quantity × selling_price when selling_price > 0; else settlement + Σ fee columns when settlement > 0',
    referral_fee: 'from CSV; if missing: revenue × referral_fee_rate (CONFIG)',
    total_fees: 'referral_fee + fba_fee + shipping_fee + storage_fee + other_fees (CSV or CONFIG per-order)',
    refund_amount: 'from CSV returnAmount when > 0; refund_rule with return_flag is limited without that column',
    total_cost: 'from cost_price_rule on selling_price × quantity when recognised',
    net_payout: 'revenue − total_fees − refund_amount',
    net_profit:
      'SUM(profit) from CSV when the profit column is present on all material rows; else net_payout − total_cost (null if cost missing)',
    profit_margin: 'net_profit / revenue when net_profit known',
    gst_output: 'revenue × gst_rate (CONFIG advisory)',
    gst_input: 'not in dataset — null unless you extend CONFIG',
    net_gst_liability: 'gst_output − gst_input when input known',
    tcs_amount:
      'when total_revenue column on all rows: (SUM(total_revenue) − SUM(gst_amount)) × tcs_rate; else revenue × tcs_rate (CONFIG advisory)',
    tds_amount: 'SUM(total_revenue) × tds_rate when line revenue basis; else revenue × tds_rate (CONFIG advisory)',
  };

  const isAmazonFlat =
    rows.length > 0 && rows.every((r) => r.rowSource === 'amazon_transaction_line') && !!amazonTransactionMetrics;

  if (isAmazonFlat && amazonTransactionMetrics) {
    return buildAmazonFlatAnalytics(rows, config, amazonTransactionMetrics, formulasUsed, dataGaps, explanations);
  }

  const computed: RowComputed[] = [];
  for (const r of rows) {
    const c = computeRow(r, config, rows.length, dataGaps);
    if (c) computed.push(c);
  }

  if (computed.length === 0) {
    explanations.push('No material rows after CONFIG filter — cannot build analytics.');
    return null;
  }

  let anyEstimate = false;
  let anyMissingCost = false;
  for (const c of computed) {
    if (c.referralEstimated || c.fbaEstimated || c.shippingEstimated || c.storageEstimated || c.otherEstimated) {
      anyEstimate = true;
    }
    if (c.cost === null && c.revenue > 0) anyMissingCost = true;
  }

  const revenue = r2(computed.reduce((s, c) => s + c.revenue, 0));
  const referralFee = r2(computed.reduce((s, c) => s + c.referral, 0));
  const referralSources = new Set(computed.map((c) => (c.referralEstimated ? 'est' : 'csv')));
  const referralFeeSource =
    referralSources.size > 1 ? 'mixed' : computed.some((c) => c.referralEstimated) ? 'estimated' : 'dataset';

  const totalFees = r2(computed.reduce((s, c) => s + c.totalFees, 0));
  const refundAmount = r2(computed.reduce((s, c) => s + c.refund, 0));

  const withRev = computed.filter((c) => c.revenue > 0);
  const totalCost = anyMissingCost
    ? null
    : r2(withRev.reduce((s, c) => s + (c.cost ?? 0), 0));

  const netPayout = r2(computed.reduce((s, c) => s + c.netPayout, 0));
  const netProfit = anyMissingCost
    ? null
    : usesLineProfit(rows)
      ? r2(sumLineProfit(rows))
      : r2(computed.reduce((s, c) => s + (c.netProfit ?? 0), 0));
  const profitMargin =
    netProfit !== null && revenue > 0 ? r2(netProfit / revenue) : null;

  const gst_output = r2((revenue / (1 + config.gst_rate)) * config.gst_rate);
  const gst_input: number | null = null;
  const net_gst_liability = gst_input === null ? null : r2(gst_output - gst_input);
  const sumGstFromRows = r2(materialSellerRows(rows).reduce((s, r) => s + (r.gstCollected || 0), 0));
  const tcs_amount = usesLineTotalRevenue(rows)
    ? r2(Math.max(0, revenue - sumGstFromRows) * config.tcs_rate)
    : r2(revenue * config.tcs_rate);
  const tds_amount = r2(revenue * config.tds_rate);

  explanations.push(
    'Net payout is pre–cost of goods (marketplace cash view). Net profit subtracts CONFIG-derived cost only when unit selling price exists.',
  );
  explanations.push(
    `Report quality: ${qualityFromFlags(anyEstimate, anyMissingCost)} — CONFIG rates: referral ${config.referral_fee_rate}, GST ${config.gst_rate}, TCS ${config.tcs_rate}, TDS ${config.tds_rate}.`,
  );

  const skuMap = new Map<string, RowComputed[]>();
  for (const c of computed) {
    const list = skuMap.get(c.sku) ?? [];
    list.push(c);
    skuMap.set(c.sku, list);
  }

  const profitBySku = new Map<string, number>();
  const profitByMonthKey = new Map<string, number>();
  if (usesLineProfit(rows)) {
    for (const r of rows) {
      if (r.isDeferred === true) continue;
      const sku = r.sku || 'UNKNOWN';
      profitBySku.set(sku, (profitBySku.get(sku) ?? 0) + (r.datasetProfit ?? 0));
      const mk = monthKeyFromRow(r, rows.length);
      profitByMonthKey.set(mk, (profitByMonthKey.get(mk) ?? 0) + (r.datasetProfit ?? 0));
    }
  }

  const skuAgg = Array.from(skuMap.entries()).map(([sku, list]) => {
    const rev = r2(list.reduce((s, x) => s + x.revenue, 0));
    const fees = r2(list.reduce((s, x) => s + x.totalFees, 0));
    const refunds = r2(list.reduce((s, x) => s + x.refund, 0));
    const np = r2(list.reduce((s, x) => s + x.netPayout, 0));
    const costs = list.map((x) => x.cost);
    const hasGap = costs.some((c) => c === null) && list.some((x) => x.revenue > 0);
    const profit = usesLineProfit(rows)
      ? r2(profitBySku.get(sku) ?? 0)
      : hasGap
        ? null
        : r2(list.reduce((s, x) => s + (x.netProfit ?? 0), 0));
    return {
      sku,
      revenue: rev,
      fees,
      refunds,
      netPayout: np,
      netProfit: profit,
      feeRatio: rev > 0 ? r2(fees / rev) : 0,
      returnRatio: rev > 0 ? r2(refunds / rev) : refunds > 0 ? -1 : 0,
    };
  });

  const monthMap = new Map<string, RowComputed[]>();
  for (const c of computed) {
    const list = monthMap.get(c.monthKey) ?? [];
    list.push(c);
    monthMap.set(c.monthKey, list);
  }

  const monthly = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => {
      const rev = r2(list.reduce((s, x) => s + x.revenue, 0));
      const feesTotal = r2(list.reduce((s, x) => s + x.totalFees, 0));
      const refundTotal = r2(list.reduce((s, x) => s + x.refund, 0));
      const np = r2(list.reduce((s, x) => s + x.netPayout, 0));
      const hasGap = list.some((x) => x.cost === null && x.revenue > 0);
      const tc = hasGap
        ? null
        : r2(list.reduce((s, x) => s + (x.cost ?? 0), 0));
      const nprof = usesLineProfit(rows)
        ? r2(profitByMonthKey.get(key) ?? 0)
        : hasGap
          ? null
          : r2(list.reduce((s, x) => s + (x.netProfit ?? 0), 0));
      return {
        monthKey: key,
        monthLabel: formatMonthLabel(key),
        revenue: rev,
        feesTotal,
        refundTotal,
        netPayout: np,
        totalCost: tc,
        netProfit: nprof,
        orderCount: list.length,
      };
    });

  const topSkusByRevenue = [...skuAgg].sort((a, b) => b.revenue - a.revenue).slice(0, 8).map((s) => ({ sku: s.sku, revenue: s.revenue }));
  const topSkusByProfit = [...skuAgg]
    .filter((s) => s.netProfit !== null)
    .sort((a, b) => (b.netProfit ?? 0) - (a.netProfit ?? 0))
    .slice(0, 8)
    .map((s) => ({ sku: s.sku, netProfit: s.netProfit, netPayout: s.netPayout }));
  const returnHeavySkus = [...skuAgg]
    .filter((s) => s.returnRatio > 0.05 || s.returnRatio < 0)
    .sort((a, b) => b.refunds - a.refunds)
    .slice(0, 8)
    .map((s) => ({ sku: s.sku, returnRatio: s.returnRatio, refundAmount: s.refunds }));
  const feeHeavySkus = [...skuAgg]
    .filter((s) => s.feeRatio > 0)
    .sort((a, b) => b.feeRatio - a.feeRatio)
    .slice(0, 8)
    .map((s) => ({ sku: s.sku, feeRatio: s.feeRatio, fees: s.fees }));

  return {
    marketplace_rules: config.marketplace_rules,
    tax_regime: config.tax_regime,
    reportQuality: qualityFromFlags(anyEstimate, anyMissingCost),
    explanations,
    dataGaps: [...dataGaps],
    formulasUsed,
    totals: {
      revenue,
      referralFee,
      referralFeeSource,
      totalFees,
      refundAmount,
      totalCost,
      netPayout,
      netProfit,
      profitMargin,
    },
    taxFromConfig: {
      gst_output,
      gst_input,
      net_gst_liability,
      tcs_amount,
      tds_amount,
    },
    monthly,
    topSkusByRevenue,
    topSkusByProfit,
    returnHeavySkus,
    feeHeavySkus,
  };
}

function buildAmazonFlatAnalytics(
  rows: SellerOrderRow[],
  config: SellerAnalyticsConfig,
  m: AmazonTransactionMetrics,
  formulasUsed: Record<string, string>,
  dataGaps: Set<string>,
  explanations: string[],
): ConfigBasedSellerAnalytics {
  const revenue = r2(m.totalCaptureTransactionAmount);
  const refundBlock =
    (m.totalRefundTransactionAmount <= 0 ? -m.totalRefundTransactionAmount : m.totalRefundTransactionAmount) +
    (m.totalChargebackTransactionAmount <= 0 ? -m.totalChargebackTransactionAmount : m.totalChargebackTransactionAmount);
  const refundAmount = r2(refundBlock);
  const totalFees = r2(m.totalTransactionFees);
  const netPayout = r2(m.netSettlementTotal);

  let totalCost: number | null = 0;
  let anyMissing = false;
  for (const r of rows) {
    if (r.amazonTxKind !== 'capture') continue;
    if (r.sellingPrice > 0) {
      const c = costFromRule(config.cost_price_rule, r.sellingPrice, Math.max(r.quantity, 1));
      if (c === null) {
        anyMissing = true;
        dataGaps.add(`cost_price_rule not applied for some capture rows: ${config.cost_price_rule}`);
        break;
      }
      totalCost! += c;
    } else {
      anyMissing = true;
      dataGaps.add('selling_price missing on capture row — COGS from CONFIG rule unavailable');
    }
  }
  if (anyMissing) totalCost = null;
  else totalCost = r2(totalCost ?? 0);

  const netProfit = totalCost !== null ? r2(netPayout - totalCost) : null;
  const profitMargin = netProfit !== null && revenue > 0 ? r2(netProfit / revenue) : null;

  const gst_output = r2((revenue / (1 + config.gst_rate)) * config.gst_rate);
  const tcs_amount = r2(revenue * config.tcs_rate);
  const tds_amount = r2(revenue * config.tds_rate);

  explanations.push('Amazon flat settlement: file-level revenue/fees/net payout from settlement aggregates; COGS from CONFIG only on capture rows with selling_price.');
  explanations.push('Net payout here follows Σ NetTransactionAmount (settlement), not the same as SKU-sum in all cases.');

  const monthly = computeMonthlyTrendsForConfig(rows, config);
  const skuSlices = aggregateSkuFromFlatRows(rows, config, dataGaps);

  return {
    marketplace_rules: config.marketplace_rules,
    tax_regime: config.tax_regime,
    reportQuality: anyMissing ? 'incomplete' : 'estimated',
    explanations,
    dataGaps: [...dataGaps],
    formulasUsed,
    totals: {
      revenue,
      referralFee: r2(rows.reduce((s, r) => s + r.referralFee, 0)),
      referralFeeSource: 'dataset',
      totalFees,
      refundAmount,
      totalCost,
      netPayout,
      netProfit,
      profitMargin,
    },
    taxFromConfig: {
      gst_output,
      gst_input: null,
      net_gst_liability: null,
      tcs_amount,
      tds_amount,
    },
    monthly,
    topSkusByRevenue: skuSlices.topRev,
    topSkusByProfit: skuSlices.topProf,
    returnHeavySkus: skuSlices.retHeavy,
    feeHeavySkus: skuSlices.feeHeavy,
  };
}

function computeMonthlyTrendsForConfig(rows: SellerOrderRow[], config: SellerAnalyticsConfig) {
  const monthMap = new Map<string, SellerOrderRow[]>();
  for (const row of rows) {
    const key = monthKeyFromRow(row, rows.length);
    const list = monthMap.get(key) ?? [];
    list.push(row);
    monthMap.set(key, list);
  }
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => {
      let rev = 0;
      let fees = 0;
      let refunds = 0;
      let np = 0;
      let costSum = 0;
      let costGap = false;
      for (const r of list) {
        if (r.amazonTxKind === 'capture') rev += r.sellingPrice;
        fees += r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
        refunds += r.returnAmount;
        np += r.settlement;
        if (r.amazonTxKind === 'capture' && r.sellingPrice > 0) {
          const c = costFromRule(config.cost_price_rule, r.sellingPrice, Math.max(r.quantity, 1));
          if (c === null) costGap = true;
          else costSum += c;
        }
      }
      const netPayoutM = r2(np);
      const totalCostM = costGap ? null : r2(costSum);
      const netProfitM = totalCostM === null ? null : r2(netPayoutM - totalCostM);
      return {
        monthKey: key,
        monthLabel: formatMonthLabel(key),
        revenue: r2(rev),
        feesTotal: r2(fees),
        refundTotal: r2(refunds),
        netPayout: netPayoutM,
        totalCost: totalCostM,
        netProfit: netProfitM,
        orderCount: list.length,
      };
    });
}

function aggregateSkuFromFlatRows(
  rows: SellerOrderRow[],
  config: SellerAnalyticsConfig,
  dataGaps: Set<string>,
) {
  const map = new Map<
    string,
    { revenue: number; fees: number; refunds: number; netPayout: number; costSum: number; costInvalid: boolean }
  >();
  for (const r of rows) {
    const sku = r.sku || 'UNKNOWN';
    const e = map.get(sku) ?? { revenue: 0, fees: 0, refunds: 0, netPayout: 0, costSum: 0, costInvalid: false };
    if (r.amazonTxKind === 'capture') e.revenue += r.sellingPrice;
    e.fees += r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
    e.refunds += r.returnAmount;
    e.netPayout += r.settlement;
    if (r.amazonTxKind === 'capture') {
      if (r.sellingPrice > 0) {
        const c = costFromRule(config.cost_price_rule, r.sellingPrice, Math.max(r.quantity, 1));
        if (c === null) {
          e.costInvalid = true;
          dataGaps.add('cost rule failed for a SKU aggregate');
        } else if (!e.costInvalid) {
          e.costSum += c;
        }
      } else {
        e.costInvalid = true;
      }
    }
    map.set(sku, e);
  }

  const list = Array.from(map.entries()).map(([sku, v]) => {
    const rev = r2(v.revenue);
    const feeRatio = rev > 0 ? r2(v.fees / rev) : 0;
    const returnRatio = rev > 0 ? r2(v.refunds / rev) : v.refunds > 0 ? -1 : 0;
    const cost = v.costInvalid ? null : r2(v.costSum);
    const netProfit = cost === null ? null : r2(v.netPayout - cost);
    return {
      sku,
      revenue: rev,
      fees: r2(v.fees),
      refunds: r2(v.refunds),
      netPayout: r2(v.netPayout),
      netProfit,
      feeRatio,
      returnRatio,
    };
  });

  return {
    topRev: [...list].sort((a, b) => b.revenue - a.revenue).slice(0, 8).map((s) => ({ sku: s.sku, revenue: s.revenue })),
    topProf: [...list]
      .filter((s) => s.netProfit !== null)
      .sort((a, b) => (b.netProfit ?? 0) - (a.netProfit ?? 0))
      .slice(0, 8)
      .map((s) => ({ sku: s.sku, netProfit: s.netProfit, netPayout: s.netPayout })),
    retHeavy: [...list]
      .filter((s) => s.returnRatio > 0.05 || s.returnRatio < 0)
      .sort((a, b) => b.refunds - a.refunds)
      .slice(0, 8)
      .map((s) => ({ sku: s.sku, returnRatio: s.returnRatio, refundAmount: s.refunds })),
    feeHeavy: [...list]
      .filter((s) => s.feeRatio > 0)
      .sort((a, b) => b.feeRatio - a.feeRatio)
      .slice(0, 8)
      .map((s) => ({ sku: s.sku, feeRatio: s.feeRatio, fees: s.fees })),
  };
}
