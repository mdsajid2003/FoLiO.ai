import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { computeProfitBreakdown, simulatePriceRange } from '../lib/reconcile/profit-engine';

const CATS = ['default', 'electronics', 'clothing', 'books', 'home', 'beauty', 'sports', 'toys'] as const;

export function ProfitSimulatorPage() {
  const [price, setPrice] = useState(999);
  const [cost, setCost] = useState(400);
  const [gstRate, setGstRate] = useState(18);
  const [category, setCategory] = useState<string>('default');
  const [weightKg, setWeightKg] = useState(0.5);
  const [isFBA, setIsFBA] = useState(true);

  const breakdown = useMemo(
    () => computeProfitBreakdown({
      sellingPrice: price,
      costOfGoods: cost,
      gstRate,
      category,
      weightKg,
      isFBA,
    }),
    [price, cost, gstRate, category, weightKg, isFBA],
  );

  const sim = useMemo(
    () => simulatePriceRange({ costOfGoods: cost, gstRate, category, weightKg, isFBA }, 400, 2000, 50),
    [cost, gstRate, category, weightKg, isFBA],
  );

  const chartData = sim.map(s => ({ price: s.price, margin: s.marginPct }));

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a14' }}>Profit simulator</div>
      <p style={{ fontSize: 12, color: '#6b6b5e', margin: 0 }}>
        Estimates referral (category), FBA weight fee, 18% GST on fees (ITC), 1% TCS, 0.1% TDS — verify against live fee schedules.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <label style={{ fontSize: 11, color: '#6b6b5e' }}>Selling price ₹
          <input type="number" value={price} onChange={e => setPrice(Number(e.target.value) || 0)} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #dbd8cf' }} />
        </label>
        <label style={{ fontSize: 11, color: '#6b6b5e' }}>Cost of goods ₹
          <input type="number" value={cost} onChange={e => setCost(Number(e.target.value) || 0)} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #dbd8cf' }} />
        </label>
        <label style={{ fontSize: 11, color: '#6b6b5e' }}>GST %
          <select value={gstRate} onChange={e => setGstRate(Number(e.target.value))} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #dbd8cf' }}>
            {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11, color: '#6b6b5e' }}>Category
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #dbd8cf' }}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11, color: '#6b6b5e' }}>Weight (kg)
          <input type="number" step={0.1} value={weightKg} onChange={e => setWeightKg(Number(e.target.value) || 0)} style={{ width: '100%', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #dbd8cf' }} />
        </label>
        <label style={{ fontSize: 11, color: '#6b6b5e', display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
          <input type="checkbox" checked={isFBA} onChange={e => setIsFBA(e.target.checked)} /> FBA
        </label>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Breakdown</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
          {([
            ['Net profit', breakdown.netProfit, breakdown.netProfit >= 0 ? '#166534' : '#991b1b'],
            ['Margin %', breakdown.profitMarginPct, breakdown.profitMarginPct >= 0 ? '#166534' : '#991b1b'],
            ['Referral', -breakdown.referralFee, '#991b1b'],
            ['FBA', -breakdown.fbaFee, '#991b1b'],
            ['TCS', -breakdown.tcsDeducted, '#991b1b'],
          ] as [string, number, string][]).map(([k, v, col]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', color: '#3a3a2e' }}>
              <span>{k}</span>
              <span style={{ color: col, fontWeight: 600 }}>{v.toFixed(2)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3a3a2e' }}>
            <span>
              TDS
              <span title="TDS @ 0.1% (Sec 194-O) on GST-inclusive price — matches Amazon's actual deduction in Form 26AS. Your CA may calculate this on ex-GST value." style={{ cursor: 'help', marginLeft: 4, color: '#6b6b5e', fontSize: 10 }}>ⓘ</span>
            </span>
            <span style={{ color: '#991b1b', fontWeight: 600 }}>{(-breakdown.tdsDeducted).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3a3a2e' }}>
            <span>GST on fees (ITC)</span>
            <span style={{ color: '#166534', fontWeight: 600 }}>{breakdown.gstOnFees.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3a3a2e' }}>
            <span>Breakeven price</span>
            {breakdown.breakeven === -1
              ? <span style={{ color: '#dc2626', fontWeight: 600 }}>N/A — not viable at any price</span>
              : <span style={{ color: '#92400e', fontWeight: 600 }}>₹{breakdown.breakeven.toFixed(2)}</span>
            }
          </div>
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: '#4a4a3e' }}>{breakdown.recommendation}</p>
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: 12, height: 280 }}>
        <div style={{ fontSize: 11, color: '#6b6b5e', marginBottom: 6 }}>Margin % vs price (₹400–₹2000)</div>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ece8dd" />
            <XAxis dataKey="price" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
            {breakdown.breakeven !== -1 && <ReferenceLine x={breakdown.breakeven} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Breakeven', fontSize: 10, fill: '#92400e' }} />}
            <Line type="monotone" dataKey="margin" stroke="#2d5a27" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
