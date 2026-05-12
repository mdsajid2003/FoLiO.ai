import { SellerOrderRow, TcsSummary } from '../../types/index.ts';
import { usesLineTotalRevenue } from '../reconcile/seller-dataset-basis.ts';

const TCS_RATE = 0.01;
const SECTION = 'Section 52 of CGST Act, 2017';

export function computeTcsSummary(rows: SellerOrderRow[]): TcsSummary {
  const monthMap = new Map<string, { taxableValue: number; tcsComputed: number; tcsFromCsv: number }>();

  const lineRev = usesLineTotalRevenue(rows);

  for (const row of rows) {
    if (row.isDeferred === true) continue;

    if (lineRev) {
      const rev = row.datasetTotalRevenue ?? 0;
      if (rev <= 0) continue;
      const month = getMonthKey(row.orderDate);
      const baseValue = rev - (row.gstCollected || 0);
      const tcsComputed = baseValue * TCS_RATE;
      const tcsFromCsv = row.tcsDeducted > 0 ? row.tcsDeducted : 0;
      const entry = monthMap.get(month) ?? { taxableValue: 0, tcsComputed: 0, tcsFromCsv: 0 };
      entry.taxableValue += baseValue;
      entry.tcsComputed += tcsComputed;
      entry.tcsFromCsv += tcsFromCsv;
      monthMap.set(month, entry);
      continue;
    }

    if (row.settlement <= 0) continue;

    const month = getMonthKey(row.orderDate);

    // TCS is charged on gross merchandise value (what the customer paid), not on
    // the net settlement (post-fee payout). Gross = settlement + all fees deducted by Amazon.
    // Do NOT add tcsDeducted — it is a deduction from the seller's payout, not part of the
    // gross merchandise value the customer paid.
    const grossSalePrice = row.settlement + row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);
    const baseValue = row.gstRate > 0
      ? grossSalePrice / (1 + row.gstRate / 100)
      : grossSalePrice;

    const tcsComputed = baseValue * TCS_RATE;
    const tcsFromCsv = row.tcsDeducted > 0 ? row.tcsDeducted : 0;

    const entry = monthMap.get(month) ?? { taxableValue: 0, tcsComputed: 0, tcsFromCsv: 0 };
    entry.taxableValue += baseValue;
    entry.tcsComputed += tcsComputed;
    entry.tcsFromCsv += tcsFromCsv;
    monthMap.set(month, entry);
  }

  const monthlyBreakdown = Array.from(monthMap.entries())
    .map(([month, v]) => ({
      month,
      taxableValue: Math.round(v.taxableValue * 100) / 100,
      tcs: Math.round((v.tcsFromCsv > 0 ? v.tcsFromCsv : v.tcsComputed) * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const totalTcsCollected = monthlyBreakdown.reduce((s, m) => s + m.tcs, 0);

  return {
    totalTcsCollected: Math.round(totalTcsCollected * 100) / 100,
    totalTcsClaimable: Math.round(totalTcsCollected * 100) / 100,
    monthlyBreakdown,
    gstr3bReference: 'GSTR-3B Table 3(d) — TCS credit from e-commerce operators',
    section: SECTION,
    rate: TCS_RATE * 100,
    reliability: {
      classification: 'assumption_based',
      confidence: monthlyBreakdown.some(item => item.tcs > 0) ? 'medium' : 'low',
      source: 'mixed',
      assumptions: [
        lineRev
          ? 'Uses CSV TCS when present; otherwise 1% of (total_revenue − gst_amount) per row (Section 52 CGST).'
          : 'Uses CSV TCS values when present; otherwise estimates TCS at 1% of taxable value ex-GST.',
        'Always verify against operator statement / GSTR-2B before filing.',
      ],
    },
  };
}

function getMonthKey(dateStr?: string): string {
  if (!dateStr) return 'Unknown';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Unknown';
    // Use UTC methods — dates are stored as UTC midnight ISO strings (from parseFlexibleDate).
    // Using local getMonth() in IST (+5:30) shifts dates near midnight into the wrong month.
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  } catch {
    return 'Unknown';
  }
}
