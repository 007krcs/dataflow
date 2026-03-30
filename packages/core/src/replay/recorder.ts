/**
 * StreamRecorder — Captures live StreamFrames into a circular snapshot buffer.
 *
 * Records up to `maxFrames` complete StreamFrames (rows + changes + anomalies).
 * Designed to be fed from the engine's onRows/onAnomaly callbacks without
 * blocking the hot path — all operations are O(1) amortised.
 *
 * Usage:
 *   const recorder = new StreamRecorder({ maxFrames: 300 });
 *   engine = new StreamingEngine(config, {
 *     onRows(rows, changes) {
 *       recorder.record({ rows, changes, anomalies: [], timestamp: Date.now(), ... });
 *     },
 *     onAnomaly(evs) { recorder.appendAnomalies(evs); },
 *   });
 *   const snapshot = recorder.snapshot();   // Returns RecordedFrame[]
 */

import type { StreamRow, CellChange, AnomalyEvent } from '../types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordedFrame {
  index:       number;           // monotonic 0-based frame index
  timestamp:   number;           // unix ms when frame was captured
  rows:        StreamRow[];      // rows delivered in this tick
  changes:     CellChange[];     // cell changes in this tick
  anomalies:   AnomalyEvent[];   // anomalies in this tick (populated by appendAnomalies)
}

export interface RecorderOptions {
  /** Maximum number of frames to keep (older frames are evicted). Default: 300 */
  maxFrames?: number;
  /** Whether to record by default once constructed. Default: true */
  autoRecord?: boolean;
}

// ─── StreamRecorder ───────────────────────────────────────────────────────────

export class StreamRecorder {
  private readonly _maxFrames: number;
  private _frames: RecordedFrame[] = [];
  private _frameIndex = 0;
  private _recording: boolean;

  constructor(opts: RecorderOptions = {}) {
    this._maxFrames = opts.maxFrames  ?? 300;
    this._recording = opts.autoRecord ?? true;
  }

  get isRecording(): boolean { return this._recording; }
  get frameCount():  number  { return this._frames.length; }
  get totalFrames(): number  { return this._frameIndex; }

  /** Start recording (noop if already recording). */
  record(): void  { this._recording = true; }
  /** Pause recording without clearing the buffer. */
  pause(): void   { this._recording = false; }
  /** Clear all recorded frames and reset index. */
  clear(): void   { this._frames = []; this._frameIndex = 0; }

  /**
   * Add a frame to the recording buffer.
   * Call this from the engine's `onRows` callback.
   */
  addFrame(rows: StreamRow[], changes: CellChange[], timestamp: number): void {
    if (!this._recording) return;

    const frame: RecordedFrame = {
      index:     this._frameIndex++,
      timestamp,
      rows:      rows.slice(),      // shallow copy — avoids mutation issues
      changes:   changes.slice(),
      anomalies: [],
    };

    this._frames.push(frame);

    // Evict oldest frames when over capacity
    if (this._frames.length > this._maxFrames) {
      this._frames.splice(0, this._frames.length - this._maxFrames);
    }
  }

  /**
   * Append anomaly events to the most recently recorded frame.
   * Call this from the engine's `onAnomaly` callback.
   */
  appendAnomalies(events: AnomalyEvent[]): void {
    if (!this._recording || this._frames.length === 0) return;
    const last = this._frames[this._frames.length - 1]!;
    last.anomalies.push(...events);
  }

  /**
   * Return a copy of all buffered frames in chronological order.
   */
  snapshot(): RecordedFrame[] {
    return this._frames.slice();
  }

  /**
   * Get the frame at a given position (0 = oldest in buffer, frameCount-1 = newest).
   */
  getFrame(position: number): RecordedFrame | null {
    return this._frames[position] ?? null;
  }

  /**
   * Get the frame closest to a unix-ms timestamp.
   */
  getFrameAtTime(ts: number): RecordedFrame | null {
    if (this._frames.length === 0) return null;
    let best = this._frames[0]!;
    let bestDist = Math.abs(best.timestamp - ts);
    for (let i = 1; i < this._frames.length; i++) {
      const dist = Math.abs(this._frames[i]!.timestamp - ts);
      if (dist < bestDist) { bestDist = dist; best = this._frames[i]!; }
    }
    return best;
  }
}
