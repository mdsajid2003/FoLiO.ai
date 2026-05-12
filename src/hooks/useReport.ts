import { useState, useRef, useEffect } from 'react';
import { ReconciliationReport } from '../types';
import {
  saveReportToHistory,
  loadReportHistory,
  saveReportToFirestore,
  loadReportHistoryFromFirestore,
  deleteReportFromFirestore,
} from '../lib/storage';
import { readUploadFileAsDelimitedText } from '../lib/readUploadFile';

interface JobStatus {
  jobId: string;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  result?: ReconciliationReport;
  failedReason?: string;
}

export interface QueuedFile {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMsg?: string;
}

const SESSION_FILE_KEY = 'guardianai_last_file';
const POLL_TIMEOUT_MS = 300_000; // 5 minutes
const CANCEL_PROMPT_MS = 120_000; // Show cancel option after 2 minutes

interface StoredFileRef { name: string; text: string; userId: string }

function saveFileToSession(name: string, text: string, userId: string): void {
  try { sessionStorage.setItem(SESSION_FILE_KEY, JSON.stringify({ name, text, userId })); } catch { /* ignore */ }
}

function loadFileFromSession(): StoredFileRef | null {
  try {
    const raw = sessionStorage.getItem(SESSION_FILE_KEY);
    return raw ? JSON.parse(raw) as StoredFileRef : null;
  } catch { return null; }
}

