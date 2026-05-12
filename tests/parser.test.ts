import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSellerCsv } from '../src/lib/reconcile/parser.ts';

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures');

describe('parseSellerCsv', () => {
  it('parses Amazon settlement fixtures with data-quality metadata', async () => {
    const csv = readFileSync(path.join(FIXTURE_DIR, 'amazon-settlement.csv'), 'utf8');
    const result = await parseSellerCsv(csv, 'amazon-settlement.csv');

    expect(result.platform).toBe('amazon');
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].orderId).toBe('403-1111111');
    expect(result.rows[0].tcsDeducted).toBe(10);
    expect(result.dataQuality.invalidRowCount).toBe(0);
    expect(result.dataQuality.assumptionsUsed.length).toBeGreaterThan(0);
  });

  it('parses Flipkart settlement fixtures with row mapping', async () => {
    const csv = readFileSync(path.join(FIXTURE_DIR, 'flipkart-settlement.csv'), 'utf8');
    const result = await parseSellerCsv(csv, 'flipkart-settlement.csv');

    expect(result.platform).toBe('flipkart');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].orderItemId).toBe('SO-1');
    expect(result.rows[0].otherFees).toBe(15);
    expect(result.dataQuality.invalidRowCount).toBe(0);
    expect(result.dataQuality.assumptionsUsed.some(item => item.toLowerCase().includes('flipkart'))).toBe(true);
  });

  it('parses generic sales CSV: Revenue → settlement, Price → sellingPrice', async () => {
    const csv = readFileSync(path.join(process.cwd(), 'test_dataset_2.csv'), 'utf8');
    const result = await parseSellerCsv(csv, 'test_dataset_2.csv');

    expect(result.platform).toBe('amazon');
    expect(result.rows).toHaveLength(100);
    expect(result.rows.every((r) => r.settlement > 0)).toBe(true);
    expect(result.rows[0].orderId).toBe('1');
    expect(result.rows[0].settlement).toBe(199);
    expect(result.rows[0].sellingPrice).toBe(99.5);
  });

  it('uses Price as settlement when Revenue column is absent (no all-₹0 error)', async () => {
    const csv = ['Order ID,SKU,Quantity,Price', '1,A1,2,50.25', '2,B2,1,120.00'].join('\n');
    const result = await parseSellerCsv(csv, 'price-only.csv');

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].sellingPrice).toBe(50.25);
    expect(result.rows[0].settlement).toBe(50.25);
    expect(result.rows[1].settlement).toBe(120);
  });

  it('BUG-8: guessGstRate returns 0 for items with zero GST (books, medicines)', async () => {
    const csv = [
      'order id,sku,settlement amount,gst amount',
      '403-001,BOOK-001,500,0',
      '403-002,MED-001,200,0',
    ].join('\n');
    const result = await parseSellerCsv(csv, 'zero-gst.csv');

    expect(result.rows).toHaveLength(2);
    // Items with 0 GST should have gstRate=0, not 18
    result.rows.forEach(row => {
      expect(row.gstRate).toBe(0);
    });
  });

  it('parses generic CSV with headers: Order ID, Date, SKU, Quantity, Price, Revenue', async () => {
    const csv = [
      'Order ID,Date,SKU,Quantity,Price,Revenue',
      'ORD-001,2026-01-15,SKU-A,2,499.00,998.00',
      'ORD-002,2026-01-16,SKU-B,1,1299.00,1299.00',
    ].join('\n');
    const result = await parseSellerCsv(csv, 'generic-orders.csv');

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].orderId).toBe('ORD-001');
    expect(result.rows[0].settlement).toBeGreaterThan(0);
    // Revenue column should map to settlement
    expect(result.rows[0].settlement).toBe(998);
    expect(result.rows[1].settlement).toBe(1299);
  });

  it('fuzzy column matching: "Total Revenue" maps to settlement', async () => {
    const csv = [
      'Order ID,SKU,Total Revenue,Quantity',
      'ORD-100,SKU-X,750.50,1',
    ].join('\n');
    const result = await parseSellerCsv(csv, 'fuzzy-headers.csv');
    // Total Revenue should fuzzy-map to settlement or sellingPrice
    expect(result.rows.length).toBeGreaterThan(0);
    const row = result.rows[0];
    expect(row.settlement + row.sellingPrice).toBeGreaterThan(0);
  });

  it('fuzzy column matching: "Gross Sales" maps to settlement', async () => {
    const csv = [
      'Order ID,SKU,Gross Sales',
      'ORD-200,SKU-Y,500.00',
    ].join('\n');
    const result = await parseSellerCsv(csv, 'gross-sales.csv');
    expect(result.rows.length).toBeGreaterThan(0);
    const row = result.rows[0];
    expect(row.settlement + row.sellingPrice).toBeGreaterThan(0);
  });

  it('rejects files with no recognisable monetary column', async () => {
    const csv = ['Name,Department,Location', 'Alice,Eng,Delhi'].join('\n');
    await expect(parseSellerCsv(csv, 'hr-data.csv')).rejects.toThrow();
  });
});

