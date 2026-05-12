import { SellerOrderRow } from '../../types/index.ts';
import {
  DataQualityTracker,
  excludeRow,
  normalizeStateCode,
  noteAssumption,
  parseFlexibleDate,
  parseNumericField,
} from './data-quality.ts';
import {
  fuzzyMatchHeaders,
  buildFieldLookupFromFuzzy,
  normalizeHeaderForFuzzy,
} from './fuzzy-columns.ts';

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

// Flipkart settlement column mapping
const FK_COL_MAP: Record<string, string> = {
  'order id': 'orderId',
  'orderid': 'orderId',
  'order item id': 'orderItemId',
  'order item nid': 'orderItemId',
  'suborder no': 'orderItemId',

  'sku': 'sku',
  'seller sku': 'sku',
  'product name': 'productName',
  'product title': 'productName',
  'fsn': 'sku',

  'selling price': 'sellingPrice',
  'order item value': 'sellingPrice',
  'total sale amount': 'sellingPrice',
  'item selling price': 'sellingPrice',

  'settlement value': 'settlement',
  'net settlement': 'settlement',
  'settlement amount': 'settlement',
  'total settlement': 'settlement',
  'seller settlement value': 'settlement',

  'marketplace fee': 'referralFee',
  'commission': 'referralFee',
  'commission fee': 'referralFee',
  'marketplace commission': 'referralFee',

  'shipping fee': 'fulfillmentFee',
  'logistics fee': 'fulfillmentFee',
  'delivery charges': 'fulfillmentFee',
  'shipping charges': 'fulfillmentFee',
  'pick and pack fee': 'pickAndPack',
  'pick pack fee': 'pickAndPack',

  'fixed fee': 'fixedFee',
  'collection fee': 'collectionFee',
  'platform fee': 'fixedFee',

  'tcs amount': 'tcsDeducted',
  'tcs': 'tcsDeducted',
  'tcs rate': '_tcsRate',

  'tds amount': 'tdsDeducted',
  'tds': 'tdsDeducted',

  'gst': 'gstCollected',
  'igst': 'gstCollected',
  'gst amount': 'gstCollected',
  'tax amount': 'gstCollected',
  'total tax': 'gstCollected',

  'quantity': 'quantity',
  'qty': 'quantity',

  'order date': 'orderDate',
  'order created date': 'orderDate',
  'sale date': 'orderDate',

  'ship state': 'pos',
  'delivery state': 'pos',
  'buyer state': 'pos',
  'state': 'pos',

  'return amount': 'returnAmount',
  'refund amount': 'returnAmount',
  'cancellation amount': 'returnAmount',

  'cost price': 'costPrice',
  'cost_price': 'costPrice',
  'cogs': 'costPrice',
  'purchase price': 'costPrice',
  'unit cost': 'costPrice',
  // These carry a quantity-adjusted total — must NOT be multiplied by qty again
  'total cost': 'totalCost',
  'total_cost': 'totalCost',
  'landed cost': 'totalCost',

  'total revenue': 'datasetTotalRevenue',
  'total_revenue': 'datasetTotalRevenue',
  'profit': 'datasetProfit',
  'total fees': 'datasetTotalFees',
  'total_fees': 'datasetTotalFees',
  'net payout': 'settlement',
  'net_payout': 'settlement',
};

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

function guessGstRate(sellingPrice: number, gst: number): number {
  if (sellingPrice <= 0 || gst <= 0) return 18;
  const base = sellingPrice - gst;
  if (base <= 0) return 18;
  const rate = (gst / base) * 100;
  const validRates = [0, 5, 12, 18, 28];
  return validRates.reduce((a, b) => Math.abs(b - rate) < Math.abs(a - rate) ? b : a);
}

