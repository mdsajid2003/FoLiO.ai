import { SellerOrderRow, GstMismatch } from '../../types/index.ts';

const VALID_GST_RATES = [0, 5, 12, 18, 28];
const TCS_RATE = 0.01;

const VALID_STATE_CODES = new Set([
  'AP', 'AR', 'AS', 'BR', 'CG', 'GA', 'GJ', 'HR', 'HP', 'JH',
  'KA', 'KL', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OD', 'PB',
  'RJ', 'SK', 'TN', 'TG', 'TR', 'UP', 'UK', 'WB', 'AN', 'CH',
  'DH', 'DD', 'DL', 'JK', 'LA', 'LD', 'PY',
]);

/**
 * @deprecated NOT used in the active report pipeline.
 * The pipeline uses computeGstSummary() from src/lib/tax/gst-slabs.ts.
 * Retained for reference only. Will be removed in a future release.
 * Do NOT import this — it has diverged from the live implementation.
 */
export function reconcileGst(rows: SellerOrderRow[]): {
  mismatches: GstMismatch[];
  tcsCollected: number;
  tcsClaimable: number;
} {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[reconcileGst] DEPRECATED — use computeGstSummary() from tax/gst-slabs.ts');
  }
  const mismatches: GstMismatch[] = [];
  let tcsCollected = 0;

  for (const row of rows) {
    if (row.settlement <= 0) continue;

    // Gross sale price = net payout + all Amazon fees deducted.
    // In most Amazon reports settlement = net payout (post-fee); fees are listed
    // separately, so gross = settlement + fees gives the actual selling price.
    const grossSalePrice = row.settlement
      + row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees
      + (row.closingFee ?? 0);

    // TCS: 1% on taxable value (gross sale excluding GST)
    const taxableBase = row.gstRate > 0
      ? grossSalePrice / (1 + row.gstRate / 100)
      : grossSalePrice;
    tcsCollected += taxableBase * TCS_RATE;

    // GST rate validation
    if (row.gstRate > 0 && !VALID_GST_RATES.includes(row.gstRate)) {
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

    // GST amount validation: use gross sale price as the base.
    // Only flag when the relative deviation is meaningful (>25% of expectedGst),
    // avoiding false positives when the file reports GST on a different base.
    if (row.gstRate > 0 && row.gstCollected > 0) {
      const expectedGst = taxableBase * (row.gstRate / 100);
      const diff = expectedGst - row.gstCollected;
      const relativeDiff = expectedGst > 0 ? Math.abs(diff / expectedGst) : 0;

      const absoluteThreshold = Math.max(2, grossSalePrice * 0.02); // 2% of order value, min ₹2
      if (Math.abs(diff) > absoluteThreshold && relativeDiff > 0.20) {
        mismatches.push({
          orderId: row.orderId,
          pos: row.pos,
          expected: Math.round(expectedGst * 100) / 100,
          actual: Math.round(row.gstCollected * 100) / 100,
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

  const tcsRounded = Math.round(tcsCollected * 100) / 100;

  return {
    mismatches,
    tcsCollected: tcsRounded,
    tcsClaimable: tcsRounded,
  };
}

function closestValidRate(rate: number): number {
  return VALID_GST_RATES.reduce((a, b) =>
    Math.abs(b - rate) < Math.abs(a - rate) ? b : a
  );
}
