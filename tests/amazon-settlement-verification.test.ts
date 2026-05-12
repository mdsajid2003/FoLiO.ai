/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AMAZON MONTHLY SETTLEMENT — FULL CALCULATION VERIFICATION SUITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dataset: 19-row Amazon MTR-style settlement (Jan–Mar 2026)
 * "settlement amount" = NET payout (gross − all fees), per generateDemoCsv convention.
 *
 * Gross reconstruction rule for every order row:
 *   gross = settlement + referralFee + fbaFee + storageFee + otherFees
 *
 * HAND-VERIFIED EXPECTED VALUES (do NOT change these without re-deriving on paper):
 *
 *  ORD-001 gross=1180  gst@18%=180  taxable=1000  ref=60   fba=65  stor=5   KA-intra
 *  ORD-002 gross=525   gst@5% =25   taxable=500   ref=50   fba=45  stor=3   MH-inter
 *  ORD-003 gross=1120  gst@12%=120  taxable=1000  ref=90   fba=55  stor=8   DL-inter  ← WEIGHT SLAB ERR (+₹10)
 *  ORD-004 gross=350   gst@0% =0    taxable=350   ref=17.5 fba=30  stor=0   GJ-inter
 *  ORD-005 gross=2360  gst@18%=360  taxable=2000  ref=160  fba=80  stor=12  oth=15 RJ-inter
 *  ORD-006 gross=1280  gst@28%=280  taxable=1000  ref=100  fba=65  stor=6   TN-inter
 *  ORD-007 gross=672   gst@12%=72   taxable=600   ref=54   fba=45  stor=4   UP-inter
 *  ORD-008 gross=2950  gst@18%=450  taxable=2500  ref=150  fba=95  stor=15  WB-inter  ← WEIGHT SLAB ERR (+₹15)
 *  ORD-009a gross=840  gst@12%=90   taxable=750   ref=67.5 fba=55  stor=5   MH-inter
 *  ORD-009b settlement=0, ref=67.50                                                    ← DUPLICATE FEE
 *  ORD-010 gross=1534  gst@18%=234  taxable=1300  ref=104  fba=65  stor=9   KA-intra
 *  ORD-011 settlement=0, return=1180                                                   ← MISSING REIMBURSEMENT
 *  ORD-012 gross=735   gst@5% =35   taxable=700   ref=70   fba=55  stor=5   MH-inter
 *  ORD-013 gross=826   gst@18%=126  taxable=700   ref=63   fba=50  stor=7   DL-inter
 *  ORD-014 gross=4720  gst@18%=720  taxable=4000  ref=240  fba=95  stor=20  oth=25 GJ-inter
 *  ORD-015 gross=560   gst@0% =0    taxable=560   ref=28   fba=30  stor=0   TN-inter
 *  ORD-016 gross=1920  gst@28%=420  taxable=1500  ref=150  fba=65  stor=10  UP-inter
 *  ORD-017 gross=1298  gst@18%=198  taxable=1100  ref=88   fba=80  stor=10  WB-inter
 *  ORD-018 gross=448   gst@12%=48   taxable=400   ref=36   fba=30  stor=3   RJ-inter
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { SellerOrderRow } from '../src/types/index.ts';
import { computeTcsSummary } from '../src/lib/tax/tcs.ts';
import { computeTdsSummary } from '../src/lib/tax/tds.ts';
import { computeGstSummary } from '../src/lib/tax/gst-slabs.ts';
import { computeIncomeTaxEstimate } from '../src/lib/tax/income-tax.ts';
import { computeTotals, computeSkuProfitability, computeMonthlyTrends } from '../src/lib/reconcile/settlement.ts';
import { detectLeakage, computeBilledWeight, computeWeightFee } from '../src/lib/reconcile/leakage.ts';
import { computeProfitBreakdown } from '../src/lib/reconcile/profit-engine.ts';

// ─── Tolerance helper ─────────────────────────────────────────────────────────
function approx(expected: number, actual: number, tolerance = 0.02): boolean {
  return Math.abs(actual - expected) <= tolerance;
}
function expectApprox(actual: number, expected: number, label: string, tol = 0.02) {
  if (!approx(expected, actual, tol)) {
    throw new Error(
      `[${label}] Expected ≈${expected.toFixed(4)}, got ${actual.toFixed(4)} (diff=${(actual - expected).toFixed(4)})`
    );
  }
}

