import { AmazonTransactionMetrics, SellerOrderRow, Platform } from '../../types/index.ts';
import { parseFlipkartCsv, isFlipkartFile } from './flipkart-parser.ts';
import {
  buildDataQualitySummary,
  createDataQualityTracker,
  excludeRow,
  normalizeStateCode,
  noteAssumption,
  noteMissingColumns,
  parseFlexibleDate,
  parseNumericField,
} from './data-quality.ts';
import {
  fuzzyMatchHeaders,
  buildFieldLookupFromFuzzy,
  normalizeHeaderForFuzzy,
} from './fuzzy-columns.ts';
import { applyFallbackEstimations } from './estimation.ts';
import {
  canParseAsAmazonTransactionFlat,
  parseAmazonTransactionFlatSettlement,
} from './amazon-transaction-settlement.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Unified parser: auto-detects Amazon vs Flipkart from column headers,
// then parses into the common SellerOrderRow[] format.
//
// Amazon formats supported:
//   A – Settlement Report V2 (tab-separated, multi-row per order)
//   B – MTR / Business Report (comma or tab, one row per order)
//
// Flipkart formats:
//   Settlement report with marketplace_fee, commission, shipping_fee, etc.
// ─────────────────────────────────────────────────────────────────────────────

export class UnrecognizedFileError extends Error {
  constructor(message: string, public readonly sampleHeaders: string[]) {
    super(message);
    this.name = 'UnrecognizedFileError';
  }
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function detectDelimiter(firstLine: string): string {
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

function splitLine(line: string, delim: string): string[] {
  if (delim === '\t') {
    // For tab-delimited: split on tabs, strip carriage returns, and trim whitespace.
    // Only strip surrounding double-quotes (not all quotes) to preserve embedded
    // apostrophes and quotes inside field values (e.g. O'Brien, 5" cable).
    return line.split('\t').map(v => {
      const trimmed = v.replace(/\r/g, '').trim();
      return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2
        ? trimmed.slice(1, -1).replace(/""/g, '"') // unescape doubled quotes per RFC 4180
        : trimmed;
    });
  }
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

function findHeaderLine(lines: string[], delim: string): number {
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = splitLine(lines[i], delim).map(norm);
    if (
      cols.some(c => c === 'order id' || c === 'order-id' || c === 'orderid') ||
      cols.some(c => c === 'transaction type' || c === 'transaction-type') ||
      cols.some(c => c === 'amount type' || c === 'amount-type') ||
      cols.some(c => c === 'sku' || c === 'seller sku' || c === 'fsn') ||
      cols.some(c => c === 'amount') ||
      cols.some(c => c === 'net amount' || c === 'settlement amount' || c === 'settlement value') ||
      cols.some(c => c.includes('net transaction amount')) ||
      cols.some(c => c.includes('transaction amount') && c !== 'amount type') ||
      cols.some(c => c.includes('total transaction fee')) ||
      // Generic / custom dataset columns
      cols.some(c => c === 'revenue' || c === 'price' || c === 'income' ||
        c === 'total revenue' || c === 'gross sales' || c === 'gross revenue')
    ) {
      return i;
    }
  }
  return 0;
}

// ── Amazon Settlement Report V2 (Format A) ───────────────────────

interface V2Row {
  orderId: string;
  sku: string;
  transactionType: string;
  amountType: string;
  amountDesc: string;
  amount: number;
  qty: number;
  shipState: string;
  postedDate: string;
}

function parseAmazonFormatA(rawRows: Record<string, string>[], tracker = createDataQualityTracker()): SellerOrderRow[] {
  tracker.detectedSchema = 'amazon_v2_multiline';
  const v2: V2Row[] = rawRows.map((r, i) => ({
    orderId: r['order-id'] || r['order id'] || r['orderid'] || `ROW-${i}`,
    sku: r['sku'] || r['asin'] || r['msku'] || 'UNKNOWN',
    transactionType: norm(r['transaction-type'] || r['transaction type'] || ''),
    amountType: norm(r['amount-type'] || r['amount type'] || ''),
    amountDesc: norm(r['amount-description'] || r['amount description'] || ''),
    amount: parseNumericField(r['amount'], { rowIndex: i + 2, field: 'amount', tracker }),
    qty: Math.max(1, parseNumericField(r['quantity-purchased'] || r['quantity'] || '1', { rowIndex: i + 2, field: 'quantity', tracker, fallback: 1 })),
    shipState: normalizeStateCode(r['ship-state'] || r['ship state'] || r['state'], tracker, i + 2, 'shipState'),
    postedDate: r['posted-date'] || r['posted date'] || '',
  }));

  const orderMap = new Map<string, {
    sku: string; qty: number; state: string; date: string;
    principal: number; tax: number; referral: number;
    fba: number; storage: number; other: number; returnAmt: number;
    rows: number[];
  }>();

  v2.forEach((r, i) => {
    if (!r.orderId || r.orderId.startsWith('ROW-')) return;

    let entry = orderMap.get(r.orderId);
    if (!entry) {
      entry = {
        sku: r.sku, qty: r.qty, state: r.shipState, date: r.postedDate,
        principal: 0, tax: 0, referral: 0, fba: 0, storage: 0, other: 0,
        returnAmt: 0, rows: [],
      };
      orderMap.set(r.orderId, entry);
    }
    if (r.sku && r.sku !== 'UNKNOWN') entry.sku = r.sku;
    entry.rows.push(i + 2);

    const amt = Math.abs(r.amount);
    const isRefund = r.transactionType === 'refund' || r.transactionType === 'order_return';

    if (r.amountType === 'itemprice' || r.amountType === 'item price') {
      if (r.amountDesc === 'principal' || r.amountDesc === 'itemchargeadjustment') {
        if (isRefund) entry.returnAmt += amt;
        else entry.principal += r.amount;
      }
      if (r.amountDesc === 'tax' || r.amountDesc === 'taxwithheld') {
        entry.tax += amt;
      }
    }
    if (r.amountType === 'itemfees' || r.amountType === 'item fees') {
      if (r.amountDesc === 'commission') entry.referral += amt;
      else if (
        r.amountDesc.includes('fbaperunit') ||
        r.amountDesc.includes('fulfillment') ||
        r.amountDesc.includes('fbaweight')
      ) entry.fba += amt;
      else if (r.amountDesc.includes('storage')) entry.storage += amt;
      else entry.other += amt;
    }
    if (r.transactionType === 'storagefeecharge' || r.transactionType === 'storage fee charge') {
      entry.storage += amt;
    }
  });

  const rows: SellerOrderRow[] = [];
  let idx = 0;
  for (const [orderId, e] of orderMap) {
    const settlement = Math.max(0, e.principal);
    noteAssumption(tracker, 'Amazon settlement V2 rows use default package weight when file lacks explicit weight columns');
    noteAssumption(tracker, 'Amazon settlement V2 rows do not expose TCS/TDS directly in this parser; missing values remain zero unless provided elsewhere');
    rows.push({
      platform: 'amazon',
      orderId,
      sku: e.sku,
      sellingPrice: settlement,
      settlement,
      referralFee: e.referral,
      fulfillmentFee: e.fba,
      storageFee: e.storage,
      otherFees: e.other,
      gstCollected: e.tax,
      gstRate: guessGstRate(settlement, e.tax),
      pos: normalizeStateCode(e.state, tracker, e.rows[0] ?? idx + 2, 'pos'),
      tcsDeducted: 0,
      tdsDeducted: 0,
      returnAmount: e.returnAmt,
      weight: 0.5,
      declaredWeight: 0.5,
      weightSource: 'default',
      quantity: e.qty,
      orderDate: parseFlexibleDate(e.date, tracker, e.rows[0] ?? idx + 2, 'orderDate'),
      rowIndex: e.rows[0] ?? idx + 2,
    });
    idx++;
  }
  return rows;
}

// ── Amazon MTR / Business Report (Format B) ──────────────────────

const AMAZON_COL_MAP: Record<string, string> = {
  'order id': 'orderId', 'order-id': 'orderId', 'orderid': 'orderId',
  'amazon order id': 'orderId', 'merchant order id': 'orderId',
  'asin': 'sku', 'sku': 'sku', 'msku': 'sku', 'merchant sku': 'sku',
  'amount': 'settlement', 'net': 'settlement', 'net amount': 'settlement',
  'net payout': 'settlement', 'net_payout': 'settlement',
  'total': 'settlement', 'settlement amount': 'settlement',
  'principal': 'settlement', 'sales': 'settlement', 'sale amount': 'settlement',
  'item price': 'sellingPrice', 'selling price': 'sellingPrice', 'product sales': 'settlement',
  // Generic / custom dataset columns
  // Plain 'revenue' maps to settlement — generic CSVs often mean net credited amount.
  'revenue': 'settlement', 'price': 'sellingPrice', 'income': 'settlement',
  // Explicit line revenue / fees / profit — do not fold into sellingPrice (avoids GST double-count & qty skew)
  'total revenue': 'datasetTotalRevenue', 'total_revenue': 'datasetTotalRevenue',
  'gross sales': 'datasetTotalRevenue', 'gross revenue': 'datasetTotalRevenue',
  'profit': 'datasetProfit',
  'total fees': 'datasetTotalFees', 'total_fees': 'datasetTotalFees',
  'sales amount': 'settlement', 'sale': 'settlement',
  'referral fee': 'referralFee', 'referral-fee': 'referralFee', 'commission': 'referralFee',
  'selling fees': 'referralFee', 'selling fee': 'referralFee',
  'fba fees': 'fulfillmentFee', 'fulfillment fee': 'fulfillmentFee', 'fba fee': 'fulfillmentFee',
  'fba fulfillment fee': 'fulfillmentFee', 'fulfillment fees': 'fulfillmentFee',
  'storage fee': 'storageFee', 'monthly storage fee': 'storageFee',
  'other fees': 'otherFees', 'other transaction fees': 'otherFees', 'other': 'otherFees',
  'gst': 'gstCollected', 'igst': 'gstCollected', 'gst amount': 'gstCollected',
  'tax': 'gstCollected', 'tax amount': 'gstCollected', 'taxes': 'gstCollected',
  'gst rate': 'gstRate', 'tax rate': 'gstRate',
  'state': 'pos', 'place of supply': 'pos', 'ship state': 'pos', 'ship-state': 'pos',
  'billing state': 'pos', 'customer state': 'pos',
  'return amount': 'returnAmount', 'refund amount': 'returnAmount',
  'returned amount': 'returnAmount', 'returns': 'returnAmount',
  'weight': 'weight', 'charged weight': 'weight', 'actual weight': 'weight',
  'item weight': 'declaredWeight', 'declared weight': 'declaredWeight',
  'product weight': 'declaredWeight', 'catalogue weight': 'declaredWeight',
  'quantity': 'quantity', 'qty': 'quantity', 'units': 'quantity',
  'units ordered': 'quantity', 'quantity purchased': 'quantity',
  'order date': 'orderDate', 'purchase date': 'orderDate', 'date': 'orderDate',
  'posted date': 'postedDate', 'posted-date': 'postedDate',
  'release date': 'releaseDate', 'deposit date': 'releaseDate', 'settlement date': 'releaseDate',
  'closing fee': 'closingFee', 'closing-fee': 'closingFee',
  'length': 'length', 'width': 'width', 'height': 'height',
  'tcs': 'tcsDeducted', 'tcs amount': 'tcsDeducted',
  'tds': 'tdsDeducted', 'tds amount': 'tdsDeducted',
  'cost price': 'costPrice', 'cost_price': 'costPrice', 'cogs': 'costPrice',
  'purchase price': 'costPrice', 'unit cost': 'costPrice',
  // These columns carry a quantity-adjusted total — must NOT be multiplied by qty again
  'total cost': 'totalCost', 'total_cost': 'totalCost',
  'landed cost': 'totalCost', 'mrp cost': 'totalCost',
};

function parseAmazonFormatB(
  headers: string[],
  lines: string[],
  delim: string,
  tracker = createDataQualityTracker(),
  columnOverrides: Record<string, string> = {},
): SellerOrderRow[] {
  tracker.detectedSchema = 'amazon_mtr';
  // ── Fuzzy column resolution (runs once per file) ─────────────────
  const fuzzyLog = fuzzyMatchHeaders(headers, AMAZON_COL_MAP, columnOverrides);
  tracker.columnMappingLog = fuzzyLog;

  // Surface auto-mapped fuzzy columns as assumptions for transparency
  for (const line of fuzzyLog.debugLines.filter(l => l.startsWith('[FUZZY_AUTO]'))) {
    noteAssumption(tracker, `Column auto-matched: ${line.replace('[FUZZY_AUTO] ', '')}`);
  }
  // Surface unmatched columns as warnings
  for (const col of fuzzyLog.unmatchedColumns) {
    tracker.warnings.add(`Column "${col}" was not recognised and will be ignored`);
  }
  // Surface suggested (ambiguous) mappings as warnings so UI can prompt user
  for (const s of fuzzyLog.suggestedMappings) {
    tracker.warnings.add(
      `Column "${s.raw}" (${(s.similarity * 100).toFixed(0)}% match) may map to "${s.suggestedTarget}" — confirm in Column Mapping`,
    );
  }

  // Build { normalizedHeader → fieldName } lookup
  const fieldLookup = buildFieldLookupFromFuzzy(fuzzyLog);

  const rows: SellerOrderRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const vals = splitLine(lines[i], delim);
    if (vals.length < 2 || vals.every(v => v === '')) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, j) => { raw[normalizeHeaderForFuzzy(h)] = vals[j] ?? ''; });

