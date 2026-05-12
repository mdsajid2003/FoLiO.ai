import { useState, type CSSProperties } from 'react';
import { ReconciliationReport } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface Props {
  report: ReconciliationReport | null;
}

const C = {
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e8e5dc', padding: '18px 20px' } as CSSProperties,
};

const TAX_COLORS = ['#2d5a27', '#4a90d9', '#e9c46a', '#e76f51'];

export function TaxSummaryPage({ report }: Props) {
  const [entityType, setEntityType] = useState<'individual' | 'huf' | 'partnership' | 'company_llp'>('individual');
  const is44ADEligible = entityType !== 'company_llp';

  if (!report) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#9a9a8e', fontSize: 13 }}>
        Upload a file to see tax summary.
      </div>
    );
  }

  const tcs = report.tcsSummary;
  const tds = report.tdsSummary;
  const gst = report.gstSummary;
  const itax = report.incomeTaxEstimate;

  // Tax liability pie chart
  const taxPieData = [
    { name: 'GST', value: gst?.netGstLiability ?? 0 },
    { name: 'TCS', value: tcs?.totalTcsCollected ?? report.tcsCollected },
    { name: 'TDS', value: tds?.totalTdsDeducted ?? 0 },
    { name: 'Income Tax', value: itax?.netTaxPayable ?? 0 },
  ].filter(d => d.value > 0);

  // Advance tax schedule
  const advanceSchedule = itax?.advanceTaxSchedule ?? [];

  // GST rate breakdown
  const rateBreakdown = gst?.rateBreakdown ?? [];
  const reliabilityNotes = [
    gst?.reliability ? { label: 'GST summary', note: formatReliability(gst.reliability) } : null,
    tcs?.reliability ? { label: 'TCS summary', note: formatReliability(tcs.reliability) } : null,
    tds?.reliability ? { label: 'TDS summary', note: formatReliability(tds.reliability) } : null,
    itax?.reliability ? { label: 'Income tax estimate', note: formatReliability(itax.reliability) } : null,
  ].filter(Boolean) as { label: string; note: string }[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {reliabilityNotes.length > 0 && (
        <div style={{ ...C.card, background: '#fffbeb', borderColor: '#fcd34d' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>Assumptions and limitations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reliabilityNotes.map(item => (
              <div key={item.label} style={{ fontSize: 12, color: '#78350f', lineHeight: 1.55 }}>
                <strong>{item.label}:</strong> {item.note}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hero cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
        <div style={{ ...C.card, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#166534', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>TCS Claimable</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a14', lineHeight: 1 }}>₹{(tcs?.totalTcsClaimable ?? report.tcsClaimable).toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#4a7a5e', marginTop: 6 }}>GSTR-3B Table 3(d)</div>
        </div>
        <div style={{ ...C.card, background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#1e40af', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>TDS Deducted</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a14', lineHeight: 1 }}>₹{(tds?.totalTdsDeducted ?? 0).toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 6 }}>Section 194-O · Form 26AS</div>
        </div>
        <div style={{ ...C.card, background: '#fefce8', borderColor: '#fde68a' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#92400e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>GST Liability</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a14', lineHeight: 1 }}>₹{(gst?.netGstLiability ?? 0).toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#b45309', marginTop: 6 }}>Output ₹{(gst?.totalOutputTax ?? 0).toLocaleString('en-IN')} − ITC ₹{(gst?.itcEligible ?? 0).toLocaleString('en-IN')} (estimate)</div>
        </div>
        <div style={C.card}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9a9a8e', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>Income Tax Est.</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a14', lineHeight: 1 }}>₹{(itax?.netTaxPayable ?? 0).toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: '#6b6b5e', marginTop: 6 }}>{itax?.itrForm ?? 'ITR-4'} · {itax?.regime === 'new' ? 'New Regime' : 'Old Regime'} · advisory</div>
        </div>
      </div>

      {gst && (gst.itcFromAmazonFees ?? 0) > 0 && (
        <div style={{ ...C.card, background: '#f0fdf4', borderColor: '#86efac' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#166534', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>
            Amazon fee GST (ITC claimable)
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#14532d', lineHeight: 1 }}>
            ₹{gst.itcFromAmazonFees.toLocaleString('en-IN')}
            {gst.itcIsEstimated && (
              <span style={{ color: '#e07b00', fontSize: 11, fontWeight: 600, marginLeft: 6 }}>
                ⚠ Estimated — verify against GSTR-2B before filing
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#15803d', marginTop: 8, lineHeight: 1.55 }}>
            18% GST on referral, FBA, storage, and other fees — claim in <strong>GSTR-3B Table 4(A)(5)</strong>. Cross-check Amazon tax invoices and GSTR-2B before filing.
          </div>
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#ecfdf5', borderRadius: 8, fontSize: 11, color: '#166534', lineHeight: 1.55 }}>
            ITC figures are computed from settlement fees × 18%. Always verify against Amazon’s GST invoice and GSTR-2B before filing.
          </div>
        </div>
      )}

      {/* Tax pie + Advance tax schedule */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 16 }}>Tax liability split</div>
          {taxPieData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={taxPieData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                    {taxPieData.map((_, i) => <Cell key={i} fill={TAX_COLORS[i % TAX_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {taxPieData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: TAX_COLORS[i % TAX_COLORS.length] }} />
                    <span style={{ fontSize: 12, color: '#3a3a2e' }}>{d.name}: ₹{d.value.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#9a9a8e' }}>No tax data available.</div>
          )}
        </div>

        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>Advance tax schedule</div>
          {advanceSchedule.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {advanceSchedule.map((s, i) => (
                <div key={s.dueDate} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < advanceSchedule.length - 1 ? '1px solid #f0ede4' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a14' }}>{s.dueDate}</div>
                    <div style={{ fontSize: 10, color: '#9a9a8e' }}>{s.percentage}% cumulative</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14' }}>₹{s.amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#9a9a8e' }}>No income tax estimate available.</div>
          )}
        </div>
      </div>

      {/* GST breakdown + IGST/CGST split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>GST rate breakdown</div>
          {rateBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={rateBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede4" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9a9a8e' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="rate" tick={{ fontSize: 11, fill: '#3a3a2e' }} tickFormatter={(v) => `${v}%`} width={40} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Bar dataKey="tax" fill="#2d5a27" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ fontSize: 12, color: '#9a9a8e' }}>No GST data available.</div>
          )}
        </div>

        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>IGST vs CGST+SGST</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f2ea', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: '#3a3a2e' }}>IGST (interstate)</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14' }}>₹{(gst?.igstAmount ?? 0).toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f2ea', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: '#3a3a2e' }}>CGST (intrastate)</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14' }}>₹{(gst?.cgstAmount ?? 0).toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f5f2ea', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: '#3a3a2e' }}>SGST (intrastate)</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14' }}>₹{(gst?.sgstAmount ?? 0).toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#dcfce7', borderRadius: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>ITC eligible</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>₹{(gst?.itcEligible ?? 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Entity type selector for 44AD eligibility */}
      {itax && (
        <div style={{ ...C.card, marginBottom: -4 }}>
          <div style={{ fontSize: 12, color: '#6b6b5e', marginBottom: 8 }}>
            Entity type — affects Section 44AD eligibility
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {(['individual', 'huf', 'partnership', 'company_llp'] as const).map(t => (
              <button
                key={t}
                onClick={() => setEntityType(t)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1px solid',
                  fontSize: 12,
                  cursor: 'pointer',
                  borderColor: entityType === t ? '#2d5a27' : '#e8e5dc',
                  background: entityType === t ? '#f0fdf4' : '#fff',
                  color: entityType === t ? '#166534' : '#6b6b5e',
                  fontWeight: entityType === t ? 600 : 400,
                }}
              >
                {t === 'company_llp' ? 'Company / LLP' : t.toUpperCase()}
              </button>
            ))}
          </div>
          {!is44ADEligible && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '6px 10px', borderRadius: 6 }}>
              Companies and LLPs cannot opt for Section 44AD presumptive taxation. Tax must be computed on actual profit.
            </div>
          )}
        </div>
      )}

      {/* Income tax details */}
      {itax && (
        <div style={C.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>
            Income tax estimate{itax.financialYear ? ` · ${itax.financialYear}` : ' (FY 2025-26)'} · New Regime
          </div>
          {itax.taxAuditRequired && itax.taxAuditReason && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#991b1b', lineHeight: 1.6 }}>
              ⚠️ {itax.taxAuditReason}
            </div>
          )}
          {itax.complianceFlags && itax.complianceFlags.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              {itax.complianceFlags.map((flag, i) => (
                <div key={i} style={{ fontSize: 11.5, color: '#78350f', lineHeight: 1.6 }}>{flag}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Row label="Gross Revenue" value={`₹${itax.grossRevenue.toLocaleString('en-IN')}`} />
                <Row label="Total Expenses" value={`₹${itax.totalExpenses.toLocaleString('en-IN')}`} />
                <Row label="Net Profit (actual)" value={`₹${itax.netProfit.toLocaleString('en-IN')}`} bold />
                <div style={{ height: 1, background: '#f0ede4', margin: '4px 0' }} />
                <Row label="Presumptive (6%)" value={`₹${itax.presumptiveIncome6Pct.toLocaleString('en-IN')}`} />
                <Row label="Tax on actual" value={`₹${itax.taxOnActual.toLocaleString('en-IN')}`} />
                <Row label="Tax on presumptive" value={`₹${itax.taxOnPresumptive.toLocaleString('en-IN')}`} />
                <div style={{ height: 1, background: '#f0ede4', margin: '4px 0' }} />
                {is44ADEligible ? (
                  <Row label="Recommended" value={itax.recommendedScheme === 'presumptive_44AD' ? 'Section 44AD (presumptive)' : 'Actual computation'} highlight />
                ) : (
                  <Row label="44AD eligibility" value="Not applicable — Company/LLP cannot opt for 44AD" highlight />
                )}
                <Row label="TCS credit" value={`-₹${itax.tcsCredit.toLocaleString('en-IN')}`} green />
                <Row label="TDS credit" value={`-₹${itax.tdsCredit.toLocaleString('en-IN')}`} green />
                <Row label="Net tax payable" value={`₹${itax.netTaxPayable.toLocaleString('en-IN')}`} bold />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3a3a2e', marginBottom: 10 }}>Slab breakdown</div>
              {(itax.slabBreakdown ?? []).map(s => (
                <div key={s.slab} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f2ea' }}>
                  <span style={{ fontSize: 11.5, color: '#6b6b5e' }}>{s.slab} @ {s.rate}%</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#1a1a14' }}>₹{s.tax.toLocaleString('en-IN')}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#eff6ff', borderRadius: 6, fontSize: 11, color: '#1e40af' }}>
                File using <strong>{itax.itrForm}</strong> only after CA review of deductions, 44AD eligibility, and credits.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GSTR pointers */}
      {gst && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={C.card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a14', marginBottom: 10 }}>GSTR-1 filing pointers</div>
            {(gst.gstr1Pointers ?? []).map((p, i) => (
              <div key={i} style={{ fontSize: 11.5, color: '#3a3a2e', padding: '6px 0', borderBottom: i < (gst.gstr1Pointers ?? []).length - 1 ? '1px solid #f5f2ea' : 'none', lineHeight: 1.5 }}>
                {p}
              </div>
            ))}
          </div>
          <div style={C.card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a14', marginBottom: 10 }}>GSTR-3B filing pointers</div>
            {(gst.gstr3bPointers ?? []).map((p, i) => (
              <div key={i} style={{ fontSize: 11.5, color: '#3a3a2e', padding: '6px 0', borderBottom: i < (gst.gstr3bPointers ?? []).length - 1 ? '1px solid #f5f2ea' : 'none', lineHeight: 1.5 }}>
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next steps */}
      <div style={C.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>Next steps</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.gstMismatchCount > 0 && (
            <div style={{ fontSize: 12, color: '#92400e', padding: '8px 12px', background: '#fef3c7', borderRadius: 6, lineHeight: 1.5 }}>
              {report.gstMismatchCount} GST mismatch(es) found — review rate accuracy in GSTR-1 before filing
            </div>
          )}
          {(tcs?.totalTcsClaimable ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: '#166534', padding: '8px 12px', background: '#dcfce7', borderRadius: 6, lineHeight: 1.5 }}>
              Claim ₹{(tcs?.totalTcsClaimable ?? 0).toLocaleString('en-IN')} TCS credit in GSTR-3B Table 3(d)
            </div>
          )}
          {(tds?.totalTdsDeducted ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: '#1e40af', padding: '8px 12px', background: '#dbeafe', borderRadius: 6, lineHeight: 1.5 }}>
              Verify ₹{(tds?.totalTdsDeducted ?? 0).toLocaleString('en-IN')} TDS in Form 26AS / AIS
            </div>
          )}
          <div style={{ fontSize: 11, color: '#6b6b5e', padding: '6px 0', fontStyle: 'italic' }}>
            Share this page with your CA for filing reference
          </div>
        </div>
      </div>

      {/* Filing Checklist */}
      <div style={C.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a14', marginBottom: 14 }}>Filing Checklist</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: '#3a3a2e', lineHeight: 1.6 }}>
          <CheckItem label="GSTR-1: File by 11th of next month (outward supplies)" applicable />
          <CheckItem label="GSTR-3B: File by 20th of next month (monthly summary)" applicable />
          {(tcs?.totalTcsClaimable ?? 0) > 0 && (
            <CheckItem
              label={`TCS credit (₹${(tcs!.totalTcsClaimable).toLocaleString('en-IN')}): Claim in GSTR-3B Table 3(d)`}
              applicable
            />
          )}
          {(tds?.totalTdsDeducted ?? 0) > 0 && (
            <CheckItem
              label={`TDS credit (₹${(tds!.totalTdsDeducted).toLocaleString('en-IN')}): Reflect in Form 26AS — claim while filing ITR`}
              applicable
            />
          )}
          {(itax?.netTaxPayable ?? 0) > 10000 && (
            <CheckItem
              label={`Advance tax (net tax ₹${(itax!.netTaxPayable).toLocaleString('en-IN')} > ₹10,000): Due Jun 15 / Sep 15 / Dec 15 / Mar 15`}
              applicable
            />
          )}
          <CheckItem
            label="ITR-3 / ITR-4: Due 31 July (non-audit) / 31 Oct (audit — turnover > ₹1 Cr)"
            applicable
          />
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: '#9a9a8e', fontStyle: 'italic' }}>
          Consult your CA before filing. This checklist is indicative only.
        </div>
      </div>
    </div>
  );
}

function CheckItem({ label, applicable }: { label: string; applicable: boolean }) {
  const [checked, setChecked] = useState(false);
  if (!applicable) return null;
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => setChecked(e.target.checked)}
        style={{ marginTop: 2, flexShrink: 0, accentColor: '#2d5a27' }}
      />
      <span style={{ textDecoration: checked ? 'line-through' : 'none', color: checked ? '#9a9a8e' : '#3a3a2e' }}>
        {label}
      </span>
    </label>
  );
}

function Row({ label, value, bold, highlight, green }: { label: string; value: string; bold?: boolean; highlight?: boolean; green?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11.5, color: highlight ? '#2d5a27' : '#6b6b5e', fontWeight: highlight ? 600 : 400 }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: bold ? 700 : 500, color: green ? '#166534' : highlight ? '#2d5a27' : '#1a1a14' }}>{value}</span>
    </div>
  );
}

function formatReliability(meta: NonNullable<ReconciliationReport['gstSummary']>['reliability']) {
  if (!meta) return '';
  const assumptionsList = meta.assumptions ?? [];
  const assumptions = assumptionsList.length > 0 ? ` Assumptions: ${assumptionsList.join(' | ')}` : '';
  return `${meta.classification.replace(/_/g, ' ')} · confidence ${meta.confidence} · source ${meta.source}.${assumptions}`;
}

