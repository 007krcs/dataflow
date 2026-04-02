/**
 * SustainedAnomalyDetector — Run-length & burst anomaly detection.
 *
 * Layered on top of the point-in-time AnomalyDetector.  It tracks two
 * additional patterns that the base detector cannot catch:
 *
 *  1. **Sustained run** — a column that fires anomaly events on N consecutive
 *     ticks.  This is more actionable than a single spike that immediately
 *     reverts.  Emits a `SustainedEvent` with type `'run'`.
 *
 *  2. **Burst** — K or more anomaly events within a sliding time window of W
 *     milliseconds for the same column.  Indicates a systemic problem rather
 *     than random noise.  Emits a `SustainedEvent` with type `'burst'`.
 *
 * Usage:
 *   const sa = new SustainedAnomalyDetector({ runLength: 4, burstCount: 6, burstWindowMs: 10_000 });
 *   const base = new AnomalyDetector(config);
 *
 *   // In your row-processing loop:
 *   const pointEvents  = base.process(row, schema);
 *   const sustained    = sa.process(row.id, col, pointEvents, row.timestamp);
 */

import type { AnomalyEvent, AnomalySeverity } from '../types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SustainedType = 'run' | 'burst';

export interface SustainedEvent {
  id: string;
  type: SustainedType;
  columnId: string;
  /** Number of consecutive flags (run) or events in the window (burst). */
  count: number;
  /** Duration in ms — run: time from first to last flag; burst: window width. */
  durationMs: number;
  severity: AnomalySeverity;
  timestamp: number;
  message: string;
  /** The individual point events that contributed to this sustained event. */
  contributingEvents: AnomalyEvent[];
}

export interface SustainedAnomalyOptions {
  /**
   * Number of consecutive anomaly ticks that constitutes a "run".
   * Default: 4
   */
  runLength?: number;
  /**
   * Number of anomaly events within `burstWindowMs` that triggers a burst.
   * Default: 6
   */
  burstCount?: number;
  /**
   * Sliding time window for burst detection (milliseconds).
   * Default: 10_000 (10 seconds)
   */
  burstWindowMs?: number;
  /**
   * If true, continue emitting sustained events every N ticks while the run
   * persists (not just on the first detection).
   * Default: false
   */
  repeatRunEvents?: boolean;
}

// ─── Internal state per column ────────────────────────────────────────────────

interface ColumnRunState {
  /** How many consecutive ticks had at least one anomaly */
  consecutiveCount: number;
  /** Timestamp of the tick that started this run */
  runStartTs: number;
  /** Events accumulated during the current run */
  runEvents: AnomalyEvent[];
  /** Whether we already emitted a run event for the current streak */
  runEmitted: boolean;
}

interface ColumnBurstState {
  /** Sliding window of (timestamp, event) entries */
  window: Array<{ ts: number; event: AnomalyEvent }>;
  /** Whether we already emitted a burst event for the current saturation */
  burstActive: boolean;
}

// ─── Counter ──────────────────────────────────────────────────────────────────

let _sCounter = 0;
function nextId(): string { return `sus-${++_sCounter}-${Date.now()}`; }

// ─── SustainedAnomalyDetector ─────────────────────────────────────────────────

export class SustainedAnomalyDetector {
  private readonly _runLength:    number;
  private readonly _burstCount:   number;
  private readonly _burstWindowMs: number;
  private readonly _repeatRun:    boolean;

  private readonly _runs   = new Map<string, ColumnRunState>();
  private readonly _bursts = new Map<string, ColumnBurstState>();

  constructor(opts: SustainedAnomalyOptions = {}) {
    this._runLength     = opts.runLength     ?? 4;
    this._burstCount    = opts.burstCount    ?? 6;
    this._burstWindowMs = opts.burstWindowMs ?? 10_000;
    this._repeatRun     = opts.repeatRunEvents ?? false;
  }