    const mapped: Record<string, any> = {};
    for (const [normH, v] of Object.entries(raw)) {
      const field = fieldLookup[normH];
      if (field) mapped[field] = v;
    }

    const rowIndex = i + 2;
    // Missing mapped fields must be NaN (not 0): parseNumericField(undefined) returns fallback 0, which blocked Price→settlement fallback for generic CSVs.
    const settlement =
      mapped.settlement === undefined || mapped.settlement === null
        ? Number.NaN
        : parseNumericField(mapped.settlement, { rowIndex, field: 'settlement', tracker, invalidAsNaN: true });
    const sellingPriceRaw =
      mapped.sellingPrice === undefined || mapped.sellingPrice === null
        ? Number.NaN
        : parseNumericField(mapped.sellingPrice, { rowIndex, field: 'sellingPrice', tracker, invalidAsNaN: true });
    const gstCollected = parseNumericField(mapped.gstCollected, { rowIndex, field: 'gstCollected', tracker });

    const parsedDatasetTR =
      mapped.datasetTotalRevenue != null && mapped.datasetTotalRevenue !== ''
        ? parseNumericField(mapped.datasetTotalRevenue, { rowIndex, field: 'datasetTotalRevenue', tracker, invalidAsNaN: true })
        : Number.NaN;
    const datasetTotalRevenue = Number.isFinite(parsedDatasetTR) ? parsedDatasetTR : undefined;

