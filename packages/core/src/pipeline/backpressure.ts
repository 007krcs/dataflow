// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * BackpressureController — Token-bucket + rAF frame scheduler.
 *
 * Prevents the UI from being overwhelmed when the data source
 * produces rows faster than the browser can render.
 *
 * Algorithm:
 *   1. Incoming rows are pushed into a RingBuffer (bounded).
 *   2. requestAnimationFrame fires at the browser's refresh rate.
 *   3. On each frame, up to `rowsPerFrame` rows are drained and
 *      delivered to the consumer callback.
 *   4. If the buffer exceeds capacity, the configured drop strategy kicks in:
 *      - 'oldest'  — evict the oldest row (default, best for live data)
 *      - 'newest'  — discard the incoming row (preserve existing sequence)
 *      - 'sample'  — discard every other incoming row (50% temporal sample)
 *   5. Metrics track drop rate and buffer utilization.
 */

import { RingBuffer } from './ring-buffer.js';
import type { BackpressureConfig, StreamRow } from '../types.js';

export interface BackpressureCallbacks {
  onFlush: (rows: StreamRow[]) => void;
  onDrop:  (count: number) => void;
}

export class BackpressureController {
  private readonly _buf: RingBuffer<StreamRow>;
  private readonly _cfg: Required<BackpressureConfig>;
  private readonly _cb: BackpressureCallbacks;

  private _rafId:        number | null = null;
  private _lastFlush     = 0;
  private _totalDropped  = 0;
  private _running       = false;
  private _sampleToggle  = false;  // for 'sample' strategy alternation

  constructor(config: BackpressureConfig, callbacks: BackpressureCallbacks) {
    this._cfg = {
      maxBufferSize:      config.maxBufferSize      ?? 50_000,
      targetFps:          config.targetFps          ?? 30,
      dropStrategy:       config.dropStrategy       ?? 'oldest',
      minFrameIntervalMs: config.minFrameIntervalMs ?? Math.floor(1000 / (config.targetFps ?? 30)),
    };
    this._buf = new RingBuffer<StreamRow>(this._cfg.maxBufferSize);
    this._cb  = callbacks;
  }

  /** Push one row into the buffer, applying drop strategy if full. */
  push(row: StreamRow): void {
    const strategy = this._cfg.dropStrategy;

    if (strategy === 'newest') {
      // Discard the incoming row when buffer is full (preserve existing sequence)
      if (this._buf.isFull) {
        this._totalDropped++;
        this._cb.onDrop(1);
        return;
      }
      this._buf.push(row);
      return;
    }

    if (strategy === 'sample') {
      // Accept every other row regardless of buffer state
      this._sampleToggle = !this._sampleToggle;
      if (!this._sampleToggle) {
        this._totalDropped++;
        this._cb.onDrop(1);
        return;
      }
      const evicted = this._buf.push(row);
      if (evicted !== undefined) {
        this._totalDropped++;
        this._cb.onDrop(1);
      }
      return;
    }

    // Default: 'oldest' — RingBuffer evicts oldest when full
    const evicted = this._buf.push(row);
    if (evicted !== undefined) {
      this._totalDropped++;
      this._cb.onDrop(1);
    }
  }

  /** Push a batch of rows. */
  pushMany(rows: StreamRow[]): void {
    for (const row of rows) this.push(row);
  }

  get bufferSize(): number        { return this._buf.size; }
  get bufferUtilization(): number { return this._buf.utilization; }
  get totalDropped(): number      { return this._totalDropped; }

  /** Start the rAF loop. */
  start(): void {
    if (this._running) return;
    this._running = true;
    this._schedule();
  }

  /** Stop the rAF loop (buffer contents are preserved). */
  stop(): void {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Drain all remaining rows immediately (used on destroy). */
  flush(): void {
    const rows = this._buf.toArray();
    this._buf.clear();
    if (rows.length > 0) this._cb.onFlush(rows);
  }

  destroy(): void {
    this.stop();
    this._buf.clear();
  }

  private _schedule(): void {
    if (!this._running) return;
    this._rafId = requestAnimationFrame((now) => {
      if (!this._running) return;
      const elapsed = now - this._lastFlush;
      if (elapsed >= this._cfg.minFrameIntervalMs && !this._buf.isEmpty) {
        this._lastFlush = now;
        // Drain up to the number of rows that fit in one frame at target fps
        const maxRows = Math.ceil(this._cfg.maxBufferSize / this._cfg.targetFps);
        const rows = this._buf.popN(maxRows);
        if (rows.length > 0) this._cb.onFlush(rows);
      }
      this._schedule();
    });
  }
}