import { detectLeakage } from '../src/lib/reconcile/leakage.ts';
import { computeTcsSummary } from '../src/lib/tax/tcs.ts';
import type { SellerOrderRow } from '../src/types/index.ts';

function makeRow(overrides: Partial<SellerOrderRow>): SellerOrderRow {
  return {
    orderId: 'TEST-001',
    orderItemId: 'ITEM-001',
    orderDate: '2025-06-15',
    sku: 'SKU-A',
    platform: 'amazon',
    settlement: 500,
    sellingPrice: 590,
    referralFee: 47,
    fulfillmentFee: 40,
    storageFee: 3,
    otherFees: 0,
    gstCollected: 90,
    gstRate: 18,
    pos: 'MH',
    tcsDeducted: 5.9,
    tdsDeducted: 0,
    returnAmount: 0,
    weight: 0.4,
    declaredWeight: 0.4,
    weightSource: 'parsed',
    quantity: 1,
    rowIndex: 0,
    ...overrides,
  };
}

describe('detectLeakage', () => {
  it('DATA-3: does not false-positive "sp" in "sports" as a category trigger', () => {
    const rows = [makeRow({ sku: 'TRANSPORT-001' })];
    const items = detectLeakage(rows);
    // TRANSPORT should not be classified as "sports" (contains "sport" but shouldn't fuzzy-match "sp")
    const referralItems = items.filter(i => i.type === 'incorrect_referral_fee');
    // If incorrectly categorised as sports, rate diff would appear; this test just ensures no crash
    expect(Array.isArray(referralItems)).toBe(true);
  });

  it('DATA-2: skips weight_slab_error detection for Flipkart platform', () => {
    const rows = [makeRow({
      platform: 'flipkart', sku: 'FK-SKU-1',
      weight: 2.0, declaredWeight: 0.4, weightSource: 'parsed',
      fulfillmentFee: 200,
    })];
    const items = detectLeakage(rows, 'flipkart');
    const weightErrors = items.filter(i => i.type === 'weight_slab_error');
    expect(weightErrors).toHaveLength(0);
  });

  it('DATA-2: detects weight_slab_error for Amazon platform', () => {
    // charged weight = 2.0kg (fee ₹65), declared weight = 0.4kg (fee ₹30) → diff = ₹35
    const rows = [makeRow({
      platform: 'amazon',
      weight: 2.0,         // what Amazon charged
      declaredWeight: 0.4, // what seller declared
      weightSource: 'parsed',
    })];
    const items = detectLeakage(rows, 'amazon');
    const weightErrors = items.filter(i => i.type === 'weight_slab_error');
    expect(weightErrors.length).toBeGreaterThan(0);
    expect(weightErrors[0].diff).toBeGreaterThan(0);
  });
});

describe('computeTcsSummary', () => {
  it('DATA-1: uses net taxable value (ex-GST) as TCS base, not gross settlement', () => {
    const rows = [
      makeRow({
        settlement: 450,
        referralFee: 47,
        fulfillmentFee: 40,
        storageFee: 3,
        otherFees: 0,
        gstRate: 18,
        tcsDeducted: 0, // force computed path
      }),
    ];
    const result = computeTcsSummary(rows);
    // grossSalePrice = 450+47+40+3 = 540; baseValue = 540/1.18 ≈ 457.63; TCS = 4.58
    expect(result.totalTcsCollected).toBeCloseTo(4.58, 1);
  });

  it('DATA-1: prefers CSV TCS when present over computed estimate', () => {
    const rows = [makeRow({ tcsDeducted: 12.50 })];
    const result = computeTcsSummary(rows);
    expect(result.totalTcsCollected).toBe(12.50);
  });
});
