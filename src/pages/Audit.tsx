import type { CSSProperties } from 'react';
import type { ReconciliationReport } from '../types';

interface Props {
  report: ReconciliationReport | null;
}

const th: CSSProperties = { textAlign: 'left', fontSize: 10, color: '#6b6b5e', padding: '6px 8px', borderBottom: '1px solid #e8e5dc' };
const td: CSSProperties = { fontSize: 11, padding: '6px 8px', borderBottom: '1px solid #f0ede4' };

export function AuditPage({ report }: Props) {
  if (!report) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, textAlign: 'center', color: '#9a9a8e', fontSize: 13 }}>
        Upload and process a report to see invariant checks and order vs settlement match.
      </div>
    );
  }

  const inv = report.invariantReport;
  const tw = report.threeWayMatch;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a14' }}>Two-way match</div>
        <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 5, padding: '2px 8px' }}>
          Orders vs settlement · bank reconciliation not yet available
        </span>
      </div>

      {inv && (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: 14, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Invariant checks</span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 6,
              background: inv.allPassed ? '#dcfce7' : '#fef2f2',
              color: inv.allPassed ? '#166534' : '#991b1b',
            }}>
              {inv.allPassed ? 'All passed' : `${inv.criticalFailures} critical · ${inv.warnings} warnings`}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Check</th>
                <th style={th}>Expected</th>
                <th style={th}>Actual</th>
                <th style={th}>Diff</th>
                <th style={th}>OK</th>
              </tr>
            </thead>
            <tbody>
              {inv.checks.map((c, i) => (
                <tr key={i}>
                  <td style={td}>{c.name}</td>
                  <td style={td}>{c.expected.toFixed(2)}</td>
                  <td style={td}>{c.actual.toFixed(2)}</td>
                  <td style={td}>{c.difference.toFixed(2)}</td>
                  <td style={{ ...td, color: c.passed ? '#166534' : '#991b1b', fontWeight: 600 }}>{c.passed ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tw && tw.items.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: 14, overflow: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Order vs settlement match · {tw.matchRate}% matched · {tw.totalMismatched} mismatches / missing
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr>
                <th style={th}>Order</th>
                <th style={th}>Order value</th>
                <th style={th}>Settlement</th>
                <th style={th}>Δ tax vs settlement</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tw.items.slice(0, 80).map((row, i) => (
                <tr key={`${row.orderId}-${i}`}>
                  <td style={td}>{row.orderId}</td>
                  <td style={td}>{row.orderValue.toFixed(0)}</td>
                  <td style={td}>{row.settlementValue.toFixed(0)}</td>
                  <td style={td}>{row.taxVsSettlement.toFixed(0)}</td>
                  <td style={{
                    ...td,
                    color: row.status === 'matched' ? '#166534' : row.status === 'missing' ? '#d97706' : '#991b1b',
                    fontWeight: 600,
                  }}
                  >
                    {row.status}{row.mismatchCause ? ` · ${row.mismatchCause}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tw.items.length > 80 && <div style={{ fontSize: 11, color: '#9a9a8e', marginTop: 8 }}>Showing first 80 orders.</div>}
        </div>
      )}
    </div>
  );
}
