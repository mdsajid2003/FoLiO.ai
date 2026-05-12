import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSellerCsv } from '../src/lib/reconcile/parser.ts';
import { computeGstSummary, inferSellerState } from '../src/lib/tax/gst-slabs.ts';
import { computeIncomeTaxEstimate } from '../src/lib/tax/income-tax.ts';
import { computeTcsSummary } from '../src/lib/tax/tcs.ts';
import { computeTdsSummary } from '../src/lib/tax/tds.ts';

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures');

describe('tax summary reliability', () => {
  it('tags GST, TCS, and TDS summaries as assumption-based', async () => {
    const csv = readFileSync(path.join(FIXTURE_DIR, 'amazon-settlement.csv'), 'utf8');
    const { rows } = await parseSellerCsv(csv, 'amazon-settlement.csv');

    const gst = computeGstSummary(rows, inferSellerState(rows));
    const tcs = computeTcsSummary(rows);
    const tds = computeTdsSummary(rows);

    expect(gst.reliability?.classification).toBe('assumption_based');
    expect(gst.reliability?.assumptions.length).toBeGreaterThan(0);
    expect(tcs.reliability?.classification).toBe('assumption_based');
    expect(tds.reliability?.classification).toBe('assumption_based');
  });

  it('keeps income tax outputs explicitly advisory', async () => {
    const csv = readFileSync(path.join(FIXTURE_DIR, 'amazon-settlement.csv'), 'utf8');
    const { rows } = await parseSellerCsv(csv, 'amazon-settlement.csv');
    const estimate = computeIncomeTaxEstimate(rows, 19.5, 21.5);

    expect(estimate.reliability?.classification).toBe('advisory');
    expect(estimate.reliability?.confidence).toBe('low');
    expect(estimate.netTaxPayable).toBeGreaterThanOrEqual(0);
  });
});