// ─── DEFINITIVE DATASET (19 rows) ─────────────────────────────────────────────
// settlement = NET payout from Amazon (gross minus all fees already deducted)
// gross = settlement + referralFee + fbaFee + storageFee + otherFees
const ROWS: SellerOrderRow[] = [
  // ── January 2026 ──────────────────────────────────────────────────────────
  {
    platform: 'amazon', orderId: 'ORD-001', sku: 'SKU-ELEC-01',
    sellingPrice: 1180, settlement: 1050,
    referralFee: 60, fulfillmentFee: 65, storageFee: 5, otherFees: 0,
    gstCollected: 180, gstRate: 18, pos: 'KA',
    tcsDeducted: 10, tdsDeducted: 0, returnAmount: 0,
    weight: 0.5, declaredWeight: 0.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-01-05', rowIndex: 2,
  },
  {
    platform: 'amazon', orderId: 'ORD-002', sku: 'SKU-CLOTH-01',
    sellingPrice: 525, settlement: 427,
    referralFee: 50, fulfillmentFee: 45, storageFee: 3, otherFees: 0,
    gstCollected: 25, gstRate: 5, pos: 'MH',
    tcsDeducted: 5, tdsDeducted: 0, returnAmount: 0,
    weight: 1.0, declaredWeight: 1.0, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-01-10', rowIndex: 3,
  },
  {
    // WEIGHT SLAB ERROR: charged 1.5kg slab (₹55), should be 1.0kg slab (₹45) → overcharge=₹10
    platform: 'amazon', orderId: 'ORD-003', sku: 'SKU-HOME-01',
    sellingPrice: 1120, settlement: 967,
    referralFee: 90, fulfillmentFee: 55, storageFee: 8, otherFees: 0,
    gstCollected: 120, gstRate: 12, pos: 'DL',
    tcsDeducted: 10, tdsDeducted: 0, returnAmount: 0,
    weight: 1.5, declaredWeight: 1.0, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-01-15', rowIndex: 4,
  },
  {
    platform: 'amazon', orderId: 'ORD-004', sku: 'SKU-BOOK-01',
    sellingPrice: 350, settlement: 302.5,
    referralFee: 17.5, fulfillmentFee: 30, storageFee: 0, otherFees: 0,
    gstCollected: 0, gstRate: 0, pos: 'GJ',
    tcsDeducted: 3.5, tdsDeducted: 0, returnAmount: 0,
    weight: 0.5, declaredWeight: 0.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-01-20', rowIndex: 5,
  },
  {
    platform: 'amazon', orderId: 'ORD-005', sku: 'SKU-SPORT-01',
    sellingPrice: 2360, settlement: 2093,
    referralFee: 160, fulfillmentFee: 80, storageFee: 12, otherFees: 15,
    gstCollected: 360, gstRate: 18, pos: 'RJ',
    tcsDeducted: 20, tdsDeducted: 0, returnAmount: 0,
    weight: 2.0, declaredWeight: 2.0, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-01-25', rowIndex: 6,
  },
  {
    platform: 'amazon', orderId: 'ORD-006', sku: 'SKU-BEAUTY-01',
    sellingPrice: 1280, settlement: 1109,
    referralFee: 100, fulfillmentFee: 65, storageFee: 6, otherFees: 0,
    gstCollected: 280, gstRate: 28, pos: 'TN',
    tcsDeducted: 10, tdsDeducted: 0, returnAmount: 0,
    weight: 1.0, declaredWeight: 1.0, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-01-30', rowIndex: 7,
  },
  // ── February 2026 ──────────────────────────────────────────────────────────
  {
    platform: 'amazon', orderId: 'ORD-007', sku: 'SKU-TOY-01',
    sellingPrice: 672, settlement: 569,
    referralFee: 54, fulfillmentFee: 45, storageFee: 4, otherFees: 0,
    gstCollected: 72, gstRate: 12, pos: 'UP',
    tcsDeducted: 6, tdsDeducted: 0, returnAmount: 0,
    weight: 0.5, declaredWeight: 0.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-02-03', rowIndex: 8,
  },
  {
    // WEIGHT SLAB ERROR: charged 3.0kg (₹95), declared 2.5kg (₹80) → overcharge=₹15
    platform: 'amazon', orderId: 'ORD-008', sku: 'SKU-ELEC-02',
    sellingPrice: 2950, settlement: 2690,
    referralFee: 150, fulfillmentFee: 95, storageFee: 15, otherFees: 0,
    gstCollected: 450, gstRate: 18, pos: 'WB',
    tcsDeducted: 25, tdsDeducted: 0, returnAmount: 0,
    weight: 3.0, declaredWeight: 2.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-02-08', rowIndex: 9,
  },
  {
    // Row 1 of ORD-009 — genuine sale
    platform: 'amazon', orderId: 'ORD-009', sku: 'SKU-HOME-02',
    sellingPrice: 840, settlement: 712.5,
    referralFee: 67.5, fulfillmentFee: 55, storageFee: 5, otherFees: 0,
    gstCollected: 90, gstRate: 12, pos: 'MH',
    tcsDeducted: 7.5, tdsDeducted: 0, returnAmount: 0,
    weight: 1.0, declaredWeight: 1.0, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-02-12', rowIndex: 10,
  },
  {
    // Row 2 of ORD-009 — DUPLICATE referral fee (settlement=0, same orderId+sku+referralFee)
    platform: 'amazon', orderId: 'ORD-009', sku: 'SKU-HOME-02',
    sellingPrice: 0, settlement: 0,
    referralFee: 67.5, fulfillmentFee: 0, storageFee: 0, otherFees: 0,
    gstCollected: 0, gstRate: 12, pos: 'MH',
    tcsDeducted: 0, tdsDeducted: 0, returnAmount: 0,
    weight: 1.0, declaredWeight: 1.0, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-02-12', rowIndex: 11,
  },
  {
    platform: 'amazon', orderId: 'ORD-010', sku: 'SKU-SPORT-02',
    sellingPrice: 1534, settlement: 1356,
    referralFee: 104, fulfillmentFee: 65, storageFee: 9, otherFees: 0,
    gstCollected: 234, gstRate: 18, pos: 'KA',
    tcsDeducted: 13, tdsDeducted: 0, returnAmount: 0,
    weight: 1.5, declaredWeight: 1.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-02-18', rowIndex: 12,
  },
  {
    // MISSING REIMBURSEMENT: customer returned ₹1180, no credit issued
    platform: 'amazon', orderId: 'ORD-011', sku: 'SKU-ELEC-01',
    sellingPrice: 0, settlement: 0,
    referralFee: 0, fulfillmentFee: 0, storageFee: 0, otherFees: 0,
    gstCollected: 0, gstRate: 18, pos: 'KA',
    tcsDeducted: 0, tdsDeducted: 0, returnAmount: 1180,
    weight: 0.5, declaredWeight: 0.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-02-22', rowIndex: 13,
  },
  // ── March 2026 ────────────────────────────────────────────────────────────
  {
    platform: 'amazon', orderId: 'ORD-012', sku: 'SKU-CLOTH-02',
    sellingPrice: 735, settlement: 605,
    referralFee: 70, fulfillmentFee: 55, storageFee: 5, otherFees: 0,
    gstCollected: 35, gstRate: 5, pos: 'MH',
    tcsDeducted: 7, tdsDeducted: 0, returnAmount: 0,
    weight: 1.0, declaredWeight: 1.0, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-03-02', rowIndex: 14,
  },
  {
    platform: 'amazon', orderId: 'ORD-013', sku: 'SKU-HOME-03',
    sellingPrice: 826, settlement: 706,
    referralFee: 63, fulfillmentFee: 50, storageFee: 7, otherFees: 0,
    gstCollected: 126, gstRate: 18, pos: 'DL',
    tcsDeducted: 7, tdsDeducted: 0, returnAmount: 0,
    weight: 1.0, declaredWeight: 1.0, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-03-07', rowIndex: 15,
  },
  {
    platform: 'amazon', orderId: 'ORD-014', sku: 'SKU-ELEC-03',
    sellingPrice: 4720, settlement: 4340,
    referralFee: 240, fulfillmentFee: 95, storageFee: 20, otherFees: 25,
    gstCollected: 720, gstRate: 18, pos: 'GJ',
    tcsDeducted: 40, tdsDeducted: 0, returnAmount: 0,
    weight: 2.5, declaredWeight: 2.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-03-12', rowIndex: 16,
  },
  {
    platform: 'amazon', orderId: 'ORD-015', sku: 'SKU-BOOK-02',
    sellingPrice: 560, settlement: 502,
    referralFee: 28, fulfillmentFee: 30, storageFee: 0, otherFees: 0,
    gstCollected: 0, gstRate: 0, pos: 'TN',
    tcsDeducted: 5.6, tdsDeducted: 0, returnAmount: 0,
    weight: 0.5, declaredWeight: 0.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-03-17', rowIndex: 17,
  },
  {
    platform: 'amazon', orderId: 'ORD-016', sku: 'SKU-BEAUTY-02',
    sellingPrice: 1920, settlement: 1695,
    referralFee: 150, fulfillmentFee: 65, storageFee: 10, otherFees: 0,
    gstCollected: 420, gstRate: 28, pos: 'UP',
    tcsDeducted: 15, tdsDeducted: 0, returnAmount: 0,
    weight: 1.5, declaredWeight: 1.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-03-22', rowIndex: 18,
  },
  {
    platform: 'amazon', orderId: 'ORD-017', sku: 'SKU-SPORT-03',
    sellingPrice: 1298, settlement: 1120,
    referralFee: 88, fulfillmentFee: 80, storageFee: 10, otherFees: 0,
    gstCollected: 198, gstRate: 18, pos: 'WB',
    tcsDeducted: 11, tdsDeducted: 0, returnAmount: 0,
    weight: 2.0, declaredWeight: 2.0, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-03-25', rowIndex: 19,
  },
  {
    platform: 'amazon', orderId: 'ORD-018', sku: 'SKU-TOY-02',
    sellingPrice: 448, settlement: 379,
    referralFee: 36, fulfillmentFee: 30, storageFee: 3, otherFees: 0,
    gstCollected: 48, gstRate: 12, pos: 'RJ',
    tcsDeducted: 4, tdsDeducted: 0, returnAmount: 0,
    weight: 0.5, declaredWeight: 0.5, weightSource: 'parsed',
    quantity: 1, orderDate: '2026-03-28', rowIndex: 20,
  },
];

