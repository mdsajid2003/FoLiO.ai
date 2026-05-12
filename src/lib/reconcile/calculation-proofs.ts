import { ReconciliationReport, CalculationProof, SellerOrderRow } from '../../types/index.ts';
import { materialSellerRows, usesLineProfit, usesLineTotalRevenue } from './seller-dataset-basis.ts';

/** Build auditable "Show calculation" metadata for key dashboard metrics. */
export function buildCalculationProofs(
  rows: SellerOrderRow[],
  report: Pick<
    ReconciliationReport,
    | 'totalRevenue'
    | 'totalExpenses'
    | 'netProfit'
    | 'recoverableLeakage'
    | 'tcsClaimable'
    | 'rowCount'
    | 'leakageItems'
    | 'dataQuality'
  >,
): Record<string, CalculationProof> {
  const lineRev = usesLineTotalRevenue(rows);
  const lineProfit = usesLineProfit(rows);
  const revenueRows = lineRev ? materialSellerRows(rows).length : rows.filter(r => r.settlement > 0).length;

  const proofs: Record<string, CalculationProof> = {};
  const parserAssumptions = report.dataQuality?.assumptionsUsed ?? [];

  proofs.revenue = {
    label: lineRev ? 'Revenue (Σ total_revenue)' : 'Revenue (gross order value)',
    formula: lineRev
      ? 'SUM(total_revenue) for all non-deferred rows — authoritative when the column is present on every row'
      : 'SUM(settlement + referralFee + fulfillmentFee + storageFee + otherFees + closingFee) for rows where settlement > 0 (deferred rows excluded)',
    explanation: lineRev
      ? `Total revenue is the sum of the file's total_revenue column across ${revenueRows} material row(s). Selling price × quantity is not used.`
      : `Gross sales reconstructed from ${revenueRows} positive-settlement rows: net settlement plus marketplace fee components (same basis as dashboard total revenue).`,
    sourceRowCount: revenueRows,
    confidence: 'high',
    classification: 'deterministic',
    source: lineRev ? 'csv' : 'csv',
    assumptions: [],
  };

  proofs.expenses = {
    label: 'Total expenses',
    formula: 'SUM(referralFee + fulfillmentFee + storageFee + otherFees + closingFee + returnAmount where returnAmount > 0)',
    explanation: 'Aggregated marketplace fees and returns across every row in the report.',
    sourceRowCount: rows.length,
    confidence: 'high',
    classification: 'deterministic',
    source: 'csv',
    assumptions: [],
  };

  proofs.netProfit = {
    label: lineProfit ? 'Net profit (Σ profit from file)' : 'Net profit (after platform fees)',
    formula: lineProfit
      ? 'SUM(profit) from CSV — not recomputed as revenue minus expenses'
      : 'totalRevenue − totalExpenses (fees + returns + COGS when available)',
    explanation: lineProfit
      ? 'Net profit is the sum of the profit column in your dataset so it matches SKU rollups and the waterfall ending balance.'
      : 'Gross order value minus all platform fees, returns, and cost of goods (when cost_price column is present in the CSV). When COGS data is absent the figure represents net payout after fees only.',
    sourceRowCount: rows.length,
    confidence: 'high',
    classification: lineProfit ? 'deterministic' : 'deterministic',
    source: lineProfit ? 'csv' : 'derived',
    assumptions: lineProfit
      ? []
      : rows.some(r => r.costPrice != null)
        ? ['COGS deducted from rows that carry a cost_price / total_cost column.']
        : ['COGS excluded — no cost_price column detected. Upload a file with cost_price to compute true net profit.'],
  };

  const leakCount = report.leakageItems?.length ?? 0;
  proofs.recoverableLeakage = {
    label: 'Recoverable amount',
    formula: 'SUM(leakageItem.diff) for all detected issues',
    explanation:
      leakCount > 0
        ? `${leakCount} issue(s) from deterministic rules (fees, duplicates, returns, etc.). Review each in Recovery Actions.`
        : 'No fee or settlement anomalies matched our detection rules for this file.',
    sourceRowCount: leakCount,
    confidence: leakCount > 0 ? 'medium' : 'high',
    classification: leakCount > 0 ? 'assumption_based' : 'deterministic',
    source: 'derived',
    assumptions: ['Flagged issues depend on heuristic fee and reimbursement rules, not marketplace adjudication.'],
  };

  proofs.tcsClaimable = {
    label: 'TCS claimable',
    formula: '1% of taxable value (ex-GST) per row, or sum of TCS from CSV when present',
    explanation: 'Section 52 CGST — compare with GSTR-2B / operator certificate before claiming in GSTR-3B.',
    sourceRowCount: revenueRows,
    confidence: 'medium',
    classification: 'assumption_based',
    source: 'mixed',
    assumptions: [
      'Uses CSV TCS when present; otherwise estimates from taxable value ex-GST.',
      ...parserAssumptions.filter(assumption => assumption.toLowerCase().includes('gst') || assumption.toLowerCase().includes('state')),
    ],
  };

  proofs.netMargin = {
    label: lineProfit ? 'Net margin % (Σprofit / Σtotal_revenue)' : rows.some(r => r.costPrice != null)
      ? 'Gross profit margin % (fees + COGS deducted)'
      : 'Payout margin % (after fees, excl. COGS)',
    formula: lineProfit ? '(SUM(profit) / SUM(total_revenue)) × 100' : '(netProfit / totalRevenue) × 100',
    explanation: lineProfit
      ? 'Margin uses summed profit over summed total revenue from the CSV (not selling_price × quantity).'
      : rows.some(r => r.costPrice != null)
        ? 'Net profit as a percentage of gross revenue, with fees and COGS deducted. Reflects true gross margin when cost data is present.'
        : 'Fee-adjusted payout as a percentage of gross revenue. Does NOT represent true profit margin — COGS is excluded. Add a cost_price column to compute actual net margin.',
    sourceRowCount: rows.length,
    confidence: 'medium',
    classification: 'assumption_based',
    source: 'derived',
    assumptions: lineProfit
      ? ['Net margin uses summed CSV profit divided by summed CSV total_revenue.']
      : rows.some(r => r.costPrice != null)
        ? ['COGS deducted from rows carrying cost_price / total_cost column.']
        : ['COGS excluded — this margin overstates true profitability.'],
  };

  return proofs;
}
