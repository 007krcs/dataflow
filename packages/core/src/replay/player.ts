// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * ReplayPlayer — Plays back a recorded frame buffer at configurable speed.
 *
 * Supports:
 *  - Variable playback speed (0.25× to 8×)
 *  - Seek to any frame position (0…frameCount-1)
 *  - Step forward / backward by 1 frame
 *  - Loop mode
 *  - Real-time callbacks matching the engine's signature so the same UI
 *    components work for both live and replay modes
 *
 * Usage:
 *   const player = new ReplayPlayer(recorder.snapshot(), {
 *     onFrame(frame, position, total) { /* update UI *\/ },
 *     onEnd() { console.log('replay finished'); },
 *   });
 *   player.play();
 *   player.seek(42);
 *   player.speed = 2;
 *   player.pause();
 */

import type { RecordedFrame } from './recorder.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlayerState = 'idle' | 'playing' | 'paused' | 'ended';

export interface PlayerCallbacks {
  /** Called for each frame delivered during playback or seek. */
  onFrame: (frame: RecordedFrame, position: number, total: number) => void;
  /** Called when the last frame is reached (not called in loop mode). */
  onEnd?: () => void;
  /** Called when state transitions. */
  onStateChange?: (state: PlayerState) => void;
}

export interface PlayerOptions extends PlayerCallbacks {
  /** Playback speed multiplier. Default: 1.0 */
  speed?: number;
  /** Loop back to start when the last frame is reached. Default: false */
  loop?: boolean;
  /**
   * If true, use wall-clock delta between frame timestamps to preserve
   * original timing at 1× speed.  If false, deliver one frame per rAF tick
   * (useful for step-by-step debugging).
   * Default: true
   */
  preserveTiming?: boolean;
}

// ─── ReplayPlayer ─────────────────────────────────────────────────────────────

export class ReplayPlayer {
  private _frames:   RecordedFrame[];
  private _position: number = 0;
  private _state:    PlayerState = 'idle';
  private _speed:    number;
  private _loop:     boolean;
  private _preserveTiming: boolean;
  private _callbacks: PlayerCallbacks;

  private _rafId:       number | null = null;
  private _lastWallMs:  number = 0;
  private _accumMs:     number = 0;

  constructor(frames: RecordedFrame[], opts: PlayerOptions) {
    this._frames          = frames;
    this._speed           = opts.speed           ?? 1.0;
    this._loop            = opts.loop            ?? false;
    this._preserveTiming  = opts.preserveTiming  ?? true;
    this._callbacks       = { onFrame: opts.onFrame, onEnd: opts.onEnd, onStateChange: opts.onStateChange };
  }

  // ── Getters ──────────────────────────────────────────────────────────────────

  get state():    PlayerState { return this._state; }
  get position(): number      { return this._position; }
  get total():    number      { return this._frames.length; }
  get progress(): number      { return this._frames.length > 0 ? this._position / (this._frames.length - 1) : 0; }

  get speed(): number          { return this._speed; }
  set speed(v: number)         { this._speed = Math.max(0.1, Math.min(16, v)); }

  get loop(): boolean          { return this._loop; }
  set loop(v: boolean)         { this._loop = v; }

  // ── Controls ─────────────────────────────────────────────────────────────────

  /** Start or resume playback. */
  play(): void {
    if (this._frames.length === 0) return;
    if (this._state === 'ended') this._position = 0;
    this._setState('playing');
    this._lastWallMs = Date.now();
    this._accumMs    = 0;
    this._scheduleNext();
  }

  /** Pause playback without resetting position. */
  pause(): void {
    if (this._state !== 'playing') return;
    this._cancelRaf();
    this._setState('paused');
  }

  /** Stop playback and reset to frame 0. */
  stop(): void {
    this._cancelRaf();
    this._position = 0;
    this._setState('idle');
  }

  /** Seek to an absolute frame position and deliver that frame immediately. */
  seek(position: number): void {
    const clamped = Math.max(0, Math.min(this._frames.length - 1, Math.round(position)));
    this._position = clamped;
    this._accumMs  = 0;
    const frame = this._frames[clamped];
    if (frame) this._callbacks.onFrame(frame, clamped, this._frames.length);
  }

  /** Seek by relative offset (+1 / -1 for step-forward / step-back). */
  step(delta: number): void {
    this.seek(this._position + delta);
  }

  /** Replace the frames buffer (e.g. after more data is recorded). */
  setFrames(frames: RecordedFrame[]): void {
    this._frames = frames;
    if (this._position >= frames.length) {
      this._position = Math.max(0, frames.length - 1);
    }
  }

  /** Destroy: cancel rAF and release references. */
  destroy(): void {
    this._cancelRaf();
    this._setState('idle');
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private _setState(s: PlayerState): void {
    if (this._state === s) return;
    this._state = s;
    this._callbacks.onStateChange?.(s);
  }

  private _scheduleNext(): void {
    this._rafId = requestAnimationFrame((now) => this._tick(now));
  }

  private _tick(now: number): void {
    if (this._state !== 'playing') return;

    const wallDelta = now - this._lastWallMs;
    this._lastWallMs = now;
    this._accumMs += wallDelta * this._speed;

    if (this._preserveTiming) {
      // Deliver frames whose simulated time has elapsed
      while (this._position < this._frames.length) {
        const curr = this._frames[this._position]!;
        const prev = this._position > 0 ? this._frames[this._position - 1]! : null;
        const frameDelta = prev ? curr.timestamp - prev.timestamp : 0;

        if (this._accumMs >= frameDelta) {
          this._accumMs -= frameDelta;
          this._deliverFrame(this._position);
          this._position++;
        } else {
          break;
        }
      }
    } else {
      // One frame per rAF regardless of timing
      this._deliverFrame(this._position);
      this._position++;
    }

    if (this._position >= this._frames.length) {
      this._position = this._frames.length - 1;
      if (this._loop) {
        this._position = 0;
        this._accumMs  = 0;
        this._scheduleNext();
      } else {
        this._cancelRaf();
        this._setState('ended');
        this._callbacks.onEnd?.();
      }
      return;
    }

    this._scheduleNext();
  }

  private _deliverFrame(pos: number): void {
    const frame = this._frames[pos];
    if (!frame) return;
    this._callbacks.onFrame(frame, pos, this._frames.length);
  }

  private _cancelRaf(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}