    const parsedDatasetProfit =
      mapped.datasetProfit != null && mapped.datasetProfit !== ''
        ? parseNumericField(mapped.datasetProfit, { rowIndex, field: 'datasetProfit', tracker, invalidAsNaN: true })
        : Number.NaN;
    const datasetProfit = Number.isFinite(parsedDatasetProfit) ? parsedDatasetProfit : undefined;

    const parsedDatasetFees =
      mapped.datasetTotalFees != null && mapped.datasetTotalFees !== ''
        ? parseNumericField(mapped.datasetTotalFees, { rowIndex, field: 'datasetTotalFees', tracker, invalidAsNaN: true })
        : Number.NaN;
    const datasetTotalFees = Number.isFinite(parsedDatasetFees) ? parsedDatasetFees : undefined;

    const finalSettlement = !Number.isNaN(settlement) ? settlement : sellingPriceRaw;
    const hasNumericSettlement = !Number.isNaN(finalSettlement);
    const hasLineRevenue = datasetTotalRevenue !== undefined && Number.isFinite(datasetTotalRevenue);

    if (!mapped.orderId || (!hasNumericSettlement && !hasLineRevenue)) {
      excludeRow(tracker, rowIndex, 'Excluded Amazon row due to missing orderId or invalid settlement / total_revenue value');
      continue;
    }

