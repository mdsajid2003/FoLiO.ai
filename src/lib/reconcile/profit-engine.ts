import type { ProfitBreakdown, ProfitInput } from '../../types/index.ts';
import { REFERRAL_RATES, computeWeightFee } from './leakage.ts';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeProfitBreakdown(input: ProfitInput): ProfitBreakdown {
  const { sellingPrice, costOfGoods, gstRate, category, weightKg, isFBA } = input;
  const gstOnSale = round2(sellingPrice - sellingPrice / (1 + gstRate / 100));
  const taxableSellingPrice = round2(sellingPrice / (1 + gstRate / 100));
  const rate = REFERRAL_RATES[category] ?? REFERRAL_RATES.default;
  const referralFee = round2(taxableSellingPrice * rate);
  const fbaFee = isFBA ? round2(computeWeightFee(weightKg)) : 0;
  const gstOnFees = round2((referralFee + fbaFee) * 0.18);
  const tcsDeducted = round2(taxableSellingPrice * 0.01);
  // Section 194-O TDS: 0.1% on gross GST-inclusive selling price.
  // Amazon IN deducts on the GST-inclusive amount in practice — matches Form 26AS credits.
  // Some CAs argue 194-O applies ex-GST. Consult your CA if Form 26AS differs from this estimate.
  const tdsDeducted = round2(sellingPrice * 0.001);
  // totalDeductions = all amounts Amazon deducts before crediting the seller.
  // gstOnFees IS deducted by Amazon (they charge GST-inclusive fees); the seller
  // later recovers it as ITC via GSTR-3B — but the cash payout is reduced by it.
  const totalDeductions = round2(referralFee + fbaFee + gstOnFees + tcsDeducted + tdsDeducted);
  const netPayout = round2(sellingPrice - totalDeductions - gstOnSale);
  const grossProfit = round2(netPayout - costOfGoods);
  // gstOnFees is an Input Tax Credit (ITC) — a tax offset, not cash income.
  // It reduces your GST liability when filing returns but is NOT added to
  // operating profit. Previously this was incorrectly added to netProfit,
  // overstating profit by ~18% of the fee total.
  const netProfit = round2(grossProfit); // ITC claimed separately via GST return
  const profitMarginPct = sellingPrice > 0 ? round2((netProfit / sellingPrice) * 100) : 0;
  // Breakeven: solve netProfit(P) = 0 analytically.
  // netPayout = P - gstOnSale - referralFee - gstOnFees - fbaFee - TCS - TDS
  // where taxable = P/(1+g), referralFee = taxable*rr, gstOnFees = (taxable*rr + fbaFee)*0.18,
  // TCS = taxable*0.01, TDS = P*0.001
  // netProfit = netPayout - costOfGoods = 0
  // → P * [ (1 - rr - rr*0.18 - 0.01) / (1+g) - (1 + 0.001) ] = costOfGoods + fbaFee*(1+0.18)
  // Simplify: coefficient of 1/(1+g) = 1 - rr*1.18 - 0.01; direct P coeff = -0.001
  const g = gstRate / 100;
  const rr = REFERRAL_RATES[category] ?? REFERRAL_RATES.default;
  const beNumerator = costOfGoods + fbaFee * 1.18;
  const beDenominator = (1 - rr * 1.18 - 0.01) / (1 + g) - 0.001;
  // -1 is a sentinel: no viable price exists at this fee/GST/category combination.
  const breakeven = beDenominator > 0 ? round2(beNumerator / beDenominator) : -1;

  const isViable = netProfit > 0;
  let recommendation = '';
  if (breakeven === -1) {
    recommendation =
      'No viable price exists at this fee/GST/category combination. ' +
      'Platform fees exceed available margin at any selling price. ' +
      'Consider: lower-fee category, reduced COGS, or Easy Ship instead of FBA.';
  } else if (profitMarginPct < 0) {
    recommendation = `Loss-making. Raise price or reduce cost of goods (breakeven ≈ ₹${breakeven}).`;
  } else if (profitMarginPct < 5) {
    recommendation = 'Marginal. Vulnerable to returns. Consider repricing.';
  } else if (profitMarginPct < 15) {
    recommendation = 'Acceptable margin. Monitor return rate.';
  } else {
    recommendation = 'Healthy margin. Scale this SKU.';
  }

  return {
    sellingPrice: round2(sellingPrice),
    gstOnSale,
    taxableSellingPrice,
    referralFee,
    fbaFee,
    gstOnFees,
    tcsDeducted,
    tdsDeducted,
    totalDeductions,
    netPayout,
    costOfGoods: round2(costOfGoods),
    grossProfit,
    netProfit,
    profitMarginPct,
    breakeven,
    recommendation,
    isViable,
  };
}

export function simulatePriceRange(
  input: Omit<ProfitInput, 'sellingPrice'>,
  minPrice: number,
  maxPrice: number,
  step: number,
): Array<{ price: number; netProfit: number; marginPct: number; isViable: boolean }> {
  const out: Array<{ price: number; netProfit: number; marginPct: number; isViable: boolean }> = [];
  for (let p = minPrice; p <= maxPrice + 1e-6; p += step) {
    const b = computeProfitBreakdown({ ...input, sellingPrice: p });
    out.push({
      price: round2(p),
      netProfit: b.netProfit,
      marginPct: b.profitMarginPct,
      isViable: b.isViable,
    });
  }
  return out;
}
