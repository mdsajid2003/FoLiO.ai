import type { CSSProperties } from 'react';
import { ReconciliationReport } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props { report: ReconciliationReport | null; }

const C = {
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: '18px 20px' } as CSSProperties,
};

const WATERFALL_COLORS = {
  positive: '#76c893',
  negative: '#e76f51',
  neutral: '#7db8e8',
};

const REASON_STYLES: Record<string, { bg: string; color: string }> = {
  'FBA fee':          { bg: '#fee2e2', color: '#991b1b' },
  'GST 12%':          { bg: '#fef3c7', color: '#92400e' },
  'supply mismatch':  { bg: '#fee2e2', color: '#991b1b' },
  'matched':          { bg: '#f0fdf4', color: '#166534' },
};

export function ReconciliationPage({ report }: Props) {
  if (!report) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#9a9a8e', fontSize: 13 }}>Upload a file to see reconciliation details.</div>;
  }

  const waterfall = report.waterfall ?? [];
  const orders = report.orderRecon ?? [];
  const leakageBreakdown = report.leakageBreakdown ?? [];
  const ordersWithGaps = orders.filter(o => o.gap > 0).length;

  // Waterfall chart data for Recharts
  const waterfallData = waterfall.map(item => ({
    name: item.label,
    value: Math.abs(item.value),
    isPositive: item.isPositive,
    displayValue: item.value,
  }));

  // Violations
  const violations: { label: string; value: string; valueColor: string }[] = [];
  if (report.gstMismatchCount > 0) {
    violations.push({ label: '12% slab invoices', value: String(report.gstMismatchCount), valueColor: '#374151' });
  }
  const fbaBreakdown = leakageBreakdown.find(b => b.type === 'weight_slab_error');
  if (fbaBreakdown) {
    violations.push({ label: 'FBA overcharge', value: `₹${fbaBreakdown.amount.toLocaleString('en-IN')}`, valueColor: '#991b1b' });
  }
  const dupes = leakageBreakdown.find(b => b.type === 'duplicate_charge');
  if (dupes) {
    violations.push({ label: 'Duplicate charges', value: `₹${dupes.amount.toLocaleString('en-IN')}`, valueColor: '#991b1b' });
  }
  const missingReimb = leakageBreakdown.find(b => b.type === 'missing_reimbursement');
  if (missingReimb) {
    violations.push({ label: 'Missing reimbursements', value: `₹${missingReimb.amount.toLocaleString('en-IN')}`, valueColor: '#d97706' });
  }
  const adWaste = leakageBreakdown.find(b => b.type === 'incorrect_referral_fee');
  if (adWaste) {
    violations.push({ label: 'Referral fee overcharge', value: `₹${adWaste.amount.toLocaleString('en-IN')}`, valueColor: '#991b1b' });
  }

  const itcMismatch = (report.gstMismatches ?? []).filter(m => m.reason === 'itc_mismatch');
  if (itcMismatch.length > 0) {
    violations.push({
      label: 'ITC vs GSTR-2B mismatch',
      value: `${itcMismatch.length} variance(s)`,
      valueColor: '#991b1b',
    });
  }

  const failedInv = report.invariantReport?.checks.filter(c => !c.passed) ?? [];
  for (const c of failedInv) {
    violations.push({
      label: `Invariant: ${c.name}`,
      value: c.severity === 'critical' ? 'Critical' : c.severity === 'warning' ? 'Warning' : 'Info',
      valueColor: c.severity === 'critical' ? '#991b1b' : '#ca8a04',
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* TCS Hero */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#166534', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6 }}>TCS Claimable</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#1a1a14', lineHeight: 1, marginBottom: 6 }}>₹{report.tcsClaimable.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 12, color: '#4a7a5e' }}>
            1% on ₹{report.totalRevenue.toLocaleString('en-IN')} · Section 52 CGST · Claim in GSTR-3B
          </div>
        </div>
        <span style={{ fontSize: 11, color: '#4a7a5e', fontStyle: 'italic' }}>Claim via GSTR-3B Table 3(d)</span>
      </div>

      {/* Waterfall (Recharts) + Violations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 16 }}>Settlement waterfall</div>
          {waterfallData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={waterfallData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede4" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9a9a8e' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#3a3a2e' }} width={100} />
                <Tooltip formatter={(v: number, _name: string, props: any) => {
                  const item = props.payload;
                  const prefix = item.isPositive ? '' : '-';
                  return [`${prefix}₹${v.toLocaleString('en-IN')}`, item.name];
                }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {waterfallData.map((entry, i) => (
                    <Cell key={i} fill={entry.isPositive ? WATERFALL_COLORS.positive : WATERFALL_COLORS.negative} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9a8e' }}>No waterfall data</div>
          )}
        </div>

        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>Violations</div>
          {violations.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9a9a8e', padding: '12px 0' }}>No violations detected.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {violations.map((v, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < violations.length - 1 ? '1px solid #f0ede4' : 'none' }}>
                  <span style={{ fontSize: 12, color: '#3a3a2e' }}>{v.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: v.valueColor }}>{v.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Order-level reconciliation */}
      <div style={C.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14' }}>Order-level reconciliation</span>
          <span style={{ fontSize: 11, color: '#2d5a27', fontWeight: 500 }}>
            {ordersWithGaps > 0 ? `${ordersWithGaps} orders with gaps` : 'All orders matched'}
          </span>
        </div>

        {orders.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9a9a8e', padding: '12px 0' }}>No order-level data available.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr>
                {['Order ID', 'Product', 'MTR Gross', 'Settlement', 'Gap', 'Reason'].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9a9a8e', textAlign: 'left', padding: '0 0 10px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(row => {
                const reasonStyle = REASON_STYLES[row.reason] ?? { bg: '#f3f4f6', color: '#374151' };
                return (
                  <tr key={row.orderId} style={{ borderTop: '1px solid #f0ede4' }}>
                    <td style={{ padding: '10px 0', fontSize: 12, color: '#6b6b5e' }}>{row.orderId}</td>
                    <td style={{ padding: '10px 0', fontSize: 12, color: '#2d5a27', fontWeight: 500 }}>{row.product}</td>
                    <td style={{ padding: '10px 0', fontSize: 12, color: '#1a1a14' }}>₹{row.mtrGross.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 0', fontSize: 12, color: '#1a1a14' }}>₹{row.settlement.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 0', fontSize: 12, fontWeight: 600, color: row.gap > 0 ? '#991b1b' : '#166534' }}>₹{row.gap.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '10px 0' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: reasonStyle.bg, color: reasonStyle.color }}>{row.reason}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        <div style={{ marginTop: 14, padding: '10px 12px', background: '#fafaf5', borderRadius: 6, fontSize: 11, color: '#6b6b5e', lineHeight: 1.55 }}>
          <strong>Verification:</strong> MTR gross ₹{orders.reduce((s, o) => s + o.mtrGross, 0).toLocaleString('en-IN')} − Settlement ₹{orders.reduce((s, o) => s + o.settlement, 0).toLocaleString('en-IN')} = Gap ₹{orders.reduce((s, o) => s + o.gap, 0).toLocaleString('en-IN')}
        </div>
      </div>
    </div>
  );
}
