/**
 * Schema Auto-Inference
 *
 * Samples a batch of StreamRows and produces a StreamSchema:
 *  - Detects column types: number, boolean, timestamp, currency, percentage, string
 *  - Infers labels (snake_case / camelCase → "Title Case")
 *  - Suggests alignment (numbers → right, booleans → center, strings → left)
 *  - Detects the id column and timestamp column
 *  - Marks numeric columns as anomaly candidates
 */

import type { StreamRow, StreamSchema, StreamColumn, ColumnType } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CURRENCY_RE  = /^\s*[$€£¥₹]\s*[\d,]+(\.\d{1,4})?\s*$/;
const PERCENT_RE   = /^\s*[\d.]+\s*%\s*$/;
const ISO_DATE_RE  = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;
const UNIX_MS_MIN  = 1_000_000_000_000;   // 2001-09-09 — lower bound for unix ms
const UNIX_MS_MAX  = 9_999_999_999_999;   // 2286-11-20

/** Convert camelCase / snake_case / kebab-case to "Title Case" */
function toLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase split
    .replace(/[_-]+/g, ' ')                 // snake / kebab
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Classify a raw cell value sample into a ColumnType */
function classifyValue(v: unknown): ColumnType | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return 'boolean';

  if (typeof v === 'number') {
    if (v >= UNIX_MS_MIN && v <= UNIX_MS_MAX && Number.isInteger(v)) return 'timestamp';
    return 'number';
  }

  if (typeof v === 'string') {
    if (CURRENCY_RE.test(v))  return 'currency';
    if (PERCENT_RE.test(v))   return 'percentage';
    if (ISO_DATE_RE.test(v))  return 'timestamp';
    const num = Number(v);
    if (!isNaN(num) && v.trim() !== '') return 'number';
    return 'string';
  }

  return 'string';
}

/** Merge two ColumnType classifications — prefer more specific types */
const TYPE_PRIORITY: Record<ColumnType, number> = {
  currency:   6,
  percentage: 5,
  timestamp:  4,
  boolean:    3,
  number:     2,
  string:     1,
};

