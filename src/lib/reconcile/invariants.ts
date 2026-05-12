import type { InvariantCheck, InvariantReport, SellerOrderRow } from '../../types/index.ts';

export function runInvariantChecks(
  rows: SellerOrderRow[],
  bankDeposit?: number,
  grossSales?: number,
): InvariantReport {
  const checks: InvariantCheck[] = [];

  const nonDeferred = rows.filter(r => r.isDeferred !== true);
  const settlementSum = nonDeferred.reduce((s, r) => s + Math.max(0, r.settlement), 0);

  if (bankDeposit != null && Number.isFinite(bankDeposit)) {
    const tol = 2;
    const diff = settlementSum - bankDeposit;
    checks.push({
      name: 'Settlement = Bank Deposit',
      formula: 'Σ settlement (non-deferred) ≈ bankDeposit',
      expected: bankDeposit,
      actual: Math.round(settlementSum * 100) / 100,
      difference: Math.round(diff * 100) / 100,
      withinTolerance: Math.abs(diff) <= tol,
      tolerance: tol,
      passed: Math.abs(diff) <= tol,
      severity: 'critical',
      explanation:
        'Total settlement payouts should match the bank deposit. A difference may indicate reserves, deferred amounts, or recording errors.',
    });
  }

  const tdsCsv = rows.reduce((s, r) => s + (r.tdsDeducted > 0 ? r.tdsDeducted : 0), 0);
  const gs = grossSales ?? rows.reduce((s, r) => {
    if (r.returnAmount > 0 && r.settlement <= 0) return s;
    if (r.settlement <= 0) return s;
    return s + r.settlement + r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
  }, 0);
  const expectedTds = gs * 0.001;
  const tolTds = Math.max(2, expectedTds * 0.05);
  const diffTds = tdsCsv - expectedTds;
  checks.push({
    name: 'TDS ≈ 0.1% of Gross Sales',
    formula: 'Σ tdsDeducted (CSV) vs gross × 0.1%',
    expected: Math.round(expectedTds * 100) / 100,
    actual: Math.round(tdsCsv * 100) / 100,
    difference: Math.round(diffTds * 100) / 100,
    withinTolerance: Math.abs(diffTds) <= tolTds,
    tolerance: tolTds,
    passed: Math.abs(diffTds) <= tolTds,
    severity: 'warning',
    explanation:
      'Total TDS deducted should approximate 0.1% of gross sales. Differences arise from timing and CSV coverage.',
  });

  let netTaxableGmv = 0;
  for (const r of rows) {
    if (r.settlement <= 0) continue;
    const g = r.settlement + r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
    const base = r.gstRate > 0 ? g / (1 + r.gstRate / 100) : g;
    netTaxableGmv += base;
  }
  const tcsCsv = rows.reduce((s, r) => s + (r.tcsDeducted > 0 ? r.tcsDeducted : 0), 0);
  const expTcs = netTaxableGmv * 0.01;
  const tolTcs = Math.max(2, expTcs * 0.05); // 5% relative, min ₹2 — matches TDS tolerance
  const diffTcs = tcsCsv - expTcs;
  checks.push({
    name: 'TCS ≈ 1% of Net Taxable GMV',
    formula: 'Σ tcsDeducted vs taxable × 1%',
    expected: Math.round(expTcs * 100) / 100,
    actual: Math.round(tcsCsv * 100) / 100,
    difference: Math.round(diffTcs * 100) / 100,
    withinTolerance: Math.abs(diffTcs) <= tolTcs,
    tolerance: Math.round(tolTcs * 100) / 100,
    passed: Math.abs(diffTcs) <= tolTcs,
    severity: 'warning',
    explanation:
      'TCS at 1% on net taxable value (ex-GST). Differences arise from timing and partial CSV coverage. ' +
      'Tolerance: 5% of expected TCS or ₹2, whichever is greater.',
  });

  const badReturnTds = rows.some(r => r.returnAmount > 0 && r.tdsDeducted < 0);
  checks.push({
    name: 'TDS not fully reversed on returns',
    formula: 'No negative tdsDeducted on return rows',
    expected: 0,
    actual: badReturnTds ? 1 : 0,
    difference: badReturnTds ? 1 : 0,
    withinTolerance: !badReturnTds,
    tolerance: 0,
    passed: !badReturnTds,
    severity: 'warning',
    explanation:
      'TDS is not fully reversed when a return is processed — negative tdsDeducted on return rows would be unusual.',
  });

  const negSale = rows.some(r => r.sellingPrice > 0 && r.settlement < -2);
  checks.push({
    name: 'No negative settlements on sale rows',
    formula: 'sellingPrice > 0 ⇒ settlement ≥ -2',
    expected: 0,
    actual: negSale ? 1 : 0,
    difference: negSale ? 1 : 0,
    withinTolerance: !negSale,
    tolerance: 0,
    passed: !negSale,
    severity: 'warning',
    explanation: 'Large negative settlement on rows with selling price may indicate data issues.',
  });

  const criticalFailures = checks.filter(c => !c.passed && c.severity === 'critical').length;
  const warnings = checks.filter(c => !c.passed && c.severity === 'warning').length;

  return {
    checks,
    allPassed: checks.every(c => c.passed),
    criticalFailures,
    warnings,
  };
}
