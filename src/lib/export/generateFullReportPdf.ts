import { jsPDF } from 'jspdf';
import type { ReconciliationReport } from '../../types/index.ts';

// ─── helpers ─────────────────────────────────────────────────────────────────

const W = 210;       // A4 width mm
const H = 297;       // A4 height mm
const ML = 14;       // left margin
const MR = 14;       // right margin
const BODY = W - ML - MR;   // usable width

type RGB = [number, number, number];

const CLR = {
  green:    [45, 90, 39]   as RGB,
  greenBg:  [240, 253, 244] as RGB,
  red:      [153, 27, 27]  as RGB,
  redBg:    [254, 226, 226] as RGB,
  blue:     [30, 64, 175]  as RGB,
  blueBg:   [239, 246, 255] as RGB,
  amber:    [146, 64, 14]  as RGB,
  amberBg:  [254, 243, 199] as RGB,
  ink:      [26, 26, 20]   as RGB,
  muted:    [107, 107, 94] as RGB,
  border:   [232, 229, 220] as RGB,
  bg:       [250, 250, 245] as RGB,
  white:    [255, 255, 255] as RGB,
  barA:     [45,  90,  39]  as RGB,
  barB:     [74, 144, 217]  as RGB,
  barC:     [233, 196, 106] as RGB,
  barD:     [231, 111, 81]  as RGB,
  barE:     [154, 154, 142] as RGB,
};

function fill(pdf: jsPDF, c: RGB) { pdf.setFillColor(c[0], c[1], c[2]); }
function stroke(pdf: jsPDF, c: RGB) { pdf.setDrawColor(c[0], c[1], c[2]); }
function textc(pdf: jsPDF, c: RGB) { pdf.setTextColor(c[0], c[1], c[2]); }
function inr(n: number) { return 'Rs.' + n.toLocaleString('en-IN'); }
/** Inr with sign preserved (for waterfall / signed amounts in PDF). */
function signedInr(n: number): string {
  const sign = n < 0 ? '-' : '';
  return safe(sign + 'Rs.' + Math.abs(n).toLocaleString('en-IN'));
}
function cap(s: string) { return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); }
function trunc(s: string, max: number) { return s.length > max ? s.slice(0, max - 1) + '...' : s; }

/** Strip / replace characters outside Windows-1252 (Latin-1 extended) so jsPDF doesn't garble text */
function safe(s: string): string {
  return s
    .replace(/\u20b9/g, 'Rs.')    // ₹
    .replace(/\u2192/g, '->')     // →
    .replace(/\u2190/g, '<-')     // ←
    .replace(/\u2013/g, '-')      // en dash
    .replace(/\u2014/g, '--')     // em dash
    .replace(/\u2018|\u2019/g, "'") // curly single quotes
    .replace(/\u201c|\u201d/g, '"') // curly double quotes
    .replace(/\u2026/g, '...')    // ellipsis
    .replace(/\u26a0/g, '[!]')    // ⚠
    .replace(/\u2022/g, '*')      // bullet •
    .replace(/\u00b7/g, '·')      // middle dot (keep, it's Latin-1)
    .replace(/[^\x00-\xff]/g, '?'); // anything else outside Latin-1
}

// ─── page state ──────────────────────────────────────────────────────────────

class Ctx {
  pdf: jsPDF;
  y = 18;

  constructor() {
    this.pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  }

  addPage() {
    this.pdf.addPage();
    this.y = 18;
  }

  maybeNewPage(needed = 20) {
    if (this.y + needed > H - 14) this.addPage();
  }

  // thin horizontal rule
  rule(color: RGB = CLR.border) {
    stroke(this.pdf, color);
    this.pdf.setLineWidth(0.2);
    this.pdf.line(ML, this.y, W - MR, this.y);
    this.y += 3;
  }

  // section header — dark banner with left accent stripe
  sectionTitle(label: string) {
    this.maybeNewPage(16);
    // dark bg
    fill(this.pdf, [22, 34, 28] as RGB);
    this.pdf.roundedRect(ML, this.y, BODY, 9, 2, 2, 'F');
    // left accent stripe
    fill(this.pdf, CLR.green);
    this.pdf.roundedRect(ML, this.y, 3, 9, 1.5, 1.5, 'F');
    textc(this.pdf, [220, 245, 225] as RGB);
    this.pdf.setFontSize(8.5);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text(safe(label.toUpperCase()), ML + 6, this.y + 6.1);
    this.y += 13;
    this.pdf.setFont('helvetica', 'normal');
  }