    const priceBasisForFallback =
      datasetTotalRevenue != null && datasetTotalRevenue > 0
        ? datasetTotalRevenue
        : hasNumericSettlement
          ? finalSettlement
          : 0;
    const sellingPrice =
      !Number.isNaN(sellingPriceRaw) && sellingPriceRaw > 0 ? sellingPriceRaw : priceBasisForFallback;

    if (!mapped.sellingPrice && !hasLineRevenue) {
      noteAssumption(tracker, 'Some Amazon rows used settlement amount as selling price because selling price was missing');
    }
    if (!mapped.gstRate && gstCollected > 0) noteAssumption(tracker, 'Some Amazon rows inferred GST rate from settlement and GST amount');
    if (!mapped.pos) noteAssumption(tracker, 'Some Amazon rows had no buyer state; place of supply defaulted to KA');
    if (!mapped.weight) noteAssumption(tracker, 'Some Amazon rows had no charged weight; default weight assumptions were used');

    // BUG 2 FIX: negative finalSettlement in custom CSVs signals a return row — treat as returnAmount
    const isNegativeSettlement = hasNumericSettlement && finalSettlement < -0.01;
    if (isNegativeSettlement) {
      noteAssumption(tracker, `Row ${rowIndex}: negative settlement (${finalSettlement.toFixed(2)}) treated as return amount — no separate return column found.`);
    }

