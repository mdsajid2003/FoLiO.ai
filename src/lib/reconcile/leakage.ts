import { SellerOrderRow, LeakageItem, Platform } from '../../types/index.ts';
import { DEFAULT_SELLER_ANALYTICS_CONFIG } from '../../config/sellerAnalytics.config.ts';

// Amazon India FBA Pick & Pack (Standard-Size) weight handling fees.
// Updated to rates effective September 1, 2025 (Amazon India annual revision).
// Source: Amazon Seller Central IN / Rekonsile fee revision guide (Sept 2025).
//
// Structure:
//   fee          — base charge for the slab (₹, ex-GST, 18% GST added separately)
//   extraPer500g — incremental ₹ per 500g above the boundary of the previous slab
//
// Standard model: ₹17 base for ≤1kg, +₹5 per 500g up to 5kg,
// then +₹2 per 500g beyond 5kg (new lower tier introduced Sept 2025).
//
// WARNING: Verify against https://sellercentral.amazon.in before using for
// disputes — Amazon revises these slabs periodically (typically every Sept).
// WEIGHT_SLABS imported from config — edit src/config/fba-weight-slabs.ts to update rates
import { WEIGHT_SLABS } from '../../config/fba-weight-slabs.ts';

/** Amazon-style policy assumptions — date driven from config; update closing_fee_refund_cutoff in sellerAnalytics.config.ts if Amazon revises. */
const POLICY_DATES = {
  closingFeeRefundCutoff: new Date(DEFAULT_SELLER_ANALYTICS_CONFIG.closing_fee_refund_cutoff),
};

// Amazon India referral fee rates (effective September 1, 2025).
// These are mid-range slab estimates used for leakage detection when the CSV
// does not provide an explicit referral fee column. Rates are category-level
// approximations — the real schedule has price-band sub-slabs.
// Source: Amazon Seller Central IN fee schedule (Sept 2025 revision).
// Verify exact rates at https://sellercentral.amazon.in for each SKU.
export const REFERRAL_RATES: Record<string, number> = {
  default:     0.09,   // ~9% general/miscellaneous
  electronics: 0.06,   // 6% — computers, mobiles, accessories
  clothing:    0.13,   // 13% — apparel (was up to 24%, now trimmed to ~19% max)
  books:       0.05,   // 5% — books, fixed low-fee treatment preserved
  home:        0.09,   // 9% — home & kitchen
  beauty:      0.08,   // 8% — beauty/personal care (mid-slab reduced Sept 2025)
  sports:      0.09,   // 9% — sports & fitness
  toys:        0.09,   // 9% — toys & games
  shoes:       0.09,   // 9% — footwear (reduced Sept 2025 in lower price bands)
  furniture:   0.10,   // 10% — home furnishings
  grocery:     0.04,   // 4% — grocery & gourmet foods
  automotive:  0.10,   // 10% — automotive accessories
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  electronics: ['phone', 'mobile', 'laptop', 'charger', 'cable', 'earphone', 'headphone', 'speaker', 'tablet', 'camera', 'watch', 'smart', 'usb', 'power bank', 'adapter', 'electronic'],
  clothing: ['shirt', 'tshirt', 't-shirt', 'jeans', 'dress', 'kurta', 'saree', 'top', 'pant', 'trouser', 'jacket', 'hoodie', 'legging', 'clothing', 'apparel', 'wear', 'cotton', 'fabric'],
  books: ['book', 'novel', 'textbook', 'guide', 'manual', 'edition', 'paperback', 'hardcover'],
  home: ['pillow', 'bedsheet', 'curtain', 'towel', 'kitchen', 'utensil', 'bottle', 'container', 'organizer', 'decor', 'lamp', 'rug', 'mat', 'shelf'],
  beauty: ['cream', 'lotion', 'serum', 'shampoo', 'soap', 'perfume', 'cosmetic', 'makeup', 'lipstick', 'face', 'skin', 'hair', 'beauty', 'moisturizer'],
  sports: ['bat', 'ball', 'racket', 'yoga', 'gym', 'fitness', 'sport', 'exercise', 'dumbbell', 'treadmill'],
  toys: ['toy', 'puzzle', 'game', 'doll', 'lego', 'block', 'play', 'stuffed'],
  shoes: ['shoe', 'shoes', 'sandal', 'sandals', 'slipper', 'slippers', 'sneaker', 'sneakers', 'boot', 'boots', 'footwear', 'flip-flop', 'flipflop', 'chappal', 'heel', 'loafer'],
  furniture: ['furniture', 'sofa', 'chair', 'table', 'desk', 'wardrobe', 'cabinet', 'bed frame', 'bookshelf', 'cupboard'],
  grocery: ['grocery', 'food', 'snack', 'biscuit', 'rice', 'dal', 'spice', 'oil', 'ghee', 'flour', 'sugar', 'tea', 'coffee', 'juice', 'sauce', 'pickle', 'dry fruit', 'nuts'],
  automotive: ['car', 'bike', 'automotive', 'vehicle', 'tyre', 'battery', 'oil filter', 'brake', 'wiper', 'accessory', 'seat cover', 'dashboard'],
};

