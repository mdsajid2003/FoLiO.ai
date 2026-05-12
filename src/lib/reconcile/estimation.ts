// ─────────────────────────────────────────────────────────────────────────────
// Fallback estimation engine.
//
// When critical financial fields are missing from a row, this module estimates
// them from available context.  Every estimated value is:
//   • Tracked in EstimationLog so the UI can show a badge
//   • Recorded as a data-quality assumption so the report is transparent
//
// Rule: NEVER mix estimated and real values silently.
// ─────────────────────────────────────────────────────────────────────────────

import type { SellerOrderRow, EstimationLog } from '../../types/index.ts';
import { noteAssumption } from './data-quality.ts';
import type { DataQualityTracker } from './data-quality.ts';

export type { EstimationLog };

// The midpoint of Amazon's typical net-settlement-to-gross ratio (60 %–85 %)
const SETTLEMENT_MIDPOINT_RATIO = 0.725;

/**
 * Apply safe fallback estimations to rows that are missing critical fields.
 * Only settlement can be estimated here (from sellingPrice × qty × ratio).
 * All other missing fields remain 0 — they are flagged via DataQuality warnings.
 */
export function applyFallbackEstimations(
  rows: SellerOrderRow[],
  tracker: DataQualityTracker,
): { rows: SellerOrderRow[]; log: EstimationLog } {
  const estimatedFields: EstimationLog['estimatedFields'] = [];

  const processedRows = rows.map(row => {
    // Only estimate settlement when it is genuinely missing (= 0) AND we have
    // enough source data to make a reasonable estimate.
    if (row.settlement > 0) return row;
    if (row.sellingPrice <= 0 || row.quantity <= 0) return row;

    const estimated = Math.round(row.sellingPrice * row.quantity * SETTLEMENT_MIDPOINT_RATIO * 100) / 100;
    noteAssumption(
      tracker,
      `Row ${row.rowIndex}: settlement estimated = sellingPrice(${row.sellingPrice}) × qty(${row.quantity}) × 72.5%` +
      ` — confidence:LOW — no settlement column found in file`,
    );
    estimatedFields.push({
      rowIndex: row.rowIndex,
      field: 'settlement',
      estimatedValue: estimated,
      method: `sellingPrice × qty × ${SETTLEMENT_MIDPOINT_RATIO}`,
      confidence: 'low',
    });

    return { ...row, settlement: estimated };
  });

  return {
    rows: processedRows,
    log: { totalEstimatedRows: estimatedFields.length, estimatedFields },
  };
}

/**
 * Throw (or warn) when a required field is missing AND the user explicitly
 * disallowed estimation.  Used in strict-mode parsing.
 */
export function assertFieldPresent(
  value: number | undefined | null,
  fieldName: string,
  rowIndex: number,
  allowEstimation: boolean,
): void {
  if (value !== undefined && value !== null && !Number.isNaN(value)) return;
  const msg = `Row ${rowIndex}: required field "${fieldName}" is missing and estimation is disabled.`;
  if (!allowEstimation) throw new Error(msg);
}
