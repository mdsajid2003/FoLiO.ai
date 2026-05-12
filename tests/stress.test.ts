import { describe, expect, it } from 'vitest';
import { generateStressDataset, runStressValidation } from '../src/lib/test/stress-dataset.ts';
import { computeGstSummary } from '../src/lib/tax/gst-slabs.ts';

describe('stress dataset', () => {
  it('runStressValidation passes core cases', () => {
    const { passed, failed, results } = runStressValidation();
    expect(failed).toBe(0);
    expect(passed).toBe(results.length);
    for (const r of results) {
      expect(r.passed, r.details).toBe(true);
    }
  });

  it('STRESS-004 invalid GST rate is flagged', () => {
    const rows = generateStressDataset().filter(r => r.orderId === 'STRESS-004');
    const gst = computeGstSummary(rows, 'MH');
    expect(gst.mismatches.some(m => m.reason === 'rate_mismatch' && m.gstRate === 15)).toBe(true);
  });
});