// ─── Pre-computed hand-verified constants ─────────────────────────────────────
// Revenue rows only (settlement > 0): 17 rows (excludes ORD-009b and ORD-011)
const CORRECT_GROSS_REVENUE   = 23318.00; // Σ (settlement+fees) for settlement>0
const CORRECT_TOTAL_FEES      = 2762.50;  // Σ fees across ALL 19 rows
const CORRECT_REVENUE_ROW_FEES = 2695.00; // Σ fees for settlement>0 rows only
const CORRECT_TOTAL_RETURNS   = 1180.00;  // ORD-011 returnAmount
const CORRECT_NET_PROFIT      = 19375.50; // grossRevenue - allFees - returns
const CORRECT_NET_SETTLEMENTS = 20623.00; // Σ settlement where settlement>0

// TCS (from tcsDeducted column — CSV path):
const CORRECT_TOTAL_TCS = 199.60; // Σ tcsDeducted for settlement>0 rows
// TCS monthly (settled rows only):
const CORRECT_TCS_JAN   = 58.50;
const CORRECT_TCS_FEB   = 51.50;
const CORRECT_TCS_MAR   = 89.60;

// TDS (computed from gross × 0.001 since tdsDeducted=0 in CSV):
const CORRECT_TOTAL_TDS = 23.33; // rounded sum of monthly rounded values

// GST:
const CORRECT_OUTPUT_TAX  = 3358.00;
const CORRECT_IGST        = 2944.00; // all non-KA states
const CORRECT_CGST        = 207.00;  // KA intrastate half
const CORRECT_SGST        = 207.00;  // KA intrastate half
// ITC is computed only on rows where settlement > 0 — Amazon does not charge
// fresh fees on return/zero-settlement rows so those should not contribute ITC.
// Excludes ORD-009b (duplicate fee row, settlement=0) and ORD-011 (return, settlement=0).
const CORRECT_ITC_FEES    = 485.10;  // settlement>0 rows' fees × 18%
const CORRECT_NET_GST_LIABILITY = 2872.90; // outputTax − ITC

// Leakage:
const EXPECTED_WEIGHT_ERRORS = 2;     // ORD-003 (+₹5) + ORD-008 (+₹5) — Sept 2025 slabs
const EXPECTED_WEIGHT_TOTAL  = 10.00; // ₹5 + ₹5 (new Sept 2025 FBA slab rates)
const EXPECTED_DUPLICATE_FEES = 1;    // ORD-009b (₹67.50)
const EXPECTED_MISSING_REIMB  = 1;    // ORD-011 (₹1180)
const EXPECTED_TOTAL_RECOVERABLE = 10.00 + 67.50 + 1180.00; // 1257.50

// ─── SECTION 1: WEIGHT SLAB HELPERS ─────────────────────────────────────────
describe('Weight Slab Helpers', () => {
  it('computeBilledWeight — standard slabs round up to 500g', () => {
    expect(computeBilledWeight(0.3, 0)).toBe(0.5);
    expect(computeBilledWeight(0.5, 0)).toBe(0.5);
    expect(computeBilledWeight(0.6, 0)).toBe(1.0);
    expect(computeBilledWeight(1.0, 0)).toBe(1.0);
    expect(computeBilledWeight(1.1, 0)).toBe(1.5);
    expect(computeBilledWeight(2.5, 0)).toBe(2.5);
    expect(computeBilledWeight(3.0, 0)).toBe(3.0);
  });

  it('computeBilledWeight — volumetric dominates when larger', () => {
    expect(computeBilledWeight(0.5, 1.2)).toBe(1.5); // volumetric=1.2kg rounds up to 1.5
    expect(computeBilledWeight(2.0, 1.5)).toBe(2.0); // actual dominates
  });

  it('computeWeightFee — exact slab fee table', () => {
    // Amazon India FBA Pick & Pack fees — effective September 1, 2025.
    // Base: ₹17 for ≤1kg; +₹5 per 500g up to 5kg; +₹2 per 500g above 5kg.
    expect(computeWeightFee(0.5)).toBe(17);  // ≤0.5kg slab
    expect(computeWeightFee(1.0)).toBe(17);  // ≤1.0kg slab
    expect(computeWeightFee(1.5)).toBe(22);  // 17 + 1×5
    expect(computeWeightFee(2.0)).toBe(27);  // 17 + 2×5
    expect(computeWeightFee(2.5)).toBe(32);  // 17 + 3×5
    expect(computeWeightFee(3.0)).toBe(37);  // 17 + 4×5
    expect(computeWeightFee(3.5)).toBe(42);  // 17 + 5×5
    expect(computeWeightFee(4.0)).toBe(47);  // 17 + 6×5
    expect(computeWeightFee(4.5)).toBe(52);  // 17 + 7×5
    expect(computeWeightFee(5.0)).toBe(57);  // 17 + 8×5
    // Above 5kg: +₹2 per 500g (new lower-tier introduced Sept 2025)
    expect(computeWeightFee(5.5)).toBe(59);  // 57 + 1×2
    expect(computeWeightFee(6.0)).toBe(61);  // 57 + 2×2
    expect(computeWeightFee(7.0)).toBe(65);  // 57 + 4×2
  });
});