  // small label + value pair in a box
  kv(label: string, value: string, bx: number, bw: number, bgColor?: RGB) {
    const by = this.y;
    fill(this.pdf, bgColor ?? CLR.bg);
    stroke(this.pdf, CLR.border);
    this.pdf.setLineWidth(0.3);
    this.pdf.roundedRect(bx, by, bw, 14, 2, 2, 'FD');
    textc(this.pdf, CLR.muted);
    this.pdf.setFontSize(6.5);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.text(safe(label), bx + 3, by + 4.5);
    textc(this.pdf, CLR.ink);
    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text(safe(trunc(value, 22)), bx + 3, by + 11.5);
  }

  // 4-column KV row; advances y by 17
  kvRow(items: [string, string, RGB?][]) {
    this.maybeNewPage(20);
    const w = (BODY - 3) / items.length;
    items.forEach(([l, v, bg], i) => this.kv(l, v, ML + i * (w + 1), w, bg));
    this.y += 17;
  }

  // simple body text
  body(text: string, color: RGB = CLR.ink) {
    this.maybeNewPage(10);
    this.pdf.setFontSize(8);
    this.pdf.setFont('helvetica', 'normal');
    textc(this.pdf, color);
    const lines = this.pdf.splitTextToSize(safe(text), BODY) as string[];
    this.pdf.text(lines, ML, this.y);
    this.y += lines.length * 4 + 2;
  }

  gap(n = 3) { this.y += n; }
}

// ─── chart helpers ────────────────────────────────────────────────────────────

/** Vertical bar chart. Returns height consumed. */
function vBarChart(
  ctx: Ctx,
  data: { label: string; value: number }[],
  colors: RGB[],
  chartH = 40,
): void {
  if (!data.length) { ctx.body('No data.'); return; }
  ctx.maybeNewPage(chartH + 16);

  const maxV = Math.max(...data.map(d => d.value), 1);
  const barW = Math.min(18, (BODY - 4) / data.length - 2);
  const totalW = data.length * (barW + 2) - 2;
  const startX = ML + (BODY - totalW) / 2;
  const baseY = ctx.y + chartH;

  // Y axis guide lines
  stroke(ctx.pdf, CLR.border);
  ctx.pdf.setLineWidth(0.15);
  ctx.pdf.setFontSize(5.5);
  textc(ctx.pdf, CLR.muted);
  ctx.pdf.setFont('helvetica', 'normal');
  [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
    const ly = baseY - frac * chartH;
    ctx.pdf.line(ML, ly, W - MR, ly);
    const lv = maxV * frac;
    const label = lv >= 100000
      ? `Rs.${(lv / 100000).toFixed(1)}L`
      : lv >= 1000
      ? `Rs.${(lv / 1000).toFixed(0)}K`
      : `Rs.${lv.toFixed(0)}`;
    ctx.pdf.text(safe(label), ML - 1, ly + 1, { align: 'right' });
  });

  // bars + labels
  data.forEach((d, i) => {
    const bh = maxV > 0 ? (d.value / maxV) * chartH : 0;
    const bx = startX + i * (barW + 2);
    const by = baseY - bh;
    fill(ctx.pdf, colors[i % colors.length]);
    ctx.pdf.roundedRect(bx, by, barW, bh, 1, 1, 'F');
    // x label
    ctx.pdf.setFontSize(5.5);
    textc(ctx.pdf, CLR.muted);
    ctx.pdf.text(safe(trunc(d.label, 8)), bx + barW / 2, baseY + 4, { align: 'center' });
    // value on top
    if (bh > 4) {
      ctx.pdf.setFontSize(5);
      textc(ctx.pdf, CLR.white);
      const sv = d.value >= 100000
        ? `${(d.value / 100000).toFixed(1)}L`
        : d.value >= 1000
        ? `${(d.value / 1000).toFixed(0)}K`
        : `${d.value}`;
      ctx.pdf.text(sv, bx + barW / 2, by + 3.5, { align: 'center' });
    }
  });
  ctx.y = baseY + 8;
}

