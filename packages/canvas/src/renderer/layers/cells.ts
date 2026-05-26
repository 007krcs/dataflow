// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * Cells layer — paints the visible window of row text.
 *
 * Hot path. Allocations and per-cell font changes must be avoided.
 *
 * Optimisations:
 *   - Only visible rows are iterated (computed by the renderer using rowHeight).
 *   - `ctx.font` is set once per layer, not per cell.
 *   - `ctx.textAlign` is set per column, not per cell.
 *   - `format` callbacks for primitive cells default to inline `String(v)` to
 *     skip the user-callback overhead when no custom formatter is provided.
 */

import type { StreamRow } from '@gridstorm/dataflow-core';
import type { CanvasGridColumn, CanvasGridTheme } from '../../types.js';

export interface PaintCellsOptions {
  ctx:           CanvasRenderingContext2D;
  rows:          readonly StreamRow[];
  firstVisible:  number;
  lastVisible:   number;        // exclusive
  rowHeight:     number;
  headerHeight:  number;
  scrollTop:     number;
  columns:       readonly CanvasGridColumn[];
  columnXs:      readonly number[];
  columnWidths:  readonly number[];
  theme:         CanvasGridTheme;
}

export function paintCells(o: PaintCellsOptions): void {
  const {
    ctx, rows, firstVisible, lastVisible, rowHeight, headerHeight, scrollTop,
    columns, columnXs, columnWidths, theme,
  } = o;

  if (firstVisible >= rows.length) return;

  ctx.font         = `${theme.fontSize}px ${theme.fontFamily}`;
  ctx.fillStyle    = theme.cellForeground;
  ctx.textBaseline = 'middle';

  const padX  = 8;
  const last  = Math.min(lastVisible, rows.length);

  for (let r = firstVisible; r < last; r++) {
    const row = rows[r];
    if (!row) continue;

    const yTop = headerHeight + (r * rowHeight) - scrollTop;
    const midY = yTop + rowHeight / 2;

    for (let c = 0; c < columns.length; c++) {
      const col   = columns[c]!;
      const x     = columnXs[c]    ?? 0;
      const w     = columnWidths[c] ?? 0;
      const align = col.align ?? alignFor(row[col.key]);
      const raw   = row[col.key];
      const text  = col.format ? col.format(raw, row) : defaultFormat(raw);

      if (align === 'right') {
        ctx.textAlign = 'right';
        ctx.fillText(text, x + w - padX, midY);
      } else if (align === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(text, x + w / 2, midY);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(text, x + padX, midY);
      }
    }
  }
}

function defaultFormat(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number')         return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

function alignFor(v: unknown): 'left' | 'right' | 'center' {
  return typeof v === 'number' ? 'right' : 'left';
}