export function parseFlipkartCsv(
  headers: string[],
  dataLines: string[],
  delim: string,
  tracker: DataQualityTracker,
  columnOverrides: Record<string, string> = {},
): SellerOrderRow[] {
  tracker.detectedSchema = 'flipkart';
  // ── Fuzzy column resolution (runs once per file) ─────────────────
  const fuzzyLog = fuzzyMatchHeaders(headers, FK_COL_MAP, columnOverrides);
  tracker.columnMappingLog = fuzzyLog;

  for (const line of fuzzyLog.debugLines.filter(l => l.startsWith('[FUZZY_AUTO]'))) {
    noteAssumption(tracker, `Column auto-matched: ${line.replace('[FUZZY_AUTO] ', '')}`);
  }
  for (const col of fuzzyLog.unmatchedColumns) {
    tracker.warnings.add(`Column "${col}" was not recognised and will be ignored`);
  }
  for (const s of fuzzyLog.suggestedMappings) {
    tracker.warnings.add(
      `Column "${s.raw}" (${(s.similarity * 100).toFixed(0)}% match) may map to "${s.suggestedTarget}" — confirm in Column Mapping`,
    );
  }

  const fieldLookup = buildFieldLookupFromFuzzy(fuzzyLog);
  const rows: SellerOrderRow[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const vals = splitLine(dataLines[i], delim);
    if (vals.length < 2 || vals.every(v => v === '')) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, j) => { raw[normalizeHeaderForFuzzy(h)] = vals[j] ?? ''; });

    const mapped: Record<string, any> = {};
    for (const [normH, v] of Object.entries(raw)) {
      const field = fieldLookup[normH];
      if (field) mapped[field] = v;
    }

    const rowIndex = i + 2;
    const sellingPrice = parseNumericField(mapped.sellingPrice, { rowIndex, field: 'sellingPrice', tracker, invalidAsNaN: true });
    const settlement = parseNumericField(mapped.settlement, { rowIndex, field: 'settlement', tracker, invalidAsNaN: true });
    const gstCollected = parseNumericField(mapped.gstCollected, { rowIndex, field: 'gstCollected', tracker });
    const referralFee = parseNumericField(mapped.referralFee, { rowIndex, field: 'referralFee', tracker, absolute: true });
    const fulfillmentFee = parseNumericField(mapped.fulfillmentFee, { rowIndex, field: 'fulfillmentFee', tracker, absolute: true });
    const pickAndPack = parseNumericField(mapped.pickAndPack, { rowIndex, field: 'pickAndPack', tracker, absolute: true });
    const fixedFee = parseNumericField(mapped.fixedFee, { rowIndex, field: 'fixedFee', tracker, absolute: true });
    const collectionFee = parseNumericField(mapped.collectionFee, { rowIndex, field: 'collectionFee', tracker, absolute: true });

    const otherFees = pickAndPack + fixedFee + collectionFee;
    const finalSellingPrice = !Number.isNaN(sellingPrice) && sellingPrice > 0 ? sellingPrice : settlement;
    const finalSettlement = !Number.isNaN(settlement) && settlement > 0 ? settlement : sellingPrice;

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

    const hasLineRevenue = datasetTotalRevenue !== undefined && Number.isFinite(datasetTotalRevenue);

    if (!mapped.orderId || (Number.isNaN(finalSellingPrice) && Number.isNaN(finalSettlement) && !hasLineRevenue)) {
      excludeRow(tracker, rowIndex, 'Excluded Flipkart row due to missing orderId or invalid monetary columns');
      continue;
    }

    if (!mapped.settlement) noteAssumption(tracker, 'Some Flipkart rows used selling price as settlement because settlement was missing');
    if (!mapped.sellingPrice) noteAssumption(tracker, 'Some Flipkart rows used settlement value as selling price because selling price was missing');
    if (!mapped.gstCollected) noteAssumption(tracker, 'Some Flipkart rows had no GST amount; GST rate was inferred from settlement values when needed');
    if (!mapped.pos) noteAssumption(tracker, 'Some Flipkart rows had no buyer state; place of supply defaulted to KA');
    noteAssumption(tracker, 'Flipkart storage and shipment weights are not present in standard files; weight-based checks use defaults');

    rows.push({
      platform: 'flipkart',
      orderId: String(mapped.orderId ?? `FK-ROW-${i}`),
      orderItemId: mapped.orderItemId ? String(mapped.orderItemId) : undefined,
      sku: String(mapped.sku ?? mapped.productName ?? 'UNKNOWN'),
      productName: mapped.productName ? String(mapped.productName) : undefined,
      sellingPrice:
        finalSellingPrice > 0
          ? finalSellingPrice
          : hasLineRevenue && datasetTotalRevenue != null && datasetTotalRevenue > 0
            ? datasetTotalRevenue
            : 0,
      settlement: finalSettlement > 0 ? finalSettlement : 0,
      referralFee,
      fulfillmentFee,
      storageFee: 0,
      otherFees,
      gstCollected,
      gstRate: guessGstRate(
        (finalSellingPrice > 0 ? finalSellingPrice : 0) ||
          (finalSettlement > 0 ? finalSettlement : 0) ||
          (datasetTotalRevenue ?? 0),
        gstCollected,
      ),
      pos: normalizeStateCode(mapped.pos, tracker, rowIndex, 'pos'),
      tcsDeducted: parseNumericField(mapped.tcsDeducted, { rowIndex, field: 'tcsDeducted', tracker, absolute: true }),
      tdsDeducted: parseNumericField(mapped.tdsDeducted, { rowIndex, field: 'tdsDeducted', tracker, absolute: true }),
      returnAmount: parseNumericField(mapped.returnAmount, { rowIndex, field: 'returnAmount', tracker, absolute: true }),
      weight: 0.5,
      declaredWeight: 0.5,
      weightSource: 'default' as const,
      quantity: Math.max(1, Math.round(parseNumericField(mapped.quantity, { rowIndex, field: 'quantity', tracker, fallback: 1 }))) || 1,
      orderDate: parseFlexibleDate(mapped.orderDate, tracker, rowIndex, 'orderDate'),
      costPrice: mapped.costPrice != null
        ? parseNumericField(mapped.costPrice, { rowIndex, field: 'costPrice', tracker, absolute: true }) || undefined
        : undefined,
      totalCost: mapped.totalCost != null
        ? parseNumericField(mapped.totalCost, { rowIndex, field: 'totalCost', tracker, absolute: true }) || undefined
        : undefined,
      datasetTotalRevenue,
      datasetProfit,
      datasetTotalFees,
      rowIndex,
    });
  }

  return rows;
}

export function isFlipkartFile(normalizedHeaders: string[]): boolean {
  const flipkartIndicators = [
    'marketplace fee', 'marketplace commission', 'commission fee',
    'pick and pack fee', 'pick pack fee', 'collection fee',
    'settlement value', 'seller settlement value', 'fsn',
    'seller sku', 'suborder no', 'order item nid',
  ];
  return flipkartIndicators.some(indicator =>
    normalizedHeaders.some(h => h === indicator || h.includes(indicator))
  );
}
