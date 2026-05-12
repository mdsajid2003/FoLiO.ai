import { useState } from 'react';
import { ReconciliationReport, LeakageItem } from '../types';

function exportLeakageCsv(items: LeakageItem[], filename: string) {
  const headers = ['Order ID', 'SKU', 'Leakage Type', 'Expected Fee', 'Actual Fee', 'Difference', 'Confidence', 'Claim Deadline (days)'];
  const rows = items.map(item => [
    item.orderId ?? '',
    item.sku ?? '',
    item.type.replace(/_/g, ' '),
    item.expected.toFixed(2),
    item.actual.toFixed(2),
    item.diff.toFixed(2),
    item.confidence,
    item.claimDeadlineDays !== undefined ? String(item.claimDeadlineDays) : '',
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leakage_${filename.replace(/[^a-z0-9]/gi, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  report: ReconciliationReport | null;
}

export function ActionsPage({ report }: Props) {
  const [openType, setOpenType] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  if (!report) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: '#9a9a8e', fontSize: 14 }}>
        Upload a settlement file to see recovery steps and support templates.
      </div>
    );
  }

  const actions = report.recoveryActions ?? [];
  const leakageItems = report.leakageItems ?? [];

  const missingReimbUrgent = leakageItems.some(
    li => li.type === 'missing_reimbursement' && li.isExpiringSoon === true,
  );
  const missingReimbMinDeadlineDays = (() => {
    const urgent = leakageItems.filter(
      li => li.type === 'missing_reimbursement' && li.isExpiringSoon === true && li.claimDeadlineDays !== undefined,
    );
    if (urgent.length === 0) return null;
    return Math.min(...urgent.map(li => li.claimDeadlineDays!));
  })();

  const sortedActions = [...actions].sort((a, b) => {
    const au = a.type === 'missing_reimbursement' && missingReimbUrgent;
    const bu = b.type === 'missing_reimbursement' && missingReimbUrgent;
    if (au !== bu) return au ? -1 : 1;
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority] || b.totalAmount - a.totalAmount;
  });

  const platformLabel = report.platform === 'flipkart' ? 'Flipkart' : 'Amazon';

  async function copyTemplate(text: string, actionType: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(actionType);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      alert('Could not copy — select and copy manually.');
    }
  }

  if (actions.length === 0) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: '24px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a14', marginBottom: 8 }}>No automated recovery actions</div>
          <p style={{ fontSize: 13, color: '#6b6b5e', lineHeight: 1.6, margin: 0 }}>
            This file did not match our fee or reimbursement anomaly rules. Check Reconciliation and Tax Summary for GST/TCS items, or upload a fuller settlement export.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#3a3a2e' }}>
          Recovery workflow for {platformLabel} — steps and ticket text you can paste into seller support.
        </div>
        {leakageItems.length > 0 && (
          <button
            type="button"
            onClick={() => exportLeakageCsv(leakageItems, report.filename)}
            style={{ fontSize: 12, fontWeight: 600, color: '#2d5a27', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 7, padding: '6px 14px', cursor: 'pointer' }}
          >
            ↓ Download CSV
          </button>
        )}
      </div>

      {sortedActions.map(action => {
        const isOpen = openType === action.type;
        const priorityColor = action.priority === 'high' ? '#991b1b' : action.priority === 'medium' ? '#d97706' : '#6b6b5e';
        const showReimbDeadlineBadge =
          action.type === 'missing_reimbursement' && missingReimbMinDeadlineDays !== null;
        return (
          <div key={action.type} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setOpenType(isOpen ? null : action.type)}
              style={{
                width: '100%', textAlign: 'left', padding: '14px 18px', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', textTransform: 'capitalize' }}>
                    {action.type.replace(/_/g, ' ')}
                  </span>
                  {showReimbDeadlineBadge && (
                    <span
                      style={{
                        background: '#991b1b',
                        color: '#fff',
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontWeight: 600,
                      }}
                    >
                      Claim expires in {missingReimbMinDeadlineDays} days
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 4 }}>
                  ₹{action.totalAmount.toLocaleString('en-IN')} · {action.itemCount} item(s) · ~{action.estimatedRecoveryDays} days typical resolution
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: priorityColor, textTransform: 'uppercase' }}>{action.priority}</span>
                <span style={{ fontSize: 12, color: '#9a9a8e' }}>{isOpen ? '▴' : '▾'}</span>
              </div>
            </button>
            {isOpen && (
              <div style={{ borderTop: '1px solid #f0ede4', padding: '16px 18px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.5px', marginBottom: 8 }}>STEPS</div>
                <ol style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 12.5, color: '#3a3a2e', lineHeight: 1.7 }}>
                  {action.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.5px', marginBottom: 8 }}>SUPPORT TEMPLATE</div>
                <pre style={{
                  fontSize: 11, background: '#fafaf5', border: '1px solid #e8e5dc', borderRadius: 8, padding: 12,
                  whiteSpace: 'pre-wrap', color: '#2a2a1e', margin: '0 0 12px', maxHeight: 200, overflow: 'auto',
                }}>
                  {action.template}
                </pre>
                <button
                  type="button"
                  onClick={() => copyTemplate(action.template, action.type)}
                  style={{
                    background: '#2d5a27', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {copiedType === action.type ? 'Copied!' : 'Copy template'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