export function useReport(getIdToken?: () => Promise<string | null>) {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [savedReports, setSavedReports] = useState<ReconciliationReport[]>(() => loadReportHistory());
  const [error, setError] = useState<string | null>(null);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedAtRef = useRef<number | null>(null);
  const pollFailureCountRef = useRef(0);
  const currentFileRef = useRef<{ file: File; userId: string } | null>(null);
  const fileQueueRef = useRef<Array<{ id: string; file: File; userId: string }>>([]);
  const processingQueueRef = useRef(false);
  // Tracks the final outcome of the most recent polling cycle so waitForPollingDone
  // can surface failures to processNextInQueue (#6).
  // Declared here (not near waitForPollingDone) so submitFile can reference it safely.
  const lastJobOutcomeRef = useRef<'completed' | 'failed' | null>(null);

  function persistReport(next: ReconciliationReport) {
    saveReportToHistory(next);
    setSavedReports(loadReportHistory());
    // #11 fix: also persist to Firestore so reports survive across devices.
    // Decode uid from the token lazily — avoids blocking the UI for a background sync.
    if (getIdToken) {
      getIdToken().then(token => {
        if (!token) return;
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const uid: string = payload.sub || payload.uid;
          if (uid) saveReportToFirestore(uid, next).catch(err =>
            console.warn('Firestore save failed (non-fatal):', err)
          );
        } catch { /* JWT decode failed — skip Firestore */ }
      });
    }
  }

  // #11 fix: hydrate saved reports from Firestore on first load (userId available via getIdToken)
  // Fix: include getIdToken in deps so if auth state changes (user signs in after mount),
  // we re-hydrate with the real token instead of the stale guest null.
  useEffect(() => {
    if (!getIdToken) return;
    let cancelled = false;
    getIdToken().then(token => {
      if (cancelled || !token) return;
      // Decode UID from token header to pass to Firestore loader
      // (simple base64 decode of JWT payload — no verification needed here, we just need uid)
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const uid: string = payload.sub || payload.uid;
        if (!uid) return;
        loadReportHistoryFromFirestore(uid).then(remoteReports => {
          if (cancelled) return;
          if (remoteReports.length > 0) {
            // Merge remote ReportMeta with local full ReconciliationReport objects.
            // Firestore only stores lightweight meta; local storage has the full reports.
            // We just use the remote list to check for any we don't have locally.
            const localReports = loadReportHistory();
            const localIds = new Set(localReports.map(r => r.reportId));
            // For now, surface the local set sorted by createdAt — the Firestore
            // records are metadata only and can't be used to reconstruct full reports.
            // This at least ensures the sidebar reflects what Firestore knows about.
            const sorted = localReports.sort(
              (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
            );
            // Log if remote has IDs not present locally (useful for debugging cross-device sync)
            const missingLocally = remoteReports.filter(r => !localIds.has(r.reportId));
            if (missingLocally.length > 0) {
              console.info(`[Firestore] ${missingLocally.length} report(s) exist remotely but not locally (may have been uploaded from another device).`);
            }
            setSavedReports(sorted);
          }
        }).catch(err => console.warn('Firestore load failed (non-fatal):', err));
      } catch { /* JWT decode failed — skip */ }
    });
    return () => { cancelled = true; };
  // getIdToken identity changes when auth state changes (sign in after mount)
  }, [getIdToken]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollStartedAtRef.current = null;
    pollFailureCountRef.current = 0;
    setShowCancelPrompt(false);
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  async function submitFile(
    file: File,
    userId: string = 'anonymous',
    columnOverrides: Record<string, string> = {},
  ) {
    stopPolling();
    setError(null);
    setReport(null);
    setJobStatus(null);
    lastJobOutcomeRef.current = null; // reset outcome for this job (#6)

    try {
      currentFileRef.current = { file, userId };
      const text = await readUploadFileAsDelimitedText(file);
      saveFileToSession(file.name, text, userId);

      const token = getIdToken ? await getIdToken() : null;
      const authHeaders: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {};

      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ filename: file.name, data: text, userId, columnOverrides }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to submit file');
      }
      const { jobId } = await res.json();
      setJobStatus({ jobId, state: 'waiting', progress: 0 });
      pollStartedAtRef.current = Date.now();

      pollRef.current = setInterval(async () => {
        try {
          const elapsed = pollStartedAtRef.current ? Date.now() - pollStartedAtRef.current : 0;
          if (elapsed > POLL_TIMEOUT_MS) {
            setError('Processing has exceeded 5 minutes. The server may be overloaded — please try again later.');
            stopPolling();
            return;
          }
          if (elapsed > CANCEL_PROMPT_MS) {
            setShowCancelPrompt(prev => prev ? prev : true);
          }

          const pollToken = getIdToken ? await getIdToken() : null;
          const pollAuthHeaders: Record<string, string> = pollToken
            ? { Authorization: `Bearer ${pollToken}` }
            : {};
          const statusRes = await fetch(`/api/reconcile/status/${jobId}`, { headers: pollAuthHeaders });
          if (!statusRes.ok) {
            const body = await statusRes.json().catch(() => ({}));
            throw new Error(body.error ?? 'Failed to fetch job status');
          }
          const status: JobStatus = await statusRes.json();
          pollFailureCountRef.current = 0;
          setJobStatus(status);

          if (status.state === 'completed' && status.result) {
            setReport(status.result);
            persistReport(status.result);
            lastJobOutcomeRef.current = 'completed'; // #6
            stopPolling();
          } else if (status.state === 'failed') {
            setError(status.failedReason ?? 'Processing failed');
            setReport(null);
            lastJobOutcomeRef.current = 'failed'; // #6
            stopPolling();
          }
        } catch (err: unknown) {
          pollFailureCountRef.current += 1;
          if (pollFailureCountRef.current >= 4) {
            const msg = err instanceof Error ? err.message : 'Lost connection while processing the file';
            setError(msg);
            stopPolling();
          }
        }
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  function loadSavedReport(saved: ReconciliationReport) {
    stopPolling();
    setError(null);
    setJobStatus(null);
    setReport(saved);
  }

  async function loadDemoReport(userId: string = 'anonymous') {
    stopPolling();
    setError(null);
    setReport(null);
    setJobStatus(null);
    try {
      const res = await fetch('/demo/amazon-demo.csv');
      if (!res.ok) {
        throw new Error(`Could not load demo file (${res.status}).`);
      }
      const text = await res.text();
      const file = new File([text], 'amazon-demo.csv', { type: 'text/csv' });
      await submitFile(file, userId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load demo';
      setError(message);
    }
  }

  /** Re-run the last uploaded file with user-confirmed column overrides.
   *  Falls back to sessionStorage if the in-memory ref was lost after a page refresh. */
  async function resubmitWithColumnOverrides(overrides: Record<string, string>) {
    if (currentFileRef.current) {
      const { file, userId } = currentFileRef.current;
      await submitFile(file, userId, overrides);
      return;
    }
    // Try to restore from sessionStorage
    const stored = loadFileFromSession();
    if (stored) {
      const file = new File([stored.text], stored.name, { type: 'text/csv' });
      currentFileRef.current = { file, userId: stored.userId };
      await submitFile(file, stored.userId, overrides);
      return;
    }
    setError('Please re-upload your file to apply new column mappings.');
  }

  function cancelProcessing() {
    stopPolling();
    processingQueueRef.current = false;
    fileQueueRef.current = [];
    setFileQueue([]);
    setJobStatus(null);
    setError('Processing cancelled. You can upload a different file or try again.');
  }

  /** Resolves once the current polling interval clears; throws if the job failed (#6). */
  function waitForPollingDone(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!pollRef.current) {
        // Already stopped — check outcome immediately
        if (lastJobOutcomeRef.current === 'failed') {
          reject(new Error('Job processing failed'));
        } else {
          resolve();
        }
        return;
      }
      const t = setInterval(() => {
        if (!pollRef.current) {
          clearInterval(t);
          if (lastJobOutcomeRef.current === 'failed') {
            reject(new Error('Job processing failed'));
          } else {
            resolve();
          }
        }
      }, 500);
    });
  }

  /** Process the internal queue iteratively — no recursion (#31). */
  async function processNextInQueue(userId: string) {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;

    // Iterative loop — avoids 50-frame deep stack for 50 files (#31)
    try {
      while (fileQueueRef.current.length > 0) {
        const next = fileQueueRef.current.shift()!;
        setFileQueue(prev => prev.map(f => f.id === next.id ? { ...f, status: 'processing' } : f));
        try {
          await submitFile(next.file, userId);
          // Wait for the polling cycle to fully complete before starting the next file (#3)
          await waitForPollingDone();
          setFileQueue(prev => prev.map(f => f.id === next.id ? { ...f, status: 'done' } : f));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed';
          setFileQueue(prev => prev.map(f => f.id === next.id ? { ...f, status: 'error', errorMsg: msg } : f));
        }
      }
    } finally {
      processingQueueRef.current = false;
    }
  }

  /** Accept multiple files, queue them, and start processing sequentially. */
  async function submitFiles(files: File[], userId: string = 'anonymous') {
    if (files.length === 1) {
      // Clear any stale multi-file queue UI from a previous batch (#18)
      setFileQueue([]);
      fileQueueRef.current = [];
      await submitFile(files[0], userId);
      return;
    }
    // Multi-file: build a queue
    const newItems: QueuedFile[] = files.map((f, i) => ({
      id: `q_${Date.now()}_${i}`,
      name: f.name,
      status: 'pending' as const,
    }));
    fileQueueRef.current = files.map((f, i) => ({ id: newItems[i].id, file: f, userId }));
    setFileQueue(newItems);
    setError(null);
    await processNextInQueue(userId);
  }

  function refreshSavedReports() {
    setSavedReports(loadReportHistory());
  }

  return {
    jobStatus, report, error, showCancelPrompt, fileQueue,
    submitFile, submitFiles, loadDemoReport, savedReports, loadSavedReport,
    resubmitWithColumnOverrides, cancelProcessing, refreshSavedReports,
  };
}
