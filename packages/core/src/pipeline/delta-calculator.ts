// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * DeltaCalculator — Tracks per-cell value changes across stream updates.
 * Produces CellChange records with direction (up/down/flat) and % change.
 * Used to drive flash animations in the grid UI.
 */

import type { CellChange, CellChangeDirection, CellValue, StreamRow } from '../types.js';

export class DeltaCalculator {
  /** Previous snapshot: rowId → columnId → value */
  private readonly _prev = new Map<string, Map<string, CellValue>>();

  /**
   * Diff `newRow` against the previous snapshot for the same row id.
   * Returns CellChange records for every column that changed.
   */
  diff(newRow: StreamRow): CellChange[] {
    const changes: CellChange[] = [];
    const rowId = newRow.id;
    let prevCols = this._prev.get(rowId);

    if (!prevCols) {
      // First time seeing this row — record it but emit no changes
      prevCols = new Map();
      this._prev.set(rowId, prevCols);
      for (const [col, val] of Object.entries(newRow)) {
        if (col !== 'id' && col !== 'timestamp') prevCols.set(col, val as CellValue);
      }
      return changes;
    }

    for (const [col, newVal] of Object.entries(newRow)) {
      if (col === 'id' || col === 'timestamp') continue;
      const oldVal = prevCols.get(col);
      const nv = newVal as CellValue;

      if (oldVal !== nv) {
        const dir = computeDirection(oldVal, nv);
        const pct = computeChangePercent(oldVal, nv);
        changes.push({
          rowId,
          columnId: col,
          oldValue: oldVal ?? null,
          newValue: nv,
          direction: dir,
          changePercent: pct,
          timestamp: newRow.timestamp,
        });
        prevCols.set(col, nv);
      }
    }

    return changes;
  }

  /** Evict rows no longer in the stream (prevents memory leak). */
  evict(rowIds: string[]): void {
    for (const id of rowIds) this._prev.delete(id);
  }

  /** Clear all state. */
  reset(): void {
    this._prev.clear();
  }
}

function computeDirection(oldVal: CellValue | undefined, newVal: CellValue): CellChangeDirection {
  if (typeof oldVal !== 'number' || typeof newVal !== 'number') return 'flat';
  if (newVal > oldVal) return 'up';
  if (newVal < oldVal) return 'down';
  return 'flat';
}

function computeChangePercent(oldVal: CellValue | undefined, newVal: CellValue): number | null {
  if (typeof oldVal !== 'number' || typeof newVal !== 'number') return null;
  if (oldVal === 0) return newVal === 0 ? 0 : null;
  return ((newVal - oldVal) / Math.abs(oldVal)) * 100;
}
