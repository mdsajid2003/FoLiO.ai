// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy column matching — Levenshtein distance + similarity scoring.
// Auto-maps high-confidence headers, surfaces suggestions for ambiguous ones.
// ─────────────────────────────────────────────────────────────────────────────

import type { ColumnMatchResult, ColumnMappingLog, ColumnMappingSuggestion } from '../../types/index.ts';

// Re-export for convenience so callers only need one import
export type { ColumnMatchResult, ColumnMappingLog, ColumnMappingSuggestion };

// Header normalization: NFKC (fullwidth / compatibility chars from Excel), lowercase, collapse separators, strip non-alphanum
export function normalizeHeaderForFuzzy(header: string): string {
  return header
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Classic Levenshtein edit distance
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Use a single flat array instead of a 2-D matrix for memory efficiency
  const row0 = Array.from({ length: n + 1 }, (_, j) => j);
  const row1 = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    row1[0] = i;
    for (let j = 1; j <= n; j++) {
      row1[j] = a[i - 1] === b[j - 1]
        ? row0[j - 1]
        : 1 + Math.min(row0[j], row1[j - 1], row0[j - 1]);
    }
    for (let j = 0; j <= n; j++) row0[j] = row1[j];
  }
  return row0[n];
}

// Normalised similarity score in [0, 1]
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

// Thresholds
const AUTO_MAP_THRESHOLD = 0.82;   // ≥ this → auto-map silently
const SUGGEST_THRESHOLD  = 0.65;   // ≥ this → show a "Did you mean?" suggestion

/**
 * Match every raw CSV header against a target map of canonical column names.
 *
 * @param rawHeaders     - Original headers from the uploaded CSV
 * @param targetMap      - `{ "canonical name": "fieldName" }` (values are SellerOrderRow keys)
 * @param userOverrides  - `{ "raw header": "fieldName" }` from a previous user confirmation
 */
export function fuzzyMatchHeaders(
  rawHeaders: string[],
  targetMap: Record<string, string>,
  userOverrides: Record<string, string> = {},
): ColumnMappingLog {
  const results: ColumnMatchResult[] = [];
  const suggestedMappings: ColumnMappingSuggestion[] = [];
  const unmatchedColumns: string[] = [];
  const debugLines: string[] = [];
  let autoMappedCount = 0;

  // Pre-normalise the target map keys once
  const normTargetEntries: Array<[string, string]> = Object.entries(targetMap).map(
    ([k, v]) => [normalizeHeaderForFuzzy(k), v],
  );
  const normTargetMap = Object.fromEntries(normTargetEntries);

  // Pre-normalise user overrides keys
  const normOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(userOverrides)) {
    normOverrides[normalizeHeaderForFuzzy(k)] = v;
  }

  for (const raw of rawHeaders) {
    const normalized = normalizeHeaderForFuzzy(raw);

    // 1. User override has absolute priority
    if (normOverrides[normalized]) {
      const field = normOverrides[normalized];
      results.push({ rawHeader: raw, normalizedHeader: normalized, mappedField: field, similarity: 1, matchType: 'exact' });
      debugLines.push(`[OVERRIDE] "${raw}" → field:${field}`);
      continue;
    }

    // 2. Exact match after normalisation
    if (normTargetMap[normalized]) {
      results.push({ rawHeader: raw, normalizedHeader: normalized, mappedField: normTargetMap[normalized], similarity: 1, matchType: 'exact' });
      debugLines.push(`[EXACT] "${raw}" (norm:"${normalized}") → field:${normTargetMap[normalized]}`);
      continue;
    }

    // 3. Fuzzy scan against all normalised target keys
    let bestScore = 0;
    let bestNormTarget = '';
    let bestField = '';
    for (const [normTarget, field] of normTargetEntries) {
      const score = stringSimilarity(normalized, normTarget);
      if (score > bestScore) {
        bestScore = score;
        bestNormTarget = normTarget;
        bestField = field;
      }
    }

    if (bestScore >= AUTO_MAP_THRESHOLD) {
      results.push({
        rawHeader: raw, normalizedHeader: normalized,
        mappedField: bestField, similarity: bestScore,
        matchType: 'fuzzy_auto', suggestion: bestNormTarget,
      });
      autoMappedCount++;
      debugLines.push(
        `[FUZZY_AUTO] "${raw}" → field:${bestField}  (${(bestScore * 100).toFixed(0)}% match via canonical:"${bestNormTarget}")`
      );
    } else if (bestScore >= SUGGEST_THRESHOLD) {
      results.push({
        rawHeader: raw, normalizedHeader: normalized,
        mappedField: null, similarity: bestScore,
        matchType: 'fuzzy_suggest', suggestion: bestNormTarget,
      });
      suggestedMappings.push({ raw, suggestedTarget: bestNormTarget, mappedField: bestField, similarity: bestScore });
      debugLines.push(
        `[FUZZY_SUGGEST] "${raw}" ≈ "${bestNormTarget}" (${(bestScore * 100).toFixed(0)}%) — needs user confirmation`
      );
    } else {
      results.push({
        rawHeader: raw, normalizedHeader: normalized,
        mappedField: null, similarity: bestScore,
        matchType: 'unmatched',
      });
      unmatchedColumns.push(raw);
      debugLines.push(`[UNMATCHED] "${raw}" (best score:${(bestScore * 100).toFixed(0)}%)`);
    }
  }

  return { results, autoMappedCount, suggestedMappings, unmatchedColumns, debugLines };
}

/** Build a `{ normalizedHeader → fieldName }` lookup from a completed mapping log */
export function buildFieldLookupFromFuzzy(log: ColumnMappingLog): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const result of log.results) {
    if (result.mappedField) {
      lookup[normalizeHeaderForFuzzy(result.rawHeader)] = result.mappedField;
    }
  }
  return lookup;
}