// Pre-compile keyword regexes once at module load — avoids creating thousands of
// RegExp objects per report (one per keyword per row). Input text is already
// lowercased in inferCategory so the 'i' flag was redundant and is dropped.
const CATEGORY_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = Object.entries(
  CATEGORY_KEYWORDS,
).map(([category, keywords]) => ({
  category,
  patterns: keywords.map(kw => new RegExp(`\\b${kw}\\b`)),
}));

function inferCategory(sku: string, productName?: string): string {
  const text = `${sku} ${productName ?? ''}`.toLowerCase();
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    if (patterns.some(re => re.test(text))) return category;
  }
  return 'default';
}

const AMAZON_REIMBURSEMENT_WINDOW_DAYS = 548; // ~18 months

type ReimbursementDeadline = { claimDeadlineDays: number; isExpiringSoon: boolean; isRecoverable?: boolean };

/** Amazon-style claim window from order date; null if date missing/invalid */
function computeReimbursementClaimDeadline(orderDateStr: string | undefined): ReimbursementDeadline | null {
  if (!orderDateStr || !String(orderDateStr).trim()) {
    return null;
  }
  const order = new Date(orderDateStr.trim());
  if (Number.isNaN(order.getTime())) {
    return null;
  }
  const today = new Date();
  const utcOrder = Date.UTC(order.getFullYear(), order.getMonth(), order.getDate());
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const daysSinceOrder = Math.floor((utcToday - utcOrder) / dayMs);
  const claimDeadlineDays = AMAZON_REIMBURSEMENT_WINDOW_DAYS - daysSinceOrder;
  const isExpiringSoon = claimDeadlineDays <= 30;
  const out: ReimbursementDeadline = {
    claimDeadlineDays,
    isExpiringSoon,
  };
  if (claimDeadlineDays <= 0) {
    out.isRecoverable = false;
  }
  return out;
}

/** Volumetric weight (kg) from L×W×H in cm — Amazon divisor 5000 */
function volumetricKgFromRow(row: SellerOrderRow): number {
  const L = row.length ?? 0;
  const W = row.width ?? 0;
  const H = row.height ?? 0;
  if (L > 0 && W > 0 && H > 0) return (L * W * H) / 5000;
  if (row.volumetricWeight != null && row.volumetricWeight > 0) return row.volumetricWeight;
  return 0;
}

/**
 * Billed weight: max(actual vs volumetric), rounded up to 500g slabs (Amazon-style).
 */
export function computeBilledWeight(actualKg: number, volumetricKg: number): number {
  const chargeableWeight = volumetricKg > 0 ? Math.max(actualKg, volumetricKg) : actualKg;
  if (chargeableWeight <= 0) return 0.5;
  const SLAB_STEP = 0.5;
  return Math.ceil(chargeableWeight / SLAB_STEP) * SLAB_STEP;
}

export function computeWeightFee(weightKg: number): number {
  // Find the last slab boundary BEFORE the one that matches (i.e. the lower
  // bound of the open-ended final slab) so `extra` is computed dynamically
  // rather than against the old hardcoded 2.0 kg constant.
  let prevMaxKg = 0;
  for (const slab of WEIGHT_SLABS) {
    if (weightKg <= slab.maxKg) {
      if (slab.extraPer500g === 0) return slab.fee;
      const extra = Math.ceil((weightKg - prevMaxKg) / 0.5) * slab.extraPer500g;
      return slab.fee + extra;
    }
    prevMaxKg = slab.maxKg;
  }
  return 65;
}

