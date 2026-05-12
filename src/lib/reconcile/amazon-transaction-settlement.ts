// ─────────────────────────────────────────────────────────────────────────────
// Amazon flat settlement report — one row per TRANSACTION (not per order).
// Uses: TransactionAmount, TotalTransactionFee, NetTransactionAmount, TransactionType
// per Amazon Payments / settlement flat-file style exports.
// ─────────────────────────────────────────────────────────────────────────────

import type { AmazonTransactionMetrics, SellerOrderRow } from '../../types/index.ts';
import {
  type DataQualityTracker,
  excludeRow,
  noteAssumption,
  parseFlexibleDate,
} from './data-quality.ts';
import {
  fuzzyMatchHeaders,
  buildFieldLookupFromFuzzy,
  normalizeHeaderForFuzzy,
} from './fuzzy-columns.ts';
import { logEvent } from '../logger.ts';

/** Canonical header phrases (keys) → internal field ids (values for fuzzy map) */
export const AMAZON_TRANSACTION_SETTLEMENT_COL_MAP: Record<string, string> = {
  'transaction amount': 'txAmount',
  'transactionamount': 'txAmount',
  'total transaction fee': 'txFee',
  'totaltransactionfee': 'txFee',
  'total transaction fees': 'txFee',
  'net transaction amount': 'netAmount',
  'nettransactionamount': 'netAmount',
  'transaction type': 'txType',
  'transactiontype': 'txType',
  'order id': 'orderId',
  'order-id': 'orderId',
  'amazon order id': 'orderId',
  'sku': 'sku',
  'seller sku': 'sku',
  'posted date': 'postedDate',
  'posted-date': 'postedDate',
  'settlement id': 'settlementId',
  // 🟠 fix: map tax columns so GST/TCS/TDS are no longer hardcoded to ₹0
  'igst': 'igst',
  'igst amount': 'igst',
  'cgst': 'cgst',
  'cgst amount': 'cgst',
  'sgst': 'sgst',
  'sgst amount': 'sgst',
  'marketplace withheld tax': 'gstCollected',
  'marketplace facilitator tax': 'gstCollected',
  'tcs': 'tcsDeducted',
  'tcs amount': 'tcsDeducted',
  'tax collected at source': 'tcsDeducted',
  'tds': 'tdsDeducted',
  'tds amount': 'tdsDeducted',
  'tax deducted at source': 'tdsDeducted',
};

const REQUIRED_INTERNAL_FIELDS = ['txAmount', 'netAmount', 'txFee', 'txType'] as const;

function splitLine(line: string, delim: string): string[] {
  if (delim === '\t') return line.split('\t').map(v => v.replace(/"/g, '').replace(/\r/g, '').trim());
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === delim && !inQ) { result.push(cur.replace(/\r/g, '').trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.replace(/\r/g, '').trim());
  return result;
}

/** Parse monetary cell — no silent 0: invalid / blank → null */
function parseMoneyCell(
  raw: unknown,
  rowIndex: number,
  field: string,
  tracker: DataQualityTracker,
): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/,/g, '').replace(/₹/g, '').replace(/\r/g, '').trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) {
    tracker.issues.push({
      rowIndex,
      field,
      severity: 'error',
      rawValue: s,
      message: `${field} is not a valid number`,
    });
    return null;
  }
  return n;
}

export type AmazonTxKind =
  | 'capture'
  | 'refund'
  | 'chargeback'
  | 'adjustment'
  | 'transfer'
  | 'reserve'
  | 'carryover'
  | 'other';

export function classifyAmazonFlatTransactionType(raw: string): AmazonTxKind {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return 'other';
  if (t.includes('capture')) return 'capture';
  if (t === 'order' || t.includes('orderpayment')) return 'capture';
  if (t.includes('refund')) return 'refund';
  if (t.includes('chargeback')) return 'chargeback';
  if (t.includes('adjustment')) return 'adjustment';
  if (t.includes('transfer')) return 'transfer';
  if (t.includes('reserve')) return 'reserve';
  if (t.includes('carryover') || t.includes('carry-over')) return 'carryover';
  if (t.includes('deferred')) return 'reserve';
  return 'other';
}

/** True if fuzzy mapping resolves all mandatory Amazon flat-transaction columns. */
export function canParseAsAmazonTransactionFlat(
  headers: string[],
  columnOverrides: Record<string, string>,
): boolean {
  const log = fuzzyMatchHeaders(headers, AMAZON_TRANSACTION_SETTLEMENT_COL_MAP, columnOverrides);
  const mapped = new Set(log.results.filter(r => r.mappedField).map(r => r.mappedField!));
  return REQUIRED_INTERNAL_FIELDS.every(f => mapped.has(f));
}

