import type { SellerOrderRow } from '../../types/index.ts';
import { detectLeakage } from '../reconcile/leakage.ts';
import { computeTotals } from '../reconcile/settlement.ts';
import { runInvariantChecks } from '../reconcile/invariants.ts';

export function generateStressDataset(): SellerOrderRow[] {
  const rows: SellerOrderRow[] = [];
  let idx = 0;

  const base = (o: Partial<SellerOrderRow>): SellerOrderRow => ({
    platform: 'amazon',
    orderId: 'X',
    sku: 'SKU',
    sellingPrice: 0,
    settlement: 0,
    referralFee: 0,
    fulfillmentFee: 0,
    storageFee: 0,
    otherFees: 0,
    gstCollected: 0,
    gstRate: 18,
    pos: 'MH',
    tcsDeducted: 0,
    tdsDeducted: 0,
    returnAmount: 0,
    weight: 0.5,
    declaredWeight: 0.5,
    weightSource: 'parsed',
    quantity: 1,
    rowIndex: 0,
    ...o,
  });

  rows.push(base({
    orderId: 'STRESS-001', sku: 'SKU-BOUNDARY',
    sellingPrice: 999, settlement: 750, gstRate: 18,
    referralFee: 80, fulfillmentFee: 50, storageFee: 0, otherFees: 0,
    gstCollected: 152.54, tcsDeducted: 7.5, tdsDeducted: 0.75,
    weight: 0.5, declaredWeight: 0.5, weightSource: 'parsed',
    orderDate: '2024-02-01', rowIndex: idx++,
  }));

  rows.push(base({
    orderId: 'STRESS-002', sku: 'SKU-PARTIAL',
    sellingPrice: 1500, settlement: 0, gstRate: 12,
    returnAmount: 600,
    weight: 1.0, declaredWeight: 0.8, weightSource: 'parsed',
    orderDate: '2024-02-15', pos: 'DL', rowIndex: idx++,
  }));

  rows.push(base({
    orderId: 'STRESS-003', sku: 'SKU-SLAB',
    sellingPrice: 500, settlement: 350, gstRate: 5,
    referralFee: 40, fulfillmentFee: 65, storageFee: 0, otherFees: 0,
    gstCollected: 23.81, tcsDeducted: 3.5, tdsDeducted: 0.35,
    weight: 1.05, declaredWeight: 0.48, weightSource: 'parsed',
    orderDate: '2024-03-01', pos: 'KA', rowIndex: idx++,
  }));

  rows.push(base({
    orderId: 'STRESS-004', sku: 'SKU-TAXERROR',
    sellingPrice: 2000, settlement: 1500, gstRate: 15,
    referralFee: 160, fulfillmentFee: 80, storageFee: 0, otherFees: 0,
    gstCollected: 300, tcsDeducted: 15, tdsDeducted: 1.5,
    weight: 2.0, declaredWeight: 2.0, weightSource: 'parsed',
    orderDate: '2024-03-10', pos: 'GJ', rowIndex: idx++,
  }));

  rows.push(base({
    orderId: 'STRESS-005', sku: 'SKU-ZEROREFERRAL',
    sellingPrice: 750, settlement: 700, gstRate: 0,
    referralFee: 0, fulfillmentFee: 45, storageFee: 0, otherFees: 5,
    tcsDeducted: 7, tdsDeducted: 0.7,
    weight: 0.3, declaredWeight: 0.3, weightSource: 'parsed',
    orderDate: '2024-03-15', pos: 'TN', rowIndex: idx++,
  }));

  rows.push(base({
    orderId: 'STRESS-006', sku: 'SKU-DUPE',
    sellingPrice: 1200, settlement: 900, gstRate: 18,
    referralFee: 96, fulfillmentFee: 55, storageFee: 0, otherFees: 0,
    gstCollected: 183.05, tcsDeducted: 9, tdsDeducted: 0.9,
    weight: 0.8, declaredWeight: 0.8, weightSource: 'parsed',
    orderDate: '2024-03-18', pos: 'MH', rowIndex: idx++,
  }));
  rows.push(base({
    orderId: 'STRESS-006', sku: 'SKU-DUPE',
    sellingPrice: 0, settlement: 0, gstRate: 18,
    referralFee: 96, fulfillmentFee: 0, storageFee: 0, otherFees: 0,
    weight: 0.8, declaredWeight: 0.8, weightSource: 'parsed',
    orderDate: '2024-03-18', pos: 'MH', rowIndex: idx++,
  }));

  rows.push(base({
    orderId: 'STRESS-007', sku: 'SKU-DEFERRED',
    sellingPrice: 3000, settlement: 2200, gstRate: 18,
    referralFee: 240, fulfillmentFee: 100, storageFee: 20, otherFees: 0,
    gstCollected: 457.63, tcsDeducted: 22, tdsDeducted: 2.2,
    weight: 3.0, declaredWeight: 3.0, weightSource: 'parsed',
    orderDate: '2024-03-20', pos: 'UP', rowIndex: idx++, isDeferred: true,
  }));

  return rows;
}

export function runStressValidation(): {
  passed: number;
  failed: number;
  results: Array<{ case: string; passed: boolean; details: string }>;
} {
  const rows = generateStressDataset();
  const results: Array<{ case: string; passed: boolean; details: string }> = [];

  const leak = detectLeakage(rows, 'amazon');
  const dup = leak.filter(i => i.type === 'duplicate_charge' && i.orderId === 'STRESS-006');
  results.push({
    case: 'STRESS-006 duplicate_charge',
    passed: dup.length > 0,
    details: dup.length ? `Found ${dup.length}` : 'Missing duplicate_charge',
  });

  const slab = leak.filter(i => i.type === 'weight_slab_error' && i.orderId === 'STRESS-003');
  results.push({
    case: 'STRESS-003 weight_slab_error',
    passed: slab.length > 0,
    details: slab.length ? 'Slab issue flagged' : 'Expected weight slab flag',
  });

  const totals = computeTotals(rows);
  // totalRevenue is now GROSS (settlement + fees) for settlement>0 rows, deferred excluded.
  // STRESS-001: 750+80+50=880 | STRESS-003: 350+40+65=455 | STRESS-004: 1500+160+80=1740
  // STRESS-005: 700+0+45+0+5=750 | STRESS-006a: 900+96+55=1051 | STRESS-002(settlement=0)=skip
  // STRESS-007(isDeferred=true)=skip
  const expectedCashRevenue = 880 + 455 + 1740 + 750 + 1051; // = 4876
  results.push({
    case: 'STRESS-007 deferred excluded from cash revenue',
    passed: Math.abs(totals.totalRevenue - expectedCashRevenue) < 2,
    details: `totalRevenue=${totals.totalRevenue} (expected ≈${expectedCashRevenue} gross ex-deferred)`,
  });

  const inv = runInvariantChecks(rows, undefined, undefined);
  results.push({
    case: 'invariants run',
    passed: inv.checks.length > 0,
    details: `${inv.checks.length} checks`,
  });

  const passed = results.filter(r => r.passed).length;
  return { passed, failed: results.length - passed, results };
}