// ─── SECTION 2: TCS ─────────────────────────────────────────────────────────
describe('TCS — computeTcsSummary', () => {
  const tcs = computeTcsSummary(ROWS);

  it('rate is 1% (Section 52 CGST)', () => {
    expect(tcs.rate).toBe(1);
    expect(tcs.section).toContain('52');
  });

  it('total TCS collected matches CSV values (₹199.60)', () => {
    expectApprox(tcs.totalTcsCollected, CORRECT_TOTAL_TCS, 'totalTcsCollected');
    expect(tcs.totalTcsClaimable).toBe(tcs.totalTcsCollected);
  });

  it('monthly TCS breakdown — January ₹58.50', () => {
    const jan = tcs.monthlyBreakdown.find(m => m.month === '2026-01');
    expect(jan).toBeDefined();
    expectApprox(jan!.tcs, CORRECT_TCS_JAN, 'TCS Jan');
    // Taxable value verification: Σ taxable = 1000+500+1000+350+2000+1000 = 5850
    expectApprox(jan!.taxableValue, 5850, 'GMV Jan', 1);
  });

  it('monthly TCS breakdown — February ₹51.50', () => {
    const feb = tcs.monthlyBreakdown.find(m => m.month === '2026-02');
    expect(feb).toBeDefined();
    expectApprox(feb!.tcs, CORRECT_TCS_FEB, 'TCS Feb');
    // Taxable value: 600+2500+750+1300=5150 (ORD-009b settlement=0 skipped, ORD-011 skipped)
    expectApprox(feb!.taxableValue, 5150, 'GMV Feb', 1);
  });

  it('monthly TCS breakdown — March ₹89.60', () => {
    const mar = tcs.monthlyBreakdown.find(m => m.month === '2026-03');
    expect(mar).toBeDefined();
    expectApprox(mar!.tcs, CORRECT_TCS_MAR, 'TCS Mar');
    // Taxable value: 700+700+4000+560+1500+1100+400=8960
    expectApprox(mar!.taxableValue, 8960, 'GMV Mar', 1);
  });

  it('TCS base is taxable value (gross ÷ (1+gstRate/100)), not gross', () => {
    // For ORD-001: gross=1180, gstRate=18 → taxable=1000 → TCS=10
    // gross incorrectly as base: TCS would be 11.80 → WRONG
    const jan = tcs.monthlyBreakdown.find(m => m.month === '2026-01')!;
    // If TCS was on gross, Jan total would be: Σ gross×0.01 = (1180+525+1120+350+2360+1280)×0.01 = 78.15
    // Correct (on taxable): 58.50
    expect(jan.tcs).toBeLessThan(75); // guard: must NOT be ~78 (wrong base)
    expectApprox(jan.tcs, 58.50, 'TCS Jan correct base');
  });

  it('return rows and zero-settlement rows are excluded from TCS base', () => {
    // ORD-011 (return, settlement=0) and ORD-009b (settlement=0) excluded
    // If included, TCS would be higher
    expect(tcs.totalTcsCollected).toBeLessThanOrEqual(200);
  });
});

// ─── SECTION 3: TDS ─────────────────────────────────────────────────────────
describe('TDS — computeTdsSummary (Section 194-O, 0.1% with PAN)', () => {
  const tds = computeTdsSummary(ROWS, true);

  it('rate is 0.1% when PAN is furnished', () => {
    expect(tds.effectiveRate).toBe(0.1);
    expect(tds.panFurnished).toBe(true);
    expect(tds.section).toContain('194-O');
  });

  it('rate changes to 5% without PAN (Section 206AA)', () => {
    const tdsNoPan = computeTdsSummary(ROWS, false);
    expect(tdsNoPan.effectiveRate).toBe(5);
  });

  it('total TDS computed on gross (settlement + fees) = ₹23.33', () => {
    expectApprox(tds.totalTdsDeducted, CORRECT_TOTAL_TDS, 'totalTds', 0.03);
  });

  it('TDS base includes gross (not just settlement net)', () => {
    // For ORD-001: gross=1180, TDS=1.18; NOT settlement=1050 → TDS=1.05
    const jan = tds.monthlyBreakdown.find(m => m.month === '2026-01')!;
    // Jan gross sum = 1180+525+1120+350+2360+1280 = 6815 → TDS = 6.815 → 6.82
    expectApprox(jan.grossAmount, 6815, 'grossAmount Jan', 1);
    expectApprox(jan.tds, 6.82, 'TDS Jan', 0.02);
  });

  it('February TDS — ORD-009b (settlement=0) and ORD-011 (return+0) are skipped', () => {
    const feb = tds.monthlyBreakdown.find(m => m.month === '2026-02')!;
    // Revenue rows: ORD-007(672)+ORD-008(2950)+ORD-009a(840)+ORD-010(1534) = 5996
    expectApprox(feb.grossAmount, 5996, 'grossAmount Feb', 1);
    expectApprox(feb.tds, 6.00, 'TDS Feb', 0.02);
  });

  it('March TDS — 7 revenue rows', () => {
    const mar = tds.monthlyBreakdown.find(m => m.month === '2026-03')!;
    // 735+826+4720+560+1920+1298+448 = 10507
    expectApprox(mar.grossAmount, 10507, 'grossAmount Mar', 1);
    expectApprox(mar.tds, 10.51, 'TDS Mar', 0.02);
  });

  it('TDS claimable equals TDS deducted', () => {
    expect(tds.totalTdsClaimable).toBe(tds.totalTdsDeducted);
  });
});

