// ─────────────────────────────────────────────────────────────────────────────
// Dataset question engine — analyses parsed rows and generates 3-5 smart,
// contextual follow-up questions the user should confirm for accurate reports.
// ─────────────────────────────────────────────────────────────────────────────

import type { SellerOrderRow, DatasetQuestion } from '../../types/index.ts';

export type { DatasetQuestion };

export function generateDatasetQuestions(
  rows: SellerOrderRow[],
  platform: string,
  unmatchedColumns: string[] = [],
): DatasetQuestion[] {
  const questions: DatasetQuestion[] = [];

  // ── Q1: FBA vs Easy Ship ─────────────────────────────────────────
  const fulfillmentRows = rows.filter(r => r.fulfillmentFee > 0);
  if (platform === 'amazon' && fulfillmentRows.length > 0) {
    questions.push({
      id: 'fulfillment_type',
      question: 'Are these FBA (Fulfilled by Amazon) or Easy Ship orders?',
      context: `${fulfillmentRows.length} row(s) carry fulfillment fees. FBA fees have specific weight-slab tiers; Easy Ship has different pricing. Confirming this validates whether detected fee overcharges are real.`,
      options: ['FBA (Fulfilled by Amazon)', 'Easy Ship', 'Both FBA and Easy Ship', "I'm not sure"],
      importance: 'high',
      detectedReason: `${fulfillmentRows.length} rows have non-zero fulfillment fees`,
    });
  }

  // ── Q2: Returns handling ─────────────────────────────────────────
  const returnRows = rows.filter(r => r.returnAmount > 0);
  if (returnRows.length > 0) {
    const totalReturns = returnRows.reduce((s, r) => s + r.returnAmount, 0);
    questions.push({
      id: 'returns_handling',
      question: `${returnRows.length} return row(s) detected (total ₹${totalReturns.toLocaleString('en-IN', { maximumFractionDigits: 0 })}). Are returns already netted into settlement, or listed as separate rows?`,
      context: 'This changes whether returns are subtracted again from net revenue. Double-subtracting leads to understated profit.',
      options: [
        'Returns are netted into the settlement amount (standard Amazon)',
        'Returns appear as separate negative/return rows',
        "I'm not sure — I'll check the report format",
      ],
      importance: 'critical',
      detectedReason: `${returnRows.length} rows with returnAmount > 0`,
    });
  }

  // ── Q3: GST inclusive vs exclusive ──────────────────────────────
  const gstRows = rows.filter(r => r.gstRate > 0);
  if (gstRows.length > 0) {
    const avgRate = Math.round(gstRows.reduce((s, r) => s + r.gstRate, 0) / gstRows.length);
    questions.push({
      id: 'gst_inclusive',
      question: 'Are the listed settlement/sale amounts GST-inclusive (MRP already includes GST)?',
      context: `Average detected GST rate: ${avgRate}%. If prices are GST-inclusive, taxable value = price × 100/(100+rate). This directly affects your GSTR-1 output tax and GST liability calculation.`,
      options: [
        'Yes — prices include GST (standard for most Amazon/Flipkart sales)',
        'No — GST is charged on top of the listed price',
        'Varies by product / SKU',
        "I'm not sure",
      ],
      importance: 'critical',
      detectedReason: `${gstRows.length} rows with GST rate data; avg rate ${avgRate}%`,
    });
  }

  // ── Q4: Settlement = net or gross? ───────────────────────────────
  const feeRows = rows.filter(r => r.referralFee > 0 || r.fulfillmentFee > 0);
  if (feeRows.length > 0) {
    questions.push({
      id: 'settlement_type',
      question: 'Is the "settlement amount" the net payout after fees, or the gross sale price before fees?',
      context: 'Amazon deposits the net amount (gross – fees). If your column is gross, fees would be double-counted in expense totals and profit would be understated.',
      options: [
        'Net after fees — what the platform deposits to my bank',
        'Gross sale price — before any fees are deducted',
        "I'm not sure",
      ],
      importance: 'critical',
      detectedReason: `${feeRows.length} rows have both settlement and fee columns`,
    });
  }

  // ── Q5: TCS / TDS not found ──────────────────────────────────────
  const hasTcs = rows.some(r => r.tcsDeducted > 0);
  const hasTds = rows.some(r => r.tdsDeducted > 0);
  if (!hasTcs && !hasTds) {
    const platformName = platform === 'amazon' ? 'Amazon' : 'Flipkart';
    questions.push({
      id: 'tcs_tds_status',
      question: `No TCS (Tax Collected at Source) was found in this report. Has ${platformName} deducted TCS?`,
      context: `${platformName} deducts 1% TCS under Section 52 of CGST Act on gross merchandise value. Missing TCS data means the TCS credit claimed in GSTR-3B Table 3(d) may be understated.`,
      options: [
        `Yes — ${platformName} deducted TCS, but it may be in a different report/column`,
        'No TCS was deducted for this settlement period',
        "I'll cross-check from my GSTR-2B portal",
      ],
      importance: 'high',
      detectedReason: 'no tcsDeducted or tdsDeducted values found across all parsed rows',
    });
  }

  // ── Bonus Q: unmatched columns hinting at missing data ──────────
  if (unmatchedColumns.length > 0 && questions.length < 5) {
    questions.push({
      id: 'unmatched_columns',
      question: `${unmatchedColumns.length} column(s) in your file were not recognised: "${unmatchedColumns.slice(0, 3).join('", "')}". Do any of these contain settlement or fee data?`,
      context: 'Unrecognised columns are ignored. If they contain revenue or fee data, your totals may be incomplete.',
      options: [
        'Yes — please re-map them (use the Column Mapping section below)',
        'No — these are informational columns only (e.g. ASIN, product name)',
        "I'm not sure",
      ],
      importance: 'medium',
      detectedReason: `${unmatchedColumns.length} headers had no match: ${unmatchedColumns.join(', ')}`,
    });
  }

  return questions.slice(0, 5);
}
