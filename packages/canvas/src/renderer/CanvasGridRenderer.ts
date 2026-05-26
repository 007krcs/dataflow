// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * CanvasGridRenderer — the orchestrator.
 *
 * Owns:
 *   - The 2D context on the supplied canvas
 *   - The current row buffer (capped at `maxRows`)
 *   - Layer caches (background, header) — rebuilt only on layout change
 *   - The FrameScheduler (rAF-driven dirty-rect loop)
 *   - The FlashLayer (per-cell animations)
 *
 * Does not own:
 *   - The canvas DOM element (caller mounts and unmounts)
 *   - Scroll input (caller wires wheel/keyboard → setScrollTop)
 *   - The streaming engine (caller pushes rows via update)
 *
 * Design note: the renderer is intentionally pull-driven from the FrameScheduler
 * so it composes cleanly with WebGL or OffscreenCanvas backends in the future.
 * The same layer-painting code can be redirected at a different surface.
 */

import type { StreamRow } from '@gridstorm/dataflow-core';

import {
  DEFAULT_THEME,
  type CanvasGridConfig,
  type CanvasGridColumn,
  type CanvasGridHit,
  type CanvasGridTheme,
  type CanvasGridUpdate,
  type CanvasGridViewport,
  type ICanvasGridRenderer,
} from '../types.js';

import { FrameScheduler, type Rect } from '../scheduler/frame-scheduler.js';
import { FlashLayer }                from './layers/flashes.js';
import { paintCells }                from './layers/cells.js';
import { buildBackgroundLayer }      from './layers/background.js';
import { buildHeaderLayer }          from './layers/header.js';
import { hitTest as runHitTest }     from './hit-test.js';

const DEFAULT_ROW_HEIGHT      = 24;
const DEFAULT_HEADER_HEIGHT   = 28;
const DEFAULT_FLASH_MS        = 600;
const DEFAULT_MAX_ROWS        = 100_000;

export class CanvasGridRenderer implements ICanvasGridRenderer {
  // ── Canvas / context ────────────────────────────────────────────────────────
  private readonly _canvas: HTMLCanvasElement;
  private readonly _ctx:    CanvasRenderingContext2D;

  // ── Config ──────────────────────────────────────────────────────────────────
  private _columns:        readonly CanvasGridColumn[];
  private readonly _rowHeight:    number;
  private readonly _headerHeight: number;
  private readonly _theme:        CanvasGridTheme;
  private readonly _dpr:          number;
  private readonly _maxRows:      number;

  // ── State ───────────────────────────────────────────────────────────────────
  private _rows:        StreamRow[] = [];
  private _rowIndex     = new Map<string, number>();    // rowId → index in _rows
  private _cssWidth     = 0;
  private _cssHeight    = 0;
  private _scrollTop    = 0;
  private _columnXs:     number[] = [];
  private _columnWidths: number[] = [];

  // ── Layer caches ────────────────────────────────────────────────────────────
  private _backgroundCache: HTMLCanvasElement | null = null;
  private _headerCache:     HTMLCanvasElement | null = null;
  private _layoutDirty = true;

  // ── Subsystems ──────────────────────────────────────────────────────────────
  private readonly _scheduler: FrameScheduler;
  private readonly _flashes:   FlashLayer;

  constructor(canvas: HTMLCanvasElement, config: CanvasGridConfig) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[dataflow-canvas] 2D context unavailable');

    this._canvas = canvas;
    this._ctx    = ctx;

