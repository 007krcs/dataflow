// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * FlashLayer — tracks active cell-change animations and paints them.
 *
 * A flash is a per-cell fading rectangle keyed by `(rowId, columnKey)`.
 * Each call to `enqueue(changes, now)` schedules new flashes; each call to
 * `paint(ctx, now, ...)` draws all currently-live flashes with the correct
 * alpha for their progress.
 *
 * Memory is bounded — when more than `MAX_ACTIVE` flashes are in flight the
 * oldest are dropped silently (no visible artefact; user already saw them).
 */

import type { CellChange } from '@gridstorm/dataflow-core';
import type { CanvasGridTheme } from '../../types.js';

const MAX_ACTIVE = 5_000;

interface Flash {
  rowId:     string;
  columnKey: string;
  startedAt: number;
  /** -1 = down, 0 = flat, 1 = up */
  direction: -1 | 0 | 1;
}

export class FlashLayer {
  private readonly _flashes: Flash[] = [];
  private readonly _duration: number;

  constructor(flashDurationMs: number) {
    this._duration = Math.max(60, flashDurationMs);
  }

  /** True iff any flashes are still animating — drives "keep ticking" logic. */
  get isAnimating(): boolean { return this._flashes.length > 0; }

  /** Schedule new flashes from a batch of cell changes. */
  enqueue(changes: readonly CellChange[], now: number): void {
    if (changes.length === 0) return;

    for (const c of changes) {
      const direction: -1 | 0 | 1 =
        c.direction === 'up'   ? 1 :
        c.direction === 'down' ? -1 : 0;

      // De-duplicate: if the same cell is already flashing, restart its timer
      // by replacing the existing entry rather than stacking another.
      const idx = this._findIndex(c.rowId, c.columnId);
      if (idx >= 0) {
        this._flashes[idx] = { rowId: c.rowId, columnKey: c.columnId, startedAt: now, direction };
      } else {
        this._flashes.push({ rowId: c.rowId, columnKey: c.columnId, startedAt: now, direction });
      }
    }

    // Bound the active set
    if (this._flashes.length > MAX_ACTIVE) {
      this._flashes.splice(0, this._flashes.length - MAX_ACTIVE);
    }
  }

  /**
   * Evict expired flashes. Call once per frame before painting.
   * Returns true if any flashes were evicted.
   */
  reap(now: number): boolean {
    if (this._flashes.length === 0) return false;
    const cutoff = now - this._duration;
    let writeIdx = 0;
    for (let readIdx = 0; readIdx < this._flashes.length; readIdx++) {
      const f = this._flashes[readIdx]!;
      if (f.startedAt > cutoff) {
        if (writeIdx !== readIdx) this._flashes[writeIdx] = f;
        writeIdx++;
      }
    }
    const evicted = this._flashes.length - writeIdx;
    this._flashes.length = writeIdx;
    return evicted > 0;
  }

  /**
   * Paint all active flashes.
   *
   * The caller provides a `locator` that resolves `(rowId, columnKey) → rect`
   * in CSS pixels relative to the canvas. If `null` is returned (the cell is
   * off-screen or no longer in the row buffer), the flash is skipped this
   * frame but not evicted — the user may scroll back into view.
   */
  paint(
    ctx: CanvasRenderingContext2D,
    now: number,
    theme: CanvasGridTheme,
    locator: (rowId: string, columnKey: string) => { x: number; y: number; width: number; height: number } | null,
  ): void {
    if (this._flashes.length === 0) return;

    for (const f of this._flashes) {
      const elapsed = now - f.startedAt;
      if (elapsed < 0 || elapsed >= this._duration) continue;

      const rect = locator(f.rowId, f.columnKey);
      if (!rect) continue;

      const progress = elapsed / this._duration;
      const alpha    = 1 - progress;       // linear fade (cheap, looks fine for ≤1s)
      const colour   = f.direction === 1 ? theme.flashUp
                     : f.direction === -1 ? theme.flashDown
                     : theme.flashFlat;

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = colour;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this._flashes.length = 0;
  }

  private _findIndex(rowId: string, columnKey: string): number {
    // Linear scan — typical active count is <100, so this is fast enough.
    // If profiling shows it dominating, switch to a `Map<key, idx>`.
    for (let i = 0; i < this._flashes.length; i++) {
      const f = this._flashes[i]!;
      if (f.rowId === rowId && f.columnKey === columnKey) return i;
    }
    return -1;
  }
}
