// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * Hit testing — maps a CSS-pixel coordinate to (rowIndex, columnKey).
 *
 * Stateless helper. Both row and column lookups are O(log n) (column lookup
 * is binary search; row index is direct division by rowHeight). The renderer
 * pulls the actual row id from its row buffer.
 */

import type { CanvasGridColumn } from '../types.js';

export interface HitTestInputs {
  cssX:         number;
  cssY:         number;
  headerHeight: number;
  rowHeight:    number;
  scrollTop:    number;
  columnXs:     readonly number[];    // start-x of each column
  columnWidths: readonly number[];    // width of each column
  columns:      readonly CanvasGridColumn[];
  rowCount:     number;
}

export interface HitTestResult {
  rowIndex:  number;
  columnKey: string;
  rect:      { x: number; y: number; width: number; height: number };
}

export function hitTest(i: HitTestInputs): HitTestResult | null {
  if (i.cssY < i.headerHeight) return null;            // header click — not a row

  const localY  = i.cssY - i.headerHeight + i.scrollTop;
  const rowIdx  = Math.floor(localY / i.rowHeight);
  if (rowIdx < 0 || rowIdx >= i.rowCount) return null;

  const colIdx = findColumn(i.cssX, i.columnXs, i.columnWidths);
  if (colIdx < 0) return null;

  const x = i.columnXs[colIdx]    ?? 0;
  const w = i.columnWidths[colIdx] ?? 0;
  const y = i.headerHeight + (rowIdx * i.rowHeight) - i.scrollTop;

  return {
    rowIndex:  rowIdx,
    columnKey: i.columns[colIdx]!.key,
    rect: { x, y, width: w, height: i.rowHeight },
  };
}

/** Binary search — columns are stored left-to-right with monotonic xs. */
function findColumn(x: number, xs: readonly number[], widths: readonly number[]): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo <= hi) {
    const mid     = (lo + hi) >>> 1;
    const colX    = xs[mid] ?? 0;
    const colEnd  = colX + (widths[mid] ?? 0);
    if (x < colX)        hi = mid - 1;
    else if (x >= colEnd) lo = mid + 1;
    else                  return mid;
  }
  return -1;
}
