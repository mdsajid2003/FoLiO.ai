import { SellerOrderRow, TdsSummary } from '../../types/index.ts';
import { usesLineTotalRevenue } from '../reconcile/seller-dataset-basis.ts';

/**
 * 0.1% — Section 194-O of the Income Tax Act, 1961
 * (Inserted by Finance Act, 2020; applicable to e-commerce operators)
 * TDS is on the gross amount of sales or services at the time of credit or payment,
 * whichever is earlier. Threshold: gross receipts > ₹5 lakh for the financial year.
 */
const TDS_RATE_WITH_PAN = 0.001; // 0.1%

/**
 * 5% — Section 194-O read with Section 206AA of the Income Tax Act, 1961.
 * If the seller does NOT furnish a valid PAN, Section 206AA mandates deduction at
 * the HIGHER of: (a) twice the specified rate, (b) 5%, or (c) rate in force.
 * For 194-O: twice of 0.1% = 0.2%; 5% > 0.2% → effective rate = 5%.
 * Previous code erroneously used 2% — CORRECTED here.
 */
const TDS_RATE_WITHOUT_PAN = 0.05; // 5%

const SECTION = 'Section 194-O of Income Tax Act, 1961 (Finance Act, 2020)';

export function computeTdsSummary(
  rows: SellerOrderRow[],
  panFurnished: boolean = true,
): TdsSummary {
  const effectiveRate = panFurnished ? TDS_RATE_WITH_PAN : TDS_RATE_WITHOUT_PAN;
  const lineRev = usesLineTotalRevenue(rows);
  // Per-month: sum per-row TDS (CSV when present, else computed) so partial CSV columns do not undercount.
  const monthMap = new Map<string, { grossAmount: number; tdsComputed: number; tdsFromCsv: number; tdsBest: number }>();

  for (const row of rows) {
    if (lineRev) {
      if (row.isDeferred === true) continue;
      const rev = row.datasetTotalRevenue ?? 0;
      if (rev <= 0) continue;
      const month = getMonthKey(row.orderDate);
      const tdsComputed = rev * effectiveRate;
      const tdsFromCsv = row.tdsDeducted > 0 ? row.tdsDeducted : 0;
      const tdsBestForRow = tdsFromCsv > 0 ? tdsFromCsv : tdsComputed;
      const entry = monthMap.get(month) ?? { grossAmount: 0, tdsComputed: 0, tdsFromCsv: 0, tdsBest: 0 };
      entry.grossAmount += rev;
      entry.tdsComputed += tdsComputed;
      entry.tdsFromCsv += tdsFromCsv;
      entry.tdsBest += tdsBestForRow;
      monthMap.set(month, entry);
      continue;
    }

    // TDS is not fully reversed on returns per Section 194-O — ClearTax advisory:
    // skip return-only / credit rows so we never treat negative settlement as a TDS "credit".
    if (row.returnAmount > 0 && row.settlement <= 0) continue;

    if (row.settlement <= 0) continue;

    const month = getMonthKey(row.orderDate);

    // Section 194-O: TDS is on the gross amount paid by the customer = settlement + all
    // fees deducted by Amazon (referral, FBA, storage, etc.). Do NOT add tcsDeducted —
    // TCS is a deduction from the seller's payout, not an addition to the customer price.
    const grossAmount = row.settlement + row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);

    const tdsComputed = grossAmount * effectiveRate;
    const tdsFromCsv = row.tdsDeducted > 0 ? row.tdsDeducted : 0;
    // Per-row decision: use CSV if available, else compute. Prevents undercount when only some
    // rows in a month have the tdsDeducted column populated.
    const tdsBestForRow = tdsFromCsv > 0 ? tdsFromCsv : tdsComputed;

    const entry = monthMap.get(month) ?? { grossAmount: 0, tdsComputed: 0, tdsFromCsv: 0, tdsBest: 0 };
    entry.grossAmount += grossAmount;
    entry.tdsComputed += tdsComputed;
    entry.tdsFromCsv += tdsFromCsv;
    entry.tdsBest += tdsBestForRow;
    monthMap.set(month, entry);
  }

  const monthlyBreakdown = Array.from(monthMap.entries())
    .map(([month, v]) => {
      return {
        month,
        grossAmount: Math.round(v.grossAmount * 100) / 100,
        tds: Math.round(v.tdsBest * 100) / 100,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  const totalTds = monthlyBreakdown.reduce((s, m) => s + m.tds, 0);

  return {
    totalTdsDeducted: Math.round(totalTds * 100) / 100,
    totalTdsClaimable: Math.round(totalTds * 100) / 100,
    panFurnished,
    effectiveRate: effectiveRate * 100,
    monthlyBreakdown,
    section: SECTION,
    form26asReference: 'Verify TDS credits in Form 26AS / AIS under Section 194-O. Credits appear in Part A of Form 26AS.',
    reliability: {
      classification: 'assumption_based',
      confidence: monthlyBreakdown.some(item => item.tds > 0) ? 'medium' : 'low',
      source: 'mixed',
      assumptions: [
        lineRev
          ? `Uses CSV TDS when present; otherwise ${effectiveRate * 100}% of total_revenue per row (Section 194-O).`
          : `Uses CSV TDS when present; otherwise ${effectiveRate * 100}% of gross (settlement + fees).`,
        panFurnished
          ? 'Rate: 0.1% per Section 194-O (with PAN). Applicable when gross receipts > ₹5 lakh.'
          : 'Rate: 5% per Section 206AA read with Section 194-O (PAN not furnished). Furnish PAN immediately to Amazon to reduce rate to 0.1%.',
        'TDS credits must be verified in Form 26AS / AIS Part A before filing ITR.',
        'Claim TDS credit in ITR under Schedule TDS-2 (for non-salary TDS).',
        'If TDS is higher than tax liability, claim refund in ITR.',
      ],
    },
  };
}

function getMonthKey(dateStr?: string): string {
  if (!dateStr) return 'Unknown';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Unknown';
    // #25 fix: use UTC methods — dates are stored as UTC midnight ISO strings.
    // Using local getMonth() in IST (+5:30) shifts dates near midnight into the wrong month.
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  } catch {
    return 'Unknown';
  }
}
