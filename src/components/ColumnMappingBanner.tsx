import { useState, CSSProperties } from 'react';
import type { ColumnMappingLog } from '../types';

interface Props {
  mappingLog: ColumnMappingLog;
  onResubmit: (overrides: Record<string, string>) => void;
}

const C: Record<string, CSSProperties> = {
  wrap:    { background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 10, padding: '14px 16px', marginBottom: 14 },
  wrapOk:  { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '14px 16px', marginBottom: 14 },
  heading: { fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 7 },
  headOk:  { fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 7 },
  body:    { fontSize: 12, color: '#78350f', lineHeight: 1.6 },
  bodyOk:  { fontSize: 12, color: '#14532d', lineHeight: 1.6 },
  badge:   { display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, marginRight: 5 },
  row:     { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 },
  select:  { fontSize: 11, border: '1px solid #d4a017', borderRadius: 5, padding: '3px 7px', background: '#fff', cursor: 'pointer', minWidth: 160 },
  btn:     { fontSize: 11, fontWeight: 600, background: '#92400e', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' },
};

// All valid SellerOrderRow field names that users can pick from
const FIELD_OPTIONS = [
  { value: '', label: '— ignore this column —' },
  { value: 'orderId', label: 'Order ID' },
  { value: 'sku', label: 'SKU / Product Code' },
  { value: 'settlement', label: 'Settlement Amount (net payout)' },
  { value: 'sellingPrice', label: 'Selling Price (gross sale)' },
  { value: 'referralFee', label: 'Referral / Commission Fee' },
  { value: 'fulfillmentFee', label: 'Fulfillment / Shipping Fee' },
  { value: 'storageFee', label: 'Storage Fee' },
  { value: 'otherFees', label: 'Other Fees' },
  { value: 'gstCollected', label: 'GST Amount Collected' },
  { value: 'gstRate', label: 'GST Rate (%)' },
  { value: 'tcsDeducted', label: 'TCS Deducted' },
  { value: 'tdsDeducted', label: 'TDS Deducted' },
  { value: 'returnAmount', label: 'Return / Refund Amount' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'orderDate', label: 'Order Date' },
  { value: 'pos', label: 'Place of Supply / State' },
  { value: 'weight', label: 'Charged Weight' },
  { value: 'declaredWeight', label: 'Declared Weight' },
  { value: 'costPrice', label: 'Cost Price / COGS per unit' },
  { value: 'txAmount', label: 'Amazon flat: Transaction Amount (base)' },
  { value: 'txFee', label: 'Amazon flat: Total Transaction Fee' },
  { value: 'netAmount', label: 'Amazon flat: Net Transaction Amount' },
  { value: 'txType', label: 'Amazon flat: Transaction Type' },
];

export function ColumnMappingBanner({ mappingLog, onResubmit }: Props) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);

  const { autoMappedCount, suggestedMappings, unmatchedColumns } = mappingLog;
  const hasIssues = suggestedMappings.length > 0 || unmatchedColumns.length > 0;
  const hasAutoMaps = autoMappedCount > 0;

  // Only show the banner if there's something to report
  if (!hasIssues && !hasAutoMaps) return null;

  function handleApply() {
    const finalOverrides: Record<string, string> = {};
    for (const [raw, field] of Object.entries(overrides)) {
      if (field) finalOverrides[raw] = String(field);
    }
    onResubmit(finalOverrides);
  }

  return (
    <div style={hasIssues ? C.wrap : C.wrapOk}>
      {/* Header */}
      <div style={hasIssues ? C.heading : C.headOk}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={hasIssues ? '#92400e' : '#166534'} strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Column Mapping
        {hasAutoMaps && (
          <span style={{ ...C.badge, background: '#d1fae5', color: '#065f46' }}>
            {autoMappedCount} auto-mapped
          </span>
        )}
        {suggestedMappings.length > 0 && (
          <span style={{ ...C.badge, background: '#fef3c7', color: '#92400e' }}>
            {suggestedMappings.length} uncertain
          </span>
        )}
        {unmatchedColumns.length > 0 && (
          <span style={{ ...C.badge, background: '#fee2e2', color: '#991b1b' }}>
            {unmatchedColumns.length} unmatched
          </span>
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginLeft: 'auto', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b5e' }}
        >
          {expanded ? 'Hide details ▲' : 'Show details ▼'}
        </button>
      </div>

      {/* Summary line */}
      <div style={hasIssues ? C.body : C.bodyOk}>
        {hasAutoMaps && `${autoMappedCount} column(s) were fuzzy-matched automatically. `}
        {suggestedMappings.length > 0 && (
          <strong>{suggestedMappings.length} column(s) are ambiguous — confirm the correct mapping below and re-analyse. </strong>
        )}
        {unmatchedColumns.length > 0 && `${unmatchedColumns.length} column(s) couldn't be matched and are being ignored. `}
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          {/* Auto-mapped (informational) */}
          {hasAutoMaps && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#065f46', marginBottom: 4 }}>
                Auto-mapped columns
              </div>
              {mappingLog.results
                .filter(r => r.matchType === 'fuzzy_auto')
                .map(r => (
                  <div key={r.rawHeader} style={{ fontSize: 11, color: '#166534', padding: '2px 0' }}>
                    <span style={{ fontFamily: 'monospace', background: '#d1fae5', padding: '1px 5px', borderRadius: 3 }}>
                      {r.rawHeader}
                    </span>
                    {' '}→ <strong>{r.mappedField}</strong>
                    {' '}
                    <span style={{ color: '#9a9a8e' }}>({(r.similarity * 100).toFixed(0)}% match)</span>
                  </div>
                ))}
            </div>
          )}

          {/* Ambiguous — user picks */}
          {suggestedMappings.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                Ambiguous columns — please confirm:
              </div>
              {suggestedMappings.map(s => (
                <div key={s.raw} style={C.row}>
                  <span style={{ fontSize: 12, color: '#1a1a14', fontFamily: 'monospace', background: '#fef3c7', padding: '2px 6px', borderRadius: 3 }}>
                    {s.raw}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b6b5e' }}>({(s.similarity * 100).toFixed(0)}% ≈ "{s.suggestedTarget}")</span>
                  <select
                    style={C.select}
                    defaultValue={s.mappedField}
                    onChange={e => setOverrides(prev => ({ ...prev, [s.raw]: e.target.value }))}
                  >
                    {FIELD_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Unmatched — user picks */}
          {unmatchedColumns.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>
                Unrecognised columns — map manually if they contain financial data:
              </div>
              {unmatchedColumns.map(col => (
                <div key={col} style={C.row}>
                  <span style={{ fontSize: 12, color: '#1a1a14', fontFamily: 'monospace', background: '#fee2e2', padding: '2px 6px', borderRadius: 3 }}>
                    {col}
                  </span>
                  <select
                    style={{ ...C.select, borderColor: '#fca5a5' }}
                    defaultValue=""
                    onChange={e => setOverrides(prev => ({ ...prev, [col]: e.target.value }))}
                  >
                    {FIELD_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {(suggestedMappings.length > 0 || unmatchedColumns.length > 0) && (
            <button style={C.btn} onClick={handleApply}>
              Apply mappings &amp; Re-analyse
            </button>
          )}
        </div>
      )}
    </div>
  );
}
