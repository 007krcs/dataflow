// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * FontCache — caches `ctx.measureText` results.
 *
 * `measureText` is one of the slowest Canvas2D calls. In a streaming grid,
 * the same strings (`AAPL`, `GOOGL`, formatted prices) repeat thousands of
 * times per second. Cache them by `(font, text)` key — typical hit rate in
 * the steady state is > 99 %.
 *
 * The cache is bounded — when it exceeds `maxEntries`, the oldest 25 % are
 * dropped (simple FIFO eviction, no LRU bookkeeping). The expected working
 * set for a streaming grid is small (column labels + ~20 visible rows × N
 * columns), so misses rarely matter.
 */

const DEFAULT_MAX_ENTRIES = 4096;

export class FontCache {
  private readonly _cache = new Map<string, number>();
  private readonly _max:   number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this._max = maxEntries;
  }

  /**
   * Measure the width of `text` rendered with `font`, using a cached value
   * when available.
   *
   * @param ctx  Any 2D context — the current `font` is set transiently.
   * @param font CSS font string, e.g. `'12px monospace'`.
   * @param text The string to measure.
   */
  measure(ctx: CanvasRenderingContext2D, font: string, text: string): number {
    const key = font + '\0' + text;
    const hit = this._cache.get(key);
    if (hit !== undefined) return hit;

    const prev = ctx.font;
    ctx.font = font;
    const width = ctx.measureText(text).width;
    ctx.font = prev;

    this._cache.set(key, width);
    if (this._cache.size > this._max) this._evict();
    return width;
  }

  /** Drop the oldest 25 % of entries. */
  private _evict(): void {
    const target = Math.floor(this._max * 0.75);
    const it = this._cache.keys();
    while (this._cache.size > target) {
      const next = it.next();
      if (next.done) break;
      this._cache.delete(next.value);
    }
  }

  clear(): void {
    this._cache.clear();
  }

  get size(): number { return this._cache.size; }
}
