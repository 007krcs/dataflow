// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * FrameScheduler — rAF-driven dirty-rect render loop.
 *
 * The renderer marks regions dirty (`markDirty(rect)`) when rows change or the
 * viewport scrolls. The scheduler coalesces marks across the frame and invokes
 * the consumer's `render(dirtyRects)` callback at most once per rAF tick.
 *
 * If `dirty` is empty when a tick fires, `render` is not called — the loop
 * stays idle. As soon as a flash animation is in flight, the renderer keeps
 * scheduling itself via `markDirty` until the animation completes, so this
 * scheduler does not need its own animation timer.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameSchedulerCallbacks {
  /** Called once per rAF tick when there is dirty work to do. */
  render: (dirtyRects: readonly Rect[], now: number) => void;
}

export class FrameScheduler {
  private _dirty:    Rect[] = [];
  private _allDirty  = false;
  private _rafId:    number | null = null;
  private _running   = false;
  private readonly _cb: FrameSchedulerCallbacks;

  constructor(callbacks: FrameSchedulerCallbacks) {
    this._cb = callbacks;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._schedule();
  }

  stop(): void {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Mark a rectangle dirty. Coalesced and flushed on the next rAF tick. */
  markDirty(rect: Rect): void {
    if (this._allDirty) return;
    this._dirty.push(rect);
  }

  /** Mark the entire viewport dirty — short-circuits per-rect tracking. */
  markAllDirty(): void {
    this._allDirty = true;
    this._dirty.length = 0;
  }

  /** Force-render this frame even if nothing has been marked dirty. */
  requestFullRender(): void {
    this.markAllDirty();
  }

  private _schedule(): void {
    if (!this._running) return;
    this._rafId = requestAnimationFrame((now) => {
      if (!this._running) return;
      if (this._allDirty || this._dirty.length > 0) {
        const rects: Rect[] = this._allDirty ? [] : mergeRects(this._dirty);
        // Reset BEFORE render so anything marked during render queues for next tick
        this._allDirty = false;
        this._dirty.length = 0;
        try { this._cb.render(rects, now); }
        catch (e) { console.error('[dataflow-canvas] render error', e); }
      }
      this._schedule();
    });
  }
}

// ─── Rect merge ───────────────────────────────────────────────────────────────
// Conservative O(n²) coalesce — fine for the few-dozen-rects per frame we expect.
// If a renderer ever produces hundreds of rects per frame, swap in an interval
// tree. For now this is the simplest correct implementation.

function mergeRects(input: Rect[]): Rect[] {
  if (input.length <= 1) return input.slice();
  const out: Rect[] = [];
  for (const r of input) {
    let merged = false;
    for (let i = 0; i < out.length; i++) {
      if (overlapsOrTouches(out[i]!, r)) {
        out[i] = union(out[i]!, r);
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...r });
  }
  // One more pass — newly-unioned rects may now overlap each other
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (overlapsOrTouches(out[i]!, out[j]!)) {
          out[i] = union(out[i]!, out[j]!);
          out.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return out;
}

function overlapsOrTouches(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width  < b.x ||
    b.x + b.width  < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function union(a: Rect, b: Rect): Rect {
  const x  = Math.min(a.x, b.x);
  const y  = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width,  b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: x2 - x, height: y2 - y };
}
