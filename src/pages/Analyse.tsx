import type { CSSProperties } from 'react';
import { ReconciliationReport } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';

interface Props { report: ReconciliationReport | null; }

const C = {
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: '16px 18px' } as CSSProperties,
};

const COLORS = ['#2d5a27', '#4a90d9', '#e9c46a', '#e76f51', '#9a9a8e', '#264653'];

export function AnalysePage({ report }: Props) {
  if (!report) {
    return <div style={{ textAlign: 'center', padding: 60, color: '#9a9a8e', fontSize: 13 }}>Upload a file to see analysis.</div>;
  }

  const sa = report.salesAnalytics;
  const skus = report.skuProfitability ?? [];
  const topSku = skus[0];
  const avgOrderValue = sa?.avgOrderValue ?? (report.rowCount > 0 ? Math.round(report.totalRevenue / report.rowCount) : 0);
  const totalReturns = skus.reduce((s, sk) => s + sk.returns, 0);
  // Return rate: prefer the order-count-based rate from salesAnalytics (fixed in analytics engine).
  // Fall back to a monetary ratio only when salesAnalytics is unavailable (legacy reports).
  const returnRate = sa
    ? (sa.returnRateBySku.length > 0
        ? (() => {
            const totalOrders = sa.returnRateBySku.reduce((sum, r) => sum + (r.orders || 0), 0);
            const totalReturns = sa.returnRateBySku.reduce((sum, r) => sum + (r.returnOrders || 0), 0);
            return totalOrders > 0 ? ((totalReturns / totalOrders) * 100).toFixed(1) : '0';
          })()
        : '0')
    : (report.totalRevenue > 0 ? ((totalReturns / report.totalRevenue) * 100).toFixed(1) : '0');
  const netMargin = sa?.profitMarginPct ?? (report.totalRevenue > 0 ? Math.round((report.netProfit / report.totalRevenue) * 100) : 0);

  const trends = report.monthlyTrends ?? [];
  const momText = trends.length >= 2
    ? (() => {
        const prev = trends[trends.length - 2].revenue;
        const curr = trends[trends.length - 1].revenue;
        const pct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;
        return pct >= 0 ? `↑${pct}% MoM` : `↓${Math.abs(pct)}% MoM`;
      })()
    : `${report.rowCount} orders`;

  // Fee breakdown for horizontal bar — use only real computed data
  const feeData = sa?.feeBreakdown ?? [];

  // Category donut
  const categoryData = sa?.categoryBreakdown ?? skus.slice(0, 4).map(sk => ({
    category: sk.sku,
    revenue: sk.revenue,
    percentage: report.totalRevenue > 0 ? Math.round((sk.revenue / report.totalRevenue) * 100) : 0,
  }));

  // Return rate by SKU (chart: rates only; -1 = return rows with no settlement — see PDF / note)
  const returnRateAll = sa?.returnRateBySku ?? [];
  const returnOnlySkuCount = returnRateAll.filter(r => r.returnRate < 0).length;
  const returnData = returnRateAll.filter(r => r.returnRate >= 0).slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
        <div style={C.card}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>Top Product</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a14', marginBottom: 4 }}>{topSku?.sku ?? '—'}</div>
          <div style={{ fontSize: 11, color: '#6b6b5e' }}>₹{(topSku?.revenue ?? 0).toLocaleString('en-IN')} revenue</div>
        </div>
        <div style={C.card}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>Avg Order Value</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a14', lineHeight: 1, marginBottom: 4 }}>₹{avgOrderValue.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#6b6b5e' }}>{momText}</div>
        </div>
        <div style={C.card}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>Return Rate</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: parseFloat(returnRate) > 3 ? '#991b1b' : '#1a1a14', lineHeight: 1, marginBottom: 4 }}>{returnRate}%</div>
          <div style={{ fontSize: 11, color: parseFloat(returnRate) > 3 ? '#991b1b' : '#6b6b5e' }}>
            {parseFloat(returnRate) > 3 ? 'above 3% target' : 'within target'}
          </div>
        </div>
        <div style={C.card}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>Net Margin</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a14', lineHeight: 1, marginBottom: 4 }}>{netMargin}%</div>
          <div style={{ fontSize: 11, color: '#6b6b5e' }}>Fee% = {sa?.feePctOfRevenue ?? 0}%</div>
        </div>
      </div>

      {/* Profit trend + Revenue by category */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>Profit trend</div>
          {trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede4" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9a9a8e' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9a9a8e' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} width={55} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Line type="monotone" dataKey="revenue" stroke="#4a90d9" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
                <Line type="monotone" dataKey="profit" stroke="#2d5a27" strokeWidth={2} dot={{ r: 3 }} name="Profit" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9a8e' }}>No trend data</div>
          )}
        </div>

        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>Revenue by category</div>
          {categoryData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={categoryData} dataKey="revenue" nameKey="category" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {categoryData.slice(0, 5).map((d, i) => (
                  <div key={d.category} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#3a3a2e' }}>{d.category} ({d.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9a8e' }}>No data</div>
          )}
        </div>
      </div>

      {/* Fee breakdown + SKU profitability */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>Fee breakdown</div>
          {feeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={feeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede4" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9a9a8e' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: '#3a3a2e' }} width={100} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Bar dataKey="amount" fill="#e76f51" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9a8e' }}>No fee data</div>
          )}
        </div>

        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>SKU profitability</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['SKU', 'Revenue', 'Fees', 'Profit'].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: '#9a9a8e', textAlign: 'left', padding: '0 0 10px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skus.slice(0, 6).map(sk => (
                <tr key={sk.sku} style={{ borderTop: '1px solid #f0ede4' }}>
                  <td style={{ padding: '8px 0', fontSize: 12, color: '#1a1a14', fontWeight: 500 }}>{sk.sku}</td>
                  <td style={{ padding: '8px 0', fontSize: 12, color: '#3a3a2e' }}>₹{sk.revenue.toLocaleString('en-IN')}</td>
                  <td style={{ padding: '8px 0', fontSize: 12, color: '#3a3a2e' }}>₹{sk.fees.toLocaleString('en-IN')}</td>
                  <td style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, color: sk.netProfit >= 0 ? '#166534' : '#991b1b' }}>₹{sk.netProfit.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Return rate by SKU */}
      {(returnData.length > 0 || returnOnlySkuCount > 0) && (
        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>Return rate by SKU</div>
          {returnOnlySkuCount > 0 && (
            <div style={{ fontSize: 11, color: '#92400e', marginBottom: 10 }}>
              {returnOnlySkuCount} SKU(s) have return amounts with no positive settlement on file (rate N/A — shown in PDF export).
            </div>
          )}
          {returnData.length > 0 && (
          <>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={returnData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ede4" vertical={false} />
              <XAxis dataKey="sku" tick={{ fontSize: 10, fill: '#9a9a8e' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9a9a8e' }} tickFormatter={(v) => `${v}%`} width={40} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="returnRate" fill="#e76f51" radius={[4, 4, 0, 0]} name="Return %" />
            </BarChart>
          </ResponsiveContainer>
          {returnRateAll.filter(r => r.returnRate >= 0).length > 5 && (
            <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 8 }}>
              Showing top 5 SKUs by return rate. {returnRateAll.filter(r => r.returnRate >= 0).length - 5} other SKU(s) have lower return rates (e.g. {returnRateAll.filter(r => r.returnRate >= 0).slice(5).map(r => `${r.sku} ${r.returnRate.toFixed(1)}%`).join(', ')}).
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* AI Narrative */}
      <div style={{ ...C.card, background: '#fafaf5', borderColor: '#e0ddd0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2d5a27', display: 'inline-block' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#2d5a27', letterSpacing: '0.6px', textTransform: 'uppercase' }}>AI Narrative · Claude Sonnet</span>
        </div>
        <p style={{ fontSize: 13, color: '#2a2a1e', lineHeight: 1.7, margin: '0 0 12px' }}>{report.narrative}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {report.gstMismatchCount > 0 && (
            <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '4px 10px', fontWeight: 500 }}>{report.gstMismatchCount} GST mismatch(es)</span>
          )}
          {report.tcsClaimable > 0 && (
            <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '4px 10px', fontWeight: 500 }}>₹{report.tcsClaimable.toLocaleString('en-IN')} TCS claimable</span>
          )}
          {report.recoverableLeakage > 0 && (
            <span style={{ fontSize: 11, background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '4px 10px', fontWeight: 500 }}>₹{report.recoverableLeakage.toLocaleString('en-IN')} recoverable</span>
          )}
        </div>
      </div>
    </div>
  );
}
