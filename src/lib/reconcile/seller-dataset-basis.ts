import type { SellerOrderRow } from '../../types/index.ts';

/** Non-deferred rows included in seller order-level analytics */
export function materialSellerRows(rows: SellerOrderRow[]): SellerOrderRow[] {
  return rows.filter((r) => r.isDeferred !== true);
}

/** True when every material row carries an explicit `total_revenue` (CSV) value */
export function usesLineTotalRevenue(rows: SellerOrderRow[]): boolean {
  const m = materialSellerRows(rows);
  return (
    m.length > 0 &&
    m.every((r) => r.datasetTotalRevenue != null && Number.isFinite(r.datasetTotalRevenue))
  );
}

/** True when every material row carries an explicit `profit` column */
export function usesLineProfit(rows: SellerOrderRow[]): boolean {
  const m = materialSellerRows(rows);
  return m.length > 0 && m.every((r) => r.datasetProfit != null && Number.isFinite(r.datasetProfit));
}

/** True when every material row carries explicit `total_fees` from CSV */
export function usesLineTotalFees(rows: SellerOrderRow[]): boolean {
  const m = materialSellerRows(rows);
  return m.length > 0 && m.every((r) => r.datasetTotalFees != null && Number.isFinite(r.datasetTotalFees));
}

export function sumLineTotalRevenue(rows: SellerOrderRow[]): number {
  return materialSellerRows(rows).reduce((s, r) => s + (r.datasetTotalRevenue ?? 0), 0);
}

export function sumLineProfit(rows: SellerOrderRow[]): number {
  return materialSellerRows(rows).reduce((s, r) => s + (r.datasetProfit ?? 0), 0);
}

export function sumLineTotalFees(rows: SellerOrderRow[]): number {
  return materialSellerRows(rows).reduce((s, r) => s + (r.datasetTotalFees ?? 0), 0);
}

function feePartRow(r: SellerOrderRow): number {
  return r.referralFee + r.fulfillmentFee + r.storageFee + r.otherFees + (r.closingFee ?? 0);
}

/** Legacy gross reconstruction: settlement + fee components (positive settlement rows only) */
export function sumSettlementPlusFeeGross(rows: SellerOrderRow[]): number {
  let s = 0;
  for (const r of materialSellerRows(rows)) {
    if (r.settlement <= 0) continue;
    s += r.settlement + feePartRow(r);
  }
  return Math.round(s * 100) / 100;
}

/** selling_price × max(quantity, 1) — must not be used as headline revenue when line total_revenue exists */
export function sumSellingPriceTimesQty(rows: SellerOrderRow[]): number {
  let s = 0;
  for (const r of materialSellerRows(rows)) {
    s += r.sellingPrice * Math.max(1, r.quantity);
  }
  return Math.round(s * 100) / 100;
}

/**
 * Warn if common wrong revenue reconstructions differ from SUM(total_revenue) by >1%.
 * Runs only when `usesLineTotalRevenue(rows)`.
 */
export function datasetRevenueDeviationWarnings(rows: SellerOrderRow[]): string[] {
  if (!usesLineTotalRevenue(rows)) return [];
  const truth = sumLineTotalRevenue(rows);
  if (truth <= 0) return [];
  const out: string[] = [];
  const check = (label: string, alt: number) => {
    const dev = Math.abs(alt - truth) / truth;
    if (dev > 0.01) {
      out.push(
        `Revenue sanity: ${label} (₹${alt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}) ` +
          `differs from SUM(total_revenue) (₹${truth.toLocaleString('en-IN', { maximumFractionDigits: 2 })}) ` +
          `by ${(dev * 100).toFixed(2)}% — using SUM(total_revenue) for the report.`,
      );
    }
  };
  check('settlement + fee columns (reconstructed gross)', sumSettlementPlusFeeGross(rows));
  check('selling_price × quantity', sumSellingPriceTimesQty(rows));
  return out;
}

export function isSaleRowForCogs(r: SellerOrderRow): boolean {
  if (r.isDeferred === true) return false;
  return r.settlement > 0 || (r.datasetTotalRevenue != null && r.datasetTotalRevenue > 0);
}