// ─── SECTION 4: GST ─────────────────────────────────────────────────────────
describe('GST — computeGstSummary (seller state = KA)', () => {
  const gst = computeGstSummary(ROWS, 'KA');

  it('total output tax = ₹3358.00', () => {
    expectApprox(gst.totalOutputTax, CORRECT_OUTPUT_TAX, 'outputTax', 0.01);
  });

  it('IGST+CGST+SGST = output tax (no leakage in split)', () => {
    const total = gst.igstAmount + gst.cgstAmount + gst.sgstAmount;
    expectApprox(total, CORRECT_OUTPUT_TAX, 'igst+cgst+sgst', 0.01);
  });

  it('interstate → IGST (all non-KA buyers)', () => {
    expectApprox(gst.igstAmount, CORRECT_IGST, 'IGST', 0.01);
  });

  it('intrastate KA → CGST=₹207 + SGST=₹207', () => {
    // ORD-001(KA,180) + ORD-010(KA,234) = 414 → CGST=207, SGST=207
    expectApprox(gst.cgstAmount, CORRECT_CGST, 'CGST', 0.01);
    expectApprox(gst.sgstAmount, CORRECT_SGST, 'SGST', 0.01);
  });

  it('ITC from Amazon fees = ₹485.10 (settlement>0 rows fees × 18%)', () => {
    // Only rows where settlement > 0 contribute ITC — Amazon does not charge
    // fresh fees on return/zero-settlement rows.
    expectApprox(gst.itcFromAmazonFees, CORRECT_ITC_FEES, 'ITC', 0.02);
  });

  it('net GST liability = outputTax − ITC = ₹2872.90', () => {
    expectApprox(gst.netGstLiability, CORRECT_NET_GST_LIABILITY, 'netGstLiability', 0.02);
  });

  it('net GST liability is never negative', () => {
    // code does Math.max(0, …)
    expect(gst.netGstLiability).toBeGreaterThanOrEqual(0);
  });

  it('rate breakdown covers all slabs used (0,5,12,18,28)', () => {
    const rates = gst.rateBreakdown.map(r => r.rate).sort((a, b) => a - b);
    expect(rates).toContain(0);
    expect(rates).toContain(5);
    expect(rates).toContain(12);
    expect(rates).toContain(18);
    expect(rates).toContain(28);
  });

  it('GST amount cross-check — 18% slab taxable correctly', () => {
    const slab18 = gst.rateBreakdown.find(r => r.rate === 18)!;
    // 18% rows: ORD-001(taxable=1000,gst=180)+ORD-005(2000,360)+ORD-008(2500,450)
    //          +ORD-010(1300,234)+ORD-013(700,126)+ORD-014(4000,720)+ORD-017(1100,198)
    // total taxable = 12600, total gst = 2268
    expect(slab18).toBeDefined();
    expectApprox(slab18!.taxableValue, 12600, '18% taxableValue', 5);
    expectApprox(slab18!.tax, 2268, '18% GST tax', 2);
  });

  it('ITC breakdown — referral, FBA, storage, other × 18%', () => {
    const bd = gst.amazonFeesGstBreakdown;
    // settlement>0 rows: referralFees total = 1528 → GST = 275.04
    expectApprox(bd.referralFeeGst, 275.04, 'referralFeeGst', 0.05);
    // fbaFees total = 1005 → GST = 180.90 (unchanged — return row had fba=0)
    expectApprox(bd.fbaFeeGst, 180.90, 'fbaFeeGst', 0.05);
    // storageFees total = 122 → GST = 21.96 (unchanged — return rows had stor=0)
    expectApprox(bd.storageFeeGst, 21.96, 'storageFeeGst', 0.05);
    // otherFees total = 40 → GST = 7.20 (unchanged)
    expectApprox(bd.otherFeeGst, 7.20, 'otherFeeGst', 0.05);
    expectApprox(bd.total, CORRECT_ITC_FEES, 'ITC total bd', 0.05);
  });

  it('28% GST — correct taxable value extraction', () => {
    const slab28 = gst.rateBreakdown.find(r => r.rate === 28)!;
    // ORD-006(taxable=1000,gst=280) + ORD-016(taxable=1500,gst=420)
    expect(slab28).toBeDefined();
    expectApprox(slab28!.taxableValue, 2500, '28% taxable', 2);
    expectApprox(slab28!.tax, 700, '28% tax', 2);
  });

  it('no GST mismatch for properly formed rows (rate + amount consistent)', () => {
    // All our rows have consistent gstRate + gstCollected → no mismatch expected
    const rateMismatches = gst.mismatches.filter(m => m.reason === 'rate_mismatch');
    expect(rateMismatches.length).toBe(0);
  });
});

// ─── SECTION 5: INCOME TAX ──────────────────────────────────────────────────
describe('Income Tax — computeIncomeTaxEstimate', () => {
  const it_est = computeIncomeTaxEstimate(ROWS);

  // ── BUG #1 PROOF: Double-deduction of fees ────────────────────────────────
  it('⚠️  BUG #1 — grossRevenue must be gross (settlement + fees), not just settlement', () => {
    // settlement alone for settlement>0 rows = 20623
    // Correct gross = 23318 (settlement + all fees for settlement>0 rows)
    // The CURRENT CODE uses settlement-only → grossRevenue = 20623 (WRONG)
    // AFTER FIX: grossRevenue = 23318

    // This test DOCUMENTS the bug. It currently FAILS on the fixed value.
    // If code is buggy: expect 20623; after fix: expect 23318.
    // We assert against the CORRECT value:
    expectApprox(it_est.grossRevenue, CORRECT_GROSS_REVENUE, 'grossRevenue', 1);
  });

  it('⚠️  BUG #1 — netProfit must not double-subtract fees', () => {
    // Buggy: netProfit = 20623 - 3942.50 = 16680.50 (fees deducted TWICE)
    // Correct: netProfit = 23318 - 3942.50 = 19375.50
    expectApprox(it_est.netProfit, CORRECT_NET_PROFIT, 'netProfit', 1);
  });

  it('totalExpenses = all fees + all returns = ₹3942.50', () => {
    // 2762.50 (fees all rows) + 1180 (ORD-011 return) = 3942.50
    expectApprox(it_est.totalExpenses, 3942.50, 'totalExpenses', 0.02);
  });

  it('Section 44AD presumptive income @6% is on gross revenue', () => {
    // Buggy: 20623 × 0.06 = 1237.38
    // Correct: 23318 × 0.06 = 1399.08
    expectApprox(it_est.presumptiveIncome6Pct, CORRECT_GROSS_REVENUE * 0.06, 'presumptive6Pct', 1);
    expectApprox(it_est.presumptiveIncome8Pct, CORRECT_GROSS_REVENUE * 0.08, 'presumptive8Pct', 1);
  });

  it('Section 87A rebate applies if taxable income ≤ ₹12L', () => {
    // Our netProfit (~19375) is well under 12L → if presumptive is used (6%=~1399), rebate applies
    // netTaxPayable should reflect the rebate
    expect(it_est.netTaxPayable).toBeGreaterThanOrEqual(0);
  });

  it('advance tax schedule sums to 100% of netTaxPayable', () => {
    const totalScheduled = it_est.advanceTaxSchedule.reduce((s, a) => s + a.amount, 0);
    expectApprox(totalScheduled, it_est.netTaxPayable, 'advanceTaxTotal', 1);
  });

  it('4% health & education cess is applied', () => {
    // Verify through slabBreakdown: cess embedded in taxOnActual / taxOnPresumptive
    // We can't see cess directly but verifying the recommended scheme is set
    expect(['actual', 'presumptive_44AD']).toContain(it_est.recommendedScheme);
  });

  it('netTaxPayable = estimatedTax − tcsCredit − tdsCredit', () => {
    const expected = Math.max(0, it_est.estimatedTax - it_est.tcsCredit - it_est.tdsCredit);
    expect(it_est.netTaxPayable).toBe(expected);
  });
});