    const postedDate = parseFlexibleDate(mapped.postedDate, tracker, rowIndex, 'postedDate')
      ?? parseFlexibleDate(mapped.orderDate, tracker, rowIndex, 'orderDate');
    const releaseDate = parseFlexibleDate(mapped.releaseDate, tracker, rowIndex, 'releaseDate');
    const len = parseNumericField(mapped.length, { rowIndex, field: 'length', tracker, fallback: 0 });
    const wid = parseNumericField(mapped.width, { rowIndex, field: 'width', tracker, fallback: 0 });
    const hgt = parseNumericField(mapped.height, { rowIndex, field: 'height', tracker, fallback: 0 });
    const closingFee = parseNumericField(mapped.closingFee, { rowIndex, field: 'closingFee', tracker, absolute: true });

    // BUG 1 FIX: totalCost is already quantity-adjusted — must not be multiplied by qty downstream
    const parsedTotalCost = mapped.totalCost != null
      ? parseNumericField(mapped.totalCost, { rowIndex, field: 'totalCost', tracker, absolute: true }) || undefined
      : undefined;

    rows.push({
      platform: 'amazon',
      orderId: String(mapped.orderId ?? `ROW-${i}`),
      sku: String(mapped.sku ?? 'UNKNOWN'),
      sellingPrice,
      settlement: isNegativeSettlement ? 0 : hasNumericSettlement ? finalSettlement : 0,
      referralFee: parseNumericField(mapped.referralFee, { rowIndex, field: 'referralFee', tracker, absolute: true }),
      fulfillmentFee: parseNumericField(mapped.fulfillmentFee, { rowIndex, field: 'fulfillmentFee', tracker, absolute: true }),
      storageFee: parseNumericField(mapped.storageFee, { rowIndex, field: 'storageFee', tracker, absolute: true }),
      otherFees: parseNumericField(mapped.otherFees, { rowIndex, field: 'otherFees', tracker, absolute: true }),
      gstCollected,
      gstRate:
        parseNumericField(mapped.gstRate, { rowIndex, field: 'gstRate', tracker }) ||
        guessGstRate(datasetTotalRevenue ?? (hasNumericSettlement ? finalSettlement : 0), gstCollected),
      pos: normalizeStateCode(mapped.pos, tracker, rowIndex, 'pos'),
      tcsDeducted: parseNumericField(mapped.tcsDeducted, { rowIndex, field: 'tcsDeducted', tracker, absolute: true }),
      tdsDeducted: parseNumericField(mapped.tdsDeducted, { rowIndex, field: 'tdsDeducted', tracker, absolute: true }),
      returnAmount: isNegativeSettlement
        ? Math.abs(finalSettlement)
        : parseNumericField(mapped.returnAmount, { rowIndex, field: 'returnAmount', tracker, absolute: true }),
      weight: parseNumericField(mapped.weight, { rowIndex, field: 'weight', tracker, fallback: 0.5 }) || 0.5,
      declaredWeight: parseNumericField(mapped.declaredWeight, { rowIndex, field: 'declaredWeight', tracker, fallback: parseNumericField(mapped.weight, { rowIndex, field: 'weight', tracker, fallback: 0.5 }) || 0.5 }) || (parseNumericField(mapped.weight, { rowIndex, field: 'weight', tracker, fallback: 0.5 }) || 0.5),
      weightSource: parseNumericField(mapped.weight, { rowIndex, field: 'weight', tracker, fallback: 0 }) > 0 ? 'parsed' : 'default',
      quantity: Math.max(1, Math.round(parseNumericField(mapped.quantity, { rowIndex, field: 'quantity', tracker, fallback: 1 }))) || 1,
      orderDate: parseFlexibleDate(mapped.orderDate, tracker, rowIndex, 'orderDate'),
      postedDate,
      releaseDate: releaseDate ?? undefined,
      length: len > 0 ? len : undefined,
      width: wid > 0 ? wid : undefined,
      height: hgt > 0 ? hgt : undefined,
      closingFee: closingFee > 0 ? closingFee : undefined,
      costPrice: mapped.costPrice != null
        ? parseNumericField(mapped.costPrice, { rowIndex, field: 'costPrice', tracker, absolute: true }) || undefined
        : undefined,
      totalCost: parsedTotalCost,
      datasetTotalRevenue,
      datasetProfit,
      datasetTotalFees,
      rowIndex,
    });
  }
  return rows;
}

