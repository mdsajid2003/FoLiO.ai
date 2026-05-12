import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { ReconciliationReport } from '../types';
import { deleteReportFromHistory, deleteReportFromFirestore } from '../lib/storage';
import type { QueuedFile } from '../hooks/useReport';

interface HumanizedError { title: string; detail: string; suggestion: string }

function humanizeError(raw: string): HumanizedError {
  if (raw.includes('revenue column') || raw.includes('monetary values are ₹0'))
    return {
      title: 'Revenue column not found',
      detail: 'Your file was parsed but the revenue/amount column could not be identified.',
      suggestion: 'Rename your revenue column to "Amount" or "Revenue" and re-upload.',
    };
  if (raw.includes('UnrecognizedFileError') || raw.includes('does not appear to be'))
    return {
      title: 'Unrecognised file format',
      detail: "This file doesn't look like a settlement or order report.",
      suggestion: 'Upload an Amazon Settlement V2 CSV, Amazon MTR, or Flipkart Settlement report.',
    };
  if (raw.includes('No data rows'))
    return {
      title: 'File appears empty',
      detail: 'The file has headers but no data rows.',
      suggestion: "Check the file isn't filtered to show 0 rows before downloading.",
    };
  if (raw.includes('AI analysis limit'))
    return {
      title: 'Monthly AI limit reached',
      detail: "You've used your 5 AI-assisted analyses for this month.",
      suggestion: "Upload an Amazon/Flipkart settlement report — these don't use the AI limit.",
    };
  if (raw.includes('Too many'))
    return {
      title: 'Too many uploads',
      detail: "You've uploaded too many files in a short time.",
      suggestion: 'Wait 60 seconds and try again.',
    };
  if (raw.includes('binary'))
    return {
      title: 'Invalid file type',
      detail: 'The server only accepts text-based uploads (CSV or Excel converted in the browser).',
      suggestion: 'Use a .csv, .xls, or .xlsx settlement export. If this persists, re-save the file from Excel.',
    };
  return {
    title: 'Something went wrong',
    detail: raw,
    suggestion: 'Try refreshing and uploading again.',
  };
}

interface JobStatus {
  jobId: string;
  state: string;
  progress: number;
  failedReason?: string;
}

interface Props {
  onFileSelect: (files: File[]) => void;
  onLoadDemo: () => void | Promise<void>;
  jobStatus: JobStatus | null;
  error: string | null;
  savedReports: ReconciliationReport[];
  onLoadSavedReport: (report: ReconciliationReport) => void;
  onReportsChanged?: () => void;
  fileQueue?: QueuedFile[];
  /** Incremented from the app header "+ Upload" while already on this page to open the file picker. */
  headerUploadSignal?: number;
  /** Authenticated user ID for Firestore delete operations (#11) */
  userId?: string;
}

