import { SellerOrderRow, IncomeTaxEstimate, AmazonTransactionMetrics } from '../../types/index.ts';
import { getRowCogs } from '../reconcile/settlement.ts';
import {
  sumLineProfit,
  sumLineTotalRevenue,
  usesLineProfit,
  usesLineTotalFees,
  usesLineTotalRevenue,
} from '../reconcile/seller-dataset-basis.ts';

// ─── FY 2025-26 new-regime slabs (Finance Act 2025 / Budget 2025-26) ──────────
// Source: Schedule I Part III – Income Tax Act, 1961 (New Regime u/s 115BAC)
const SLABS = [
  { upto: 400_000,  rate: 0,    label: '0 – 4L'   },
  { upto: 800_000,  rate: 0.05, label: '4L – 8L'  },
  { upto: 1_200_000, rate: 0.10, label: '8L – 12L' },
  { upto: 1_600_000, rate: 0.15, label: '12L – 16L' },
  { upto: 2_000_000, rate: 0.20, label: '16L – 20L' },
  { upto: 2_400_000, rate: 0.25, label: '20L – 24L' },
  { upto: Infinity,  rate: 0.30, label: '24L+'      },
] as const;

// Section 87A rebate – FY 2025-26 (Budget 2025):
// If taxable income ≤ ₹12 lakh → full rebate up to ₹60,000 (new regime only)
const REBATE_87A_LIMIT   = 1_200_000;
const REBATE_87A_MAXAMT  = 60_000;

/** Section 44AD eligibility limits (FY 2025-26) */
const SEC_44AD_DIGITAL_LIMIT  = 30_000_000; // ₹3 crore  – e-comm / digital receipts
const SEC_44AD_CASH_LIMIT     = 20_000_000; // ₹2 crore  – non-digital

/**
 * Section 44AB tax audit thresholds (FY 2025-26)
 * Circular No. 1/2024 & Finance Act 2023 clarifications.
 */
const SEC_44AB_DIGITAL_LIMIT = 100_000_000; // ₹10 crore – if 95%+ digital (no audit below this)
const SEC_44AB_REGULAR_LIMIT =  10_000_000; // ₹1 crore  – otherwise
const SEC_44AB_PRESUMPTIVE_LIMIT = 20_000_000; // ₹2 crore  – if 44AD opted, profit < 6% (Sec 44AB(e))

// ─── Surcharge rates (new regime, FY 2025-26) ────────────────────────────────
// Source: Finance Act 2023 — surcharge capped at 25% for new regime (u/s 115BAC)
// Prior regime had 37% for >₹5 Cr; new regime cap is 25%.
const SURCHARGE_SLABS = [
  { above: 50_000_000,  rate: 0.25 }, // > ₹5 crore  → 25% (capped under new regime)
  { above: 20_000_000,  rate: 0.25 }, // > ₹2 crore  → 25%
  { above: 10_000_000,  rate: 0.15 }, // > ₹1 crore  → 15%
  { above:  5_000_000,  rate: 0.10 }, // > ₹50 lakh  → 10%
] as const;

/**
 * Determine the Indian Financial Year from the latest order date in rows.
 * Indian FY: 1 Apr (YYYY) – 31 Mar (YYYY+1).
 */
function detectFY(rows: SellerOrderRow[]): { startYear: number; endYear: number; label: string } {
  let latestDate: Date | null = null;
  for (const r of rows) {
    if (!r.orderDate) continue;
    try {
      const d = new Date(r.orderDate);
      if (!isNaN(d.getTime()) && (!latestDate || d > latestDate)) latestDate = d;
    } catch { /* skip */ }
  }

  const ref = latestDate ?? new Date();
  // Use UTC methods — dates are stored as UTC midnight ISO strings (from parseFlexibleDate).
  // Indian FY starts April 1 (month 4); using local getMonth() in IST can push a Mar 31
  // UTC date into April locally, shifting the FY label by one year.
  const month = ref.getUTCMonth() + 1; // 1–12
  const year  = ref.getUTCFullYear();
  const startYear = month >= 4 ? year : year - 1;
  return { startYear, endYear: startYear + 1, label: `FY ${startYear}-${String(startYear + 1).slice(2)}` };
}