/**
 * Infer the GST rate from the settlement amount and GST collected.
 *
 * BUG FIX: Previously used `settlement - gst` as the taxable base, which is
 * wrong when `settlement` is the NET payout (already fee-stripped). This caused
 * the inferred rate to be inflated and snap to the wrong slab.
 *
 * Fix: use `gst / settlement` as an approximation of the rate (treating
 * settlement ≈ taxable selling price), then snap to the nearest valid slab.
 * The wide slab bands (0, 5, 12, 18, 28) mean this approximation is robust
 * enough even when settlement is slightly off the true taxable base.
 */
function guessGstRate(settlement: number, gst: number): number {
  if (gst <= 0) return 0;
  if (settlement <= 0) return 18;
  const approxRate = (gst / settlement) * 100;
  const validRates = [0, 5, 12, 18, 28];
  const snapped = validRates.reduce((a, b) =>
    Math.abs(b - approxRate) < Math.abs(a - approxRate) ? b : a,
  );
  // If approxRate suggests non-zero but snapped to 0, it's likely 5% —
  // prevent false-zero inference for small GST amounts.
  return snapped === 0 && approxRate > 1 ? 5 : snapped;
}

// ── Main entry point ─────────────────────────────────────────────

export interface ParseResult {
  rows: SellerOrderRow[];
  platform: Platform;
  dataQuality: import('../../types/index.ts').DataQualitySummary;
  /** Present when file was parsed as Amazon flat transaction settlement (TransactionAmount / NetTransactionAmount / …) */
  amazonTransactionMetrics?: AmazonTransactionMetrics;
}