export function UploadPage({ onFileSelect, onLoadDemo, jobStatus, error, savedReports, onLoadSavedReport, onReportsChanged, fileQueue, headerUploadSignal = 0, userId }: Props) {
  const [aiUsage, setAiUsage] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [localReports, setLocalReports] = useState<ReconciliationReport[]>(savedReports);

  // Sync when parent updates savedReports
  useEffect(() => { setLocalReports(savedReports); }, [savedReports]);

  function handleDelete(e: React.MouseEvent, reportId: string | undefined) {
    e.stopPropagation();
    if (!reportId) return;
    deleteReportFromHistory(reportId);
    // #11 fix: also delete from Firestore so it stays in sync
    if (userId) {
      deleteReportFromFirestore(userId, reportId).catch(err =>
        console.warn('Firestore delete failed (non-fatal):', err)
      );
    }
    setLocalReports(prev => prev.filter(r => r.reportId !== reportId));
    onReportsChanged?.();
  }

  useEffect(() => {
    fetch('/api/ai-usage')
      .then(r => r.json())
      .then(data => setAiUsage(data))
      .catch(() => {});
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) onFileSelect(accepted);
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    multiple: true,
  } as any);

  useEffect(() => {
    if (headerUploadSignal > 0) open();
  }, [headerUploadSignal, open]);

  const isProcessing = jobStatus && (jobStatus.state === 'waiting' || jobStatus.state === 'active');
  const isLimitError = error?.includes('AI analysis limit reached');

  const fileChips = ['Amazon Settlement V2.csv', 'Amazon MTR Report.csv', 'Flipkart Settlement.csv'];

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* What to upload card */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#6b6b5e', marginBottom: 10 }}>What to upload</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {fileChips.map(chip => (
            <span key={chip} style={{
              fontSize: 11,
              color: '#3a3a2e',
              background: '#f0ede4',
              border: '1px solid #dbd8cf',
              borderRadius: 6,
              padding: '3px 9px',
              fontFamily: 'monospace',
            }}>{chip}</span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 10, lineHeight: 1.5 }}>
          CSV or Excel (.xlsx / .xls). Other CSV layouts are analyzed via AI (Gemini + Claude).
          {aiUsage && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: aiUsage.remaining > 0 ? '#2563eb' : '#991b1b', background: aiUsage.remaining > 0 ? '#eff6ff' : '#fef2f2', padding: '2px 7px', borderRadius: 5 }}>
              {aiUsage.remaining} AI {aiUsage.remaining === 1 ? 'analysis' : 'analyses'} left this month
            </span>
          )}
        </div>
      </div>

      {/* Drop zone */}
      {!isProcessing && (
        <div
          {...getRootProps()}
          style={{
            border: `2px dashed ${isDragActive ? '#2d5a27' : '#ccc9be'}`,
            borderRadius: 10,
            padding: '48px 28px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragActive ? '#f0fdf4' : '#fafaf7',
            transition: 'all 0.2s',
          }}
        >
          <input {...getInputProps()} />
          <div style={{ marginBottom: 12 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2d5a27" strokeWidth="1.8" style={{ display: 'block', margin: '0 auto' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
          </div>
          {isDragActive ? (
            <p style={{ fontSize: 14, color: '#2d5a27', fontWeight: 600, margin: 0 }}>Drop your file here…</p>
          ) : (
            <>
              <p style={{ fontSize: 14, color: '#1a1a14', fontWeight: 500, margin: '0 0 6px' }}>Drop your settlement CSV or Excel file to find recoverable money</p>
              <p style={{ fontSize: 12, color: '#9a9a8e', margin: 0 }}>Amazon or Flipkart · CSV, .xlsx, or .xls · Results in 60 seconds</p>
            </>
          )}
        </div>
      )}

      {/* Multi-file queue */}
      {fileQueue && fileQueue.length > 1 && (
        <div style={{ marginTop: 12, background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b6b5e', marginBottom: 8 }}>Processing {fileQueue.length} files</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fileQueue.map(f => {
              const icons: Record<QueuedFile['status'], string> = { pending: '○', processing: '◌', done: '✓', error: '✗' };
              const colors: Record<QueuedFile['status'], string> = { pending: '#9a9a8e', processing: '#2563eb', done: '#2d5a27', error: '#991b1b' };
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors[f.status] }}>
                  <span style={{ fontWeight: 700, minWidth: 14 }}>{icons[f.status]}</span>
                  <span style={{ flex: 1, color: '#3a3a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  {f.status === 'error' && <span style={{ fontSize: 11, color: '#991b1b' }}>{f.errorMsg}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Processing */}
      {isProcessing && (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#1a1a14', fontWeight: 500, marginBottom: 6 }}>
            {jobStatus.state === 'waiting' ? 'Queued…' : 'Scanning for recoverable money…'}
          </div>
          <div style={{ fontSize: 12, color: '#9a9a8e', marginBottom: 16 }}>Checking fees, reimbursements, GST, TCS — usually under 30 seconds</div>
          <div style={{ width: '100%', maxWidth: 240, height: 4, background: '#e8e5dc', borderRadius: 4, margin: '0 auto', overflow: 'hidden' }}>
            <div style={{ width: `${jobStatus.progress || 5}%`, height: '100%', background: '#2d5a27', transition: 'width 0.5s' }} />
          </div>
          <div style={{ fontSize: 11, color: '#9a9a8e', marginTop: 6 }}>{jobStatus.progress || 0}%</div>
        </div>
      )}

      {/* Error */}
      {error && (() => {
        const { title, detail, suggestion } = humanizeError(error);
        const borderColor = isLimitError ? '#93c5fd' : '#fca5a5';
        const titleColor = isLimitError ? '#1e40af' : '#991b1b';
        const bgColor = isLimitError ? '#eff6ff' : '#fef2f2';
        return (
          <div style={{ marginTop: 12, background: '#fff', border: `1px solid ${borderColor}`, borderRadius: 10, padding: '16px 18px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={titleColor} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: titleColor }}>{title}</span>
            </div>
            <div style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 12, lineHeight: 1.5 }}>{detail}</div>
            <div style={{ fontSize: 11, color: '#6b6b5e', lineHeight: 1.6, background: bgColor, borderRadius: 6, padding: '10px 12px' }}>
              <strong style={{ color: titleColor }}>What to try:</strong>
              <div style={{ marginTop: 4 }}>{suggestion}</div>
            </div>
          </div>
        );
      })()}

      {/* Demo */}
      {!isProcessing && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            onClick={onLoadDemo}
            style={{ fontSize: 12, color: '#6b6b5e', background: 'none', border: '1px solid #d0cdc4', borderRadius: 7, padding: '6px 16px', cursor: 'pointer' }}
          >
            Load demo report (50 orders)
          </button>
        </div>
      )}

      {!isProcessing && localReports.length > 0 && (
        <div style={{ marginTop: 28, background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: '14px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a14', marginBottom: 10 }}>Previous reports</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {localReports.map((r) => {
              const label = r.filename ?? 'Saved report';
              const when = r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '';
              const recover = r.totalRecoverableAmount ?? r.recoverableLeakage ?? 0;
              return (
                <div key={r.reportId ?? `${label}_${r.createdAt}`} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => onLoadSavedReport(r)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: '#fafaf7',
                      border: '1px solid #e8e5dc',
                      borderRadius: 8,
                      padding: '10px 36px 10px 12px',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: '#1a1a14',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 4 }}>
                      {when}
                      {recover > 0 ? ` · Recoverable ~₹${recover.toLocaleString('en-IN')}` : ''}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, r.reportId)}
                    title="Delete this report"
                    style={{
                      position: 'absolute',
                      top: '50%',
                      right: 10,
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#9a9a8e',
                      fontSize: 16,
                      lineHeight: 1,
                      padding: '2px 4px',
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
