import { useState, useEffect, type CSSProperties } from 'react';
import { ReconciliationReport, CalculationProof } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface JobStatus { jobId: string; state: string; progress: number; }

interface Props {
  report: ReconciliationReport | null;
  jobStatus: JobStatus | null;
  onUploadNew: () => void;
  onViewRecon: () => void;
  onViewAnalyse: () => void;
  onViewRecovery: () => void;
  onViewAudit?: () => void;
  justCompleted?: boolean;
}

const C = {
  card: { background: '#ffffff', borderRadius: 10, padding: '16px 18px', border: '1px solid #e8e5dc' } as CSSProperties,
};

function ProofHint({ proofKey, proofs }: { proofKey: string; proofs?: Record<string, CalculationProof> }) {
  const [open, setOpen] = useState(false);
  const p = proofs?.[proofKey];
  if (!p) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: 10, color: '#2d5a27', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}
      >
        {open ? 'Hide calculation' : 'Show calculation'}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: 10, background: '#fafaf5', borderRadius: 8, fontSize: 11, color: '#4a4a3e', lineHeight: 1.55 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.formula}</div>
          <div>{p.explanation}</div>
          <div style={{ marginTop: 6, color: '#9a9a8e' }}>
            Rows: {p.sourceRowCount} · Confidence: {p.confidence}
            {p.classification ? ` · ${p.classification.replace(/_/g, ' ')}` : ''}
            {p.source ? ` · ${p.source}` : ''}
          </div>
          {p.assumptions && p.assumptions.length > 0 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #ece8dd', color: '#7a7a6e' }}>
              Assumptions: {p.assumptions.join(' | ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const emptyCard: CSSProperties = {
  background: '#f9f8f5',
  border: '1px dashed #d0cdc4',
  borderRadius: 10,
  padding: '16px 18px',
  fontSize: 12,
  color: '#9a9a8e',
  textAlign: 'center',
};

export function DashboardPage({ report, jobStatus, onUploadNew, onViewRecon, onViewAnalyse, onViewRecovery, onViewAudit, justCompleted }: Props) {
  const [showHero, setShowHero] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (justCompleted) {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 4000);
      return () => clearTimeout(t);
    }
  }, [justCompleted]);

  useEffect(() => {
    if (!report) {
      setShowHero(false);
      return;
    }
    if (report.totalRecoverableAmount === undefined || report.totalRecoverableAmount === 0) {
      setShowHero(false);
      return;
    }
    const key = 'hero_seen_' + report.filename + report.createdAt;
    if (localStorage.getItem(key)) {
      setShowHero(false);
      return;
    }
    setShowHero(true);
  }, [report]);

  const dismissHero = (alsoViewRecovery: boolean) => {
    if (!report) return;
    localStorage.setItem('hero_seen_' + report.filename + report.createdAt, '1');
    setShowHero(false);
    if (alsoViewRecovery) onViewRecovery();
  };

  if (!report) {
    const isProcessing = jobStatus && (jobStatus.state === 'waiting' || jobStatus.state === 'active');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400 }}>
        {isProcessing ? (
          <>
            <div style={{ fontSize: 14, color: '#4a4a3e', marginBottom: 10 }}>
              {jobStatus.state === 'waiting' ? 'Queued...' : 'Analysing your file...'}
            </div>
            <div style={{ width: 200, height: 4, background: '#e8e5dc', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${jobStatus.progress || 5}%`, height: '100%', background: '#2d5a27', transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#9a9a8e', marginTop: 6 }}>{jobStatus.progress || 0}%</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: '#9a9a8e', marginBottom: 12 }}>No report yet</div>
            <button onClick={onUploadNew} style={{ background: '#2d5a27', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              Upload a file
            </button>
          </>
        )}
      </div>
    );
  }

  const hasZeroRevenue = report.totalRevenue === 0;
  const revenueL = hasZeroRevenue ? '0' : (report.totalRevenue / 100000).toFixed(2).replace(/\.?0+$/, '');
  const barData = report.monthlyTrends ?? [];
  const gstMismatches = report.gstMismatches ?? [];
  const leakageBreakdown = report.leakageBreakdown ?? [];

  // Issues derived from report
  const issues: { label: string; badge: string | null; badgeColor?: string; badgeText?: string; amount: string | null; amountColor?: string }[] = [];
  const gst12count = gstMismatches.filter(m => m.gstRate === 12).length;
  if (gst12count > 0) {
    issues.push({ label: `12% GST on ${gst12count} row(s) — verify against HSN`, badge: 'verify', badgeColor: '#fef3c7', badgeText: '#92400e', amount: null });
  }
  if (report.tcsClaimable > 0) {
    issues.push({ label: 'TCS not yet claimed', badge: null, amount: `₹${report.tcsClaimable.toLocaleString('en-IN')}`, amountColor: '#374151' });
  }
  const fbaLeak = leakageBreakdown.find(b => b.type === 'weight_slab_error');
  if (fbaLeak) {
    issues.push({ label: 'FBA fee overcharge', badge: null, amount: `₹${fbaLeak.amount.toLocaleString('en-IN')}`, amountColor: '#991b1b' });
  }
  if ((report.tdsSummary?.totalTdsDeducted ?? 0) > 0) {
    issues.push({ label: 'TDS to verify in 26AS', badge: null, amount: `₹${report.tdsSummary!.totalTdsDeducted.toLocaleString('en-IN')}`, amountColor: '#1e40af' });
  }
  const posErrors = gstMismatches.filter(m => m.reason === 'pos_error').length;
  if (posErrors > 0) {
    issues.push({ label: 'Place of supply mismatch', badge: null, amount: `${posErrors} orders`, amountColor: '#d97706' });
  }

  const isAiAssisted = report.analysisSource === 'ai_assisted';

  const reimbExpiringSoon = (report.leakageItems ?? []).filter(
    li => li.type === 'missing_reimbursement' && li.isExpiringSoon === true && li.claimDeadlineDays !== undefined,
  );
  const lowestReimbClaimDays =
    reimbExpiringSoon.length > 0 ? Math.min(...reimbExpiringSoon.map(li => li.claimDeadlineDays!)) : null;

  const netProfitAfterGst = report.salesAnalytics?.netProfitAfterGst;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {showSuccess && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#166534' }}>
          ✓ Analysis complete — {report.rowCount} orders processed{report.salesAnalytics ? ` in ${report.salesAnalytics.totalOrders} transactions` : ''}.
        </div>
      )}
      {showHero && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              padding: '28px 32px',
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: 18, color: '#6b6b5e', fontWeight: 400 }}>
              {report.platform === 'flipkart' ? 'Flipkart owes you' : 'Amazon owes you'}
            </div>
            <div style={{ fontSize: 64, color: '#1a1a14', fontWeight: 700, lineHeight: 1, marginTop: 8 }}>
              ₹{report.totalRecoverableAmount.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 13, color: '#9a9a8e', marginTop: 8 }}>
              Based on {report.rowCount} orders · {report.confidence} confidence
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => dismissHero(false)}
                style={{
                  flex: 1,
                  minWidth: 140,
                  background: '#1a1a14',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                See full breakdown
              </button>
              <button
                type="button"
                onClick={() => dismissHero(true)}
                style={{
                  flex: 1,
                  minWidth: 140,
                  background: '#ffffff',
                  color: '#1a1a14',
                  border: '1px solid #1a1a14',
                  borderRadius: 8,
                  padding: '12px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Start claiming →
              </button>
            </div>
          </div>
        </div>
      )}

      {isAiAssisted && (
        <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M12 2a4 4 0 014 4v1a1 1 0 001 1h1a4 4 0 010 8h-1a1 1 0 00-1 1v1a4 4 0 01-8 0v-1a1 1 0 00-1-1H6a4 4 0 010-8h1a1 1 0 001-1V6a4 4 0 014-4z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>AI-Assisted Analysis</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: '#dbeafe', color: '#1d4ed8' }}>Approximate</span>
          </div>
          <p style={{ fontSize: 12.5, color: '#1e3a5f', margin: '0 0 8px', lineHeight: 1.6 }}>
            This report was analyzed by AI because the file format was not automatically recognized.
            Results are approximate and should be independently verified before taking financial action.
          </p>
          <p style={{ fontSize: 11, color: '#3b82f6', margin: 0 }}>
            For deterministic, finance-grade analysis, upload an Amazon Settlement V2, Amazon MTR, or Flipkart Settlement report.
          </p>
        </div>
      )}

      {hasZeroRevenue && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>Revenue showing ₹0 — column mapping issue</span>
          </div>
          <p style={{ fontSize: 12.5, color: '#78350f', margin: '0 0 10px', lineHeight: 1.6 }}>
            The parser could not find a recognised revenue column in your uploaded file.
          </p>
          <div style={{ fontSize: 11.5, color: '#78350f', lineHeight: 1.6, background: '#fef3c7', borderRadius: 6, padding: '10px 12px' }}>
            <strong>How to fix this:</strong>
            <ul style={{ margin: '6px 0 0 0', paddingLeft: 16 }}>
              <li>Use the standard <strong>Amazon Settlement Report V2</strong> (download from Payments &gt; Reports in Seller Central).</li>
              <li>Or use the <strong>Flipkart Settlement Report</strong> (download from Flipkart Seller Hub &gt; Payments).</li>
              <li>The file should have columns like "amount", "net amount", "settlement amount", or "principal".</li>
              <li>Custom or modified CSV formats may not be supported yet.</li>
            </ul>
            <div style={{ marginTop: 8 }}>
              <button onClick={onUploadNew} style={{ fontSize: 11, fontWeight: 600, background: '#92400e', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                Try a different file
              </button>
            </div>
          </div>
        </div>
      )}

      {report.dataQuality && !report.dataQuality.financeGradeReady && (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>Finance-grade review recommended</div>
          <div style={{ fontSize: 12.5, color: '#7c2d12', lineHeight: 1.6 }}>
            {report.dataQuality.invalidRowCount > 0 && <span>{report.dataQuality.invalidRowCount} row(s) had invalid numeric fields. </span>}
            {report.dataQuality.excludedRowCount > 0 && <span>{report.dataQuality.excludedRowCount} row(s) were excluded. </span>}
            {(report.dataQuality.assumptionsUsed ?? []).length > 0 && <span>{(report.dataQuality.assumptionsUsed ?? []).length} parser/calculation assumption(s) were used. </span>}
            Share this report with your CA before filing or disputing high-value tax items.
          </div>
        </div>
      )}

      {report.configBasedAnalytics && (
        <div style={{ ...C.card, borderColor: '#c7d2fe', background: '#f8fafc' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a' }}>CONFIG-first analytics</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: '#e0e7ff', color: '#3730a3' }}>
              {report.configBasedAnalytics.marketplace_rules}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>
              {report.configBasedAnalytics.reportQuality}
            </span>
            <span style={{ fontSize: 10, color: '#64748b' }}>Tax regime: {report.configBasedAnalytics.tax_regime}</span>
          </div>
          <p style={{ fontSize: 11.5, color: '#475569', margin: '0 0 12px', lineHeight: 1.55 }}>
            Net payout (pre–COGS) and net profit are shown separately. Profit is not labelled exact unless cost is derived for all material rows.
            Advisory GST/TCS/TDS from CONFIG rates — compare to GST summary from your file.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, fontSize: 12, color: '#1e293b' }}>
            <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Revenue (engine)</div>
              <div style={{ fontWeight: 700 }}>₹{report.configBasedAnalytics.totals.revenue.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Total fees</div>
              <div style={{ fontWeight: 700 }}>₹{report.configBasedAnalytics.totals.totalFees.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Refunds</div>
              <div style={{ fontWeight: 700 }}>₹{report.configBasedAnalytics.totals.refundAmount.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Net payout</div>
              <div style={{ fontWeight: 700 }}>₹{report.configBasedAnalytics.totals.netPayout.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Total cost (CONFIG)</div>
              <div style={{ fontWeight: 700 }}>
                {report.configBasedAnalytics.totals.totalCost === null ? '— missing' : `₹${report.configBasedAnalytics.totals.totalCost.toLocaleString('en-IN')}`}
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Net profit</div>
              <div style={{ fontWeight: 700 }}>
                {report.configBasedAnalytics.totals.netProfit === null
                  ? '— incomplete'
                  : `₹${report.configBasedAnalytics.totals.netProfit.toLocaleString('en-IN')}`}
              </div>
            </div>
          </div>
          {report.configBasedAnalytics.dataGaps.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: '#9a3412', background: '#fff7ed', borderRadius: 8, padding: '10px 12px', border: '1px solid #fed7aa' }}>
              <strong>Data gaps:</strong> {report.configBasedAnalytics.dataGaps.join(' · ')}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8' }}>
            Fee and GST assumptions follow your project defaults — edit <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>sellerAnalytics.config.ts</code> and re-upload to refresh.
          </div>
        </div>
      )}

      {/* Hero — money recovery */}
      <div style={{
        background: 'linear-gradient(135deg, #1a3d16 0%, #2d5a27 100%)',
        borderRadius: 12, padding: '22px 24px', color: '#fff',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', opacity: 0.85, marginBottom: 8 }}>RECOVERABLE FROM THIS FILE</div>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15 }}>
              {(report.platform === 'flipkart' ? 'Flipkart' : 'Amazon')} — ₹{(report.totalRecoverableAmount ?? report.recoverableLeakage).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 8, maxWidth: 420 }}>
              Based on {report.rowCount} rows from your upload. {isAiAssisted ? 'Numbers are AI-estimated from a sample — verify independently.' : 'Numbers are computed in code, not AI.'}
              {(report.totalNonRecoverableAmount ?? 0) > 0 && (
                <span> · ₹{report.totalNonRecoverableAmount!.toLocaleString('en-IN')} flagged for manual review (lower confidence).</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onViewRecovery}
              style={{
                background: '#fff', color: '#1a3d16', border: 'none', borderRadius: 8, padding: '10px 20px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Start recovery →
            </button>
            <button
              type="button"
              onClick={onViewRecon}
              style={{
                background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 8, padding: '10px 16px',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              Full recon
            </button>
          </div>
        </div>
        {lowestReimbClaimDays !== null && (
          <div
            style={{
              background: '#7f1d1d',
              color: '#fff',
              width: '100%',
              padding: '10px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              boxSizing: 'border-box',
            }}
          >
            ⚠ Reimbursement claim expires in {lowestReimbClaimDays} days
          </div>
        )}
      </div>

      <CaReliabilityNote isAiAssisted={isAiAssisted} />

      {report.dataQuality && (
        <div style={{ ...C.card, padding: '14px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 10 }}>Data quality and assumptions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <MiniStat label="Invalid rows" value={String(report.dataQuality.invalidRowCount)} tone={report.dataQuality.invalidRowCount > 0 ? '#991b1b' : '#166534'} />
            <MiniStat label="Excluded rows" value={String(report.dataQuality.excludedRowCount)} tone={report.dataQuality.excludedRowCount > 0 ? '#991b1b' : '#166534'} />
            <MiniStat label="Assumptions used" value={String(report.dataQuality.assumptionsUsed.length)} tone={report.dataQuality.assumptionsUsed.length > 0 ? '#92400e' : '#166534'} />
            <MiniStat label="Finance-grade ready" value={isAiAssisted ? 'AI estimate' : report.dataQuality.financeGradeReady ? 'Yes' : 'Needs review'} tone={isAiAssisted ? '#1e40af' : report.dataQuality.financeGradeReady ? '#166534' : '#92400e'} />
          </div>
          {report.dataQuality.assumptionsUsed.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: '#5a5a4e', lineHeight: 1.6 }}>
              {report.dataQuality.assumptionsUsed.map((assumption, idx) => (
                <div key={idx}>• {assumption}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {(report.gstSummary?.itcFromAmazonFees != null && report.gstSummary.itcFromAmazonFees > 0) ||
      report.threeWayMatch != null ||
      (report.deferredAmount != null && report.deferredAmount > 0) ||
      report.invariantReport != null ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          {report.gstSummary && (report.gstSummary.itcFromAmazonFees ?? 0) > 0 && (
            <div style={{ ...C.card, borderColor: '#bbf7d0', background: '#f0fdf4' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#166534', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>ITC (fees × 18%)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#14532d' }}>₹{report.gstSummary.itcFromAmazonFees.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 10, color: '#15803d', marginTop: 6 }}>Claim in GSTR-3B Table 4(A)(5) — verify vs GSTR-2B</div>
              {report.gstSummary.itcIsEstimated && (
                <span style={{ color: '#e07b00', fontSize: 11, fontWeight: 600, marginTop: 4, display: 'block' }}>
                  ⚠ Estimated — verify against GSTR-2B before filing
                </span>
              )}
            </div>
          )}
          {report.threeWayMatch && (
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>3-way match rate</div>
              <div style={{
                fontSize: 22,
                fontWeight: 700,
                color: report.threeWayMatch.matchRate >= 95 ? '#166534' : report.threeWayMatch.matchRate >= 80 ? '#ca8a04' : '#991b1b',
              }}
              >
                {report.threeWayMatch.matchRate}%
              </div>
              <div style={{ fontSize: 10, color: '#6b6b5e', marginTop: 6 }}>{report.threeWayMatch.totalMismatched} mismatched / missing orders</div>
            </div>
          )}
          {(report.deferredAmount ?? 0) > 0 && (
            <div style={{ ...C.card, borderColor: '#fcd34d', background: '#fffbeb' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#92400e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>Deferred / reserve</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#78350f' }}>₹{report.deferredAmount!.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 10, color: '#92400e', marginTop: 6 }}>Not yet credited to your bank account.</div>
            </div>
          )}
          {report.invariantReport && (
            <div style={C.card}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>Invariant status</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: report.invariantReport.allPassed ? '#166534' : '#991b1b' }}>
                {report.invariantReport.allPassed ? '✓ All checks passed' : `⚠ ${report.invariantReport.criticalFailures} critical`}
              </div>
              {onViewAudit && (
                <button type="button" onClick={onViewAudit} style={{ marginTop: 10, fontSize: 11, fontWeight: 600, background: '#1a1a14', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
                  Open Audit
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Metric cards — responsive */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
        <div style={C.card}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>Revenue</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a14', lineHeight: 1 }}>₹{revenueL}L</div>
          <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 6 }}>
            {barData.length >= 2
              ? (() => {
                  const prev = barData[barData.length - 2].revenue;
                  const curr = barData[barData.length - 1].revenue;
                  const pct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;
                  return pct >= 0 ? `↑${pct}% MoM` : `↓${Math.abs(pct)}% MoM`;
                })()
              : `${report.rowCount} orders`
            }
          </div>
          <ProofHint proofKey="revenue" proofs={report.calculationProofs} />
        </div>
        <div style={C.card}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>Recoverable</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#c0392b', lineHeight: 1 }}>₹{report.recoverableLeakage.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 6 }}>{report.leakageBreakdown.length} issue type(s)</div>
          <ProofHint proofKey="recoverableLeakage" proofs={report.calculationProofs} />
        </div>
        <div style={C.card}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>TCS Claimable</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a14', lineHeight: 1 }}>₹{report.tcsClaimable.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 6 }}>GSTR-3B Table 3(d)</div>
          <ProofHint proofKey="tcsClaimable" proofs={report.calculationProofs} />
        </div>
        <div style={C.card}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>Net Payout (after fees)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2d5a27', lineHeight: 1 }}>
            ₹{report.netProfit.toLocaleString('en-IN')}
          </div>
          {netProfitAfterGst !== undefined && (
            <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 4 }}>
              After GST: <span style={{ fontWeight: 600, color: netProfitAfterGst >= 0 ? '#166534' : '#991b1b' }}>₹{netProfitAfterGst.toLocaleString('en-IN')}</span>
            </div>
          )}
          <div style={{ fontSize: 11, color: '#e07b00', marginTop: 4 }}>Excl. COGS — upload purchase invoices for true profit</div>
          <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 2 }}>{report.rowCount} rows • {report.platform}</div>
          <ProofHint proofKey="netMargin" proofs={report.calculationProofs} />
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {/* Monthly revenue chart (Recharts) */}
        <div style={{ ...C.card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14' }}>Monthly revenue</span>
            <button onClick={onViewAnalyse} style={{ fontSize: 11, color: '#2d5a27', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              Full analysis →
            </button>
          </div>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede4" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9a9a8e' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9a9a8e' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#2d5a27" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9a8e', fontSize: 12 }}>No trend data</div>
          )}
        </div>

        {/* Issues to act on */}
        <div style={{ ...C.card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14' }}>Money to recover</span>
            <button onClick={onViewRecon} style={{ fontSize: 11, color: '#2d5a27', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              View recon →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {issues.length === 0 && <div style={{ fontSize: 12, color: '#9a9a8e', padding: '12px 0' }}>No issues detected.</div>}
            {issues.map((issue, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < issues.length - 1 ? '1px solid #f0ede4' : 'none' }}>
                <span style={{ fontSize: 12, color: '#3a3a2e' }}>{issue.label}</span>
                {issue.badge ? (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6, background: issue.badgeColor, color: issue.badgeText }}>{issue.badge}</span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600, color: issue.amountColor }}>{issue.amount}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Observation */}
      <div style={{ ...C.card, padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14' }}>AI observation</span>
          <span style={{ fontSize: 10, color: isAiAssisted ? '#2563eb' : '#2d5a27', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isAiAssisted ? '#2563eb' : '#2d5a27', display: 'inline-block' }} />
            {isAiAssisted ? 'Gemini + Claude' : 'Claude Sonnet'}
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#3a3a2e', lineHeight: 1.65, margin: 0 }}>{report.narrative}</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={onViewRecon} style={{ fontSize: 11.5, color: '#4a4a3e', background: '#f0ede4', border: '1px solid #d8d5cc', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
            View full recon →
          </button>
        </div>
      </div>

      {/* GST summary availability notice for non-settlement files */}
      {!report.gstSummary && (
        <div style={emptyCard}>
          GST summary not available — upload an Amazon/Flipkart settlement file for full tax analysis.
        </div>
      )}

      {/* Recovery actions availability notice */}
      {!report.recoveryActions?.length && report.totalRevenue > 0 && (
        <div style={emptyCard}>
          No automated recovery actions found. Check the Reconciliation tab for GST/TCS details.
        </div>
      )}

      <CaReliabilityNote isAiAssisted={isAiAssisted} />
    </div>
  );
}

function CaReliabilityNote({ isAiAssisted }: { isAiAssisted: boolean }) {
  const [open, setOpen] = useState(false);

  const checks = [
    { label: 'FBA weight slab errors', method: "Compares charged weight to declared weight using published FBA fee slabs", reliable: true },
    { label: 'Duplicate referral fees', method: 'Detects same order-id + same fee amount appearing more than once', reliable: true },
    { label: 'Missing return credits', method: 'Flags return amounts with no matching settlement credit', reliable: true },
    { label: 'TCS (1% deduction)', method: '1% of GMV excl. GST — Section 52 CGST. Verify with Form 26AS', reliable: true },
    { label: 'TDS (Section 194-O)', method: '0.1% of gross credited (5% if PAN not furnished — Section 206AA) — verify against Form 26AS/AIS', reliable: true },
    { label: 'GST rate validation', method: 'Validates rates in [0, 5, 12, 18, 28]%. 12% still valid for many HSNs — verify', reliable: true },
    { label: 'Income tax estimate', method: 'FY 2025-26 new regime slabs with Section 44AD option. Indicative only', reliable: false },
    { label: 'Place of supply', method: 'Validates state codes. IGST vs CGST/SGST split uses seller state assumption', reliable: false },
    { label: 'COGS / purchase cost', method: 'Not computed — purchase invoices not uploaded', reliable: false },
  ];

  return (
    <div style={{ background: '#fff', border: '1px solid #e8e5dc', borderRadius: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', background: 'none', border: 'none', padding: '12px 18px', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1a1a14' }}>How reliable are these numbers?</span>
          <span style={{ fontSize: 11, color: '#6b6b5e', background: '#f0ede4', padding: '2px 8px', borderRadius: 6 }}>vs CA-level accuracy</span>
        </div>
        <span style={{ fontSize: 13, color: '#9a9a8e', display: 'inline-block', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid #f0ede4', padding: '14px 18px' }}>
          <p style={{ fontSize: 12, color: '#4a4a3e', lineHeight: 1.65, margin: '0 0 14px' }}>
            {isAiAssisted ? (
              <>This report used <strong>AI-assisted interpretation</strong> of a sample of your file because the format was not recognised. Numbers are indicative only — verify against your source data and books before acting.</>
            ) : (
              <>All figures are computed <strong>deterministically from your CSV</strong> — no AI is used for calculations. AI (Claude) only explains the numbers in plain English.</>
            )}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr>
                {['Check', 'How we calculate', 'Reliability'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0 0 8px', color: '#9a9a8e', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checks.map(c => (
                <tr key={c.label} style={{ borderTop: '1px solid #f5f2ea' }}>
                  <td style={{ padding: '8px 0', fontWeight: 500, color: '#2a2a1e', width: '25%' }}>{c.label}</td>
                  <td style={{ padding: '8px 12px 8px 0', color: '#5a5a4e', width: '55%', lineHeight: 1.5 }}>{c.method}</td>
                  <td style={{ padding: '8px 0' }}>
                    {c.reliable
                      ? <span style={{ color: '#166534', background: '#dcfce7', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>High</span>
                      : <span style={{ color: '#92400e', background: '#fef3c7', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>Partial</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fafaf5', borderRadius: 8, fontSize: 11.5, color: '#5a5a4e', lineHeight: 1.6 }}>
            <strong>What a CA does that this tool doesn't:</strong> reconciles purchase invoices against GSTR-1/3B, verifies ITC eligibility, validates HSN summary, audits books under the Companies Act. This tool is a <em>pre-audit diagnostic</em>.
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ background: '#fafaf5', border: '1px solid #eee7da', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: '#8a8a7d', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone }}>{value}</div>
    </div>
  );
}