    this._columns      = config.columns;
    this._rowHeight    = config.rowHeight    ?? DEFAULT_ROW_HEIGHT;
    this._headerHeight = config.headerHeight ?? DEFAULT_HEADER_HEIGHT;
    this._theme        = { ...DEFAULT_THEME, ...(config.theme ?? {}) };
    this._dpr          = config.devicePixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1);
    this._maxRows      = config.maxRows ?? DEFAULT_MAX_ROWS;

    this._flashes   = new FlashLayer(config.flashDurationMs ?? DEFAULT_FLASH_MS);

    this._scheduler = new FrameScheduler({
      render: (rects, now) => this._paint(rects, now),
    });
    this._scheduler.start();

    if (config.backend === 'webgl') {
      // Reserved for the WebGL backend; falls back to Canvas2D today.
      console.warn('[dataflow-canvas] backend="webgl" not yet implemented — using canvas2d');
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get viewport(): CanvasGridViewport {
    const visibleH = Math.max(0, this._cssHeight - this._headerHeight);
    const firstVisible = Math.floor(this._scrollTop / this._rowHeight);
    const lastVisible  = Math.min(
      this._rows.length,
      Math.ceil((this._scrollTop + visibleH) / this._rowHeight),
    );
    return {
      scrollTop:    this._scrollTop,
      firstVisible,
      lastVisible,
      width:        this._cssWidth,
      height:       this._cssHeight,
    };
  }

  get rowCount(): number { return this._rows.length; }

  update(payload: CanvasGridUpdate): void {
    this._ingestRows(payload.rows);
    if (payload.changes && payload.changes.length > 0) {
      this._flashes.enqueue(payload.changes, performance.now());
    }
    // A row-set change always invalidates everything.
    this._scheduler.markAllDirty();
  }

  resize(cssWidth: number, cssHeight: number): void {
    if (cssWidth === this._cssWidth && cssHeight === this._cssHeight) return;
    this._cssWidth  = cssWidth;
    this._cssHeight = cssHeight;

    // Resize the backing store at device-pixel resolution
    this._canvas.width  = Math.ceil(cssWidth  * this._dpr);
    this._canvas.height = Math.ceil(cssHeight * this._dpr);
    // ...but draw in CSS units
    this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);

    this._recomputeColumns();
    this._invalidateLayout();
  }

  setScrollTop(scrollTop: number): void {
    const maxScroll = Math.max(0, (this._rows.length * this._rowHeight) - (this._cssHeight - this._headerHeight));
    const clamped   = Math.max(0, Math.min(maxScroll, scrollTop));
    if (clamped === this._scrollTop) return;
    this._scrollTop = clamped;
    this._scheduler.markAllDirty();
  }

  hitTest(cssX: number, cssY: number): CanvasGridHit | null {
    const hit = runHitTest({
      cssX, cssY,
      headerHeight: this._headerHeight,
      rowHeight:    this._rowHeight,
      scrollTop:    this._scrollTop,
      columnXs:     this._columnXs,
      columnWidths: this._columnWidths,
      columns:      this._columns,
      rowCount:     this._rows.length,
    });
    if (!hit) return null;
    const row = this._rows[hit.rowIndex];
    if (!row) return null;
    return { ...hit, rowId: row.id };
  }

  destroy(): void {
    this._scheduler.stop();
    this._flashes.clear();
    this._rows.length = 0;
    this._rowIndex.clear();
    this._backgroundCache = null;
    this._headerCache     = null;
  }

  // ── Internal — row ingestion ────────────────────────────────────────────────

  private _ingestRows(incoming: readonly StreamRow[]): void {
    // Update-or-append semantics keyed by row.id. This matches how the engine
    // streams partial snapshots — most rows are updates to existing ids.
    for (const row of incoming) {
      const existing = this._rowIndex.get(row.id);
      if (existing !== undefined) {
        this._rows[existing] = row;
      } else {
        this._rowIndex.set(row.id, this._rows.length);
        this._rows.push(row);
      }
    }

    // Bound the buffer — keep-newest policy
    if (this._rows.length > this._maxRows) {
      const drop = this._rows.length - this._maxRows;
      const dropped = this._rows.splice(0, drop);
      for (const r of dropped) this._rowIndex.delete(r.id);
      // Rebuild index for shifted positions
      for (let i = 0; i < this._rows.length; i++) {
        this._rowIndex.set(this._rows[i]!.id, i);
      }
    }
  }

  // ── Internal — layout ───────────────────────────────────────────────────────

  private _recomputeColumns(): void {
    const fixed:  number[] = [];
    let usedFixed = 0;
    let flexCount = 0;

    for (const c of this._columns) {
      if (c.width != null) { fixed.push(c.width); usedFixed += c.width; }
      else                 { fixed.push(-1);      flexCount++; }
    }

    const remaining = Math.max(0, this._cssWidth - usedFixed);
    const perFlex   = flexCount > 0 ? Math.floor(remaining / flexCount) : 0;

    this._columnWidths = fixed.map((w) => (w >= 0 ? w : Math.max(60, perFlex)));
    this._columnXs     = [];
    let x = 0;
    for (const w of this._columnWidths) { this._columnXs.push(x); x += w; }
  }

  private _invalidateLayout(): void {
    this._layoutDirty     = true;
    this._backgroundCache = null;
    this._headerCache     = null;
    this._scheduler.markAllDirty();
  }

  // ── Internal — paint ────────────────────────────────────────────────────────

  private _paint(_dirty: readonly Rect[], now: number): void {
    if (this._cssWidth === 0 || this._cssHeight === 0) return;

    // Rebuild caches if needed
    if (this._layoutDirty || !this._backgroundCache) {
      const bodyHeight = Math.max(this._cssHeight - this._headerHeight, this._rowHeight);
      this._backgroundCache = buildBackgroundLayer({
        width:     this._cssWidth,
        height:    bodyHeight,
        dpr:       this._dpr,
        rowHeight: this._rowHeight,
        columnXs:  this._columnXs.slice(1), // skip x=0 (no leftmost line)
        theme:     this._theme,
      });
      this._headerCache = buildHeaderLayer({
        width:        this._cssWidth,
        height:       this._headerHeight,
        dpr:          this._dpr,
        columns:      this._columns,
        columnXs:     this._columnXs,
        columnWidths: this._columnWidths,
        theme:        this._theme,
      });
      this._layoutDirty = false;
    }

    // Reap expired flashes BEFORE paint
    this._flashes.reap(now);

    // Body background (blit cached layer)
    this._ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
    if (this._backgroundCache) {
      this._ctx.drawImage(
        this._backgroundCache,
        0, this._headerHeight,
        this._cssWidth, this._cssHeight - this._headerHeight,
      );
    }

    // Visible row range
    const { firstVisible, lastVisible } = this.viewport;

    // Cell text
    paintCells({
      ctx:           this._ctx,
      rows:          this._rows,
      firstVisible,
      lastVisible,
      rowHeight:     this._rowHeight,
      headerHeight:  this._headerHeight,
      scrollTop:     this._scrollTop,
      columns:       this._columns,
      columnXs:      this._columnXs,
      columnWidths:  this._columnWidths,
      theme:         this._theme,
    });

    // Flashes (drawn on top of cell text — semi-transparent overlay)
    this._flashes.paint(this._ctx, now, this._theme, (rowId, columnKey) => {
      const idx = this._rowIndex.get(rowId);
      if (idx === undefined) return null;
      if (idx < firstVisible || idx >= lastVisible) return null;
      const colIdx = this._columns.findIndex((c) => c.key === columnKey);
      if (colIdx < 0) return null;
      const animateOpt = this._columns[colIdx]!.animate;
      if (animateOpt === false) return null;
      return {
        x:      this._columnXs[colIdx] ?? 0,
        y:      this._headerHeight + (idx * this._rowHeight) - this._scrollTop,
        width:  this._columnWidths[colIdx] ?? 0,
        height: this._rowHeight,
      };
    });

    // Header (blit cached layer — always on top)
    if (this._headerCache) {
      this._ctx.drawImage(this._headerCache, 0, 0, this._cssWidth, this._headerHeight);
    }

    // If flashes are still animating, request another frame
    if (this._flashes.isAnimating) this._scheduler.markAllDirty();
  }
}
