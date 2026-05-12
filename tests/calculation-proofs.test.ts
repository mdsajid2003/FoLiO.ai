import { describe, expect, it } from 'vitest';
import { buildCalculationProofs } from '../src/lib/reconcile/calculation-proofs.ts';
import { SellerOrderRow } from '../src/types/index.ts';

describe('buildCalculationProofs', () => {
  it('marks trusted vs assumption-based metrics correctly', () => {
    const rows: SellerOrderRow[] = [
      {
        platform: 'amazon',
        orderId: '1',
        sku: 'SKU-1',
        sellingPrice: 1000,
        settlement: 1000,
        referralFee: 100,
        fulfillmentFee: 40,
        storageFee: 0,
        otherFees: 0,
        gstCollected: 152.54,
        gstRate: 18,
        pos: 'KA',
        tcsDeducted: 10,
        tdsDeducted: 10,
        returnAmount: 0,
        weight: 0.5,
        declaredWeight: 0.5,
        weightSource: 'parsed',
        quantity: 1,
        rowIndex: 2,
      },
    ];

    const proofs = buildCalculationProofs(rows, {
      totalRevenue: 1000,
      totalExpenses: 140,
      netProfit: 860,
      recoverableLeakage: 90,
      tcsClaimable: 10,
      rowCount: 1,
      leakageItems: [],
      dataQuality: {
        invalidRowCount: 0,
        excludedRowCount: 0,
        missingRequiredColumns: [],
        assumptionsUsed: ['Seller state inferred as KA'],
        warnings: [],
        financeGradeReady: false,
        issueSample: [],
      },
    });

    expect(proofs.revenue.classification).toBe('deterministic');
    expect(proofs.recoverableLeakage.classification).toBe('deterministic');
    expect(proofs.tcsClaimable.classification).toBe('assumption_based');
    expect(proofs.tcsClaimable.assumptions?.length).toBeGreaterThan(0);
  });
});
