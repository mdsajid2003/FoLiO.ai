import * as fs from 'fs';
import * as path from 'path';
import { ReconciliationJob, ReconciliationReport, AiUsageRecord } from '../types/index.ts';
import { parseSellerCsv, UnrecognizedFileError } from './reconcile/parser.ts';
import { analyzeWithAI } from './ai/csv-analysis.ts';
import { detectLeakage } from './reconcile/leakage.ts';
import { computeRecoveryActions } from './reconcile/recovery.ts';
import {
  computeSkuProfitability,
  computeMonthlyTrends,
  computeTotals,
  computeTotalsFromAmazonTransactionMetrics,
  computeDeferredAmount,
  getRowCogs,
} from './reconcile/settlement.ts';
import {
  datasetRevenueDeviationWarnings,
  isSaleRowForCogs,
  sumLineTotalRevenue,
  usesLineTotalRevenue,
} from './reconcile/seller-dataset-basis.ts';
import { computeThreeWayMatch } from './reconcile/three-way-match.ts';
import { runInvariantChecks } from './reconcile/invariants.ts';
import { checkIntegrityAgainstStore } from './storage/integrity.ts';
import { computeConfidence } from './reconcile/confidence.ts';
import { generateNarrative } from './ai/narrative.ts';
import { computeGstSummary, inferSellerState } from './tax/gst-slabs.ts';
import { buildCalculationProofs } from './reconcile/calculation-proofs.ts';
import { computeTcsSummary } from './tax/tcs.ts';
import { computeTdsSummary } from './tax/tds.ts';
import { computeIncomeTaxEstimate } from './tax/income-tax.ts';
import { computeSalesAnalytics } from './analytics/sales.ts';
import { computeConfigBasedSellerAnalytics } from './analytics/config-based-seller-analytics.ts';
import { DEFAULT_SELLER_ANALYTICS_CONFIG } from '../config/sellerAnalytics.config.ts';
import { generateDatasetQuestions } from './reconcile/dataset-questions.ts';
import { logEvent } from './logger.ts';

interface DurableJob {
  id: string;
  data: ReconciliationJob;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  returnvalue: ReconciliationReport | null;
  failedReason: string | null;
  getState(): Promise<string>;
}

const JOB_STORE_DIR = path.join(process.cwd(), '.guardianai');
const JOB_STORE_FILE = path.join(JOB_STORE_DIR, 'jobs.json');
const AI_USAGE_FILE = path.join(JOB_STORE_DIR, 'ai-usage.json');
const JOB_MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours
const jobStore = new Map<string, DurableJob>();

const AI_MONTHLY_LIMIT = 5;
const aiUsageStore = new Map<string, AiUsageRecord>();

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function ensureJobStoreDir(): void {
  if (!fs.existsSync(JOB_STORE_DIR)) fs.mkdirSync(JOB_STORE_DIR, { recursive: true });
}

