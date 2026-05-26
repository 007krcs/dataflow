// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * Background layer — paints body background, zebra stripes, and gridlines.
 *
 * Renders into an offscreen canvas that is regenerated only when the layout
 * changes (resize, theme change, column widths). The main render pass simply
 * `drawImage`s the cached layer — near-zero per-frame cost.
 */

import type { CanvasGridTheme } from '../../types.js';

export interface BackgroundLayerOptions {
  width:         number;   // CSS pixels
  height:        number;   // CSS pixels (full virtual height of viewport)
  dpr:           number;
  rowHeight:     number;
  columnXs:      readonly number[];  // x-position of each column boundary (CSS px)
  theme:         CanvasGridTheme;
}

/** Returns an offscreen canvas sized to the viewport, pre-painted. */
export function buildBackgroundLayer(opts: BackgroundLayerOptions): HTMLCanvasElement {
  const { width, height, dpr, rowHeight, columnXs, theme } = opts;

  const off = document.createElement('canvas');
  off.width  = Math.ceil(width  * dpr);
  off.height = Math.ceil(height * dpr);

  const ctx = off.getContext('2d');
  if (!ctx) return off;
  ctx.scale(dpr, dpr);

  // Body background
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  // Zebra stripes (alternating rows)
  if (theme.zebra !== theme.background) {
    ctx.fillStyle = theme.zebra;
    const rows = Math.ceil(height / rowHeight);
    for (let i = 1; i < rows; i += 2) {
      ctx.fillRect(0, i * rowHeight, width, rowHeight);
    }
  }

  // Vertical gridlines (one per column boundary)
  ctx.strokeStyle = theme.gridline;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  for (const x of columnXs) {
    // 0.5 offset for crisp 1-px lines
    const px = Math.floor(x) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
  }
  ctx.stroke();

  return off;
}