function orderDateValue(orderDate?: string): Date | null {
  if (!orderDate?.trim()) return null;
  const d = new Date(orderDate.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function enrichWeightItem(
  row: SellerOrderRow,
  expectedFee: number,
  chargedFee: number,
  diff: number,
  expectedBilled: number,
  chargedBilled: number,
  slabJump: boolean,
): LeakageItem {
  const wConf: LeakageItem['confidence'] = row.weightSource === 'parsed' ? 'high' : 'low';
  const desc = slabJump
    ? `Slab jump detected: declared weight would bill at ${expectedBilled}kg slab, charged at ${chargedBilled}kg slab. Extra fee ≈ ₹${diff.toFixed(2)}.`
    : `Weight charged at ${chargedBilled}kg billed slab but declared ${expectedBilled}kg billed slab. Extra fee: ₹${diff.toFixed(2)}`;
  const explanation = `Amazon charged fulfillment fee for a ${chargedBilled}kg weight slab but your declared product weight bills at ${expectedBilled}kg slab (charged physical/volumetric vs declared). This is an overcharge of ₹${diff.toFixed(2)}. You can raise a dispute in Seller Central.`;
  return {
    type: 'weight_slab_error',
    orderId: row.orderId,
    sku: row.sku,
    expected: expectedFee,
    actual: chargedFee,
    diff: Math.round(diff * 100) / 100,
    confidence: slabJump ? 'high' : wConf,
    description: desc,
    explanation,
    recoverable: true,
    sourceRows: [row.rowIndex],
  };
}

export function detectLeakage(rows: SellerOrderRow[], platform?: Platform): LeakageItem[] {
  const items: LeakageItem[] = [];
  const rowsForLeakage = rows.filter(r => r.rowSource !== 'amazon_transaction_line');
  const isFlipkart = platform === 'flipkart' || rows.some(r => r.platform === 'flipkart');

  // 1. Weight slab — Amazon only
  if (!isFlipkart) for (const row of rowsForLeakage) {
    if (row.weightSource === 'default') continue;
    if (row.weight <= 0 || row.declaredWeight <= 0) continue;

    const vol = volumetricKgFromRow(row);
    const expectedBilled = computeBilledWeight(row.declaredWeight, vol);
    const chargedBilled = computeBilledWeight(row.weight, vol);
    const expectedFee = computeWeightFee(expectedBilled);
    const chargedFee = computeWeightFee(chargedBilled);
    const diff = chargedFee - expectedFee;
    const slabJump = chargedBilled > expectedBilled + 1e-6;

    if (diff > 1) {
      items.push(enrichWeightItem(row, expectedFee, chargedFee, diff, expectedBilled, chargedBilled, slabJump));
    }
  }

  // 2. Duplicate charges
  const seenOrders = new Map<string, SellerOrderRow>();
  for (const row of rowsForLeakage) {
    if (row.referralFee <= 0) continue;
    const key = `${row.orderId}|${row.sku}|${row.referralFee.toFixed(2)}`;
    const prior = seenOrders.get(key);
    if (prior) {
      const fee = row.referralFee;
      items.push({
        type: 'duplicate_charge',
        orderId: row.orderId,
        sku: row.sku,
        expected: 0,
        actual: fee,
        diff: Math.round(fee * 100) / 100,
        confidence: 'high',
        description: `Duplicate referral fee of ₹${fee.toFixed(2)} for order ${row.orderId} (SKU: ${row.sku})`,
        explanation: `The referral fee of ₹${fee.toFixed(2)} was deducted twice for order ${row.orderId}. This is a duplicate deduction. Amazon will reimburse this on request.`,
        recoverable: true,
        sourceRows: [prior.rowIndex, row.rowIndex],
      });
    } else {
      seenOrders.set(key, row);
    }
  }

  // 3. Missing reimbursements
  const orderTotals = new Map<string, { returnTotal: number; creditTotal: number; returnRows: number[]; creditRows: number[] }>();
  for (const row of rowsForLeakage) {
    let entry = orderTotals.get(row.orderId);
    if (!entry) {
      entry = { returnTotal: 0, creditTotal: 0, returnRows: [], creditRows: [] };
      orderTotals.set(row.orderId, entry);
    }
    if (row.returnAmount > 0) {
      entry.returnTotal += row.returnAmount;
      entry.returnRows.push(row.rowIndex);
    }
    // #FIX: previously `row.returnAmount === 0` was required, which means reimbursement
    // rows that carry BOTH a positive settlement AND a positive returnAmount (partial
    // reimbursements) were never counted in creditTotal — making every such order look
    // fully uncompensated. Credit settlement regardless of returnAmount on the same row.
    if (row.settlement > 0 && (row.returnAmount > 0 || row.amazonTxKind === 'adjustment' || row.amazonTxKind === 'reversal')) {
      entry.creditTotal += row.settlement;
      entry.creditRows.push(row.rowIndex);
    }
  }

  const REIMBURSEMENT_TOL = 5;

  for (const [orderId, totals] of orderTotals) {
    if (totals.returnTotal <= 0) continue;

    const gap = totals.returnTotal - totals.creditTotal;
    const isFullyMissing = totals.creditTotal <= 0;
    const isPartiallyMissing = !isFullyMissing && gap > REIMBURSEMENT_TOL;

    if (!isFullyMissing && !isPartiallyMissing) continue;

    const firstReturnRow = rowsForLeakage.find(r => r.rowIndex === totals.returnRows[0]);
    const orderDate = firstReturnRow?.orderDate;
    const deadline = computeReimbursementClaimDeadline(orderDate);
    const days = deadline?.claimDeadlineDays ?? 0;
    const rec = days > 0;

    items.push({
      type: 'missing_reimbursement',
      orderId,
      sku: firstReturnRow?.sku,
      expected: Math.round(totals.returnTotal * 100) / 100,
      actual: Math.round(totals.creditTotal * 100) / 100,
      diff: Math.round(gap * 100) / 100,
      confidence: isFullyMissing ? 'medium' : 'low',
      description: isFullyMissing
        ? `Return of ₹${totals.returnTotal.toFixed(2)} for order ${orderId} with no reimbursement found`
        : `Partial reimbursement gap of ₹${gap.toFixed(2)} for order ${orderId} (returned ₹${totals.returnTotal.toFixed(2)}, credited ₹${totals.creditTotal.toFixed(2)})`,
      explanation: isFullyMissing
        ? `A return of ₹${totals.returnTotal.toFixed(2)} was processed for order ${orderId} but no credit was found. ${rec ? `About ${days} days left to file a claim.` : 'The 18-month window may have expired.'}`
        : `Order ${orderId}: returned ₹${totals.returnTotal.toFixed(2)} but only ₹${totals.creditTotal.toFixed(2)} credited — gap of ₹${gap.toFixed(2)}. Verify in Seller Central > Reports > Payments.`,
      recoverable: rec,
      sourceRows: [...totals.returnRows, ...totals.creditRows],
      ...(deadline ?? {}),
    });
  }

  // 3b. Closing fee / return policy (date-aware; requires closingFee column or explicit post-cutoff return)
  const closingKeySeen = new Set<string>();
  for (const row of rowsForLeakage) {
    if (row.returnAmount <= 0) continue;
    const od = orderDateValue(row.orderDate ?? row.postedDate);
    const cf = row.closingFee ?? 0;
    if (cf <= 0 && !od) continue;

    if (cf > 0 && od && od > POLICY_DATES.closingFeeRefundCutoff) {
      const k = `${row.orderId}|post|${row.rowIndex}`;
      if (closingKeySeen.has(k)) continue;
      closingKeySeen.add(k);
      items.push({
        type: 'closing_fee_not_refunded',
        orderId: row.orderId,
        sku: row.sku,
        expected: cf,
        actual: 0,
        diff: Math.round(cf * 100) / 100,
        confidence: 'medium',
        description: 'Closing fee refund not applicable under current Amazon policy (post Feb 2024).',
        explanation:
          'Closing fee refunds were discontinued by Amazon after February 2024 for many return scenarios. Assumption: policy cutoff date is 2024-02-01 — verify in your Seller Central account. This amount is not recoverable under current policy.',
        recoverable: false,
        sourceRows: [row.rowIndex],
      });
    } else if (cf > 0 && row.settlement <= 0 && od && od <= POLICY_DATES.closingFeeRefundCutoff) {
      const k = `${row.orderId}|pre|${row.rowIndex}`;
      if (closingKeySeen.has(k)) continue;
      closingKeySeen.add(k);
      items.push({
        type: 'closing_fee_not_refunded',
        orderId: row.orderId,
        sku: row.sku,
        expected: cf,
        actual: 0,
        diff: Math.round(cf * 100) / 100,
        confidence: 'medium',
        description: 'Closing fee charged on return with no refund credit visible.',
        explanation:
          'A closing fee appears to have been charged with no matching refund credit on this return line. Verify against your settlement detail; if still missing, open a case with Amazon.',
        recoverable: true,
        sourceRows: [row.rowIndex],
      });
    }
  }

  // 4. Incorrect referral fees
  for (const row of rowsForLeakage) {
    if (row.settlement <= 0 || row.referralFee <= 0) continue;
    // Reconstruct gross selling price (settlement + all fees), then remove GST to get
    // the taxable base Amazon applies the referral rate to. Using this base avoids
    // the circular error where referralFee is inside the gross it's being compared against.
    const sellingPrice = row.settlement + row.referralFee + row.fulfillmentFee + row.storageFee + row.otherFees + (row.closingFee ?? 0);
    const taxableBase = row.gstRate > 0
      ? sellingPrice / (1 + row.gstRate / 100)
      : sellingPrice;
    const actualRate = taxableBase > 0 ? row.referralFee / taxableBase : 0;
    const category = inferCategory(row.sku, row.productName);
    // #FIX: skip 'default' — we don't know the true rate for unrecognised SKUs,
    // so flagging them generates false positives for all generic products.
    if (category === 'default') continue;
    const expectedRate = REFERRAL_RATES[category] ?? REFERRAL_RATES.default;
    const expectedFee = taxableBase * expectedRate;
    // Only flag when BOTH the fee amount exceeds 1.3× expected AND the actual rate exceeds
    // 1.3× expected rate. This prevents false positives where every order is at a uniform
    // valid rate (e.g. 12%) that simply doesn't match our heuristic category (e.g. 8% default).
    if (row.referralFee > expectedFee * 1.3 && actualRate > expectedRate * 1.3) {
      const overage = row.referralFee - expectedFee;
      items.push({
        type: 'incorrect_referral_fee',
        orderId: row.orderId,
        sku: row.sku,
        expected: Math.round(expectedFee * 100) / 100,
        actual: Math.round(row.referralFee * 100) / 100,
        diff: Math.round(overage * 100) / 100,
        confidence: 'medium',
        description: `Referral fee ₹${row.referralFee.toFixed(2)} exceeds expected ₹${expectedFee.toFixed(2)} (${(expectedRate * 100).toFixed(0)}% of taxable ₹${taxableBase.toFixed(2)} for ${category}). Overage: ₹${overage.toFixed(2)}`,
        explanation: `The referral fee charged (₹${row.referralFee.toFixed(2)}) exceeds the expected rate (${(expectedRate * 100).toFixed(0)}% of taxable value ₹${taxableBase.toFixed(2)} = ₹${expectedFee.toFixed(2)}) for category "${category}". Amazon applies referral rates to the taxable selling price ex-GST, not to the gross. This may be due to incorrect category assignment in our heuristic.`,
        recoverable: true,
        sourceRows: [row.rowIndex],
      });
    }
  }

  // 5. Storage overcharges — volume-aware when dimensions present
  for (const row of rowsForLeakage) {
    if (row.rowSource === 'amazon_transaction_line') continue;
    if (row.storageFee <= 0) continue;

    const RATE_PER_CUFT_MONTH = 1.20; // Amazon IN upper bound ₹/cu.ft/month
    const CUFT_PER_CUBIC_CM = 1 / 28316.8;
    const qty = Math.max(1, row.quantity);
    const L = row.length ?? 0;
    const W = row.width ?? 0;
    const H = row.height ?? 0;

    let flagged = false;
    let description = '';
    let explanation = '';

    if (L > 0 && W > 0 && H > 0) {
      const volumeCuFt = L * W * H * CUFT_PER_CUBIC_CM;
      const expectedMax = Math.round(volumeCuFt * qty * RATE_PER_CUFT_MONTH * 100) / 100;
      if (row.storageFee > Math.max(10, expectedMax * 3)) {
        flagged = true;
        description = `Storage fee ₹${row.storageFee.toFixed(2)} is unusually high for ${qty} unit(s) at ${(volumeCuFt * qty).toFixed(3)} cu.ft (est. max ₹${expectedMax.toFixed(2)}).`;
        explanation = `Based on dimensions ${L}×${W}×${H} cm, estimated max monthly storage is ₹${expectedMax.toFixed(2)}. Actual charge ₹${row.storageFee.toFixed(2)} likely indicates long-term storage surcharge for aged inventory (>180 days). Consider a removal order.`;
      }
    } else if (row.storageFee > 500) {
      flagged = true;
      description = `Storage fee ₹${row.storageFee.toFixed(2)} for order ${row.orderId} is unusually high (no product dimensions available for accurate check).`;
      explanation = `Storage fee ₹${row.storageFee.toFixed(2)} is high but product dimensions are missing for precise verification. Add length/width/height columns for accurate detection.`;
    }

    if (flagged) {
      items.push({
        type: 'storage_overcharge',
        orderId: row.orderId,
        sku: row.sku,
        expected: 0,
        actual: row.storageFee,
        diff: Math.round(row.storageFee * 100) / 100,
        confidence: 'low',
        description,
        explanation,
        recoverable: false,
        sourceRows: [row.rowIndex],
      });
    }
  }

  return items;
}
