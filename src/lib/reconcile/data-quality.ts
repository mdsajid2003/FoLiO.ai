import {
  DataQualitySummary,
  ValidationIssue,
  ColumnMappingLog,
  EstimationLog,
  DetectedSettlementSchema,
} from '../../types/index.ts';

export interface DataQualityTracker {
  issues: ValidationIssue[];
  assumptions: Set<string>;
  warnings: Set<string>;
  missingRequiredColumns: Set<string>;
  excludedRowCount: number;
  columnMappingLog?: ColumnMappingLog;
  estimationLog?: EstimationLog;
  detectedSchema?: DetectedSettlementSchema;
  transactionTypeDistribution?: Record<string, number>;
}

interface NumericFieldOptions {
  rowIndex: number;
  field: string;
  tracker: DataQualityTracker;
  allowBlank?: boolean;
  absolute?: boolean;
  fallback?: number;
  invalidAsNaN?: boolean;
}

export function createDataQualityTracker(): DataQualityTracker {
  return {
    issues: [],
    assumptions: new Set<string>(),
    warnings: new Set<string>(),
    missingRequiredColumns: new Set<string>(),
    excludedRowCount: 0,
  };
}

export function parseNumericField(rawValue: unknown, options: NumericFieldOptions): number {
  const {
    rowIndex,
    field,
    tracker,
    allowBlank = true,
    absolute = false,
    fallback = 0,
    invalidAsNaN = false,
  } = options;

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    if (!allowBlank) {
      tracker.issues.push({
        rowIndex,
        field,
        severity: 'error',
        message: `${field} is required but blank`,
      });
    }
    return fallback;
  }

  const normalized = String(rawValue).replace(/,/g, '').replace(/₹/g, '').replace(/\r/g, '').trim();
  if (!normalized) {
    if (!allowBlank) {
      tracker.issues.push({
        rowIndex,
        field,
        severity: 'error',
        message: `${field} is required but blank`,
      });
    }
    return fallback;
  }

  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    tracker.issues.push({
      rowIndex,
      field,
      severity: 'error',
      rawValue: normalized,
      message: `${field} is not a valid number`,
    });
    return invalidAsNaN ? Number.NaN : fallback;
  }

  return absolute ? Math.abs(parsed) : parsed;
}

export function normalizeStateCode(
  rawValue: unknown,
  tracker: DataQualityTracker,
  rowIndex: number,
  field: string,
  // Changed from 'KA': hardcoding Karnataka affected all sellers outside Karnataka,
  // producing silent GST/TCS errors. Now defaults to '' so callers can decide,
  // and the assumption message reflects the actual fallback used.
  fallback: string = '',
): string {
  const raw = String(rawValue ?? '').trim().toUpperCase();
  if (!raw) {
    if (fallback) {
      tracker.assumptions.add(`${field} missing on some rows; defaulted to ${fallback} — verify your state code to avoid GST/TCS errors`);
    } else {
      tracker.assumptions.add(`${field} missing on some rows; place of supply left blank`);
    }
    return fallback;
  }

  const code = raw.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(code)) {
    tracker.issues.push({
      rowIndex,
      field,
      severity: 'warning',
      rawValue: raw,
      message: `${field} is not a valid 2-letter state code; defaulted to ${fallback}`,
    });
    tracker.assumptions.add(`${field} had invalid values on some rows; defaulted to ${fallback}`);
    return fallback;
  }

  return code;
}

export function parseFlexibleDate(
  rawValue: unknown,
  tracker: DataQualityTracker,
  rowIndex: number,
  field: string,
): string | undefined {
  if (!rawValue) return undefined;
  const raw = String(rawValue).trim();
  if (!raw) return undefined;

  // #H/#25 fix: attempt explicit DD-MM-YYYY and DD/MM/YYYY parsing FIRST before
  // handing off to `new Date()`, which uses MM-DD-YYYY in V8 for ambiguous strings.
  // e.g. "01-04-2024" must be April 1 (Indian date), not January 4 (US interpretation).
  const ddmmyyyy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    // Build an unambiguous ISO string so the parser can't misinterpret it
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // ISO-style or other formats that new Date() handles correctly
  try {
    const date = new Date(raw);
    if (!isNaN(date.getTime())) return date.toISOString();
  } catch {
    // ignore, handled below
  }

  // #25 fix: getMonthKey uses UTC methods to avoid IST timezone bucket mismatch.
  // (The toISOString() above already produces UTC midnight — compatible with getMonthKey.)

  tracker.issues.push({
    rowIndex,
    field,
    severity: 'warning',
    rawValue: raw,
    message: `${field} could not be parsed`,
  });
  return undefined;
}

export function noteMissingColumns(tracker: DataQualityTracker, columns: string[]): void {
  for (const column of columns) {
    tracker.missingRequiredColumns.add(column);
  }
}

export function noteAssumption(tracker: DataQualityTracker, message: string): void {
  tracker.assumptions.add(message);
}

export function excludeRow(tracker: DataQualityTracker, rowIndex: number, reason: string): void {
  tracker.excludedRowCount += 1;
  tracker.issues.push({
    rowIndex,
    field: 'row',
    severity: 'error',
    message: reason,
  });
}

export function buildDataQualitySummary(tracker: DataQualityTracker): DataQualitySummary {
  const invalidRowCount = new Set(
    tracker.issues.filter(issue => issue.severity === 'error').map(issue => issue.rowIndex),
  ).size;

  const warnings = Array.from(new Set([
    ...tracker.warnings,
    ...tracker.issues.filter(issue => issue.severity === 'warning').map(issue => issue.message),
  ]));

  const assumptionsUsed = Array.from(tracker.assumptions).sort();
  const missingRequiredColumns = Array.from(tracker.missingRequiredColumns).sort();

  return {
    invalidRowCount,
    excludedRowCount: tracker.excludedRowCount,
    missingRequiredColumns,
    assumptionsUsed,
    warnings,
    financeGradeReady:
      invalidRowCount === 0 &&
      tracker.excludedRowCount === 0 &&
      missingRequiredColumns.length === 0 &&
      assumptionsUsed.length === 0,
    issueSample: tracker.issues.slice(0, 12),
    columnMappingLog: tracker.columnMappingLog,
    estimationLog: tracker.estimationLog,
    detectedSchema: tracker.detectedSchema,
    transactionTypeDistribution: tracker.transactionTypeDistribution,
  };
}
