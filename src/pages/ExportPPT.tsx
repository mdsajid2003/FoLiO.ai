import { useState } from 'react';
import { ReconciliationReport, UserProfile, Plan } from '../types';
import { generateFullReportPdf } from '../lib/export/generateFullReportPdf';

interface Props {
  report: ReconciliationReport | null;
  profile: UserProfile | null;
  getIdToken?: () => Promise<string | null>;
  onUpgraded?: (plan: Plan) => void;
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}

// ── icon SVGs ────────────────────────────────────────────────────────────────
const IconPdf = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="2" width="13" height="17" rx="2" fill="#991b1b" opacity=".15"/>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#991b1b" strokeWidth="1.6" fill="none"/>
    <polyline points="14 2 14 8 20 8" stroke="#991b1b" strokeWidth="1.6" fill="none"/>
    <line x1="8" y1="13" x2="16" y2="13" stroke="#991b1b" strokeWidth="1.4"/>
    <line x1="8" y1="17" x2="13" y2="17" stroke="#991b1b" strokeWidth="1.4"/>
    <text x="7" y="11" fontSize="4" fill="#991b1b" fontWeight="bold">PDF</text>
  </svg>
);

const IconCsv = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="2" width="13" height="17" rx="2" fill="#166534" opacity=".12"/>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#166534" strokeWidth="1.6" fill="none"/>
    <polyline points="14 2 14 8 20 8" stroke="#166534" strokeWidth="1.6" fill="none"/>
    <line x1="8" y1="12" x2="16" y2="12" stroke="#166534" strokeWidth="1.2"/>
    <line x1="8" y1="15" x2="16" y2="15" stroke="#166534" strokeWidth="1.2"/>
    <line x1="8" y1="18" x2="12" y2="18" stroke="#166534" strokeWidth="1.2"/>
  </svg>
);

const IconTax = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="#1e40af" strokeWidth="1.6" fill="#eff6ff"/>
    <path d="M9 12l2 2 4-4" stroke="#1e40af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 7v1M12 16v1" stroke="#1e40af" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconTcs = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="6" width="18" height="14" rx="2" stroke="#0369a1" strokeWidth="1.6" fill="#e0f2fe"/>
    <path d="M3 10h18" stroke="#0369a1" strokeWidth="1.4"/>
    <circle cx="8" cy="15" r="1.5" fill="#0369a1"/>
    <line x1="12" y1="14" x2="18" y2="14" stroke="#0369a1" strokeWidth="1.2"/>
    <line x1="12" y1="16.5" x2="16" y2="16.5" stroke="#0369a1" strokeWidth="1.2"/>
  </svg>
);

const IconPpt = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4" width="20" height="14" rx="2" stroke="#7c3aed" strokeWidth="1.6" fill="#f5f3ff"/>
    <rect x="6" y="8" width="5" height="6" rx="1" fill="#7c3aed" opacity=".7"/>
    <rect x="13" y="10" width="5" height="4" rx="1" fill="#7c3aed" opacity=".4"/>
    <line x1="12" y1="18" x2="12" y2="21" stroke="#7c3aed" strokeWidth="1.6"/>
    <line x1="8" y1="21" x2="16" y2="21" stroke="#7c3aed" strokeWidth="1.6"/>
  </svg>
);

