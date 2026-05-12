import { describe, expect, it } from 'vitest';
import { computeTdsSummary } from '../src/lib/tax/tds.ts';
import type { SellerOrderRow } from '../src/types/index.ts';

function baseRow(overrides: Partial<SellerOrderRow> = {}): SellerOrderRow {
  return {
    platform: 'amazon',
    orderId: 'O-1',
    sku: 'S',
    sellingPrice: 1000,
    settlement: 800,
    referralFee: 100,
    fulfillmentFee: 80,
    storageFee: 10,
    otherFees: 10,
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
    orderDate: '2025-06-01',
    rowIndex: 0,
    ...overrides,
  };
}

describe('computeTdsSummary', () => {
  it('applies 0.1% on gross: ₹1000 gross → ₹1.00 TDS (not ₹10)', () => {
    const rows = [baseRow({ settlement: 800, referralFee: 100, fulfillmentFee: 80, storageFee: 10, otherFees: 10 })];
    // gross = 1000
    const s = computeTdsSummary(rows, true);
    expect(s.totalTdsDeducted).toBeCloseTo(1.0, 2);
    expect(s.effectiveRate).toBeCloseTo(0.1, 4);
  });

  it('return row with settlement <= 0 contributes 0 TDS', () => {
    const rows = [
      baseRow({
        orderId: 'A',
        settlement: 500,
        returnAmount: 0,
        tdsDeducted: 0,
        referralFee: 0,
        fulfillmentFee: 0,
        storageFee: 0,
        otherFees: 0,
      }),
      baseRow({
        orderId: 'B',
        settlement: 0,
        returnAmount: 200,
        referralFee: 0,
        fulfillmentFee: 0,
        storageFee: 0,
        otherFees: 0,
        tdsDeducted: 0,
      }),
    ];
    const s = computeTdsSummary(rows, true);
    expect(s.totalTdsDeducted).toBeCloseTo(0.5, 2); // only first row: 500 * 0.001
  });

  it('without PAN uses 5% rate (Section 206AA)', () => {
    const rows = [baseRow({ settlement: 1000, referralFee: 0, fulfillmentFee: 0, storageFee: 0, otherFees: 0 })];
    const s = computeTdsSummary(rows, false);
    expect(s.effectiveRate).toBe(5);
    expect(s.totalTdsDeducted).toBeCloseTo(50, 2);
  });
});
