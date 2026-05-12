import { describe, expect, it } from 'vitest';
import type { SellerOrderRow } from '../src/types/index.ts';
import { computeTotals } from '../src/lib/reconcile/settlement.ts';
import { usesLineProfit, usesLineTotalRevenue } from '../src/lib/reconcile/seller-dataset-basis.ts';

function row(p: Partial<SellerOrderRow> & Pick<SellerOrderRow, 'orderId'>): SellerOrderRow {
  return {
    platform: 'amazon',
    orderId: p.orderId,
    sku: p.sku ?? 'S',
    sellingPrice: p.sellingPrice ?? 100,
    settlement: p.settlement ?? 80,
    referralFee: p.referralFee ?? 10,
    fulfillmentFee: p.fulfillmentFee ?? 5,
    storageFee: p.storageFee ?? 0,
    otherFees: p.otherFees ?? 0,
    gstCollected: p.gstCollected ?? 0,
    gstRate: p.gstRate ?? 18,
    pos: p.pos ?? 'MH',
    tcsDeducted: p.tcsDeducted ?? 0,
    tdsDeducted: p.tdsDeducted ?? 0,
    returnAmount: p.returnAmount ?? 0,
    weight: 0.5,
    declaredWeight: 0.5,
    weightSource: 'parsed',
    quantity: p.quantity ?? 1,
    rowIndex: p.rowIndex ?? 2,
    ...p,
  };
}

describe('line-revenue / line-profit totals (regression)', () => {
  it('uses SUM(total_revenue) and SUM(profit) when all material rows carry both', () => {
    const rows: SellerOrderRow[] = [
      row({
        orderId: 'A',
        datasetTotalRevenue: 1000,
        datasetProfit: 200,
        datasetTotalFees: 100,
        referralFee: 999,
        fulfillmentFee: 0,
      }),
      row({
        orderId: 'B',
        rowIndex: 3,
        datasetTotalRevenue: 500,
        datasetProfit: 50,
        datasetTotalFees: 40,
        referralFee: 0,
        fulfillmentFee: 0,
      }),
    ];
    expect(usesLineTotalRevenue(rows)).toBe(true);
    expect(usesLineProfit(rows)).toBe(true);
    const t = computeTotals(rows);
    expect(t.totalRevenue).toBe(1500);
    expect(t.netProfit).toBe(250);
    expect(t.totalExpenses).toBe(100 + 40);
  });

  it('falls back to legacy revenue when any material row lacks datasetTotalRevenue', () => {
    const rows: SellerOrderRow[] = [
      row({ orderId: 'A', datasetTotalRevenue: 1000, datasetProfit: 1, datasetTotalFees: 10 }),
      row({ orderId: 'B', rowIndex: 3, settlement: 100, referralFee: 20, fulfillmentFee: 10 }),
    ];
    expect(usesLineTotalRevenue(rows)).toBe(false);
    const t = computeTotals(rows);
    expect(t.totalRevenue).toBe((80 + 10 + 5) + (100 + 20 + 10));
  });
});