function persistAiUsage(): void {
  try {
    ensureJobStoreDir();
    const obj: Record<string, AiUsageRecord> = {};
    for (const [k, v] of aiUsageStore) obj[k] = v;
    fs.writeFileSync(AI_USAGE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    logEvent('error', 'ai_usage_persist_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

function hydrateAiUsage(): void {
  try {
    if (!fs.existsSync(AI_USAGE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(AI_USAGE_FILE, 'utf8')) as Record<string, AiUsageRecord>;
    for (const [k, v] of Object.entries(parsed)) {
      aiUsageStore.set(k, v);
    }
  } catch (err) {
    logEvent('warn', 'ai_usage_hydrate_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

export function getAiUsage(userId: string): AiUsageRecord {
  const monthKey = getCurrentMonthKey();
  const existing = aiUsageStore.get(userId);
  if (existing && existing.monthKey === monthKey) return existing;
  const fresh: AiUsageRecord = { count: 0, monthKey, limit: AI_MONTHLY_LIMIT };
  aiUsageStore.set(userId, fresh);
  persistAiUsage();
  return fresh;
}

function incrementAiUsage(userId: string): boolean {
  const usage = getAiUsage(userId);
  if (usage.count >= usage.limit) return false;
  usage.count += 1;
  aiUsageStore.set(userId, usage);
  persistAiUsage();
  return true;
}

/** Strip raw CSV payload before writing to disk — only keep metadata */
function stripJobForPersist(job: DurableJob): Omit<DurableJob, 'getState'> {
  const { getState, ...rest } = job;
  return {
    ...rest,
    data: {
      filename: rest.data.filename,
      userId: rest.data.userId,
      timestamp: rest.data.timestamp,
      columnOverrides: rest.data.columnOverrides,
      data: '', // raw CSV is never stored on disk
    },
  };
}

function cleanupOldJobs(): void {
  const cutoff = Date.now() - JOB_MAX_AGE_MS;
  let removed = 0;
  for (const [id, job] of jobStore) {
    const ts = job.data.timestamp ? new Date(job.data.timestamp).getTime() : 0;
    if (ts > 0 && ts < cutoff) {
      jobStore.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    logEvent('info', 'job_store_cleanup', { removed, remaining: jobStore.size });
    persistJobs();
  }
}

function persistJobs(): void {
  try {
    ensureJobStoreDir();
    fs.writeFileSync(
      JOB_STORE_FILE,
      JSON.stringify(Array.from(jobStore.values()).map(stripJobForPersist), null, 2),
      'utf8',
    );
  } catch (err) {
    logEvent('error', 'job_store_persist_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

function hydrateJobs(): void {
  try {
    if (!fs.existsSync(JOB_STORE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(JOB_STORE_FILE, 'utf8')) as Array<Omit<DurableJob, 'getState'>>;
    for (const job of parsed) {
      const hydrated: DurableJob = {
        ...job,
        async getState() { return this.state; },
      };
      jobStore.set(job.id, hydrated);
      // #10 fix: reschedule any job that was in-flight when the server restarted
      // so clients polling /status/:id don't wait forever
      if (job.state === 'waiting' || job.state === 'active') {
        logEvent('info', 'job_rehydrated', { jobId: job.id, previousState: job.state });
        scheduleProcessJob(hydrated);
      }
    }
  } catch (error) {
    logEvent('warn', 'job_store_hydrate_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

function updateJob(job: DurableJob, patch: Partial<DurableJob>): void {
  Object.assign(job, patch);
  jobStore.set(job.id, job);
  persistJobs();
}

async function processJob(job: DurableJob) {
  try {
    updateJob(job, { state: 'active', progress: 5 });
    logEvent('info', 'job_processing_started', { jobId: job.id, filename: job.data.filename });

    let { rows, platform, dataQuality, amazonTransactionMetrics } = await parseSellerCsv(
      job.data.data,
      job.data.filename,
      job.data.columnOverrides ?? {},
    );
    updateJob(job, { progress: 20 });

    const integrity = checkIntegrityAgainstStore(job.data.userId, job.data.filename, job.data.data, rows.length);
    if (integrity.check?.changeDetected) {
      dataQuality = { ...dataQuality, warnings: [...dataQuality.warnings, integrity.check.message] };
    }

    const revenueDeviationWarnings = datasetRevenueDeviationWarnings(rows);
    if (revenueDeviationWarnings.length > 0) {
      for (const message of revenueDeviationWarnings) {
        logEvent('warn', 'dataset_revenue_validation', { jobId: job.id, message });
      }
      dataQuality = { ...dataQuality, warnings: [...dataQuality.warnings, ...revenueDeviationWarnings] };
    }

    // Leakage detection + recovery engine
    const rawLeakageItems = detectLeakage(rows, platform);
    if (amazonTransactionMetrics) {
      logEvent('info', 'amazon_transaction_settlement_totals', {
        jobId: job.id,
        ...amazonTransactionMetrics,
        detectedSchema: dataQuality.detectedSchema,
      });
    }
    const platformName = platform === 'flipkart' ? 'Flipkart' : 'Amazon';
    const recovery = computeRecoveryActions(rawLeakageItems, platformName);
    const leakageItems = recovery.enrichedItems;
    updateJob(job, { progress: 30 });

    updateJob(job, { progress: 40 });

    const sellerState = inferSellerState(rows, job.data.sellerRegisteredState);

    // BUG 7 FIX: warn when seller state was defaulted to KA (Karnataka)
    const stateIsDefaulted =
      sellerState === 'KA' &&
      !rows.some(r => r.sellerState?.trim()) &&
      !(typeof process !== 'undefined' && process.env?.SELLER_REGISTERED_STATE);
    if (stateIsDefaulted) {
      dataQuality = {
        ...dataQuality,
        warnings: [
          ...dataQuality.warnings,
          'Seller registered state defaulted to KA (Karnataka) — IGST/CGST/SGST split may be wrong. ' +
          'Set SELLER_REGISTERED_STATE env variable or add a seller_state column to your CSV.',
        ],
        assumptionsUsed: [
          ...dataQuality.assumptionsUsed,
          'Seller state: KA (defaulted — not from data or config).',
        ],
      };
    }

    const gstr2bItc =
      typeof process !== 'undefined' && process.env?.GSTR2B_ITC
        ? Number.parseFloat(String(process.env.GSTR2B_ITC))
        : undefined;
    const gstSummary = computeGstSummary(rows, sellerState, Number.isFinite(gstr2bItc) ? gstr2bItc : undefined);
    const gstMismatches = gstSummary.mismatches;
    updateJob(job, { progress: 50 });

    // TCS summary
    const tcsSummary = computeTcsSummary(rows);
    updateJob(job, { progress: 55 });

    // TDS summary
    const tdsSummary = computeTdsSummary(rows);
    updateJob(job, { progress: 60 });

    // Settlement totals and SKU profitability (flat Amazon transactions use file-level aggregates)
    const totals = amazonTransactionMetrics
      ? computeTotalsFromAmazonTransactionMetrics(amazonTransactionMetrics)
      : computeTotals(rows);
    const deferredAmount = computeDeferredAmount(rows);
    const threeWayMatch = computeThreeWayMatch(rows);
    const grossForInvariant = usesLineTotalRevenue(rows)
      ? sumLineTotalRevenue(rows)
      : rows.reduce((s, r) => {
          if (r.returnAmount > 0 && r.settlement <= 0) return s;
          if (r.settlement <= 0) return s;
          const feePart =
            r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
          return s + r.settlement + feePart;
        }, 0);
    const invariantReport = runInvariantChecks(rows, undefined, grossForInvariant);
    const skuProfitability = computeSkuProfitability(rows);
    const monthlyTrends = computeMonthlyTrends(rows);

    // GAP 1 FIX: warn when monthly trend chart uses synthetic buckets instead of real dates
    if (monthlyTrends.some(m => m.isEstimated)) {
      dataQuality = {
        ...dataQuality,
        warnings: [
          ...dataQuality.warnings,
          'Monthly trend chart is estimated — no order dates in this file. ' +
          'Revenue was distributed by CSV row order, not actual sale dates.',
        ],
      };
    }

    const confidence = computeConfidence(rows, leakageItems);
    updateJob(job, { progress: 70 });

    // Sales analytics (pass GST net liability so netProfitAfterGst is correct)
    const salesAnalytics = computeSalesAnalytics(rows, amazonTransactionMetrics, gstSummary.netGstLiability);
    const configBasedAnalytics = computeConfigBasedSellerAnalytics(
      rows,
      DEFAULT_SELLER_ANALYTICS_CONFIG,
      amazonTransactionMetrics,
    );
    updateJob(job, { progress: 75 });

    // Income tax estimate
    const incomeTaxEstimate = computeIncomeTaxEstimate(
      rows,
      tcsSummary.totalTcsClaimable,
      tdsSummary.totalTdsClaimable,
      amazonTransactionMetrics,
    );
    updateJob(job, { progress: 80 });

    if (totals.totalRevenue === 0) {
      logEvent('warn', 'anomaly_zero_revenue', { jobId: job.id, rowCount: rows.length });
    }
    if (!dataQuality.financeGradeReady) {
      logEvent('warn', 'data_quality_not_finance_grade_ready', {
        jobId: job.id,
        invalidRowCount: dataQuality.invalidRowCount,
        excludedRowCount: dataQuality.excludedRowCount,
        assumptionsUsed: dataQuality.assumptionsUsed,
      });
    }

    // Leakage breakdown by type
    const leakageByType = new Map<string, { amount: number; count: number; confidence: string; description: string }>();
    for (const item of leakageItems) {
      const existing = leakageByType.get(item.type) ?? { amount: 0, count: 0, confidence: item.confidence, description: item.description };
      leakageByType.set(item.type, {
        amount: existing.amount + item.diff,
        count: existing.count + 1,
        confidence: item.confidence,
        description: item.description,
      });
    }
    const leakageBreakdown = Array.from(leakageByType.entries()).map(([type, v]) => ({
      type,
      amount: Math.round(v.amount * 100) / 100,
      count: v.count,
      confidence: v.confidence as 'high' | 'medium' | 'low',
      description: v.description,
    }));

    const recoverableLeakage = recovery.totalRecoverable;

    // #K fix: distribute leakage to the actual month each item occurred in,
    // not evenly across all months (which produces a flat bar chart for every month).
    if (monthlyTrends.length > 0 && leakageItems.length > 0) {
      // Build a rowIndex→orderDate lookup from the full rows array
      const rowDateMap = new Map<number, string>();
      for (const row of rows) {
        if (row.orderDate) rowDateMap.set(row.rowIndex, row.orderDate);
      }

      // Bucket recoverable leakage diff by month
      const leakageByMonth = new Map<string, number>();
      for (const item of leakageItems) {
        if (!item.recoverable) continue;
        // Use the first sourceRow to determine the month
        const rowIdx = item.sourceRows[0];
        const dateStr = rowIdx !== undefined ? rowDateMap.get(rowIdx) : undefined;
        let monthKey = 'unknown';
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            // Use UTC methods — dates are stored as UTC midnight ISO strings
            monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          }
        }
        leakageByMonth.set(monthKey, (leakageByMonth.get(monthKey) ?? 0) + Math.abs(item.diff));
      }

      // Apply bucketed amounts to the trend objects; unknown → spread evenly as fallback
      // BUGFIX: trend.month is a formatted label like "Jan 2025" but leakageByMonth keys
      // are ISO strings like "2025-01". Build a reverse lookup from ISO key → trend object.
      const trendByIsoKey = new Map<string, (typeof monthlyTrends)[0]>();
      for (const trend of monthlyTrends) {
        // Reverse the formatMonthLabel transform: "Jan 2025" → "2025-01"
        const parts = trend.month.split(' ');
        if (parts.length === 2) {
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const mi = monthNames.indexOf(parts[0]);
          if (mi !== -1) {
            const isoKey = `${parts[1]}-${String(mi + 1).padStart(2, '0')}`;
            trendByIsoKey.set(isoKey, trend);
          }
        }
      }
      const unknownLeakage = leakageByMonth.get('unknown') ?? 0;
      const fallback = monthlyTrends.length > 0 ? Math.round((unknownLeakage / monthlyTrends.length) * 100) / 100 : 0;
      for (const trend of monthlyTrends) {
        trend.leakage = Math.round(fallback * 100) / 100; // seed with unknown share
      }
      for (const [isoKey, amount] of leakageByMonth) {
        if (isoKey === 'unknown') continue;
        const trend = trendByIsoKey.get(isoKey);
        if (trend) trend.leakage = Math.round((trend.leakage + amount) * 100) / 100;
      }
    }

    updateJob(job, { progress: 85 });

    // ── Dataset questions — contextual follow-ups based on parsed data ──
    const unmatchedCols = dataQuality.columnMappingLog?.unmatchedColumns ?? [];
    const datasetQuestions = generateDatasetQuestions(rows, platform, unmatchedCols);

    const report: Partial<ReconciliationReport> = {
      ...totals,
      platform,
      deferredAmount: deferredAmount > 0 ? deferredAmount : undefined,
      threeWayMatch,
      invariantReport,
      recoverableLeakage: Math.round(recoverableLeakage * 100) / 100,
      tcsCollected: Math.round(tcsSummary.totalTcsCollected * 100) / 100,
      tcsClaimable: Math.round(tcsSummary.totalTcsClaimable * 100) / 100,
      gstMismatchCount: gstMismatches.length,
      leakageBreakdown,
      rowCount: rows.length,
      gstSummary,
      tcsSummary,
      tdsSummary,
      incomeTaxEstimate,
      salesAnalytics,
      configBasedAnalytics: configBasedAnalytics ?? undefined,
      dataQuality,
      datasetQuestions,
      amazonTransactionMetrics,
    };

    updateJob(job, { progress: 90 });

    // Order-level recon
    const orderRecon = leakageItems
      .filter(item => item.orderId)
      .map(item => ({
        orderId: item.orderId!,
        product: item.sku ?? 'Unknown',
        mtrGross: Math.round(item.actual * 100) / 100,
        settlement: Math.round(item.expected * 100) / 100,
        gap: Math.round(item.diff * 100) / 100,
        reason: item.description,
      }));

    // Waterfall — order-based reports vs Amazon flat transaction settlement
    const totalReferral = rows.reduce((s, r) => s + r.referralFee, 0);
    const totalFba = rows.reduce((s, r) => s + r.fulfillmentFee, 0);
    const totalStorage = rows.reduce((s, r) => s + r.storageFee, 0);
    const totalOther = rows.reduce((s, r) => s + r.otherFees, 0);
    const totalClosing = rows.reduce((s, r) => s + (r.closingFee ?? 0), 0);
    const totalReturns = rows.reduce((s, r) => s + r.returnAmount, 0);

    // GST gap is NOT deducted separately — it is an advisory reconciliation note,
    // not a cash outflow that reduces net profit. Including it would double-count.
    const waterfall = amazonTransactionMetrics
      ? (() => {
          const m = amazonTransactionMetrics;
          const w: { label: string; value: number; isPositive: boolean }[] = [
            { label: 'Gross captures (Σ TransactionAmount, Capture)', value: m.totalCaptureTransactionAmount, isPositive: true },
          ];
          const refundBlock = m.totalRefundTransactionAmount + m.totalChargebackTransactionAmount;
          if (Math.abs(refundBlock) > 1e-6) {
            w.push({
              label: 'Refunds & chargebacks (Σ TransactionAmount)',
              value: Math.round(refundBlock * 100) / 100,
              isPositive: refundBlock >= 0,
            });
          }
          if (Math.abs(m.totalAdjustmentTransactionAmount) > 1e-6) {
            w.push({
              label: 'Adjustments (Σ TransactionAmount)',
              value: Math.round(m.totalAdjustmentTransactionAmount * 100) / 100,
              isPositive: m.totalAdjustmentTransactionAmount >= 0,
            });
          }
          if (m.totalTransactionFees > 0) {
            w.push({
              label: 'Transaction fees (Σ TotalTransactionFee)',
              value: -Math.round(m.totalTransactionFees * 100) / 100,
              isPositive: false,
            });
          }
          w.push({ label: 'Net profit (Σ NetTransactionAmount)', value: totals.netProfit, isPositive: totals.netProfit >= 0 });
          return w;
        })()
      : [
          {
            label: usesLineTotalRevenue(rows) ? 'Gross revenue (Σ total_revenue)' : 'Gross sales',
            value: totals.totalRevenue,
            isPositive: true,
          },
          ...(totalReferral > 0 ? [{ label: 'Referral/Commission', value: -Math.round(totalReferral * 100) / 100, isPositive: false }] : []),
          ...(totalFba > 0 ? [{ label: 'Fulfillment fee', value: -Math.round(totalFba * 100) / 100, isPositive: false }] : []),
          ...(totalStorage > 0 ? [{ label: 'Storage fee', value: -Math.round(totalStorage * 100) / 100, isPositive: false }] : []),
          ...(totalOther > 0 ? [{ label: 'Other fees', value: -Math.round(totalOther * 100) / 100, isPositive: false }] : []),
          ...(totalClosing > 0 ? [{ label: 'Closing fee', value: -Math.round(totalClosing * 100) / 100, isPositive: false }] : []),
          ...(totalReturns > 0 ? [{ label: 'Returns', value: -Math.round(totalReturns * 100) / 100, isPositive: false }] : []),
          // BUGFIX: include COGS so waterfall "Net profit" matches computeTotals netProfit (which subtracts COGS)
          ...(() => {
            const totalCogs = rows.reduce((s, r) => {
              if (r.isDeferred === true) return s;
              if (!isSaleRowForCogs(r)) return s;
              return s + getRowCogs(r);
            }, 0);
            return totalCogs > 0 ? [{ label: 'Cost of goods sold', value: -Math.round(totalCogs * 100) / 100, isPositive: false }] : [];
          })(),
          { label: 'Net profit', value: totals.netProfit, isPositive: totals.netProfit >= 0 },
        ];

    if (!amazonTransactionMetrics) {
      const totalCogsWaterfall = rows.reduce((s, r) => {
        if (r.isDeferred === true) return s;
        if (!isSaleRowForCogs(r)) return s;
        return s + getRowCogs(r);
      }, 0);
      const impliedNet =
        totals.totalRevenue - totalReferral - totalFba - totalStorage - totalOther
        - totalClosing - totalReturns - totalCogsWaterfall;
      if (Math.abs(impliedNet - totals.netProfit) > 1) {
        const msg =
          `Waterfall consistency: gross revenue (₹${totals.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}) ` +
          `minus referral (₹${totalReferral.toFixed(2)}), FBA (₹${totalFba.toFixed(2)}), returns (₹${totalReturns.toFixed(2)}), ` +
          `and COGS (₹${totalCogsWaterfall.toFixed(2)}) equals ₹${impliedNet.toFixed(2)}, ` +
          `but net profit from the dataset is ₹${totals.netProfit.toFixed(2)} (difference ₹${Math.abs(impliedNet - totals.netProfit).toFixed(2)}). ` +
          `Review returns, fees, or cost columns for leakage or double-counting.`;
        dataQuality = { ...dataQuality, warnings: [...dataQuality.warnings, msg] };
        logEvent('warn', 'waterfall_profit_mismatch', {
          jobId: job.id,
          impliedNet,
          netProfit: totals.netProfit,
          diff: Math.abs(impliedNet - totals.netProfit),
        });
      }
    }

    const result: ReconciliationReport = {
      filename: job.data.filename,
      platform,
      deferredAmount: report.deferredAmount,
      threeWayMatch: report.threeWayMatch,
      invariantReport: report.invariantReport,
      totalRevenue: report.totalRevenue!,
      totalExpenses: report.totalExpenses!,
      netProfit: report.netProfit!,
      recoverableLeakage: report.recoverableLeakage!,
      tcsCollected: report.tcsCollected!,
      tcsClaimable: report.tcsClaimable!,
      gstMismatchCount: gstMismatches.length,
      confidence,
      narrative: '', // populated below after full result is built
      leakageBreakdown,
      leakageItems,
      gstMismatches,
      skuProfitability,
      monthlyTrends,
      orderRecon,
      waterfall,
      gstSummary,
      tcsSummary,
      tdsSummary,
      incomeTaxEstimate,
      salesAnalytics,
      configBasedAnalytics: report.configBasedAnalytics,
      analysisSource: 'deterministic',
      recoveryActions: recovery.actions,
      totalRecoverableAmount: recovery.totalRecoverable,
      totalNonRecoverableAmount: recovery.totalNonRecoverable,
      calculationProofs: buildCalculationProofs(rows, {
        totalRevenue: report.totalRevenue!,
        totalExpenses: report.totalExpenses!,
        netProfit: report.netProfit!,
        recoverableLeakage: report.recoverableLeakage!,
        tcsClaimable: report.tcsClaimable!,
        rowCount: rows.length,
        leakageItems,
        dataQuality,
      }),
      dataQuality,
      datasetQuestions: report.datasetQuestions,
      amazonTransactionMetrics: report.amazonTransactionMetrics,
      createdAt: new Date().toISOString(),
      rowCount: rows.length,
    };

    // Generate narrative from the fully-assembled result so all fields
    // (leakageItems, skuProfitability, orderRecon, waterfall, etc.) are present.
    const narrative = await generateNarrative(result);
    result.narrative = narrative;
    updateJob(job, { progress: 95 });

    if (result.recoverableLeakage > result.totalRevenue * 0.4) {
      logEvent('warn', 'anomaly_high_recoverable_ratio', {
        jobId: job.id,
        recoverableLeakage: result.recoverableLeakage,
        totalRevenue: result.totalRevenue,
      });
    }

    updateJob(job, {
      progress: 100,
      returnvalue: result,
      state: 'completed',
      failedReason: null,
    });
    logEvent('info', 'job_processing_completed', {
      jobId: job.id,
      totalRevenue: result.totalRevenue,
      recoverableLeakage: result.recoverableLeakage,
      financeGradeReady: result.dataQuality?.financeGradeReady ?? false,
    });
  } catch (err: unknown) {
    if (err instanceof UnrecognizedFileError) {
      logEvent('info', 'unrecognized_file_attempting_ai_fallback', { jobId: job.id, filename: job.data.filename, headers: err.sampleHeaders.slice(0, 8) });
      updateJob(job, { progress: 15 });

      const userId = job.data.userId || 'anonymous';
      const usage = getAiUsage(userId);
      if (usage.count >= usage.limit) {
        updateJob(job, {
          state: 'failed',
          failedReason: `AI analysis limit reached (${usage.limit}/month). You've used all your free AI analyses this month. Upload an Amazon Settlement V2, Amazon MTR, or Flipkart Settlement report for unlimited deterministic analysis.`,
        });
        logEvent('warn', 'ai_usage_limit_exceeded', { jobId: job.id, userId, usage: usage.count, limit: usage.limit });
        return;
      }

      try {
        updateJob(job, { progress: 25 });
        const aiReport = await analyzeWithAI(job.data.data, job.data.filename);
        incrementAiUsage(userId);

        updateJob(job, {
          progress: 100,
          returnvalue: aiReport,
          state: 'completed',
          failedReason: null,
        });
        logEvent('info', 'ai_fallback_completed', { jobId: job.id, analysisSource: 'ai_assisted', revenue: aiReport.totalRevenue });
      } catch (aiErr: any) {
        updateJob(job, {
          state: 'failed',
          failedReason: aiErr.message ?? 'AI analysis failed',
        });
        logEvent('error', 'ai_fallback_failed', { jobId: job.id, error: aiErr.message ?? 'Unknown AI error' });
      }
      return;
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    updateJob(job, {
      state: 'failed',
      failedReason: errMsg ?? 'Unknown error',
    });
    logEvent('error', 'job_processing_failed', { jobId: job.id, error: errMsg ?? 'Unknown error' });
  }
}

/** Per-user job chains — prevents one slow job from blocking every other user's upload. (#F fix) */
const userJobChains = new Map<string, Promise<void>>();

function scheduleProcessJob(job: DurableJob): void {
  const uid = job.data.userId ?? 'anonymous';
  const existing = userJobChains.get(uid) ?? Promise.resolve();
  const next = existing
    .then(() => processJob(job))
    .catch(err => {
      logEvent('error', 'process_job_unhandled', { jobId: job.id, error: err instanceof Error ? err.message : String(err) });
    });
  userJobChains.set(uid, next);
  // Clean up resolved chain entries to prevent unbounded map growth
  next.finally(() => {
    if (userJobChains.get(uid) === next) userJobChains.delete(uid);
  });
}

export const reconciliationQueue = {
  async add(_name: string, data: ReconciliationJob) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: DurableJob = {
      id,
      data,
      state: 'waiting',
      progress: 0,
      returnvalue: null,
      failedReason: null,
      async getState() { return this.state; },
    };
    jobStore.set(id, job);
    persistJobs();
    scheduleProcessJob(job);
    return { id };
  },
  async getJob(id: string) {
    return jobStore.get(id) ?? null;
  },
};

export function startWorker() {
  hydrateAiUsage();
  hydrateJobs();
  cleanupOldJobs();
  // Run cleanup every 6 hours
  setInterval(cleanupOldJobs, 6 * 60 * 60 * 1000);
  logEvent('info', 'worker_started', { persistedJobs: jobStore.size, storage: JOB_STORE_FILE });
}
