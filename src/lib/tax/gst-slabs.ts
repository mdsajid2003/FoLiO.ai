import { SellerOrderRow, GstSummary, GstMismatch } from '../../types/index.ts';

export const GST_RATES = [0, 5, 12, 18, 28] as const;

const VALID_STATE_CODES = new Set([
  'AP', 'AR', 'AS', 'BR', 'CG', 'GA', 'GJ', 'HR', 'HP', 'JH',
  'KA', 'KL', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OD', 'PB',
  'RJ', 'SK', 'TN', 'TG', 'TR', 'UP', 'UK', 'WB', 'AN', 'CH',
  'DH', 'DD', 'DL', 'JK', 'LA', 'LD', 'PY',
]);

export function closestValidRate(rate: number): number {
  return [...GST_RATES].reduce((a, b) =>
    Math.abs(b - rate) < Math.abs(a - rate) ? b : a
  );
}

export function isInterstate(sellerState: string, buyerState: string): boolean {
  if (!sellerState || !buyerState) return true;
  return sellerState.toUpperCase().slice(0, 2) !== buyerState.toUpperCase().slice(0, 2);
}

/** Most common 2-letter state from rows, else env SELLER_REGISTERED_STATE, else KA.
 *  Priority: 1. userRegisteredState (from onboarding), 2. env var, 3. row data, 4. KA default */
export function inferSellerState(rows: SellerOrderRow[], userRegisteredState?: string): string {
  // Priority 1: user profile state
  if (userRegisteredState && /^[A-Za-z]{2}$/.test(userRegisteredState.trim())) {
    return userRegisteredState.trim().toUpperCase();
  }
  const env = typeof process !== 'undefined' && process.env?.SELLER_REGISTERED_STATE;
  if (env && /^[A-Za-z]{2}$/.test(env.trim())) return env.trim().toUpperCase();

  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row.sellerState?.trim();
    if (!raw || raw.length < 2) continue;
    const code = raw.toUpperCase().slice(0, 2);
    if (VALID_STATE_CODES.has(code)) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return 'KA';
  let best = 'KA';
  let max = 0;
  for (const [code, n] of counts) {
    if (n > max) {
      max = n;
      best = code;
    }
  }
  return best;
}