  /**
   * Feed anomaly events for a single row tick.
   *
   * @param _rowId        Row identifier (reserved for future per-row tracking)
   * @param columnIds     The columns that were evaluated this tick (anomalous or not)
   * @param events        Point anomaly events from AnomalyDetector for this tick
   * @param timestamp     Unix ms timestamp of this tick
   * @returns Array of SustainedEvents (may be empty)
   */
  process(
    _rowId: string,
    columnIds: string[],
    events: AnomalyEvent[],
    timestamp: number,
  ): SustainedEvent[] {
    const sustained: SustainedEvent[] = [];
    const anomalousCols = new Set(events.map((e) => e.columnId));

    for (const col of columnIds) {
      const colEvents = events.filter((e) => e.columnId === col);
      const isAnomalous = anomalousCols.has(col);

      // ── Run detection ───────────────────────────────────────────────────────
      let run = this._runs.get(col);
      if (!run) {
        run = { consecutiveCount: 0, runStartTs: timestamp, runEvents: [], runEmitted: false };
        this._runs.set(col, run);
      }

      if (isAnomalous) {
        if (run.consecutiveCount === 0) run.runStartTs = timestamp;
        run.consecutiveCount++;
        run.runEvents.push(...colEvents);

        const shouldEmit = run.consecutiveCount >= this._runLength &&
          (!run.runEmitted || this._repeatRun);

        if (shouldEmit) {
          run.runEmitted = true;
          const durationMs = timestamp - run.runStartTs;
          const severity   = this._runSeverity(run.consecutiveCount);
          sustained.push({
            id: nextId(),
            type: 'run',
            columnId: col,
            count: run.consecutiveCount,
            durationMs,
            severity,
            timestamp,
            message: `${col} has been anomalous for ${run.consecutiveCount} consecutive ticks (${(durationMs / 1000).toFixed(1)}s)`,
            contributingEvents: [...run.runEvents],
          });
        }
      } else {
        // Run broken — reset
        run.consecutiveCount = 0;
        run.runEvents        = [];
        run.runEmitted       = false;
      }

      // ── Burst detection ─────────────────────────────────────────────────────
      let burst = this._bursts.get(col);
      if (!burst) {
        burst = { window: [], burstActive: false };
        this._bursts.set(col, burst);
      }

      // Add new events to window
      for (const ev of colEvents) {
        burst.window.push({ ts: timestamp, event: ev });
      }

      // Evict old entries outside the sliding window
      const cutoff = timestamp - this._burstWindowMs;
      burst.window = burst.window.filter((e) => e.ts > cutoff);

      const windowCount = burst.window.length;

      if (windowCount >= this._burstCount && !burst.burstActive) {
        burst.burstActive = true;
        const severity    = this._burstSeverity(windowCount);
        const oldest      = burst.window[0]!.ts;
        const durationMs  = timestamp - oldest;
        sustained.push({
          id: nextId(),
          type: 'burst',
          columnId: col,
          count: windowCount,
          durationMs,
          severity,
          timestamp,
          message: `${col} burst: ${windowCount} anomalies in ${(durationMs / 1000).toFixed(1)}s window`,
          contributingEvents: burst.window.map((w) => w.event),
        });
      } else if (windowCount < this._burstCount) {
        // Burst resolved once count drops below threshold
        burst.burstActive = false;
      }
    }

    return sustained;
  }

  private _runSeverity(count: number): AnomalySeverity {
    if (count >= this._runLength * 3) return 'critical';
    if (count >= this._runLength * 2) return 'warning';
    return 'info';
  }

  private _burstSeverity(count: number): AnomalySeverity {
    if (count >= this._burstCount * 2) return 'critical';
    if (count >= this._burstCount)     return 'warning';
    return 'info';
  }

  /** Reset state for one or all columns */
  reset(column?: string): void {
    if (column) {
      this._runs.delete(column);
      this._bursts.delete(column);
    } else {
      this._runs.clear();
      this._bursts.clear();
    }
  }

  /** Get current run length for a column (0 if not in a run) */
  getRunLength(column: string): number {
    return this._runs.get(column)?.consecutiveCount ?? 0;
  }

  /** Get current burst window count for a column */
  getBurstCount(column: string): number {
    return this._bursts.get(column)?.window.length ?? 0;
  }
}
