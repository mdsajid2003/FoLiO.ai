import { SellerOrderRow, LeakageItem, Confidence } from '../../types/index.ts';

const VALID_GST_RATES = new Set([0, 5, 12, 18, 28]);

export function computeConfidence(rows: SellerOrderRow[], leakage: LeakageItem[]): Confidence {
  const issues: string[] = [];

  if (rows.length === 0) return 'low';

  const missingOrderIds = rows.filter(r => !r.orderId || r.orderId.startsWith('ROW-') || r.orderId.startsWith('FK-ROW-')).length;
  if (missingOrderIds > rows.length * 0.1) issues.push('missing_order_ids');

  const missingWeights = rows.filter(r => r.weight <= 0).length;
  if (missingWeights > rows.length * 0.2) issues.push('missing_weights');

  const zeroSettlements = rows.filter(r => r.settlement <= 0).length;
  if (zeroSettlements > rows.length * 0.3) issues.push('many_zero_settlements');

  const badGstRates = rows.filter(r => r.gstRate > 0 && !VALID_GST_RATES.has(r.gstRate)).length;
  if (badGstRates > rows.length * 0.05) issues.push('suspicious_gst_rates');

  const totalLeakage = leakage.reduce((s, i) => s + i.diff, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.settlement, 0);
  if (totalRevenue > 0 && totalLeakage / totalRevenue > 0.5) issues.push('leakage_ratio_too_high');

  if (issues.length === 0) return 'high';
  if (issues.length <= 2) return 'medium';
  return 'low';
}