/**
 * Build advance-tax installment schedule based on the actual FY of the data.
 * Section 211 of Income Tax Act, 1961.
 * Installments: 15% by 15 Jun, 45% by 15 Sep, 75% by 15 Dec, 100% by 15 Mar.
 */
function buildAdvanceTaxSchedule(
  fyStartYear: number,
  netTaxPayable: number,
): Array<{ dueDate: string; percentage: number; amount: number }> {
  const installments = [
    { dueDate: `15 Jun ${fyStartYear}`,     cumPct: 0.15 },
    { dueDate: `15 Sep ${fyStartYear}`,     cumPct: 0.45 },
    { dueDate: `15 Dec ${fyStartYear}`,     cumPct: 0.75 },
    { dueDate: `15 Mar ${fyStartYear + 1}`, cumPct: 1.00 },
  ];
  let paidSoFar = 0;
  return installments.map(({ dueDate, cumPct }) => {
    const target = Math.round(netTaxPayable * cumPct);
    const amount = Math.max(0, target - paidSoFar);
    paidSoFar += amount;
    return { dueDate, percentage: Math.round(cumPct * 100), amount };
  });
}

/** Income-tax slab calculation with 87A rebate and 4% cess. */
function computeSlabTax(taxableIncome: number): {
  total: number;
  breakdown: { slab: string; rate: number; tax: number }[];
} {
  const breakdown: { slab: string; rate: number; tax: number }[] = [];
  let remaining   = taxableIncome;
  let totalTax    = 0;
  let prevUpto    = 0;

  for (const slab of SLABS) {
    const slabWidth = slab.upto === Infinity ? remaining : slab.upto - prevUpto;
    const taxable   = Math.min(remaining, slabWidth);
    const tax       = taxable * slab.rate;
    if (taxable > 0) breakdown.push({ slab: slab.label, rate: slab.rate * 100, tax: Math.round(tax) });
    totalTax  += tax;
    remaining -= taxable;
    prevUpto   = slab.upto;
    if (remaining <= 0) break;
  }

  // Section 87A rebate (new regime, FY 2025-26)
  if (taxableIncome <= REBATE_87A_LIMIT) {
    totalTax = Math.max(0, totalTax - Math.min(totalTax, REBATE_87A_MAXAMT));
  }

  // Surcharge (new regime, FY 2025-26) — applied on base tax before cess
  const applicableSurcharge = SURCHARGE_SLABS.find(s => taxableIncome > s.above);
  if (applicableSurcharge) {
    // Marginal relief: surcharge cannot exceed the income above the slab threshold
    const rawSurcharge = totalTax * applicableSurcharge.rate;
    const incomeAboveThreshold = taxableIncome - applicableSurcharge.above;
    const marginalRelief = Math.max(0, rawSurcharge - incomeAboveThreshold);
    totalTax += Math.max(0, rawSurcharge - marginalRelief);
  }

  // 4% Health & Education cess (Finance Act, 2018) — on tax + surcharge
  totalTax += totalTax * 0.04;

  return { total: Math.round(totalTax), breakdown };
}