/** Horizontal bar chart for waterfall / fees. */
function hBarChart(
  ctx: Ctx,
  data: { label: string; value: number; positive?: boolean }[],
  height = 38,
): void {
  if (!data.length) { ctx.body('No data.'); return; }
  ctx.maybeNewPage(height + 6);

  const maxV = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const barH = Math.max(3, (height - data.length * 1.5) / data.length);
  const labelW = 42;
  const chartStartX = ML + labelW + 2;
  const chartW = BODY - labelW - 2;

  ctx.pdf.setFontSize(6);

  data.forEach((d, i) => {
    const by = ctx.y + i * (barH + 1.5);
    const bw = Math.abs(d.value) / maxV * chartW;
    const col: RGB = d.positive !== false && d.value >= 0 ? CLR.barA : CLR.barD;
    fill(ctx.pdf, col);
    ctx.pdf.roundedRect(chartStartX, by, bw, barH, 0.8, 0.8, 'F');
    textc(ctx.pdf, CLR.muted);
    ctx.pdf.setFont('helvetica', 'normal');
    ctx.pdf.text(safe(trunc(d.label, 20)), ML, by + barH * 0.72);
    textc(ctx.pdf, CLR.ink);
    ctx.pdf.setFont('helvetica', 'bold');
    ctx.pdf.text(signedInr(d.value), chartStartX + bw + 1.5, by + barH * 0.72);
    ctx.pdf.setFont('helvetica', 'normal');
  });
  ctx.y += height + 2;
}

/** Simple table. colWidths sum should equal BODY. */
function table(
  ctx: Ctx,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  maxRows = 20,
): void {
  if (!rows.length) { ctx.body('No data.'); return; }

  const rowH = 6;
  const headerH = 7;
  ctx.maybeNewPage(headerH + rowH * Math.min(rows.length, maxRows) + 4);

  // header
  fill(ctx.pdf, CLR.bg);
  ctx.pdf.rect(ML, ctx.y, BODY, headerH, 'F');
  ctx.pdf.setFontSize(7);
  ctx.pdf.setFont('helvetica', 'bold');
  textc(ctx.pdf, CLR.muted);
  let cx = ML + 2;
  headers.forEach((h, i) => {
    ctx.pdf.text(safe(trunc(h, 24)), cx, ctx.y + 4.8);
    cx += colWidths[i];
  });
  ctx.y += headerH;

  // rows
  rows.slice(0, maxRows).forEach((row, ri) => {
    ctx.maybeNewPage(rowH + 2);
    if (ri % 2 === 0) {
      fill(ctx.pdf, [248, 247, 242] as RGB);
      ctx.pdf.rect(ML, ctx.y, BODY, rowH, 'F');
    }
    ctx.pdf.setFontSize(6.5);
    ctx.pdf.setFont('helvetica', 'normal');
    textc(ctx.pdf, CLR.ink);
    let rx = ML + 2;
    row.forEach((cell, i) => {
      ctx.pdf.text(safe(trunc(cell, 30)), rx, ctx.y + 4.2);
      rx += colWidths[i];
    });
    ctx.y += rowH;
  });

  if (rows.length > maxRows) {
    ctx.gap(1);
    ctx.body(`… and ${rows.length - maxRows} more rows`, CLR.muted);
  }
}

// ─── main PDF function ────────────────────────────────────────────────────────