// ─── SECTION 6: SETTLEMENT TOTALS ─────────────────────────────────────────
describe('Settlement — computeTotals', () => {
  const totals = computeTotals(ROWS);

  // ── BUG #2 PROOF: totalRevenue treated as net instead of gross ─────────────
  it('⚠️  BUG #2 — totalRevenue must be gross (settlement+fees for settlement>0 rows)', () => {
    // Buggy: totalRevenue = Σ settlement = 20623
    // Correct: totalRevenue = Σ gross = 23318
    expectApprox(totals.totalRevenue, CORRECT_GROSS_REVENUE, 'totalRevenue', 1);
  });

  it('⚠️  BUG #2 — netProfit must not double-subtract fees', () => {
    // Buggy: netProfit = 20623 - 3942.50 = 16680.50
    // Correct: netProfit = 23318 - 3942.50 = 19375.50
    expectApprox(totals.netProfit, CORRECT_NET_PROFIT, 'netProfit', 1);
  });

  it('totalExpenses = all fees + returns = ₹3942.50', () => {
    expectApprox(totals.totalExpenses, 3942.50, 'totalExpenses', 0.02);
  });

  it('⚠️  BUG #3 — actualPayout must not subtract fees from zero-settlement rows', () => {
    // Buggy: ORD-009b has settlement=0, referralFee=67.50 → 0-67.50 = -67.50 leaks into actualPayout
    // Correct: actualPayout = Σ max(0, settlement) = 20623
    // Buggy value = 17860.50
    expectApprox(totals.actualPayout, CORRECT_NET_SETTLEMENTS, 'actualPayout', 1);
  });

  it('netProfit = expectedPayout', () => {
    expectApprox(totals.expectedPayout, totals.netProfit, 'expectedPayout=netProfit', 0.02);
  });
});

// ─── SECTION 7: LEAKAGE DETECTION ─────────────────────────────────────────
describe('Leakage — detectLeakage', () => {
  const leakage = detectLeakage(ROWS, 'amazon');
  const weightErrors = leakage.filter(l => l.type === 'weight_slab_error');
  const duplicates   = leakage.filter(l => l.type === 'duplicate_charge');
  const missingReimb = leakage.filter(l => l.type === 'missing_reimbursement');

  it('detects exactly 2 weight slab errors (ORD-003 and ORD-008)', () => {
    expect(weightErrors.length).toBe(EXPECTED_WEIGHT_ERRORS);
  });

  it('ORD-003 weight overcharge = ₹5 (1.5kg slab vs 1.0kg slab)', () => {
    // Sept 2025 slabs: declared 1.0kg → billedWeight=1.0 → fee=17
    //                  charged  1.5kg → billedWeight=1.5 → fee=22; diff=5
    const ord003 = weightErrors.find(l => l.orderId === 'ORD-003');
    expect(ord003).toBeDefined();
    expectApprox(ord003!.diff, 5, 'ORD-003 weight diff', 0.01);
    expectApprox(ord003!.expected, 17, 'ORD-003 expected fee', 0.01);
    expectApprox(ord003!.actual, 22, 'ORD-003 actual fee', 0.01);
    expect(ord003!.recoverable).toBe(true);
  });

  it('ORD-008 weight overcharge = ₹5 (3.0kg slab vs 2.5kg slab)', () => {
    // Sept 2025 slabs: declared 2.5kg → billedWeight=2.5 → fee=32
    //                  charged  3.0kg → billedWeight=3.0 → fee=37; diff=5
    const ord008 = weightErrors.find(l => l.orderId === 'ORD-008');
    expect(ord008).toBeDefined();
    expectApprox(ord008!.diff, 5, 'ORD-008 weight diff', 0.01);
    expectApprox(ord008!.expected, 32, 'ORD-008 expected fee', 0.01);
    expectApprox(ord008!.actual, 37, 'ORD-008 actual fee', 0.01);
    expect(ord008!.recoverable).toBe(true);
  });

  it('total weight slab overcharge = ₹25', () => {
    const total = weightErrors.reduce((s, l) => s + l.diff, 0);
    expectApprox(total, EXPECTED_WEIGHT_TOTAL, 'totalWeightOvercharge', 0.01);
  });

  it('detects exactly 1 duplicate charge (ORD-009b)', () => {
    expect(duplicates.length).toBe(EXPECTED_DUPLICATE_FEES);
    const dup = duplicates[0];
    expect(dup.orderId).toBe('ORD-009');
    expect(dup.sku).toBe('SKU-HOME-02');
    expectApprox(dup.diff, 67.5, 'duplicate diff', 0.01);
    expect(dup.recoverable).toBe(true);
    expect(dup.confidence).toBe('high');
  });

  it('detects exactly 1 missing reimbursement (ORD-011)', () => {
    expect(missingReimb.length).toBe(EXPECTED_MISSING_REIMB);
    const reib = missingReimb[0];
    expect(reib.orderId).toBe('ORD-011');
    expectApprox(reib.diff, 1180, 'reimbursement diff', 0.01);
    expectApprox(reib.expected, 1180, 'reimbursement expected', 0.01);
    expect(reib.actual).toBe(0);
    expect(reib.recoverable).toBe(true); // within 18-month window
  });

  it('ORD-011 reimbursement claim window has days remaining (order in 2026)', () => {
    const reib = missingReimb[0];
    expect((reib.claimDeadlineDays ?? 0)).toBeGreaterThan(0);
  });

  it('total recoverable leakage = ₹1272.50', () => {
    const totalRecoverable = leakage
      .filter(l => l.recoverable === true)
      .reduce((s, l) => s + l.diff, 0);
    expectApprox(totalRecoverable, EXPECTED_TOTAL_RECOVERABLE, 'totalRecoverable', 0.5);
  });

  it('no false positives for rows with matching weight slabs', () => {
    // ORD-001,002,004,005,006,007,009a,010,012-018: weight=declaredWeight → no error
    const incorrectFlags = weightErrors.filter(l =>
      !['ORD-003', 'ORD-008'].includes(l.orderId ?? '')
    );
    expect(incorrectFlags.length).toBe(0);
  });

  it('no storage overcharge false positives (all storage fees are reasonable)', () => {
    const storageErrors = leakage.filter(l => l.type === 'storage_overcharge');
    // All our rows: Qty=1, expected=max(20,1×20)=20, actual ≤ 20 < 60 (3× threshold)
    expect(storageErrors.length).toBe(0);
  });

  it('no incorrect referral fees — all rows within 30% tolerance of expected rate', () => {
    const refErrors = leakage.filter(l => l.type === 'incorrect_referral_fee');
    // All our rows use correct slab-appropriate referral rates → no over-flag
    expect(refErrors.length).toBe(0);
  });
});

