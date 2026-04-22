// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * Multi-Stream Join — Combines rows from two or more StreamRow arrays
 * using a common key field, producing enriched merged rows.
 *
 * Three join strategies match SQL semantics:
 *
 *   inner  — only rows where both A and B have a matching key
 *   left   — all A rows; B columns are null when no match
 *   outer  — all rows from both A and B; missing side is null-filled
 *
 * This is a pure, synchronous utility that operates on snapshot arrays.
 * For live use, call `joinStreams` inside a `useMemo` that depends on both
 * `rows` arrays — it runs fast enough for 1 000s of rows per frame.
 *
 * Usage:
 *   const merged = joinStreams(priceRows, fundamentalsRows, {
 *     key:        'symbol',
 *     strategy:   'left',
 *     prefixB:    'f_',   // avoids column name collisions
 *   });
 */

import type { StreamRow } from '../types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type JoinStrategy = 'inner' | 'left' | 'outer';

export interface JoinOptions {
  /**
   * The column key used to match rows between stream A and stream B.
   * Both streams must have this column.  Default: 'id'
   */
  key?: string;
  /**
   * Join strategy. Default: 'left'
   */
  strategy?: JoinStrategy;
  /**
   * Optional prefix applied to all columns from stream B to avoid collisions.
   * Example: prefixB: 'b_'  →  stream B's 'price' becomes 'b_price'
   * Default: '' (no prefix; B columns overwrite A on collision)
   */
  prefixB?: string;
  /**
   * Optional prefix applied to all columns from stream A.
   * Default: '' (no prefix)
   */
  prefixA?: string;
  /**
   * If true, include a `_joinSource` column in the output indicating which
   * side the row came from: 'A', 'B', or 'AB'.
   * Default: false
   */
  annotate?: boolean;
}

export interface JoinResult {
  rows:      StreamRow[];
  /** How many A rows were matched */
  matchedA:  number;
  /** How many B rows were matched */
  matchedB:  number;
  /** How many rows had no match on either side */
  unmatched: number;
}

// ─── Core join logic ──────────────────────────────────────────────────────────

function prefixRow(row: StreamRow, prefix: string, exclude: string): StreamRow {
  if (!prefix) return row;
  const out: StreamRow = { id: row.id, timestamp: row.timestamp };
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || k === 'timestamp') continue;
    if (k === exclude) { out[k] = v; continue; }
    out[`${prefix}${k}`] = v;
  }
  return out;
}

function nullFillB(prefixB: string, bRow: StreamRow): Record<string, null> {
  const out: Record<string, null> = {};
  for (const k of Object.keys(bRow)) {
    if (k === 'id' || k === 'timestamp') continue;
    out[prefixB ? `${prefixB}${k}` : k] = null;
  }
  return out;
}

function nullFillA(prefixA: string, aRow: StreamRow, keyCol: string): Record<string, null> {
  const out: Record<string, null> = {};
  for (const k of Object.keys(aRow)) {
    if (k === 'id' || k === 'timestamp' || k === keyCol) continue;
    out[prefixA ? `${prefixA}${k}` : k] = null;
  }
  return out;
}

/**
 * Join the latest snapshot of two streams on a common key.
 *
 * @param streamA  Array of rows from stream A (typically the "primary" stream)
 * @param streamB  Array of rows from stream B (the enriching stream)
 * @param opts     Join options
 */
export function joinStreams(
  streamA: StreamRow[],
  streamB: StreamRow[],
  opts: JoinOptions = {},
): JoinResult {
  const {
    key       = 'id',
    strategy  = 'left',
    prefixB   = '',
    prefixA   = '',
    annotate  = false,
  } = opts;

  // Index B rows by key for O(1) lookup
  const bIndex = new Map<string, StreamRow>();
  for (const row of streamB) {
    const k = String(row[key] ?? row.id);
    bIndex.set(k, row);
  }

  const result: StreamRow[] = [];
  let matchedA  = 0;
  let matchedB  = 0;
  let unmatched = 0;
  const matchedBKeys = new Set<string>();

  for (const aRow of streamA) {
    const k    = String(aRow[key] ?? aRow.id);
    const bRow = bIndex.get(k);

    const aPrefixed: StreamRow = prefixA
      ? prefixRow(aRow, prefixA, key)
      : { ...aRow };

    if (bRow) {
      matchedA++;
      matchedBKeys.add(k);
      const bPrefixed = prefixRow(bRow, prefixB, key);
      const merged: StreamRow = {
        ...aPrefixed,
        ...Object.fromEntries(
          Object.entries(bPrefixed).filter(([bk]) => bk !== 'id' && bk !== 'timestamp')
        ),
        id:        aRow.id,
        timestamp: Math.max(aRow.timestamp, bRow.timestamp),
        ...(annotate ? { _joinSource: 'AB' } : {}),
      };
      result.push(merged);
    } else {
      // No B match
      if (strategy === 'inner') {
        unmatched++;
        continue; // skip unmatched in inner join
      }
      // left or outer: include A row with null B columns
      const bTemplate = streamB[0] ?? {};
      const merged: StreamRow = {
        ...aPrefixed,
        ...nullFillB(prefixB, bTemplate as StreamRow),
        id: aRow.id,
        timestamp: aRow.timestamp,
        ...(annotate ? { _joinSource: 'A' } : {}),
      };
      result.push(merged);
      unmatched++;
    }
  }

  // For outer join: include B rows that had no A match
  if (strategy === 'outer') {
    for (const bRow of streamB) {
      const k = String(bRow[key] ?? bRow.id);
      if (matchedBKeys.has(k)) { matchedB++; continue; }
      const bPrefixed = prefixRow(bRow, prefixB, key);
      const aTemplate = streamA[0] ?? {};
      const merged: StreamRow = {
        ...nullFillA(prefixA, aTemplate as StreamRow, key),
        ...Object.fromEntries(
          Object.entries(bPrefixed).filter(([bk]) => bk !== 'id' && bk !== 'timestamp')
        ),
        id:        bRow.id,
        timestamp: bRow.timestamp,
        ...(annotate ? { _joinSource: 'B' } : {}),
      };
      result.push(merged);
      unmatched++;
    }
  } else {
    matchedB = matchedBKeys.size;
  }

  return { rows: result, matchedA, matchedB, unmatched };
}

// ─── Multi-stream merge (N streams, same schema, union by key) ────────────────

/**
 * Merge N streams into a single row array, deduplicating by `key`.
 * Later streams' rows overwrite earlier ones on key collision.
 *
 * Useful for combining multiple sensor feeds, exchange feeds, etc.
 */
export function mergeStreams(
  streams: StreamRow[][],
  key = 'id',
): StreamRow[] {
  const index = new Map<string, StreamRow>();
  for (const stream of streams) {
    for (const row of stream) {
      const k = String(row[key] ?? row.id);
      const existing = index.get(k);
      if (!existing || row.timestamp >= existing.timestamp) {
        index.set(k, row);
      }
    }
  }
  return Array.from(index.values()).sort((a, b) => a.timestamp - b.timestamp);
}