export function computeGstSummary(
  rows: SellerOrderRow[],
  sellerRegisteredState: string = 'KA',
  gstr2bItcInput?: number,
): GstSummary {
  const mismatches: GstMismatch[] = [];
  let totalOutputTax = 0;
  let igstAmount = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;

  const rateMap = new Map<number, { taxableValue: number; tax: number; count: number }>();

  for (const row of rows) {
    if (row.isDeferred === true) continue;
    if (row.settlement <= 0) continue;

    // Gross sale price = net payout + fees deducted by marketplace.
    // GST was charged on this gross, not on the net settlement alone.
    const grossSalePrice = row.settlement + row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);

    // Accumulate rate breakdown
    const entry = rateMap.get(row.gstRate) ?? { taxableValue: 0, tax: 0, count: 0 };
    const baseAmount = row.gstRate > 0
      ? grossSalePrice / (1 + row.gstRate / 100)
      : grossSalePrice;

    // BUGFIX: Amazon settlement reports often omit the GST amount column (gstCollected = 0).
    // Fall back to computing output tax from rate × taxable base so totalOutputTax,
    // IGST/CGST/SGST, and rate breakdown are not all zero.
    const gstOnSale = row.gstCollected > 0
      ? row.gstCollected
      : (row.gstRate > 0 ? Math.round(baseAmount * (row.gstRate / 100) * 100) / 100 : 0);
    totalOutputTax += gstOnSale;
    // BUGFIX: when gstCollected is present in the CSV, taxableValue must be back-derived
    // from gstOnSale (= gstCollected) so the displayed taxable base matches the GST amount.
    // Using baseAmount (from fee-reconstructed grossSalePrice) diverges when the CSV gstCollected
    // was computed on total_revenue — causing the display mismatch (₹11,10,461 vs ₹11,22,270).
    const taxableForBreakdown = row.gstCollected > 0 && row.gstRate > 0
      ? gstOnSale / (row.gstRate / 100)
      : baseAmount;
    entry.taxableValue += taxableForBreakdown;
    entry.tax += gstOnSale;
    entry.count += 1;
    rateMap.set(row.gstRate, entry);

    // IGST vs CGST+SGST split
    const interstate = isInterstate(sellerRegisteredState, row.pos);
    if (interstate) {
      igstAmount += gstOnSale;
    } else {
      cgstAmount += gstOnSale / 2;
      sgstAmount += gstOnSale / 2;
    }

    // Rate validation
    if (row.gstRate > 0 && !GST_RATES.includes(row.gstRate as any)) {
      mismatches.push({
        orderId: row.orderId,
        pos: row.pos,
        expected: closestValidRate(row.gstRate),
        actual: row.gstRate,
        diff: 0,
        gstRate: row.gstRate,
        reason: 'rate_mismatch',
        confidence: 'high',
      });
      continue;
    }

    // 12% is a valid GST slab (textiles, processed food, etc.)
    // Only flag if invoiced as 12% but computed GST suggests otherwise

    // GST amount validation — flag only when relative deviation is significant (>25%)
    if (row.gstRate > 0 && gstOnSale > 0) {
      const expectedGst = baseAmount * (row.gstRate / 100);
      const diff = expectedGst - gstOnSale;
      const relativeDiff = expectedGst > 0 ? Math.abs(diff / expectedGst) : 0;
      const absoluteThreshold = Math.max(2, grossSalePrice * 0.02); // 2% of order value, min ₹2
      if (Math.abs(diff) > absoluteThreshold && relativeDiff > 0.20) {
        mismatches.push({
          orderId: row.orderId,
          pos: row.pos,
          expected: Math.round(expectedGst * 100) / 100,
          actual: Math.round(gstOnSale * 100) / 100,
          diff: Math.round(diff * 100) / 100,
          gstRate: row.gstRate,
          reason: 'rate_mismatch',
          confidence: 'high',
        });
      }
    }

    // Place of supply validation
    if (row.pos && !VALID_STATE_CODES.has(row.pos.toUpperCase())) {
      mismatches.push({
        orderId: row.orderId,
        pos: row.pos,
        expected: 0,
        actual: 0,
        diff: 0,
        gstRate: row.gstRate,
        reason: 'pos_error',
        confidence: 'medium',
      });
    }
  }

  // ITC on Amazon platform fees — 18% GST embedded in fees (claim in GSTR-3B; verify vs GSTR-2B)
  const GST_ON_FEES_RATE = 0.18;
  let referralFeeGst = 0;
  let fbaFeeGst = 0;
  let storageFeeGst = 0;
  let otherFeeGst = 0;
  let closingFeeGst = 0;
  for (const row of rows) {
    // Skip deferred/reserved rows — not yet paid out, no GST event.
    if (row.isDeferred === true) continue;
    // Only count ITC on rows where Amazon actually charged fees (settlement > 0).
    // Return rows (settlement <= 0) may carry fee values from the original order but
    // Amazon does not charge fresh fees on returns — including them inflates ITC.
    if (row.settlement <= 0) continue;
    referralFeeGst += row.referralFee * GST_ON_FEES_RATE;
    fbaFeeGst += row.fulfillmentFee * GST_ON_FEES_RATE;
    storageFeeGst += row.storageFee * GST_ON_FEES_RATE;
    otherFeeGst += row.otherFees * GST_ON_FEES_RATE;
    closingFeeGst += (row.closingFee ?? 0) * GST_ON_FEES_RATE;
  }
  const itcFromAmazonFees = Math.round((referralFeeGst + fbaFeeGst + storageFeeGst + otherFeeGst + closingFeeGst) * 100) / 100;
  const amazonFeesGstBreakdown = {
    referralFeeGst: Math.round(referralFeeGst * 100) / 100,
    fbaFeeGst: Math.round(fbaFeeGst * 100) / 100,
    storageFeeGst: Math.round(storageFeeGst * 100) / 100,
    otherFeeGst: Math.round(otherFeeGst * 100) / 100,
    closingFeeGst: Math.round(closingFeeGst * 100) / 100,
    total: itcFromAmazonFees,
  };

  let itcMismatchVsGstr2b: number | undefined;
  if (gstr2bItcInput != null && Number.isFinite(gstr2bItcInput)) {
    itcMismatchVsGstr2b = Math.round((itcFromAmazonFees - gstr2bItcInput) * 100) / 100;
    if (Math.abs(itcMismatchVsGstr2b) > 2) {
      mismatches.push({
        orderId: 'GSTR-2B',
        pos: '—',
        expected: Math.round(itcFromAmazonFees * 100) / 100,
        actual: Math.round(gstr2bItcInput * 100) / 100,
        diff: Math.round(itcMismatchVsGstr2b * 100) / 100,
        gstRate: 18,
        reason: 'itc_mismatch',
        confidence: 'high',
      });
    }
  }

  const rateBreakdown = Array.from(rateMap.entries())
    .map(([rate, v]) => ({
      rate,
      taxableValue: Math.round(v.taxableValue * 100) / 100,
      tax: Math.round(v.tax * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => a.rate - b.rate);

  const netGstLiability = totalOutputTax - itcFromAmazonFees;

  return {
    totalOutputTax: Math.round(totalOutputTax * 100) / 100,
    totalInputTaxCredit: Math.round(itcFromAmazonFees * 100) / 100,
    netGstLiability: Math.round(Math.max(0, netGstLiability) * 100) / 100,
    igstAmount: Math.round(igstAmount * 100) / 100,
    cgstAmount: Math.round(cgstAmount * 100) / 100,
    sgstAmount: Math.round(sgstAmount * 100) / 100,
    mismatches,
    rateBreakdown,
    itcEligible: itcFromAmazonFees,
    itcFromAmazonFees,
    itcMismatchVsGstr2b,
    amazonFeesGstBreakdown,
    gstr1Pointers: [
      'B2C sales: Report all invoices under ₹2.5L in Table 7',
      'B2B sales: Report with GSTIN in Table 4',
      'Credit/debit notes for returns in Table 9',
      'HSN-wise summary in Table 12',
    ],
    gstr3bPointers: [
      'Table 3.1(a): Outward taxable supplies',
      'Table 3(d): TCS credit from e-commerce operator',
      'Table 4: ITC on platform fees (estimated at 18% — verify with actual invoices)',
      'Table 5.1: Exempt/nil-rated supplies if applicable',
    ],
    itcIsEstimated: gstr2bItcInput == null,
    reliability: {
      classification: 'assumption_based',
      confidence: mismatches.length > 0 ? 'medium' : 'low',
      source: 'mixed',
      assumptions: [
        'Assumes settlement values are GST-inclusive when deriving taxable value.',
        `Seller state used: ${sellerRegisteredState}${sellerRegisteredState === 'KA' ? ' (default — verify this matches your GSTIN registration state)' : ' (from data/config)'}.`,
        'ITC figures are computed from settlement fees × 18%. Always verify against Amazon GST invoice / GSTR-2B before filing.',
      ],
    },
  };
}