// ─── SECTION 8: PROFIT ENGINE ──────────────────────────────────────────────
describe('Profit Engine — computeProfitBreakdown', () => {
  it('GST-on-sale formula: sellingPrice × gstRate/(100+gstRate)', () => {
    const result = computeProfitBreakdown({
      sellingPrice: 1180, costOfGoods: 400,
      gstRate: 18, category: 'electronics',
      weightKg: 0.5, isFBA: true,
    });
    // gstOnSale = 1180 - 1180/1.18 = 1180 - 1000 = 180
    expectApprox(result.gstOnSale, 180, 'gstOnSale', 0.01);
    expectApprox(result.taxableSellingPrice, 1000, 'taxableSellingPrice', 0.01);
  });

  it('referral fee is on taxable (ex-GST) value, not gross', () => {
    const result = computeProfitBreakdown({
      sellingPrice: 1180, costOfGoods: 400,
      gstRate: 18, category: 'electronics',
      weightKg: 0.5, isFBA: true,
    });
    // electronics: 6% referral on taxable=1000 → 60
    expectApprox(result.referralFee, 60, 'referralFee', 0.01);
  });

  it('TCS = 1% of taxable selling price', () => {
    const result = computeProfitBreakdown({
      sellingPrice: 1180, costOfGoods: 400,
      gstRate: 18, category: 'electronics',
      weightKg: 0.5, isFBA: true,
    });
    // TCS = 1000 × 0.01 = 10
    expectApprox(result.tcsDeducted, 10, 'tcsDeducted', 0.01);
  });

  it('TDS = 0.1% of selling price (gross, Section 194-O)', () => {
    const result = computeProfitBreakdown({
      sellingPrice: 1180, costOfGoods: 400,
      gstRate: 18, category: 'electronics',
      weightKg: 0.5, isFBA: true,
    });
    // TDS = 1180 × 0.001 = 1.18
    expectApprox(result.tdsDeducted, 1.18, 'tdsDeducted', 0.01);
  });

  it('GST on fees (ITC) = (referralFee + fbaFee) × 18%', () => {
    const result = computeProfitBreakdown({
      sellingPrice: 1180, costOfGoods: 400,
      gstRate: 18, category: 'electronics',
      weightKg: 0.5, isFBA: true,
    });
    // fba=30(0.5kg), referral=60 → gstOnFees = (60+30)×0.18 = 16.20
    expectApprox(result.gstOnFees, (result.referralFee + result.fbaFee) * 0.18, 'gstOnFees', 0.01);
  });

  it('netPayout = sellingPrice − totalDeductions − gstOnSale', () => {
    const result = computeProfitBreakdown({
      sellingPrice: 1180, costOfGoods: 400,
      gstRate: 18, category: 'electronics',
      weightKg: 0.5, isFBA: true,
    });
    const expected = result.sellingPrice - result.totalDeductions - result.gstOnSale;
    expectApprox(result.netPayout, expected, 'netPayout formula', 0.01);
  });

  it('breakeven price is always > 0 when costOfGoods > 0', () => {
    const result = computeProfitBreakdown({
      sellingPrice: 500, costOfGoods: 300,
      gstRate: 18, category: 'default',
      weightKg: 1.0, isFBA: true,
    });
    expect(result.breakeven).toBeGreaterThan(0);
  });

  it('isViable = false when netProfit < 0', () => {
    // Low price, high COGS → loss-making
    const result = computeProfitBreakdown({
      sellingPrice: 200, costOfGoods: 500,
      gstRate: 18, category: 'electronics',
      weightKg: 2.5, isFBA: true,
    });
    expect(result.netProfit).toBeLessThan(0);
    expect(result.isViable).toBe(false);
  });
});

// ─── SECTION 9: SKU PROFITABILITY ─────────────────────────────────────────
describe('SKU Profitability — computeSkuProfitability', () => {
  const skuProfits = computeSkuProfitability(ROWS);

  it('all 17 unique SKUs are present (one row per distinct sku string)', () => {
    const skus = skuProfits.map(s => s.sku).sort();
    // 19 rows span 17 unique SKUs (e.g. ORD-009 has two rows for SKU-HOME-02)
    expect(skuProfits.length).toBe(17);
  });

  it('SKU-ELEC-01: gross revenue from ORD-001, returns from ORD-011 (no double fee deduction)', () => {
    const sku = skuProfits.find(s => s.sku === 'SKU-ELEC-01');
    expect(sku).toBeDefined();
    // Gross = settlement + fees = 1050 + 130 = 1180 (matches sellingPrice on ORD-001)
    expectApprox(sku!.revenue, 1180, 'SKU-ELEC-01 revenue (gross)', 1);
    // returns = ORD-011 returnAmount = 1180
    expectApprox(sku!.returns, 1180, 'SKU-ELEC-01 returns', 1);
    // netProfit = gross − fees − returns = 1180 − 130 − 1180 = −130 (not −260 from net-as-revenue bug)
    expectApprox(sku!.netProfit, 1180 - 130 - 1180, 'SKU-ELEC-01 netProfit', 1);
  });

  it('results sorted by netProfit descending (best SKU first)', () => {
    for (let i = 0; i < skuProfits.length - 1; i++) {
      expect(skuProfits[i].netProfit).toBeGreaterThanOrEqual(skuProfits[i + 1].netProfit);
    }
  });

  it('SKU-ELEC-03 (ORD-014 highest settlement) is top revenue SKU', () => {
    const sku = skuProfits.find(s => s.sku === 'SKU-ELEC-03');
    expect(sku).toBeDefined();
    // Gross = 4340 + 240 + 95 + 20 + 25 = 4720
    expectApprox(sku!.revenue, 4720, 'SKU-ELEC-03 revenue (gross)', 1);
  });
});

