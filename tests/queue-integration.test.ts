import { readFileSync, rmSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { reconciliationQueue } from '../src/lib/queue.ts';

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures');
const JOB_STORE_DIR = path.join(process.cwd(), '.guardianai');

describe('reconciliation queue integration', () => {
  beforeEach(() => {
    rmSync(JOB_STORE_DIR, { recursive: true, force: true });
  });

  it('produces a durable report with proofs and data quality', async () => {
    const csv = readFileSync(path.join(FIXTURE_DIR, 'amazon-settlement.csv'), 'utf8');
    const { id } = await reconciliationQueue.add('process-reconciliation', {
      filename: 'amazon-settlement.csv',
      data: csv,
      userId: 'test-user',
      timestamp: new Date().toISOString(),
    });

    let job = await reconciliationQueue.getJob(id);
    for (let i = 0; i < 40 && job?.state !== 'completed' && job?.state !== 'failed'; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
      job = await reconciliationQueue.getJob(id);
    }

    expect(job).not.toBeNull();
    expect(job?.state).toBe('completed');
    expect(job?.returnvalue?.calculationProofs?.revenue?.classification).toBe('deterministic');
    expect(job?.returnvalue?.dataQuality).toBeDefined();
    expect(job?.returnvalue?.recoveryActions).toBeDefined();
    expect(job?.returnvalue?.gstSummary?.reliability?.classification).toBe('assumption_based');
  });
});
