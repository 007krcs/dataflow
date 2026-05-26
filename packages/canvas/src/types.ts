// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * Public types for @gridstorm/dataflow-canvas.
 *
 * The renderer is intentionally headless — it does not own the canvas element,
 * does not own a row state store, and does not know about React. The framework
 * adapters wire it up.
 */

import type { CellValue, CellChange, StreamRow } from '@gridstorm/dataflow-core';

// ─── Column model ─────────────────────────────────────────────────────────────

export type ColumnAlign = 'left' | 'right' | 'center';

export interface CanvasGridColumn {
  /** Key in the StreamRow that this column displays. */
  key: string;
  /** Header label. Defaults to a humanized version of `key`. */
  label?: string;
  /** Pixel width. If omitted, the renderer distributes remaining space. */
  width?: number;
  /** Text alignment within the cell. Default: `left` for strings, `right` for numbers. */
  align?: ColumnAlign;
  /**
   * Custom value formatter. Runs once per render per visible cell — keep it
   * fast (string concat only, no allocations in the hot loop).
   */
  format?: (value: CellValue, row: StreamRow) => string;
  /**
   * If false, this column is ignored by the cell-flash layer. Useful for static
   * columns like `id` or `symbol` that should never animate. Default: true.
   */
  animate?: boolean;
}

// ─── Theme ────────────────────────────────────────────────────────────────────

export interface CanvasGridTheme {
  /** Background of the grid body. */
  background:        string;
  /** Alternating row tint (set to `background` to disable zebra). */
  zebra:             string;
  /** Header bar background. */
  headerBackground:  string;
  /** Header text colour. */
  headerForeground:  string;
  /** Default cell text colour. */
  cellForeground:    string;
  /** Vertical and horizontal gridlines. */
  gridline:          string;
  /** Flash colours by direction. */
  flashUp:           string;
  flashDown:         string;
  flashFlat:         string;
  /** Font family for cell + header text. */
  fontFamily:        string;
  /** Cell text size in pixels. */
  fontSize:          number;
  /** Header text size in pixels. Default = `fontSize`. */
  headerFontSize?:   number;
}

export const DEFAULT_THEME: CanvasGridTheme = {
  background:       '#0b1020',
  zebra:            '#0e1426',
  headerBackground: '#141a2e',
  headerForeground: '#9aa3b2',
  cellForeground:   '#e6eaf2',
  gridline:         '#1a2238',
  flashUp:          'rgba(16, 185, 129, 0.45)',   // emerald
  flashDown:        'rgba(239, 68, 68,  0.45)',   // red
  flashFlat:        'rgba(99, 102, 241, 0.35)',   // indigo
  fontFamily:       'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize:         12,
};

// ─── Renderer config ──────────────────────────────────────────────────────────

export interface CanvasGridConfig {
  columns:        CanvasGridColumn[];
  /** Pixel height of each row. Default: 24. */
  rowHeight?:     number;
  /** Pixel height of the header bar. Default: 28. */
  headerHeight?:  number;
  /** Cell-flash duration in milliseconds. Default: 600. */
  flashDurationMs?: number;
  /** Theme overrides — merged into `DEFAULT_THEME`. */
  theme?:         Partial<CanvasGridTheme>;
  /**
   * Device pixel ratio override. Default: `window.devicePixelRatio`.
   * Set lower for huge grids on Retina to trade fidelity for throughput.
   */
  devicePixelRatio?: number;
  /**
   * Max rows the renderer ever holds in its row buffer. The active stream may
   * push more — overflow is dropped using a `keep-newest` policy.
   * Default: 100_000.
   */
  maxRows?:       number;
  /**
   * Renderer backend. Default: `'canvas2d'`. `'webgl'` is reserved.
   */
  backend?:       'canvas2d' | 'webgl';
}

// ─── Update payload ───────────────────────────────────────────────────────────

export interface CanvasGridUpdate {
  rows:    readonly StreamRow[];
  /** Optional — drives the flash layer. If omitted, no flashes are scheduled. */
  changes?: readonly CellChange[];
}

// ─── Hit-test result ──────────────────────────────────────────────────────────

export interface CanvasGridHit {
  rowIndex:  number;
  rowId:     string;
  columnKey: string;
  /** Cell rectangle in CSS pixels, relative to the canvas. */
  rect:      { x: number; y: number; width: number; height: number };
}

// ─── Scroll state ─────────────────────────────────────────────────────────────

export interface CanvasGridViewport {
  /** Vertical scroll offset in CSS pixels. */
  scrollTop:    number;
  /** Visible row range — inclusive start, exclusive end. */
  firstVisible: number;
  lastVisible:  number;
  /** Total rendered viewport height in CSS pixels. */
  height:       number;
  width:        number;
}

// ─── Public renderer contract ─────────────────────────────────────────────────

export interface ICanvasGridRenderer {
  /** Push a new row set and (optional) change events to the renderer. */
  update(payload: CanvasGridUpdate): void;
  /** Resize the canvas to match its CSS box. Call on container resize. */
  resize(cssWidth: number, cssHeight: number): void;
  /** Set scroll offset (driven by an external scrollbar or wheel handler). */
  setScrollTop(scrollTop: number): void;
  /** Returns the cell under `(cssX, cssY)` relative to the canvas, or null. */
  hitTest(cssX: number, cssY: number): CanvasGridHit | null;
  /** Current viewport metrics — useful for syncing an external scrollbar. */
  readonly viewport: CanvasGridViewport;
  /** Total visible row count in the buffer. */
  readonly rowCount: number;
  /** Stop the render loop, release the canvas context, drop all state. */
  destroy(): void;
}