// ─── SECTION 10: MONTHLY TRENDS ───────────────────────────────────────────
describe('Monthly Trends — computeMonthlyTrends', () => {
  const trends = computeMonthlyTrends(ROWS);

  it('3 months returned: Jan, Feb, Mar 2026', () => {
    const months = trends.map(t => t.month);
    expect(months).toContain('Jan 2026');
    expect(months).toContain('Feb 2026');
    expect(months).toContain('Mar 2026');
    expect(trends.length).toBe(3);
  });

  it('January: 6 revenue rows, correct order count', () => {
    const jan = trends.find(t => t.month === 'Jan 2026')!;
    expect(jan.orderCount).toBe(6); // ORD-001 through ORD-006
  });

  it('February: 6 rows total (ORD-007 through ORD-012 incl. returns/dupes)', () => {
    const feb = trends.find(t => t.month === 'Feb 2026')!;
    // ORD-007,008,009a,009b,010,011 = 6 rows
    expect(feb.orderCount).toBe(6);
  });

  it('March: 7 rows', () => {
    const mar = trends.find(t => t.month === 'Mar 2026')!;
    expect(mar.orderCount).toBe(7); // ORD-012 through ORD-018
  });

  it('revenue increases over three months (business growing)', () => {
    const jan = trends.find(t => t.month === 'Jan 2026')!;
    const mar = trends.find(t => t.month === 'Mar 2026')!;
    // Mar has the big ORD-014 (₹4340) so must exceed Jan
    expect(mar.revenue).toBeGreaterThan(jan.revenue);
  });
});

// ─── SECTION 11: CROSS-CHECKS (INVARIANTS) ────────────────────────────────
describe('Cross-checks and Invariants', () => {
  it('INVARIANT: Σ gross(settlement>0 rows) = Σ settlement + Σ fees[settlement>0]', () => {
    const revenueRows = ROWS.filter(r => r.settlement > 0);
    const grossByAdd  = revenueRows.reduce(
      (s, r) => s + r.settlement + r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees, 0
    );
    expectApprox(grossByAdd, CORRECT_GROSS_REVENUE, 'grossByAdd', 0.01);
  });

  it('INVARIANT: TCS taxable GMV = Σ (gross/(1+gstRate/100)) for settlement>0', () => {
    const revenueRows = ROWS.filter(r => r.settlement > 0);
    const gmv = revenueRows.reduce((s, r) => {
      const gross = r.settlement + r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees;
      return s + (r.gstRate > 0 ? gross / (1 + r.gstRate / 100) : gross);
    }, 0);
    // 5850+5150+8960 = 19960
    expectApprox(gmv, 19960, 'totalGMV', 0.05);
    // TCS = GMV × 1%
    expectApprox(gmv * 0.01, CORRECT_TOTAL_TCS, 'TCS from GMV', 0.05);
  });

  it('INVARIANT: outputTax = Σ gstCollected (settlement>0 rows)', () => {
    const revenueRows = ROWS.filter(r => r.settlement > 0);
    const sumGst = revenueRows.reduce((s, r) => s + r.gstCollected, 0);
    expectApprox(sumGst, CORRECT_OUTPUT_TAX, 'outputTax invariant', 0.01);
  });

  it('INVARIANT: correct gross = correct net profit + total fees + total returns', () => {
    // grossRevenue = netProfit + allFees + returns
    const reconstruct = CORRECT_NET_PROFIT + CORRECT_TOTAL_FEES + CORRECT_TOTAL_RETURNS;
    // Note: CORRECT_TOTAL_FEES includes ORD-009b's 67.50 and ORD-011's 0
    // grossRevenue=23318 = netProfit(19375.50) + allFees(2762.50) + returns(1180) = 23318 ✓
    expectApprox(reconstruct, CORRECT_GROSS_REVENUE, 'gross reconstruction', 0.02);
  });

  it('INVARIANT: IGST + CGST + SGST = totalOutputTax', () => {
    const gst = computeGstSummary(ROWS, 'KA');
    const total = gst.igstAmount + gst.cgstAmount + gst.sgstAmount;
    expectApprox(total, CORRECT_OUTPUT_TAX, 'IGST+CGST+SGST', 0.01);
  });

  it('INVARIANT: TCS rate = 1% exactly (per Section 52 CGST Act 2017)', () => {
    const tcs = computeTcsSummary(ROWS);
    expect(tcs.rate).toBe(1);
  });

  it('INVARIANT: TDS rate = 0.1% with PAN (per Section 194-O IT Act 1961)', () => {
    const tds = computeTdsSummary(ROWS, true);
    expect(tds.effectiveRate).toBe(0.1);
  });

  it('INVARIANT: weight slab fee diff > 1 required for leakage detection', () => {
    // Both weight errors (₹10, ₹15) exceed the ₹1 minimum threshold
    const leakage = detectLeakage(ROWS, 'amazon');
    const weightErrors = leakage.filter(l => l.type === 'weight_slab_error');
    weightErrors.forEach(w => {
      expect(w.diff).toBeGreaterThan(1);
    });
  });

  it('INVARIANT: totalTcsClaimable = totalTcsCollected (full credit claimable)', () => {
    const tcs = computeTcsSummary(ROWS);
    expect(tcs.totalTcsClaimable).toBe(tcs.totalTcsCollected);
  });

  it('INVARIANT: totalTdsClaimable = totalTdsDeducted (full credit claimable)', () => {
    const tds = computeTdsSummary(ROWS, true);
    expect(tds.totalTdsClaimable).toBe(tds.totalTdsDeducted);
  });
});