function feePart(r: SellerOrderRow): number {
  return r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeIncomeTaxEstimate(
  rows: SellerOrderRow[],
  tcsCredit: number = 0,
  tdsCredit: number = 0,
  amazonTransactionMetrics?: AmazonTransactionMetrics,
): IncomeTaxEstimate {
  const fy = detectFY(rows);

  // ── Revenue & expense reconstruction ─────────────────────────────────────
  // settlement = NET payout (gross minus all Amazon fees already deducted).
  // Gross turnover (for IT purposes) = settlement + all fee components.
  let grossRevenue  = 0;
  let totalExpenses = 0;

  // Fast-path: Amazon flat transaction settlement aggregates are more accurate
  // than row-level reconstruction because capture rows carry the gross amount
  // directly while fee rows are separate — row-level looping misses them.
  if (amazonTransactionMetrics && amazonTransactionMetrics.totalCaptureTransactionAmount > 0) {
    grossRevenue = amazonTransactionMetrics.totalCaptureTransactionAmount;
    const refundExpense = amazonTransactionMetrics.totalRefundTransactionAmount <= 0
      ? -amazonTransactionMetrics.totalRefundTransactionAmount
      : amazonTransactionMetrics.totalRefundTransactionAmount;
    const chargeExpense = amazonTransactionMetrics.totalChargebackTransactionAmount <= 0
      ? -amazonTransactionMetrics.totalChargebackTransactionAmount
      : amazonTransactionMetrics.totalChargebackTransactionAmount;
    const adjPositive = amazonTransactionMetrics.totalAdjustmentTransactionAmount > 0
      ? amazonTransactionMetrics.totalAdjustmentTransactionAmount
      : 0;
    totalExpenses = amazonTransactionMetrics.totalTransactionFees + refundExpense + chargeExpense - adjPositive;
    // COGS must be deducted even on the fast-path — metrics carry no COGS data.
    // Compute from rows regardless of which path produced grossRevenue.
    for (const r of rows) {
      if (r.isDeferred === true || r.rowSource === 'amazon_transaction_line') continue;
      if (r.settlement > 0) totalExpenses += getRowCogs(r);
    }
  } else if (usesLineTotalRevenue(rows)) {
    grossRevenue = sumLineTotalRevenue(rows);
    if (usesLineProfit(rows)) {
      const np = sumLineProfit(rows);
      totalExpenses = Math.round((grossRevenue - np) * 100) / 100;
    } else {
      for (const r of rows) {
        if (r.isDeferred === true) continue;
        const fp = feePart(r);
        if (usesLineTotalFees(rows)) {
          totalExpenses += r.datasetTotalFees ?? 0;
        } else {
          totalExpenses += fp;
        }
        if (r.returnAmount > 0) totalExpenses += r.returnAmount;
        if ((r.settlement > 0 || (r.datasetTotalRevenue != null && r.datasetTotalRevenue > 0))) {
          totalExpenses += getRowCogs(r);
        }
      }
    }
  } else {
    for (const r of rows) {
      if (r.isDeferred === true) continue;
      const fp = feePart(r);
      if (r.settlement > 0) grossRevenue += r.settlement + fp;
      totalExpenses += fp;
      if (r.returnAmount > 0) totalExpenses += r.returnAmount;
      // Deduct COGS when present in dataset
      if (r.settlement > 0) totalExpenses += getRowCogs(r);
    }
  }
  grossRevenue  = Math.round(grossRevenue  * 100) / 100;
  totalExpenses = Math.round(totalExpenses * 100) / 100;
  const netProfit =
    usesLineTotalRevenue(rows) && usesLineProfit(rows)
      ? Math.round(sumLineProfit(rows) * 100) / 100
      : Math.round((grossRevenue - totalExpenses) * 100) / 100;

  // ── Section 44AD eligibility ──────────────────────────────────────────────
  // E-commerce sellers on Amazon receive 100% digital receipts → ₹3 crore limit.
  const is44ADEligible = grossRevenue <= SEC_44AD_DIGITAL_LIMIT;
  const presumptiveIncome6Pct = Math.round(grossRevenue * 0.06);
  const presumptiveIncome8Pct = Math.round(grossRevenue * 0.08);

  // ── Tax computation ───────────────────────────────────────────────────────
  const actualTax      = computeSlabTax(netProfit);
  const presumptiveTax = computeSlabTax(presumptiveIncome6Pct);

  // Recommend presumptive only if seller is eligible and tax is lower
  const recommendedScheme = (is44ADEligible && presumptiveTax.total < actualTax.total)
    ? 'presumptive_44AD' as const
    : 'actual' as const;

  const estimatedTax   = recommendedScheme === 'presumptive_44AD' ? presumptiveTax.total : actualTax.total;
  const netTaxPayable  = Math.max(0, estimatedTax - tcsCredit - tdsCredit);

  // ── Advance tax (dynamic FY dates — Section 211) ──────────────────────────
  const advanceTaxSchedule = buildAdvanceTaxSchedule(fy.startYear, netTaxPayable);

  // ── Tax audit flag (Section 44AB) ─────────────────────────────────────────
  // E-commerce = 100% digital receipts → audit threshold ₹10 crore.
  let taxAuditRequired   = false;
  let taxAuditReason: string | undefined;
  if (recommendedScheme !== 'presumptive_44AD' && grossRevenue > SEC_44AB_DIGITAL_LIMIT) {
    taxAuditRequired = true;
    taxAuditReason   = `Turnover > ₹10 crore (Section 44AB). Tax audit by CA required before ITR filing.`;
  }
  if (recommendedScheme === 'presumptive_44AD'
      && netProfit < presumptiveIncome6Pct
      && grossRevenue > SEC_44AB_PRESUMPTIVE_LIMIT) {
    taxAuditRequired = true;
    taxAuditReason   = `Profit < 6% of turnover under 44AD with turnover > ₹2 crore (Section 44AB(e)). CA audit mandatory.`;
  }

  const itrForm = recommendedScheme === 'presumptive_44AD' ? 'ITR-4 (Sugam)' : 'ITR-3';

  // ── Compliance flags ──────────────────────────────────────────────────────
  const complianceFlags: string[] = [];
  if (!is44ADEligible) {
    complianceFlags.push(`⚠️ Turnover ₹${(grossRevenue / 1e7).toFixed(2)} Cr exceeds ₹3 Cr Section 44AD digital limit — presumptive scheme not available. Use actual books + ITR-3.`);
  }
  if (taxAuditRequired && taxAuditReason) {
    complianceFlags.push(`⚠️ TAX AUDIT REQUIRED: ${taxAuditReason}`);
  }
  if (netTaxPayable > 10_000) {
    complianceFlags.push(`💡 Advance tax applicable (liability > ₹10,000). First installment due 15 Jun ${fy.startYear}.`);
  }
  complianceFlags.push(`📅 ITR filing deadline: 31 Jul ${fy.endYear} (no audit) | 31 Oct ${fy.endYear} (with audit).`);
  complianceFlags.push(`📋 Verify TDS in Form 26AS / AIS before filing. TCS credit in GSTR-2B.`);

  return {
    grossRevenue,
    totalExpenses,
    netProfit,
    presumptiveIncome6Pct,
    presumptiveIncome8Pct,
    taxOnActual:      actualTax.total,
    taxOnPresumptive: presumptiveTax.total,
    recommendedScheme,
    estimatedTax,
    tcsCredit:     Math.round(tcsCredit),
    tdsCredit:     Math.round(tdsCredit),
    netTaxPayable: Math.round(netTaxPayable),
    advanceTaxSchedule,
    itrForm,
    slabBreakdown: (recommendedScheme === 'presumptive_44AD' ? presumptiveTax : actualTax).breakdown,
    regime:        'new',
    financialYear:     fy.label,
    is44ADEligible,
    taxAuditRequired,
    taxAuditReason,
    complianceFlags,
    reliability: {
      classification: 'advisory',
      confidence:     'low',
      source:         'derived',
      assumptions: [
        `Indicative estimate only for ${fy.label} new regime (Section 115BAC).`,
        is44ADEligible
          ? 'Section 44AD eligibility confirmed (Amazon = 100% digital receipts ≤ ₹3 Cr).'
          : 'Section 44AD NOT available — turnover exceeds ₹3 Cr digital limit.',
        'Does not account for deductions, other income sources, or purchase-side books.',
        'Consult a Chartered Accountant before filing ITR or computing advance tax.',
      ],
    },
  };
}