function mergeTypes(a: ColumnType | null, b: ColumnType | null): ColumnType | null {
  if (a === null) return b;
  if (b === null) return a;
  if (a === b) return a;
  // If there's a conflict, prefer the higher-priority type unless one side is 'string'
  // (string means it could be anything — use the other type's verdict unless also string)
  if (a === 'string') return b;
  if (b === 'string') return a;
  // Different numeric subtypes — fall back to number
  return TYPE_PRIORITY[a] >= TYPE_PRIORITY[b] ? a : b;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface InferSchemaOptions {
  /** Max rows to sample. Default: 50 */
  sampleSize?: number;
  /** If a column looks like a unix-ms timestamp AND is named like a timestamp, override. Default: true */
  preferTimestampNames?: boolean;
  /** Columns to exclude from the schema output (e.g. internal fields). Default: [] */
  exclude?: string[];
}

/**
 * Infer a StreamSchema from an array of StreamRows.
 *
 * @param rows  - Array of rows to sample. At least 5 recommended.
 * @param opts  - Tuning options.
 * @returns StreamSchema with inferred columns, idColumn, and timestampColumn.
 */
export function inferSchema(rows: StreamRow[], opts: InferSchemaOptions = {}): StreamSchema {
  const { sampleSize = 50, preferTimestampNames = true, exclude = [] } = opts;

  if (rows.length === 0) {
    return { columns: [], idColumn: 'id', timestampColumn: 'timestamp' };
  }

  // Sample up to sampleSize rows (evenly spaced if more rows than sample size)
  const step  = Math.max(1, Math.floor(rows.length / sampleSize));
  const sample: StreamRow[] = [];
  for (let i = 0; i < rows.length && sample.length < sampleSize; i += step) {
    sample.push(rows[i]!);
  }

  // Collect all column keys (excluding 'id' and 'timestamp' — handled separately)
  const allKeys = new Set<string>();
  for (const row of sample) {
    for (const key of Object.keys(row)) {
      if (!exclude.includes(key)) allKeys.add(key);
    }
  }

  // Remove the built-in fields from column generation
  allKeys.delete('id');
  allKeys.delete('timestamp');

  // Classify each column
  const typeMap = new Map<string, ColumnType | null>();
  const nonNullCounts = new Map<string, number>();

  for (const key of allKeys) {
    typeMap.set(key, null);
    nonNullCounts.set(key, 0);
  }

  for (const row of sample) {
    for (const key of allKeys) {
      const v = row[key];
      if (v === null || v === undefined || v === '') continue;
      nonNullCounts.set(key, (nonNullCounts.get(key) ?? 0) + 1);
      const detected = classifyValue(v);
      typeMap.set(key, mergeTypes(typeMap.get(key) ?? null, detected));
    }
  }

  // Override type using column name heuristics
  const TIMESTAMP_NAME_RE = /^(time|ts|timestamp|date|created|updated|at|_at)$/i;
  const CURRENCY_NAME_RE  = /^(price|cost|revenue|salary|amount|fee|rate|value|balance|budget|spend)/i;
  const PERCENT_NAME_RE   = /^(pct|percent|percentage|ratio|rate|cvr|abandon|utilization)/i;

  for (const key of allKeys) {
    const current = typeMap.get(key);

    if (preferTimestampNames && TIMESTAMP_NAME_RE.test(key) && (current === 'number' || current === null)) {
      typeMap.set(key, 'timestamp');
    } else if (CURRENCY_NAME_RE.test(key) && current === 'number') {
      typeMap.set(key, 'currency');
    } else if (PERCENT_NAME_RE.test(key) && current === 'number') {
      typeMap.set(key, 'percentage');
    }

    // If still null (all values were empty/null), fall back to 'string'
    if (typeMap.get(key) === null) {
      typeMap.set(key, 'string');
    }
  }

  // Find idColumn and timestampColumn
  const idColumn        = 'id';
  const timestampColumn = 'timestamp';

  // Build StreamColumn list
  const columns: StreamColumn[] = [];

  // Always put symbol / id-like columns first
  const IDENTITY_KEYS = ['symbol', 'sensor', 'category', 'region', 'platform', 'service', 'name', 'label'];
  const sortedKeys = Array.from(allKeys).sort((a, b) => {
    const ai = IDENTITY_KEYS.indexOf(a);
    const bi = IDENTITY_KEYS.indexOf(b);
    if (ai !== -1 && bi === -1) return -1;
    if (bi !== -1 && ai === -1) return 1;
    if (ai !== -1 && bi !== -1) return ai - bi;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const type   = (typeMap.get(key) ?? 'string') as ColumnType;
    const label  = toLabel(key);
    const align  = type === 'number' || type === 'currency' || type === 'percentage' || type === 'timestamp'
      ? 'right' as const
      : type === 'boolean'
        ? 'center' as const
        : 'left' as const;

    // Suggest column widths based on type
    const width = type === 'string' ? 140
      : type === 'currency'         ? 110
      : type === 'percentage'       ? 80
      : type === 'timestamp'        ? 130
      : type === 'boolean'          ? 70
      : 100;

    // Mark numeric/currency/percentage columns as anomaly candidates
    const monitorAnomaly = type === 'number' || type === 'currency' || type === 'percentage';

    columns.push({ id: key, label, type, align, width, monitorAnomaly });
  }

  return { columns, idColumn, timestampColumn };
}

/**
 * Merge two StreamSchemas (e.g. as more rows arrive and new columns appear).
 * Existing column types are preserved; new columns are appended.
 */
export function mergeSchemas(base: StreamSchema, update: StreamSchema): StreamSchema {
  const existingIds = new Set(base.columns.map((c) => c.id));
  const newCols = update.columns.filter((c) => !existingIds.has(c.id));
  return {
    ...base,
    columns: [...base.columns, ...newCols],
  };
}

/**
 * Convenience: infer schema incrementally from a running stream.
 * Call this after every N rows to progressively refine the schema.
 *
 * Returns the same schema once it stabilizes (all numeric columns detected
 * after the first `minSamples` rows).
 */
export class SchemaInferrer {
  private _schema: StreamSchema | null = null;
  private _rowsSeen = 0;
  private readonly _minSamples: number;
  private readonly _recheckEvery: number;

  constructor(opts: { minSamples?: number; recheckEvery?: number } = {}) {
    this._minSamples    = opts.minSamples    ?? 20;
    this._recheckEvery  = opts.recheckEvery  ?? 100;
  }

  get schema(): StreamSchema | null { return this._schema; }
  get rowsSeen(): number            { return this._rowsSeen; }

  /**
   * Feed new rows into the inferrer. Returns the updated schema
   * (or null if not enough samples yet).
   */
  feed(rows: StreamRow[]): StreamSchema | null {
    this._rowsSeen += rows.length;

    if (this._rowsSeen < this._minSamples) return null;

    // Recompute every recheckEvery rows to pick up new columns
    const shouldRecompute =
      this._schema === null ||
      this._rowsSeen % this._recheckEvery < rows.length;

    if (shouldRecompute) {
      const fresh = inferSchema(rows, { sampleSize: 50 });
      this._schema = this._schema ? mergeSchemas(this._schema, fresh) : fresh;
    }

    return this._schema;
  }

  reset(): void {
    this._schema   = null;
    this._rowsSeen = 0;
  }
}
