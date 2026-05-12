import { useState, useEffect, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { useReport } from './hooks/useReport';
import { LandingPage } from './pages/Landing';
import { ConsentModal } from './components/auth/ConsentModal';
import { Sidebar, type AppPage } from './components/shared/Sidebar';
import { UploadPage } from './pages/Upload';
import { DashboardPage } from './pages/Dashboard';
import { ReconciliationPage } from './pages/Reconciliation';
import { AnalysePage } from './pages/Analyse';
import { TaxSummaryPage } from './pages/TaxSummary';
import { AskAIPage } from './pages/AskAI';
import { ExportPPTPage } from './pages/ExportPPT';
import { ActionsPage } from './pages/Actions';
import { AuditPage } from './pages/Audit';
import { ProfitSimulatorPage } from './pages/ProfitSimulator';
import { getConsentStored, setConsentStored } from './lib/storage';
import { ColumnMappingBanner } from './components/ColumnMappingBanner';
import { DatasetQuestionsPanel } from './components/DatasetQuestionsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';

type AppView = 'landing' | 'app';

const CONTENT_BG = '#f0ede4';
// Session-scoped keys — cleared automatically when the browser tab closes.
// This ensures the landing page is always the entry point on a fresh load.
const VIEW_STORAGE_KEY = 'guardianai_app_view';
const PAGE_STORAGE_KEY = 'guardianai_app_page';

const VALID_PAGES: readonly AppPage[] = ['dashboard', 'upload', 'actions', 'reconciliation', 'analyse', 'taxsummary', 'askai', 'export', 'audit', 'profitsim'];

function isStoredAppView(raw: string | null): boolean {
  if (raw == null) return false;
  return raw.trim().toLowerCase() === 'app';
}

function readStoredPage(): AppPage {
  try {
    const p = sessionStorage.getItem(PAGE_STORAGE_KEY)?.trim();
    if (p && (VALID_PAGES as readonly string[]).includes(p)) return p as AppPage;
  } catch { /* ignore */ }
  return 'dashboard';
}

function getInitialNav(): { view: AppView; page: AppPage } {
  // Always start on the landing page for a fresh load.
  // Within the same tab session, sessionStorage remembers where the user was.
  try {
    const raw = sessionStorage.getItem(VIEW_STORAGE_KEY);
    const view: AppView = isStoredAppView(raw) ? 'app' : 'landing';
    const page: AppPage = view === 'app' ? readStoredPage() : 'dashboard';
    return { view, page };
  } catch {
    return { view: 'landing', page: 'dashboard' };
  }
}

export default function App() {
  const { user, profile, loading: authLoading, signInWithGoogle, signOut, upgradePlan, getIdToken } = useAuth();
  const { jobStatus, report, error, showCancelPrompt, fileQueue, submitFiles, loadDemoReport, savedReports, loadSavedReport, resubmitWithColumnOverrides, cancelProcessing, refreshSavedReports } = useReport(getIdToken);
  const [view, setView] = useState<AppView>(() => getInitialNav().view);
  const [page, setPage] = useState<AppPage>(() => getInitialNav().page);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [uploadPickerSignal, setUploadPickerSignal] = useState(0);

  // Track when processing just completed to show the success banner (#2 fix: useRef not useState)
  const prevJobStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (jobStatus?.state === 'completed' && prevJobStateRef.current !== 'completed') {
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 5000);
    }
    prevJobStateRef.current = jobStatus?.state ?? null;
  }, [jobStatus?.state]);
  const [consentGiven, setConsentGiven] = useState(() => {
    try {
      return getConsentStored();
    } catch {
      return false;
    }
  });
  const [showConsent, setShowConsent] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch { /* ignore */ }
  }, [view]);

  useEffect(() => {
    if (view !== 'app') return;
    try {
      sessionStorage.setItem(PAGE_STORAGE_KEY, page);
    } catch { /* ignore */ }
  }, [view, page]);

  useEffect(() => {
    if (page !== 'upload') setUploadPickerSignal(0);
  }, [page]);

  useEffect(() => {
    if (error && !report && page === 'dashboard') {
      setPage('upload');
    }
  }, [error, report, page]);


  /** Landing CTAs: open dashboard with sample data so the dashboard view is never empty on first entry. */
  async function enterAppFromLanding() {
    try {
      const guest = await signInWithGoogle();
      try {
        sessionStorage.setItem(VIEW_STORAGE_KEY, 'app');
        sessionStorage.setItem(PAGE_STORAGE_KEY, 'dashboard');
      } catch { /* ignore */ }
      setView('app');
      setPage('dashboard');
      await loadDemoReport(guest.uid);
    } catch (err) {
      console.error('Failed to enter app from landing:', err);
      // Still navigate so user isn't stranded — let them upload their own file
      setView('app');
      setPage('upload');
    }
  }

  async function handleGetStarted() {
    await enterAppFromLanding();
  }

  async function handleTryDemo() {
    await enterAppFromLanding();
  }

  function handleSignOut() {
    signOut();
    try {
      sessionStorage.removeItem(VIEW_STORAGE_KEY);
      sessionStorage.removeItem(PAGE_STORAGE_KEY);
    } catch { /* ignore */ }
    setView('landing');
    setPage('dashboard');
  }

  if (authLoading) {
    // Auth state is not yet resolved — render nothing to avoid landing-page flash
    // for returning users and to prevent submitFile racing with a null user.
    return null;
  }

  if (view === 'landing') {
    return <LandingPage onGetStarted={handleGetStarted} onTryDemo={handleTryDemo} />;
  }

  function handleFileSelect(files: File[]) {
    if (!consentGiven) {
      setPendingFiles(files);
      setShowConsent(true);
    } else {
      submitFiles(files, user?.uid ?? 'anonymous');
      setPage('dashboard');
    }
  }

  function handleConsentAccept() {
    setConsentGiven(true);
    try {
      setConsentStored(true);
    } catch { /* ignore */ }
    setShowConsent(false);
    if (pendingFiles.length > 0) {
      submitFiles(pendingFiles, user?.uid ?? 'anonymous');
      setPendingFiles([]);
      setPage('dashboard');
    }
  }

  async function handleLoadDemo() {
    setPage('dashboard');
    await loadDemoReport(user?.uid ?? 'anonymous');
  }

  const issueCount = report
    ? (report.gstMismatchCount > 0 ? 1 : 0) +
      (report.recoverableLeakage > 0 ? 1 : 0) +
      (report.tcsClaimable > 0 ? 1 : 0) +
      ((report.tdsSummary?.totalTdsDeducted ?? 0) > 0 ? 1 : 0)
    : 0;

  const PAGE_TITLES: Record<AppPage, string> = {
    dashboard: 'Dashboard',
    upload: 'Upload files',
    actions: 'Recovery actions',
    reconciliation: 'Reconciliation',
    analyse: 'Analysis',
    taxsummary: 'Tax Summary',
    askai: 'Ask AI',
    export: 'Export',
    audit: 'Audit',
    profitsim: 'Profit simulator',
  };

  const title = PAGE_TITLES[page];

  const badge = (() => {
    if (page === 'dashboard' && issueCount > 0) return `${issueCount} issues need attention`;
    if (page === 'reconciliation' && report) return `₹${report.recoverableLeakage?.toLocaleString('en-IN')} leakage found`;
    if (page === 'taxsummary' && report) return 'GST + TCS + TDS + IT';
    if (page === 'askai' && report) return `${report.rowCount} rows loaded`;
    if (page === 'export' && report) return 'Report ready';
    if (page === 'analyse' && report) return `${report.platform} · ${report.rowCount} orders`;
    if (page === 'actions' && report?.recoveryActions?.length) return `${report.recoveryActions.length} action${report.recoveryActions.length === 1 ? '' : 's'}`;
    if (page === 'audit' && report?.threeWayMatch) return `${report.threeWayMatch.matchRate}% match`;
    if (page === 'profitsim') return 'Pricing tool';
    return null;
  })();

  const badgeColor = (() => {
    if (page === 'dashboard') return { bg: '#fef3c7', color: '#92400e' };
    if (page === 'reconciliation') return { bg: '#fee2e2', color: '#991b1b' };
    if (page === 'taxsummary') return { bg: '#dbeafe', color: '#1e40af' };
    if (page === 'askai') return { bg: '#f0fdf4', color: '#166534' };
    if (page === 'export') return { bg: '#f0fdf4', color: '#166534' };
    if (page === 'analyse') return { bg: '#dbeafe', color: '#1e40af' };
    if (page === 'actions') return { bg: '#dcfce7', color: '#166534' };
    if (page === 'audit') return { bg: '#fef3c7', color: '#92400e' };
    if (page === 'profitsim') return { bg: '#ecfdf5', color: '#166534' };
    return { bg: '#f3f4f6', color: '#374151' };
  })();

  // Column mapping banner: only show when there are actual issues (not on pure auto-map success)
  const mappingLog = report?.dataQuality?.columnMappingLog;
  const showMappingBanner = !!(mappingLog && (
    mappingLog.unmatchedColumns.length > 0 ||
    mappingLog.suggestedMappings.length > 0
  ));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: CONTENT_BG, overflowX: 'hidden' }}>
      {showConsent && (
        <ConsentModal
          onAccept={handleConsentAccept}
          onCancel={() => { setShowConsent(false); setPendingFiles([]); }}
        />
      )}

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.35)' }}
        />
      )}

      <div className={`sidebar-wrapper${sidebarOpen ? ' sidebar-open' : ''}`}>
        <Sidebar
          currentPage={page}
          onNavigate={(p) => { setPage(p); setSidebarOpen(false); }}
          onSignOut={handleSignOut}
          profile={profile}
          hasReport={!!report}
          issueCount={issueCount}
          recoveryActionCount={report?.recoveryActions?.length ?? 0}
          onUpgradePlan={upgradePlan}
          getIdToken={getIdToken}
        />
      </div>

      <div className="main-content">
        {/* Top bar */}
        <div style={{
          height: 52, background: CONTENT_BG, borderBottom: '1px solid #e0ddd4',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0,
        }}>
          {/* Hamburger — mobile only */}
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Open menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'none' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a14" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a14' }}>{title}</span>
          {badge && (
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: badgeColor.bg, color: badgeColor.color }}>{badge}</span>
          )}
          <div style={{ flex: 1 }} />
          {report && (
            <span style={{ fontSize: 12, color: '#6b6b5e', background: '#e8e5dc', padding: '4px 10px', borderRadius: 8, fontWeight: 500 }}>
              {report.platform === 'flipkart' ? 'Flipkart' : 'Amazon'}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (page === 'upload') {
                setUploadPickerSignal((n) => n + 1);
              } else {
                setPage('upload');
              }
            }}
            style={{ fontSize: 12, color: '#4a4a3e', background: 'none', border: '1px solid #d0cdc4', padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontWeight: 500 }}
          >
            + Upload
          </button>
          <button
            onClick={() => report && setPage('export')}
            disabled={!report}
            style={{ fontSize: 12, color: report ? '#fff' : '#999', background: report ? '#1a1a14' : '#ccc', border: 'none', padding: '6px 14px', borderRadius: 7, cursor: report ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: report ? 1 : 0.5 }}
          >
            Export PPT
          </button>
        </div>

        {/* Cancel processing prompt after 2 minutes */}
        {showCancelPrompt && (
          <div style={{ background: '#fffbeb', borderBottom: '1px solid #fcd34d', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#92400e' }}>
            <span>Processing is taking longer than expected — large files can take up to 5 minutes.</span>
            <button onClick={cancelProcessing} style={{ background: '#92400e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Cancel</button>
          </div>
        )}

        {/* Page content */}
        <div style={{ flex: 1, padding: '24px 20px', overflowY: 'auto' }}>
          {/* Column mapping banner — only shown when there are unmatched or ambiguous columns */}
          {showMappingBanner && mappingLog && (
            <ColumnMappingBanner
              mappingLog={mappingLog}
              onResubmit={resubmitWithColumnOverrides}
            />
          )}

          <ErrorBoundary>
            {page === 'upload' && (
              <UploadPage
                onFileSelect={handleFileSelect}
                onLoadDemo={handleLoadDemo}
                jobStatus={jobStatus}
                error={error}
                savedReports={savedReports}
                onLoadSavedReport={(r) => { loadSavedReport(r); setPage('dashboard'); }}
                onReportsChanged={refreshSavedReports}
                fileQueue={fileQueue}
                headerUploadSignal={uploadPickerSignal}
                userId={user?.uid}
              />
            )}
            {page === 'dashboard' && (
              <>
                <DashboardPage
                  report={report}
                  jobStatus={jobStatus}
                  onUploadNew={() => setPage('upload')}
                  onViewRecon={() => setPage('reconciliation')}
                  onViewAnalyse={() => setPage('analyse')}
                  onViewRecovery={() => setPage('actions')}
                  onViewAudit={() => setPage('audit')}
                  justCompleted={justCompleted}
                />
                {report?.datasetQuestions && report.datasetQuestions.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <DatasetQuestionsPanel questions={report.datasetQuestions} />
                  </div>
                )}
              </>
            )}
            {page === 'actions' && <ActionsPage report={report} />}
            {page === 'reconciliation' && <ReconciliationPage report={report} />}
            {page === 'analyse' && <AnalysePage report={report} />}
            {page === 'taxsummary' && <TaxSummaryPage report={report} />}
            {page === 'audit' && <AuditPage report={report} />}
            {page === 'profitsim' && <ProfitSimulatorPage />}
            {page === 'askai' && <AskAIPage report={report} getIdToken={getIdToken} />}
            {page === 'export' && <ExportPPTPage report={report} profile={profile} getIdToken={getIdToken} onUpgraded={upgradePlan} />}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
