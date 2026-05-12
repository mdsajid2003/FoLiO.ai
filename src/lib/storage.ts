import { ReconciliationReport } from '../types';

const REPORTS_META_KEY = 'guardianai_reports_meta';
const REPORT_FULL_PREFIX = 'guardianai_report_';
const CONSENT_KEY = 'guardianai_consent_v1';
const MAX_REPORTS = 10;

interface ReportMeta {
  reportId: string;
  filename: string;
  createdAt: string;
  platform: string;
  rowCount: number;
  totalRecoverableAmount: number;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getConsentStored(): boolean {
  return localStorage.getItem(CONSENT_KEY) === '1';
}

export function setConsentStored(value: boolean): void {
  localStorage.setItem(CONSENT_KEY, value ? '1' : '0');
}

export function loadReportHistory(): ReconciliationReport[] {
  // Try new metadata-only format first
  const metaList = safeParse<ReportMeta[]>(localStorage.getItem(REPORTS_META_KEY));
  if (Array.isArray(metaList) && metaList.length > 0) {
    return metaList.map(meta => {
      // Try sessionStorage for full report (current session)
      const fullRaw = sessionStorage.getItem(REPORT_FULL_PREFIX + meta.reportId);
      if (fullRaw) {
        const full = safeParse<ReconciliationReport>(fullRaw);
        if (full) return full;
      }
      // Return a stub so saved reports are still visible in the list
      return {
        reportId: meta.reportId,
        filename: meta.filename,
        createdAt: meta.createdAt,
        platform: meta.platform as ReconciliationReport['platform'],
        rowCount: meta.rowCount,
        totalRecoverableAmount: meta.totalRecoverableAmount,
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        recoverableLeakage: meta.totalRecoverableAmount,
        tcsCollected: 0,
        tcsClaimable: 0,
        gstMismatchCount: 0,
        confidence: 'low' as const,
        narrative: '',
        leakageBreakdown: [],
        leakageItems: [],
        gstMismatches: [],
        skuProfitability: [],
        monthlyTrends: [],
        orderRecon: [],
        waterfall: [],
      };
    });
  }
  // Legacy: full reports stored in localStorage (migrate on first read)
  const legacy = safeParse<ReconciliationReport[]>(localStorage.getItem('guardianai_reports'));
  if (Array.isArray(legacy)) return legacy;
  return [];
}

export function saveReportToHistory(report: ReconciliationReport): void {
  const id = report.reportId ?? `r_${report.createdAt}_${report.filename}`;
  const withId: ReconciliationReport = { ...report, reportId: id };

  // Store full report in sessionStorage (current session, larger quota)
  try {
    sessionStorage.setItem(REPORT_FULL_PREFIX + id, JSON.stringify(withId));
  } catch { /* ignore — sessionStorage may be full */ }

  // Store only metadata in localStorage
  const meta: ReportMeta = {
    reportId: id,
    filename: report.filename,
    createdAt: report.createdAt,
    platform: String(report.platform),
    rowCount: report.rowCount,
    totalRecoverableAmount: report.totalRecoverableAmount ?? report.recoverableLeakage ?? 0,
  };

  const existingMeta = safeParse<ReportMeta[]>(localStorage.getItem(REPORTS_META_KEY)) ?? [];
  const filtered = existingMeta.filter(m => m.reportId !== id);
  const next = [meta, ...filtered].slice(0, MAX_REPORTS);

  try {
    localStorage.setItem(REPORTS_META_KEY, JSON.stringify(next));
    // Remove legacy full-report key to free space
    localStorage.removeItem('guardianai_reports');
  } catch {
    // Quota exceeded — try saving just this one entry
    try { localStorage.setItem(REPORTS_META_KEY, JSON.stringify([meta])); } catch { /* ignore */ }
  }
}

export function deleteReportFromHistory(reportId: string): void {
  const existing = safeParse<ReportMeta[]>(localStorage.getItem(REPORTS_META_KEY)) ?? [];
  const filtered = existing.filter(m => m.reportId !== reportId);
  try {
    localStorage.setItem(REPORTS_META_KEY, JSON.stringify(filtered));
    sessionStorage.removeItem(REPORT_FULL_PREFIX + reportId);
  } catch { /* ignore */ }
}

export function clearReportHistory(): void {
  localStorage.removeItem(REPORTS_META_KEY);
  localStorage.removeItem('guardianai_reports');
}

// ── Firestore persistence ─────────────────────────────────────────────────────
// Call saveReportToFirestore() after saveReportToHistory() so the report
// persists across devices. loadReportHistoryFromFirestore() complements
// loadReportHistory() on auth — localStorage stays as same-session cache.

import {
  getFirestore,
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
} from 'firebase/firestore';

export async function saveReportToFirestore(
  uid: string,
  report: ReconciliationReport,
): Promise<void> {
  try {
    const db = getFirestore();
    const id = report.reportId ?? `r_${report.createdAt}_${report.filename}`;
    await setDoc(doc(db, `users/${uid}/reports/${id}`), {
      reportId: id,
      filename: report.filename,
      createdAt: report.createdAt,
      platform: String(report.platform),
      rowCount: report.rowCount,
      totalRevenue: report.totalRevenue,
      netProfit: report.netProfit,
      recoverableLeakage: report.recoverableLeakage,
      tcsClaimable: report.tcsClaimable,
      totalRecoverableAmount: (report as any).totalRecoverableAmount ?? report.recoverableLeakage ?? 0,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('saveReportToFirestore failed:', err);
  }
}

export async function loadReportHistoryFromFirestore(
  uid: string,
): Promise<ReportMeta[]> {
  try {
    const db = getFirestore();
    const q = query(
      collection(db, `users/${uid}/reports`),
      orderBy('savedAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as ReportMeta);
  } catch {
    return [];
  }
}

export async function deleteReportFromFirestore(
  uid: string,
  reportId: string,
): Promise<void> {
  try {
    const db = getFirestore();
    await deleteDoc(doc(db, `users/${uid}/reports/${reportId}`));
  } catch { /* ignore */ }
}