export async function parseSellerCsv(
  data: string,
  _filename: string,
  columnOverrides: Record<string, string> = {},
): Promise<ParseResult> {
  const tracker = createDataQualityTracker();
  const rawLines = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (rawLines.length < 2) throw new Error('File appears empty or has only one line');

  if (rawLines[0].charCodeAt(0) === 0xFEFF) rawLines[0] = rawLines[0].slice(1);

  const delim = detectDelimiter(rawLines[0]);
  const headerIdx = findHeaderLine(rawLines, delim);
  const headers = splitLine(rawLines[headerIdx], delim);
  const normHdrs = headers.map(norm);
  const dataLines = rawLines.slice(headerIdx + 1).filter(l => l.trim() !== '');

  if (dataLines.length === 0) throw new Error('No data rows found after the header');

  // ── Pre-check: does this file have ANY settlement/order columns? ──
  const REQUIRED_INDICATORS = [
    'order id', 'order-id', 'orderid', 'amazon order id',
    'amount', 'net amount', 'settlement amount', 'settlement value',
    'principal', 'selling price', 'item price', 'product sales',
    'transaction type', 'transaction-type', 'amount type', 'amount-type',
    'marketplace fee', 'commission', 'referral fee', 'selling fee',
    'seller sku', 'fsn', 'suborder no',
    'net transaction amount', 'transaction amount', 'total transaction fee',
    // Generic / custom dataset columns
    'revenue', 'price', 'sale', 'sales amount', 'income',
    'sku', 'quantity', 'qty', 'units',
  ];
  const hasAnyKnownColumn = normHdrs.some(h => REQUIRED_INDICATORS.includes(h));

  if (!hasAnyKnownColumn) {
    const sampleCols = normHdrs.slice(0, 8).join(', ');
    throw new UnrecognizedFileError(
      `This file does not appear to be a settlement or order report. ` +
      `Found columns: ${sampleCols}... — none of these are recognised as order/settlement fields.\n\n` +
      `FoLiOAI supports:\n` +
      `• Amazon Settlement Report V2 (from Seller Central → Reports → Payments)\n` +
      `• Amazon MTR / Business Report\n` +
      `• Flipkart Settlement Report (from Seller Hub → Payments)\n\n` +
      `Your file looks like a product catalog. Please upload a settlement or order report instead.`,
      normHdrs,
    );
  }

  // ── Detect platform ──
  if (isFlipkartFile(normHdrs)) {
    const missingColumns = ['settlement value', 'marketplace fee'].filter(col => !normHdrs.includes(col));
    noteMissingColumns(tracker, missingColumns);
    const rows = parseFlipkartCsv(headers, dataLines, delim, tracker, columnOverrides);
    if (rows.length === 0) throw new Error('Flipkart file parsed but no order rows found');
    return { rows, platform: 'flipkart', dataQuality: buildDataQualitySummary(tracker) };
  }

  // ── Detect Amazon V2 Settlement (multi-line per order: amount-type + amount-description) ──
  const isV2Settlement =
    normHdrs.some(h => h === 'transaction-type' || h === 'transaction type') &&
    normHdrs.some(h => h === 'amount-type' || h === 'amount type') &&
    normHdrs.some(h => h === 'amount-description' || h === 'amount description');

  // ── Amazon flat transaction settlement (one row per transaction; official-style columns) ──
  if (!isV2Settlement && canParseAsAmazonTransactionFlat(headers, columnOverrides)) {
    const { rows, metrics } = parseAmazonTransactionFlatSettlement(
      headers,
      dataLines,
      delim,
      tracker,
      columnOverrides,
    );
    return {
      rows,
      platform: 'amazon',
      dataQuality: buildDataQualitySummary(tracker),
      amazonTransactionMetrics: metrics,
    };
  }

  if (isV2Settlement) {
    const rawRows: Record<string, string>[] = dataLines.map(line => {
      const vals = splitLine(line, delim);
      const obj: Record<string, string> = {};
      headers.forEach((h, j) => { obj[h.trim()] = vals[j] ?? ''; });
      return obj;
    });
    noteAssumption(tracker, 'Amazon settlement V2 parsing groups multiple fee rows by orderId before reporting');
    const rows = parseAmazonFormatA(rawRows, tracker);
    if (rows.length === 0) throw new Error('Settlement report parsed but no order rows found');
    return { rows, platform: 'amazon', dataQuality: buildDataQualitySummary(tracker) };
  }

  // ── Amazon Format B (MTR/Business) ──
  const missingColumns = ['order id', 'settlement amount'].filter(col => !normHdrs.includes(col) && !normHdrs.includes(col.replace(' amount', '')));
  noteMissingColumns(tracker, missingColumns);
  const rows = parseAmazonFormatB(headers, dataLines, delim, tracker, columnOverrides);
  if (rows.length === 0) throw new Error('No valid rows found. Ensure the file has columns like: order id, sku, amount');

  const hasAnyRevenue = rows.some(r => r.settlement > 0 || r.referralFee > 0 || r.fulfillmentFee > 0);
  if (!hasAnyRevenue) {
    // Check if estimation can rescue the file (sellingPrice × qty available)
    const canEstimate = rows.some(r => r.sellingPrice > 0 && r.quantity > 0);
    if (canEstimate) {
      const { rows: estimated, log: estLog } = applyFallbackEstimations(rows, tracker);
      tracker.estimationLog = estLog;
      console.warn(`[parser] All settlement values were 0 — applied fallback estimation to ${estLog.totalEstimatedRows} rows`);
      return { rows: estimated, platform: 'amazon', dataQuality: buildDataQualitySummary(tracker) };
    }

    console.warn('[parser] Warning: all monetary fields are 0. Column headers found:', normHdrs.join(', '));
    throw new Error(
      `Your file was parsed (${rows.length} rows) but all monetary values are ₹0. ` +
      `Columns found: ${normHdrs.slice(0, 8).join(', ')}...\n\n` +
      `This usually means the revenue column wasn't recognised. Ensure your file has a column named ` +
      `"revenue", "amount", "net amount", "settlement amount", or "principal" (or "price" for unit price).\n\n` +
      `If your column has a different name, use the Column Mapping feature to remap it.\n\n` +
      `Download from: Amazon Seller Central → Reports → Payments → Transaction View, ` +
      `or Flipkart Seller Hub → Payments → Settlement Report.`
    );
  }

  return { rows, platform: 'amazon', dataQuality: buildDataQualitySummary(tracker) };
}