export function ExportPPTPage({ report, profile: _profile, getIdToken: _getIdToken, onUpgraded: _onUpgraded }: Props) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const hasReport = !!report;

  async function downloadVisualPdf() {
    if (!report || pdfLoading) return;
    setPdfLoading(true);
    try {
      generateFullReportPdf(report);
    } catch (e) {
      console.error(e);
      alert(
        `PDF generation failed: ${e instanceof Error ? e.message : String(e)}\n\nUse CSV export as an alternative.`,
      );
    } finally {
      setPdfLoading(false);
    }
  }

  function downloadTcsSummary() {
    if (!report) return;
    const lines = [
      'FoLiOAI — TCS Claim Summary',
      `Generated: ${new Date().toLocaleDateString('en-IN')}`,
      `Platform: ${report.platform}`,
      '',
      'SUMMARY',
      `TCS Collected by Marketplace: ₹${report.tcsCollected.toLocaleString('en-IN')}`,
      `TCS Claimable (GSTR-3B Table 3d): ₹${report.tcsClaimable.toLocaleString('en-IN')}`,
      `Section: Section 52 of CGST Act, 2017`,
      `Rate: 1% on taxable value ex-GST (gross merchandise value ÷ (1 + GST rate))`,
      '',
      'HOW TO CLAIM',
      '1. Log in to the GST portal (gst.gov.in)',
      '2. Go to GSTR-3B > Table 3(d)',
      '3. Enter the TCS credit amount shown above',
      '4. Cross-verify with your GSTR-2B before filing',
      '',
      'MONTHLY BREAKDOWN',
    ];
    if (report.tcsSummary?.monthlyBreakdown) {
      lines.push('Month, Taxable Value ex-GST (₹), TCS (₹)');
      for (const m of report.tcsSummary.monthlyBreakdown) {
        lines.push(`${m.month}, ${m.taxableValue.toLocaleString('en-IN')}, ${m.tcs.toLocaleString('en-IN')}`);
      }
    }
    lines.push('', 'This is for informational purposes only. Verify all figures with your CA before filing.');
    triggerDownload(lines.join('\n'), 'text/plain', `FoLiOAI_TCS_Summary_${report.platform}_${new Date().toISOString().slice(0, 10)}.txt`);
  }

  function downloadFullCsv() {
    if (!report) return;
    const rows: (string | number)[][] = [
      ['FoLiOAI — Full Reconciliation Report'],
      ['Generated', new Date().toLocaleDateString('en-IN')],
      ['Platform', report.platform],
      ['File', report.filename],
      [''],
      ['SUMMARY'],
      ['Total Revenue (₹)', report.totalRevenue],
      ['Total Expenses (₹)', report.totalExpenses],
      ['Net Profit (₹)', report.netProfit],
      ['Recoverable Leakage (₹)', report.recoverableLeakage],
      ['TCS Claimable (₹)', report.tcsClaimable],
      ['TDS Deducted (₹)', report.tdsSummary?.totalTdsDeducted ?? 0],
      ['GST Mismatches', report.gstMismatchCount],
      ['Orders Processed', report.rowCount],
      ['Confidence', report.confidence],
      [''],
      ['LEAKAGE BREAKDOWN'],
      ['Type', 'Amount (₹)', 'Count', 'Confidence', 'Description'],
      ...(report.leakageBreakdown ?? []).map(l => [l.type, l.amount, l.count, l.confidence, l.description]),
      [''],
      ['SKU PROFITABILITY'],
      ['SKU', 'Revenue (₹)', 'Fees (₹)', 'Returns (₹)', 'Net Profit (₹)'],
      ...(report.skuProfitability ?? []).map(s => [s.sku, s.revenue, s.fees, s.returns, s.netProfit]),
      [''],
      ['MONTHLY TRENDS'],
      ['Month', 'Revenue (₹)', 'Expenses (₹)', 'Profit (₹)', 'Leakage (₹)', 'Fee %', 'Orders'],
      ...(report.monthlyTrends ?? []).map(m => [m.month, m.revenue, m.expenses, m.profit, m.leakage, m.feePercent, m.orderCount]),
    ];
    if ((report.orderRecon ?? []).length > 0) {
      rows.push([''], ['ORDER RECONCILIATION'], ['Order ID', 'Product', 'MTR Gross (₹)', 'Settlement (₹)', 'Gap (₹)', 'Reason']);
      for (const o of report.orderRecon ?? []) {
        rows.push([o.orderId, o.product, o.mtrGross, o.settlement, o.gap, o.reason]);
      }
    }
    rows.push([''], ['This report is for informational purposes only. Consult a CA for advice.']);
    const csv = rows.map(r => r.map(cell => {
      const str = String(cell);
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\n');
    triggerDownload(csv, 'text/csv;charset=utf-8', `FoLiOAI_Report_${report.platform}_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function downloadTaxSummary() {
    if (!report) return;
    const lines = [
      'FoLiOAI — Tax Summary',
      `Generated: ${new Date().toLocaleDateString('en-IN')}`,
      `Platform: ${report.platform}`,
      '',
    ];
    if (report.gstSummary) {
      const g = report.gstSummary;
      lines.push(
        'GST SUMMARY',
        `Total Output Tax: ₹${g.totalOutputTax.toLocaleString('en-IN')}`,
        `Total ITC Eligible: ₹${g.itcEligible.toLocaleString('en-IN')}`,
        `Net GST Liability: ₹${g.netGstLiability.toLocaleString('en-IN')}`,
        `IGST: ₹${g.igstAmount.toLocaleString('en-IN')} | CGST: ₹${g.cgstAmount.toLocaleString('en-IN')} | SGST: ₹${g.sgstAmount.toLocaleString('en-IN')}`,
        '',
        'Rate Breakdown:',
      );
      for (const r of g.rateBreakdown) {
        lines.push(`  ${r.rate}% — Taxable: ₹${r.taxableValue.toLocaleString('en-IN')}, Tax: ₹${r.tax.toLocaleString('en-IN')} (${r.count} items)`);
      }
      lines.push('');
    }
    if (report.tcsSummary) {
      lines.push(
        'TCS SUMMARY',
        `Total TCS Collected: ₹${report.tcsSummary.totalTcsCollected.toLocaleString('en-IN')}`,
        `Claimable via GSTR-3B Table 3(d): ₹${report.tcsSummary.totalTcsClaimable.toLocaleString('en-IN')}`,
        `Section: ${report.tcsSummary.section}`,
        '',
      );
    }
    if (report.tdsSummary) {
      lines.push(
        'TDS SUMMARY',
        `Total TDS Deducted: ₹${report.tdsSummary.totalTdsDeducted.toLocaleString('en-IN')}`,
        `Claimable: ₹${report.tdsSummary.totalTdsClaimable.toLocaleString('en-IN')}`,
        `Section: ${report.tdsSummary.section}`,
        `Verify against: ${report.tdsSummary.form26asReference}`,
        '',
      );
    }
    if (report.incomeTaxEstimate) {
      const it = report.incomeTaxEstimate;
      lines.push(
        'INCOME TAX ESTIMATE',
        `Gross Revenue: ₹${it.grossRevenue.toLocaleString('en-IN')}`,
        `Net Profit: ₹${it.netProfit.toLocaleString('en-IN')}`,
        `Estimated Tax: ₹${it.estimatedTax.toLocaleString('en-IN')}`,
        `After TCS + TDS Credit: ₹${it.netTaxPayable.toLocaleString('en-IN')}`,
        `Recommended: ${it.recommendedScheme === 'presumptive_44AD' ? 'Section 44AD Presumptive' : 'Actual Books'}`,
        `ITR Form: ${it.itrForm}`,
        '',
      );
    }
    lines.push('This is for informational purposes only. Consult a CA before filing any tax returns.');
    triggerDownload(lines.join('\n'), 'text/plain', `FoLiOAI_Tax_Summary_${report.platform}_${new Date().toISOString().slice(0, 10)}.txt`);
  }

  function triggerDownload(content: string, mimeType: string, filename: string) {
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── stat cards from report ──────────────────────────────────────────────────
  const stats = hasReport ? [
    { label: 'Net Revenue', value: fmt(report!.totalRevenue), color: '#166534', bg: '#f0fdf4' },
    { label: 'Net Profit', value: fmt(report!.netProfit), color: report!.netProfit >= 0 ? '#166534' : '#991b1b', bg: report!.netProfit >= 0 ? '#f0fdf4' : '#fef2f2' },
    { label: 'Recoverable Leakage', value: fmt(report!.recoverableLeakage), color: '#991b1b', bg: '#fef2f2' },
    { label: 'TCS Claimable', value: fmt(report!.tcsClaimable), color: '#1e40af', bg: '#eff6ff' },
  ] : [];

  // ── export cards ────────────────────────────────────────────────────────────
  const exports = [
    {
      icon: <IconPdf />,
      title: 'Full Visual PDF Report',
      subtitle: 'Best for CAs & investors',
      desc: hasReport
        ? `${report!.rowCount} orders · Revenue · Leakage · GST · TDS · TCS · Income Tax · Charts`
        : 'Upload a settlement file to enable.',
      badge: pdfLoading ? 'Generating…' : 'Download PDF',
      accent: '#991b1b',
      accentBg: '#fef2f2',
      disabled: !hasReport || pdfLoading,
      action: downloadVisualPdf,
      highlight: true,
    },
    {
      icon: <IconCsv />,
      title: 'Full Reconciliation CSV',
      subtitle: 'Raw data for Excel / Sheets',
      desc: hasReport
        ? `${report!.rowCount} orders · SKU profitability · Monthly trends · Leakage breakdown`
        : 'Upload a settlement file to enable.',
      badge: 'Download CSV',
      accent: '#166534',
      accentBg: '#f0fdf4',
      disabled: !hasReport,
      action: downloadFullCsv,
    },
    {
      icon: <IconTcs />,
      title: 'TCS Claim Summary',
      subtitle: 'Ready for GSTR-3B Table 3(d)',
      desc: hasReport
        ? `${fmt(report!.tcsClaimable)} claimable · Monthly breakdown · Step-by-step filing guide`
        : 'Upload a settlement file to enable.',
      badge: 'Download TXT',
      accent: '#0369a1',
      accentBg: '#e0f2fe',
      disabled: !hasReport,
      action: downloadTcsSummary,
    },
    {
      icon: <IconTax />,
      title: 'Tax Summary (GST + TCS + TDS + IT)',
      subtitle: 'CA-ready consolidated statement',
      desc: hasReport
        ? 'GST output/ITC · TCS/TDS credits · Income tax estimate · GSTR-1/3B filing pointers'
        : 'Upload a settlement file to enable.',
      badge: 'Download TXT',
      accent: '#1e40af',
      accentBg: '#eff6ff',
      disabled: !hasReport,
      action: downloadTaxSummary,
    },
    {
      icon: <IconPpt />,
      title: 'CA-Ready PPT Presentation',
      subtitle: 'Executive-grade slide deck',
      desc: 'Board-ready presentation with executive summary, leakage map, recovery plan, and tax snapshot.',
      badge: 'Coming Soon',
      accent: '#7c3aed',
      accentBg: '#f5f3ff',
      disabled: true,
      action: () => {},
    },
  ];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 4px' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #16221c 0%, #1a3326 60%, #22543d 100%)',
        borderRadius: 14,
        padding: '24px 24px 20px',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* decorative circle */}
        <div style={{
          position: 'absolute', right: -30, top: -30,
          width: 130, height: 130, borderRadius: '50%',
          background: 'rgba(74,222,128,0.07)',
          pointerEvents: 'none',
        }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#4ade80', textTransform: 'uppercase', marginBottom: 8 }}>
          Export Centre
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
          Download Your Analysis
        </div>
        <div style={{ fontSize: 13, color: '#86efac', lineHeight: 1.5 }}>
          CA-grade PDF reports, tax summaries, and raw data — everything your accountant needs.
        </div>

        {/* stat row */}
        {hasReport && (
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            {stats.map(s => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '8px 14px',
                minWidth: 120,
              }}>
                <div style={{ fontSize: 10, color: '#86efac', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Export cards ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {exports.map((opt) => (
          <div
            key={opt.title}
            style={{
              background: '#fff',
              border: opt.highlight && !opt.disabled ? `1.5px solid ${opt.accent}` : '1px solid #e8e5dc',
              borderRadius: 12,
              padding: '16px 18px',
              opacity: opt.disabled && !opt.highlight ? 0.6 : 1,
              transition: 'box-shadow 0.15s',
              boxShadow: opt.highlight && !opt.disabled ? `0 2px 16px ${opt.accent}22` : '0 1px 4px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
            }}
          >
            {/* icon badge */}
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: opt.accentBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}>
              {opt.icon}
            </div>

            {/* text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a14' }}>{opt.title}</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: opt.accent,
                  background: opt.accentBg,
                  padding: '2px 8px',
                  borderRadius: 20,
                  border: `1px solid ${opt.accent}33`,
                }}>
                  {opt.subtitle}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6b6b5e', lineHeight: 1.5, marginBottom: 10 }}>
                {opt.desc}
              </div>
              <button
                onClick={opt.disabled ? undefined : opt.action}
                disabled={opt.disabled}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '7px 18px',
                  borderRadius: 7,
                  border: opt.disabled ? '1px solid #e0ddd5' : `1.5px solid ${opt.accent}`,
                  background: opt.disabled ? '#f5f4f0' : opt.highlight ? opt.accent : opt.accentBg,
                  color: opt.disabled ? '#aaa' : opt.highlight ? '#fff' : opt.accent,
                  cursor: opt.disabled ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.02em',
                  transition: 'opacity 0.1s',
                }}
              >
                {opt.badge}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Primary CTA strip ──────────────────────────────────────────── */}
      {hasReport && (
        <div style={{
          marginTop: 20,
          background: 'linear-gradient(135deg, #16221c, #1a3326)',
          borderRadius: 12,
          padding: '18px 20px',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>
              Ready to share with your CA?
            </div>
            <div style={{ fontSize: 12, color: '#86efac' }}>
              Download the full PDF — charts, tax, reconciliation all in one file.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={downloadVisualPdf}
              disabled={pdfLoading}
              style={{
                background: pdfLoading ? '#2d4a39' : '#4ade80',
                color: '#16221c',
                border: 'none',
                borderRadius: 8,
                padding: '11px 22px',
                fontSize: 13,
                fontWeight: 700,
                cursor: pdfLoading ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {pdfLoading ? 'Building PDF…' : 'Download PDF Report'}
            </button>
            <button
              type="button"
              onClick={downloadFullCsv}
              style={{
                background: 'transparent',
                color: '#86efac',
                border: '1.5px solid #4ade8044',
                borderRadius: 8,
                padding: '11px 22px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Download CSV
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!hasReport && (
        <div style={{
          textAlign: 'center',
          marginTop: 24,
          padding: '28px 20px',
          background: '#fafaf7',
          borderRadius: 12,
          border: '1px dashed #d4d0c8',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a14', marginBottom: 6 }}>
            No report loaded yet
          </div>
          <div style={{ fontSize: 12, color: '#7a7870' }}>
            Upload a settlement file from the Upload tab to unlock all export options.
          </div>
        </div>
      )}

      {/* ── Disclaimer ────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 16,
        padding: '10px 14px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 8,
        fontSize: 11,
        color: '#92400e',
        lineHeight: 1.55,
      }}>
        <strong>Disclaimer:</strong> All exports are for informational purposes only. Verify all tax figures with GSTR-2B, Form 26AS, and a qualified Chartered Accountant before filing or making business decisions.
      </div>
    </div>
  );
}
