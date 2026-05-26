// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * Header layer — paints column labels into an offscreen canvas.
 *
 * Like the background layer, the header is rebuilt only on layout change
 * and blitted as a single `drawImage` per frame.
 */

import type { CanvasGridColumn, CanvasGridTheme } from '../../types.js';

export interface HeaderLayerOptions {
  width:        number;
  height:       number;
  dpr:          number;
  columns:      readonly CanvasGridColumn[];
  columnXs:     readonly number[];  // x-position of each column (CSS px)
  columnWidths: readonly number[];  // width of each column (CSS px)
  theme:        CanvasGridTheme;
}

export function buildHeaderLayer(opts: HeaderLayerOptions): HTMLCanvasElement {
  const { width, height, dpr, columns, columnXs, columnWidths, theme } = opts;

  const off = document.createElement('canvas');
  off.width  = Math.ceil(width  * dpr);
  off.height = Math.ceil(height * dpr);

  const ctx = off.getContext('2d');
  if (!ctx) return off;
  ctx.scale(dpr, dpr);

  // Header bar
  ctx.fillStyle = theme.headerBackground;
  ctx.fillRect(0, 0, width, height);

  // Bottom border (1 px gridline)
  ctx.fillStyle = theme.gridline;
  ctx.fillRect(0, height - 1, width, 1);

  // Column labels
  const fontSize = theme.headerFontSize ?? theme.fontSize;
  ctx.font         = `600 ${fontSize}px ${theme.fontFamily}`;
  ctx.fillStyle    = theme.headerForeground;
  ctx.textBaseline = 'middle';

  const padX  = 8;
  const midY  = height / 2;

  for (let i = 0; i < columns.length; i++) {
    const col   = columns[i]!;
    const x     = columnXs[i]    ?? 0;
    const w     = columnWidths[i] ?? 0;
    const align = col.align ?? 'left';
    const label = col.label ?? humanize(col.key);

    if (align === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(label, x + w - padX, midY);
    } else if (align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, midY);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(label, x + padX, midY);
    }
  }

  return off;
}

function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