export function generateFullReportPdf(report: ReconciliationReport): void {
  const ctx = new Ctx();
  const pdf = ctx.pdf;
  const platform = report.platform === 'flipkart' ? 'Flipkart' : 'Amazon';

  // ── cover bar ──────────────────────────────────────────────────────────────
  // Cover gradient bar — top dark band + accent stripe
  fill(pdf, [22, 34, 28] as RGB);
  pdf.rect(0, 0, W, 42, 'F');
  fill(pdf, CLR.green);
  pdf.rect(0, 42, W, 3, 'F');

  // Logo text + tagline
  textc(pdf, CLR.white);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('FoLiOAI', ML, 17);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  textc(pdf, [180, 230, 190] as RGB);
  pdf.text('AI-Powered Seller Analytics & Reconciliation', ML + 36, 17);

  // Report subtitle line
  textc(pdf, [220, 245, 225] as RGB);
  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text(safe(`${platform} Settlement Report -- Full Analysis`), ML, 27);

  // Meta info
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  textc(pdf, [160, 210, 170] as RGB);
  pdf.text(
    safe(`${report.rowCount} orders  |  ${new Date().toLocaleDateString('en-IN')}  |  ${report.filename}`),
    ML, 34,
  );

  // Disclaimer ribbon
  fill(pdf, [36, 56, 44] as RGB);
  pdf.rect(0, 45, W, 7, 'F');
  pdf.setFontSize(6.5);
  textc(pdf, [180, 220, 185] as RGB);
  pdf.text(
    safe('Informational only -- verify all figures with GSTR-2B, Form 26AS and a qualified CA before acting.'),
    ML, 49.5,
  );
  ctx.y = 58;

  // ── SECTION 1 — Dashboard / Summary ─────────────────────────────────────
  ctx.sectionTitle('1 · Dashboard · Summary');

  ctx.kvRow([
    ['TOTAL REVENUE', inr(report.totalRevenue), CLR.white],
    ['TOTAL EXPENSES', inr(report.totalExpenses), CLR.white],
    ['NET PROFIT', signedInr(report.netProfit), report.netProfit >= 0 ? CLR.greenBg : CLR.redBg],
    ['RECOVERABLE LEAKAGE', inr(report.recoverableLeakage), CLR.redBg],
  ]);
  ctx.kvRow([
    ['TCS CLAIMABLE', inr(report.tcsClaimable), CLR.greenBg],
    ['GST MISMATCHES', String(report.gstMismatchCount), report.gstMismatchCount > 0 ? CLR.amberBg : CLR.white],
    ['CONFIDENCE', report.confidence.toUpperCase(), CLR.white],
    ['ANALYSIS SOURCE', report.analysisSource === 'ai_assisted' ? 'AI Assisted' : 'Deterministic', CLR.blueBg],
  ]);

  // Monthly revenue bar chart
  const trends = report.monthlyTrends ?? [];
  if (trends.length > 0) {
    ctx.gap(2);
    ctx.maybeNewPage(60);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    textc(pdf, CLR.ink);
    pdf.text('Monthly Revenue', ML, ctx.y);
    ctx.y += 5;
    vBarChart(
      ctx,
      trends.map(t => ({ label: t.month, value: t.revenue })),
      [CLR.barA],
      42,
    );

    // Profit overlay bar chart
    ctx.maybeNewPage(56);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    textc(pdf, CLR.ink);
    pdf.text('Monthly Profit / Expenses', ML, ctx.y);
    ctx.y += 5;
    vBarChart(
      ctx,
      trends.map(t => ({ label: t.month, value: t.profit })),
      [CLR.barB],
      36,
    );
  }

  // AI narrative
  if (report.narrative) {
    ctx.maybeNewPage(24);
    fill(pdf, CLR.bg);
    stroke(pdf, CLR.border);
    pdf.setLineWidth(0.3);
    const nx = ML;
    const nw = BODY;
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    const nLines = pdf.splitTextToSize(safe(report.narrative), nw - 6) as string[];
    const nh = nLines.length * 4 + 6;
    pdf.roundedRect(nx, ctx.y, nw, nh, 2, 2, 'FD');
    textc(pdf, CLR.ink);
    pdf.text(nLines, nx + 3, ctx.y + 5);
    ctx.y += nh + 4;
  }

  // ── SECTION 2 — Recovery ────────────────────────────────────────────────
  ctx.addPage();
  ctx.sectionTitle('2 · Recovery · Leakage Detected');

  // Leakage horizontal bar
  const leakage = report.leakageBreakdown ?? [];
  if (leakage.length > 0) {
    ctx.gap(1);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    textc(pdf, CLR.ink);
    pdf.text('Leakage by Type', ML, ctx.y);
    ctx.y += 5;
    hBarChart(
      ctx,
      leakage.map(l => ({ label: cap(l.type), value: l.amount, positive: false })),
      34,
    );
  }

  ctx.gap(2);
  ctx.rule();

  // Leakage table
  table(
    ctx,
    ['Type', 'Amount (Rs.)', 'Count', 'Confidence'],
    leakage.map(l => [
      cap(l.type),
      l.amount.toLocaleString('en-IN'),
      String(l.count),
      l.confidence,
    ]),
    [74, 40, 20, 28],
    30,
  );

  ctx.gap(4);
  ctx.rule();

  // Recovery actions
  const actions = report.recoveryActions ?? [];
  if (actions.length > 0) {
    ctx.sectionTitle('Recovery Actions');
    actions.forEach(a => {
      ctx.maybeNewPage(22);
      fill(pdf, CLR.bg);
      stroke(pdf, CLR.border);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(ML, ctx.y, BODY, 18, 2, 2, 'FD');

      // priority badge colour
      const pCol: RGB = a.priority === 'high' ? CLR.red : a.priority === 'medium' ? CLR.amber : CLR.muted;
      fill(pdf, pCol);
      pdf.roundedRect(ML + 2, ctx.y + 2, 18, 5.5, 1, 1, 'F');
      textc(pdf, CLR.white);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'bold');
      pdf.text(a.priority.toUpperCase(), ML + 11, ctx.y + 5.5, { align: 'center' });

      textc(pdf, CLR.ink);
      pdf.setFontSize(8);
      pdf.text(safe(cap(a.type)), ML + 22, ctx.y + 5.5);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      textc(pdf, CLR.muted);
      pdf.text(
        safe(`${inr(a.totalAmount)} - ${a.itemCount} item(s) - ~${a.estimatedRecoveryDays} days`),
        ML + 22, ctx.y + 11,
      );
      const stepsText = a.steps.slice(0, 2).join(' -> ');
      textc(pdf, CLR.green);
      pdf.setFontSize(6.5);
      pdf.text(safe(trunc(stepsText, 72)), ML + 2, ctx.y + 16.5);

      ctx.y += 21;
    });
  }

  // ── SECTION 3 — Reconciliation ──────────────────────────────────────────
  ctx.addPage();
  ctx.sectionTitle('3 · Reconciliation · Settlement Waterfall');

  const waterfall = report.waterfall ?? [];
  if (waterfall.length > 0) {
    ctx.gap(1);
    hBarChart(
      ctx,
      waterfall.map(w => ({ label: w.label, value: w.value, positive: w.isPositive })),
      Math.min(60, waterfall.length * 8 + 4),
    );
  }

  ctx.gap(3);
  ctx.rule();

  // Order-level recon table
  const orders = report.orderRecon ?? [];
  if (orders.length > 0) {
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    textc(pdf, CLR.ink);
    pdf.text('Order-Level Gaps (top 15)', ML, ctx.y);
    ctx.y += 5;
    table(
      ctx,
      ['Order ID', 'SKU / Product', 'MTR Gross', 'Settlement', 'Gap (Rs.)'],
      orders.slice(0, 15).map(o => [
        trunc(o.orderId, 20),
        trunc(o.product, 22),
        inr(o.mtrGross),
        inr(o.settlement),
        inr(o.gap),
      ]),
      [42, 46, 22, 26, 26],
      15,
    );
  }

  // GST mismatches if any
  if (report.gstMismatchCount > 0) {
    ctx.gap(4);
    ctx.rule();
    ctx.maybeNewPage(12);
    ctx.body(
      `[!] ${report.gstMismatchCount} GST mismatch(es) found. Review in Reconciliation tab and reconcile with GSTR-1 before filing.`,
      CLR.amber,
    );
  }

  // ── SECTION 4 — Analysis ────────────────────────────────────────────────
  ctx.addPage();
  ctx.sectionTitle('4 · Analysis · Sales & Products');

  const sa = report.salesAnalytics;
  const skus = report.skuProfitability ?? [];
  const avgOV = sa?.avgOrderValue ?? (report.rowCount > 0 ? Math.round(report.totalRevenue / report.rowCount) : 0);
  const netM = sa?.profitMarginPct ?? (report.totalRevenue > 0 ? Math.round((report.netProfit / report.totalRevenue) * 100) : 0);

  ctx.kvRow([
    ['NET MARGIN', `${netM}%`, netM > 10 ? CLR.greenBg : netM > 0 ? CLR.amberBg : CLR.redBg],
    ['AVG ORDER VALUE', inr(avgOV), CLR.white],
    ['FEE % OF REV', `${sa?.feePctOfRevenue ?? 0}%`, CLR.white],
    ['TOTAL ORDERS', String(report.rowCount), CLR.white],
  ]);

  // SKU profitability
  if (skus.length > 0) {
    ctx.gap(2);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    textc(pdf, CLR.ink);
    pdf.text('Top Products by Revenue', ML, ctx.y);
    ctx.y += 5;

    vBarChart(
      ctx,
      skus.slice(0, 8).map(s => ({ label: trunc(s.sku, 10), value: s.revenue })),
      [CLR.barA, CLR.barB, CLR.barC, CLR.barD, CLR.barE],
      40,
    );

    ctx.gap(3);
    table(
      ctx,
      ['SKU', 'Revenue (Rs.)', 'Fees (Rs.)', 'Returns (Rs.)', 'Net Profit (Rs.)'],
      skus.slice(0, 12).map(s => [
        trunc(s.sku, 24),
        s.revenue.toLocaleString('en-IN'),
        s.fees.toLocaleString('en-IN'),
        s.returns.toLocaleString('en-IN'),
        s.netProfit.toLocaleString('en-IN'),
      ]),
      [50, 32, 30, 30, 40],
      12,
    );
  }

  // Fee breakdown
  const feeData = sa?.feeBreakdown ?? [];
  if (feeData.length > 0) {
    ctx.gap(4);
    ctx.rule();
    ctx.maybeNewPage(50);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    textc(pdf, CLR.ink);
    pdf.text('Fee Breakdown', ML, ctx.y);
    ctx.y += 5;
    hBarChart(
      ctx,
      feeData.map(f => ({ label: f.type, value: f.amount, positive: false })),
      28,
    );
  }

  // Return rate by SKU
  const rrData = sa?.returnRateBySku?.slice(0, 8) ?? [];
  if (rrData.length > 0) {
    ctx.gap(3);
    ctx.rule();
    ctx.maybeNewPage(34);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    textc(pdf, CLR.ink);
    pdf.text('Return Rate by SKU', ML, ctx.y);
    ctx.y += 5;
    table(
      ctx,
      ['SKU', 'Return Rate %', 'Return Amount (Rs.)'],
      rrData.map(r => [
        trunc(r.sku, 36),
        r.returnRate < 0 ? 'N/A (no settlement)' : `${r.returnRate.toFixed(1)}%`,
        r.returnAmount.toLocaleString('en-IN'),
      ]),
      [82, 42, 58],
      8,
    );
  }

  // ── SECTION 5 — Tax Summary ─────────────────────────────────────────────
  ctx.addPage();
  ctx.sectionTitle('5 · Tax Summary · GST · TCS · TDS · Income Tax');

  const tcs = report.tcsSummary;
  const tds = report.tdsSummary;
  const gst = report.gstSummary;
  const itax = report.incomeTaxEstimate;

  ctx.kvRow([
    ['TCS COLLECTED (§52 CGST)', inr(tcs?.totalTcsCollected ?? report.tcsCollected), CLR.greenBg],
    ['TCS CLAIMABLE (GSTR-3B 3d)', inr(tcs?.totalTcsClaimable ?? report.tcsClaimable), CLR.greenBg],
    ['TDS DEDUCTED (§194-O)', inr(tds?.totalTdsDeducted ?? 0), CLR.blueBg],
    ['TDS CLAIMABLE', inr(tds?.totalTdsClaimable ?? 0), CLR.blueBg],
  ]);
  ctx.kvRow([
    ['OUTPUT GST', inr(gst?.totalOutputTax ?? 0), CLR.amberBg],
    ['ITC ELIGIBLE (est.)', inr(gst?.itcEligible ?? 0), CLR.amberBg],
    ['NET GST LIABILITY (est.)', inr(gst?.netGstLiability ?? 0), CLR.amberBg],
    ['INCOME TAX EST. (net)', inr(itax?.netTaxPayable ?? 0), CLR.white],
  ]);

  // IGST / CGST / SGST
  ctx.kvRow([
    ['IGST (interstate)', inr(gst?.igstAmount ?? 0), CLR.white],
    ['CGST (intrastate)', inr(gst?.cgstAmount ?? 0), CLR.white],
    ['SGST (intrastate)', inr(gst?.sgstAmount ?? 0), CLR.white],
    ['GST MISMATCHES', String(report.gstMismatchCount), report.gstMismatchCount > 0 ? CLR.redBg : CLR.greenBg],
  ]);

  // GST rate breakdown bar chart
  const rateBreakdown = gst?.rateBreakdown ?? [];
  if (rateBreakdown.length > 0) {
    ctx.gap(2);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    textc(pdf, CLR.ink);
    pdf.text('GST Rate Breakdown', ML, ctx.y);
    ctx.y += 5;
    vBarChart(
      ctx,
      rateBreakdown.map(r => ({ label: `${r.rate}%`, value: r.tax })),
      [CLR.barC, CLR.barA, CLR.barB, CLR.barD],
      38,
    );

    table(
      ctx,
      ['GST Rate', 'Taxable Value (Rs.)', 'Tax Collected (Rs.)', 'Items'],
      rateBreakdown.map(r => [
        `${r.rate}%`,
        r.taxableValue.toLocaleString('en-IN'),
        r.tax.toLocaleString('en-IN'),
        String(r.count),
      ]),
      [25, 55, 55, 27],
      10,
    );
  }

  // TCS monthly
  if (tcs?.monthlyBreakdown?.length) {
    ctx.gap(4);
    ctx.rule();
    ctx.maybeNewPage(46);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    textc(pdf, CLR.ink);
    pdf.text('TCS Monthly Breakdown', ML, ctx.y);
    ctx.y += 5;
    vBarChart(
      ctx,
      tcs.monthlyBreakdown.map(m => ({ label: m.month, value: m.tcs })),
      [CLR.barA],
      34,
    );
    table(
      ctx,
      ['Month', 'Taxable Value ex-GST (Rs.)', 'TCS (Rs.)'],
      tcs.monthlyBreakdown.map(m => [m.month, m.taxableValue.toLocaleString('en-IN'), m.tcs.toLocaleString('en-IN')]),
      [40, 62, 60],
    );
  }

  // GSTR filing pointers
  const gstr1P = gst?.gstr1Pointers ?? [];
  const gstr3bP = gst?.gstr3bPointers ?? [];
  if (gstr1P.length || gstr3bP.length) {
    ctx.gap(4);
    ctx.rule();
    if (gstr1P.length) {
      ctx.body('GSTR-1 Filing Pointers:', CLR.green);
      gstr1P.forEach(p => ctx.body(`• ${p}`, CLR.ink));
    }
    if (gstr3bP.length) {
      ctx.gap(2);
      ctx.body('GSTR-3B Filing Pointers:', CLR.green);
      gstr3bP.forEach(p => ctx.body(`• ${p}`, CLR.ink));
    }
  }

  // Income tax estimate detail
  if (itax) {
    ctx.gap(4);
    ctx.rule();
    ctx.maybeNewPage(50);
    ctx.sectionTitle('Income Tax Estimate (Indicative)');
    ctx.kvRow([
      ['GROSS REVENUE', inr(itax.grossRevenue), CLR.white],
      ['NET PROFIT', signedInr(itax.netProfit), CLR.white],
      ['ESTIMATED TAX', inr(itax.estimatedTax), CLR.amberBg],
      ['NET AFTER TCS+TDS CREDIT', inr(itax.netTaxPayable), CLR.amberBg],
    ]);
    ctx.body(
      `Regime: ${itax.regime === 'new' ? 'New Regime FY 2025-26' : 'Old Regime'} · ITR Form: ${itax.itrForm} · Recommended: ${itax.recommendedScheme === 'presumptive_44AD' ? 'Section 44AD Presumptive' : 'Actual books'}`,
      CLR.muted,
    );
    if (itax.advanceTaxSchedule?.length) {
      ctx.gap(3);
      table(
        ctx,
        ['Due Date', 'Instalment %', 'Amount (Rs.)'],
        itax.advanceTaxSchedule.map(a => [
          a.dueDate,
          `${a.percentage}%`,
          a.amount.toLocaleString('en-IN'),
        ]),
        [55, 35, 72],
      );
    }
  }

  // ── footer on every page ──────────────────────────────────────────────────
  const totalPages = pdf.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    pdf.setPage(pg);
    // footer bar
    fill(pdf, [22, 34, 28] as RGB);
    pdf.rect(0, H - 11, W, 11, 'F');
    fill(pdf, CLR.green);
    pdf.rect(0, H - 11, W, 1.2, 'F');
    textc(pdf, [160, 210, 170] as RGB);
    pdf.setFontSize(5.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      safe('FoLiOAI -- Informational use only. Verify with GSTR-2B, Form 26AS, and a qualified CA before acting.'),
      ML, H - 4.5,
    );
    textc(pdf, [220, 245, 225] as RGB);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Page ${pg} / ${totalPages}`, W - MR, H - 4.5, { align: 'right' });
  }

  // ── save ─────────────────────────────────────────────────────────────────
  const fname = `FoLiOAI_Report_${report.platform}_${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(fname);
}