/** @deprecated Use parseSellerCsv instead */
export async function parseAmazonCsv(data: string, filename: string): Promise<SellerOrderRow[]> {
  const result = await parseSellerCsv(data, filename);
  return result.rows;
}

// Demo CSV generator — output mirrors real Amazon MTR format:
// "settlement amount" = net payout after all fees; GST on gross sale price.
export function generateDemoCsv(): string {
  const headers = [
    'order id', 'sku', 'settlement amount', 'referral fee', 'fba fees',
    'storage fee', 'other fees', 'gst amount', 'gst rate', 'ship state',
    'return amount', 'charged weight', 'declared weight', 'quantity', 'order date',
    'tcs amount', 'tds amount',
  ].join(',');

  const states = ['KA', 'MH', 'DL', 'TN', 'GJ', 'UP', 'WB', 'RJ'];
  const skus = ['SKU-A101', 'SKU-B204', 'SKU-C388', 'SKU-D091', 'SKU-E055'];
  const gstRates = [5, 12, 18, 18, 28];
  const rows: string[] = [headers];

  for (let i = 0; i < 50; i++) {
    const orderId = `403-${String(Math.floor(Math.random() * 9000000) + 1000000)}-${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
    const skuIdx = Math.floor(Math.random() * skus.length);
    const sku = skus[skuIdx];
    const gstRate = gstRates[skuIdx];

    // grossSale = what the customer actually pays (MRP incl. GST)
    const grossSale = Math.round((Math.random() * 2000 + 500) * 100) / 100;
    const gstAmount = Math.round(grossSale * gstRate / (100 + gstRate) * 100) / 100;
    const taxableValue = grossSale - gstAmount;

    // Realistic Amazon fees: ~10% referral on taxable value, flat FBA
    const referralFee = Math.round(taxableValue * 0.10 * 100) / 100;
    const fulfillmentFee = Math.round((Math.random() * 60 + 40) * 100) / 100;
    const storageFee = Math.round(Math.random() * 8 * 100) / 100;
    const otherFees = 0;

    // Net settlement = gross - all fees (what Amazon deposits)
    const settlement = Math.max(0, Math.round((grossSale - referralFee - fulfillmentFee - storageFee - otherFees) * 100) / 100);

    // TCS: 1% on taxable value
    const tcsAmount = Math.round(taxableValue * 0.01 * 100) / 100;
    const tdsAmount = 0;

    const state = states[Math.floor(Math.random() * states.length)];
    const returnAmount = Math.random() > 0.9 ? Math.round(grossSale * 100) / 100 : 0;
    const declaredWeight = Math.round((Math.random() * 2 + 0.2) * 10) / 10;
    const weight = Math.random() > 0.85 ? Math.round((declaredWeight + 0.5) * 10) / 10 : declaredWeight;
    const qty = 1;
    const day = Math.floor(Math.random() * 59) + 1;
    const date = day <= 31 ? `2026-01-${String(day).padStart(2, '0')}` : `2026-02-${String(day - 31).padStart(2, '0')}`;

    rows.push([
      orderId, sku, settlement, referralFee, fulfillmentFee,
      storageFee, otherFees, gstAmount, gstRate, state,
      returnAmount, weight, declaredWeight, qty, date,
      tcsAmount, tdsAmount,
    ].join(','));
  }

  rows.push(rows[5].replace(/403-\d+/g, '403-DUPE1111-2222222'));
  rows.push(rows[5].replace(/403-\d+/g, '403-DUPE1111-2222222'));

  return rows.join('\n');
}