export function parseAmazonTransactionFlatSettlement(
  headers: string[],
  dataLines: string[],
  delim: string,
  tracker: DataQualityTracker,
  columnOverrides: Record<string, string> = {},
): { rows: SellerOrderRow[]; metrics: AmazonTransactionMetrics } {
  const fuzzyLog = fuzzyMatchHeaders(headers, AMAZON_TRANSACTION_SETTLEMENT_COL_MAP, columnOverrides);
  tracker.columnMappingLog = fuzzyLog;
  tracker.detectedSchema = 'amazon_transaction_flat';

  const mapped = new Set(fuzzyLog.results.filter(r => r.mappedField).map(r => r.mappedField!));
  const missing = REQUIRED_INTERNAL_FIELDS.filter(f => !mapped.has(f));
  if (missing.length > 0) {
    const msg =
      `This file looks like a non-standard Amazon settlement export. Required columns could not be resolved: ${missing.join(', ')}.\n\n` +
      `Please confirm in Column Mapping:\n` +
      `• Which column is Transaction Amount (base transaction amount)?\n` +
      `• Which column is Total Transaction Fee?\n` +
      `• Which column is Net Transaction Amount (settlement line)?\n` +
      `• Which column is Transaction Type?\n\n` +
      `Detected headers: ${headers.slice(0, 12).join(', ')}${headers.length > 12 ? '…' : ''}`;
    throw new Error(msg);
  }

  for (const line of fuzzyLog.debugLines.filter(l => l.startsWith('[FUZZY_AUTO]'))) {
    noteAssumption(tracker, `Column auto-matched (Amazon transaction flat): ${line.replace('[FUZZY_AUTO] ', '')}`);
  }

  const fieldLookup = buildFieldLookupFromFuzzy(fuzzyLog);

  let totalCaptureTransactionAmount = 0;
  let totalRefundTransactionAmount = 0;
  let totalChargebackTransactionAmount = 0;
  let totalAdjustmentTransactionAmount = 0;
  let totalTransactionFees = 0;
  let netSettlementTotal = 0;
  let transferRowCount = 0;
  let reserveOrCarryoverRowCount = 0;
  let otherRowCount = 0;
  const typeDistribution: Record<string, number> = {};

  const rows: SellerOrderRow[] = [];
  let parsedTransactionRowCount = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const rowIndex = i + 2;
    const vals = splitLine(dataLines[i], delim);
    if (vals.length < 2 || vals.every(v => v === '')) continue;

    const byField: Record<string, string> = {};
    headers.forEach((h, j) => {
      const norm = normalizeHeaderForFuzzy(h);
      const field = fieldLookup[norm];
      if (field) byField[field] = vals[j] ?? '';
    });

    const txTypeRaw = byField.txType?.trim() ?? '';
    if (!txTypeRaw) {
      excludeRow(tracker, rowIndex, 'Amazon transaction row skipped: Transaction Type is blank');
      continue;
    }

    const txAmount = parseMoneyCell(byField.txAmount, rowIndex, 'TransactionAmount', tracker);
    const txFee = parseMoneyCell(byField.txFee, rowIndex, 'TotalTransactionFee', tracker);
    const netAmount = parseMoneyCell(byField.netAmount, rowIndex, 'NetTransactionAmount', tracker);

    if (txAmount === null || txFee === null || netAmount === null) {
      excludeRow(tracker, rowIndex, 'Amazon transaction row skipped: missing or invalid monetary fields');
      continue;
    }

    const kind = classifyAmazonFlatTransactionType(txTypeRaw);
    typeDistribution[txTypeRaw] = (typeDistribution[txTypeRaw] ?? 0) + 1;

    switch (kind) {
      case 'capture':
        totalCaptureTransactionAmount += txAmount;
        break;
      case 'refund':
        totalRefundTransactionAmount += txAmount;
        break;
      case 'chargeback':
        totalChargebackTransactionAmount += txAmount;
        break;
      case 'adjustment':
        totalAdjustmentTransactionAmount += txAmount;
        break;
      case 'transfer':
        transferRowCount += 1;
        break;
      case 'reserve':
      case 'carryover':
        reserveOrCarryoverRowCount += 1;
        break;
      default:
        otherRowCount += 1;
        totalAdjustmentTransactionAmount += txAmount;
        break;
    }

    totalTransactionFees += txFee;
    netSettlementTotal += netAmount;

    const orderId = byField.orderId?.trim() || `TX-${rowIndex}`;
    const sku = byField.sku?.trim() || '—';
    const posted = byField.postedDate?.trim();

    let sellingPrice = 0;
    let returnAmount = 0;
    if (kind === 'capture') sellingPrice = txAmount;
    else if (kind === 'refund' || kind === 'chargeback') {
      sellingPrice = txAmount;
      returnAmount = txAmount < 0 ? -txAmount : txAmount;
    }

    const isDeferred =
      kind === 'reserve' ||
      kind === 'carryover' ||
      /deferred|reserved/i.test(txTypeRaw);

    rows.push({
      platform: 'amazon',
      orderId,
      sku,
      rowSource: 'amazon_transaction_line',
      amazonTxKind: kind,
      sellingPrice,
      settlement: netAmount,
      referralFee: txFee,
      fulfillmentFee: 0,
      storageFee: 0,
      otherFees: 0,
      gstCollected: (() => {
        // 🟠 fix: read from mapped column; fall back to summing IGST+CGST+SGST
        const direct = parseMoneyCell(byField.gstCollected, rowIndex, 'gstCollected', tracker);
        if (direct !== null) return direct;
        const igst = parseMoneyCell(byField.igst, rowIndex, 'igst', tracker) ?? 0;
        const cgst = parseMoneyCell(byField.cgst, rowIndex, 'cgst', tracker) ?? 0;
        const sgst = parseMoneyCell(byField.sgst, rowIndex, 'sgst', tracker) ?? 0;
        return igst + cgst + sgst;
      })(),
      gstRate: 0,   // transaction format doesn't carry rate; computed downstream from amounts
      pos: byField.pos?.trim() || '—',
      tcsDeducted: parseMoneyCell(byField.tcsDeducted, rowIndex, 'tcsDeducted', tracker) ?? 0,
      tdsDeducted: parseMoneyCell(byField.tdsDeducted, rowIndex, 'tdsDeducted', tracker) ?? 0,
      returnAmount,
      weight: 0,
      declaredWeight: 0,
      weightSource: 'default',
      quantity: 1,
      orderDate: parseFlexibleDate(posted, tracker, rowIndex, 'postedDate'),
      postedDate: parseFlexibleDate(posted, tracker, rowIndex, 'postedDate'),
      releaseDate: parseFlexibleDate(posted, tracker, rowIndex, 'postedDate'),
      isDeferred,
      rowIndex,
    });
    parsedTransactionRowCount += 1;
  }

  tracker.transactionTypeDistribution = typeDistribution;

  if (rows.some(r => r.isDeferred)) {
    tracker.warnings.add(
      `${rows.filter(r => r.isDeferred).length} row(s) have Deferred/Reserved status and are excluded from cash totals.`,
    );
  }

  logEvent('info', 'amazon_transaction_flat_schema', {
    detectedSchema: 'amazon_transaction_flat',
    parsedTransactionRowCount,
    transactionTypeDistribution: typeDistribution,
    mappedColumnSummary: fuzzyLog.results
      .filter(r => r.mappedField)
      .map(r => ({ from: r.rawHeader, to: r.mappedField, how: r.matchType })),
  });

  const metrics: AmazonTransactionMetrics = {
    totalCaptureTransactionAmount: round2(totalCaptureTransactionAmount),
    totalRefundTransactionAmount: round2(totalRefundTransactionAmount),
    totalChargebackTransactionAmount: round2(totalChargebackTransactionAmount),
    totalAdjustmentTransactionAmount: round2(totalAdjustmentTransactionAmount),
    totalTransactionFees: round2(totalTransactionFees),
    netSettlementTotal: round2(netSettlementTotal),
    transferRowCount,
    reserveOrCarryoverRowCount,
    otherRowCount,
    parsedTransactionRowCount,
  };

  noteAssumption(
    tracker,
    `Amazon transaction-flat totals: Capture Σ(TransactionAmount)=${metrics.totalCaptureTransactionAmount}; ` +
      `Refund Σ=${metrics.totalRefundTransactionAmount}; Fees Σ(TotalTransactionFee)=${metrics.totalTransactionFees}; ` +
      `Net Σ(NetTransactionAmount)=${metrics.netSettlementTotal}`,
  );

  if (parsedTransactionRowCount === 0) {
    throw new Error(
      'No valid Amazon transaction rows were parsed. Check that Transaction Amount, Total Transaction Fee, ' +
        'Net Transaction Amount, and Transaction Type are present and numeric.',
    );
  }

  const allMoneyZero =
    metrics.totalCaptureTransactionAmount === 0 &&
    metrics.netSettlementTotal === 0 &&
    metrics.totalTransactionFees === 0 &&
    Math.abs(metrics.totalRefundTransactionAmount) < 1e-6 &&
    Math.abs(metrics.totalChargebackTransactionAmount) < 1e-6;

  if (allMoneyZero) {
    throw new Error(
      'Amazon settlement file parsed but all monetary totals are zero. ' +
        'This is not valid — check column mapping, currency columns, or upload the correct settlement export.',
    );
  }

  return { rows, metrics };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
