// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * StreamingEngine — Central orchestrator for the DataFlow pipeline.
 * Internal pipeline stage interfaces are intentionally opaque.
 */

import { BackpressureController } from './pipeline/backpressure.js';
import { DeltaCalculator }        from './pipeline/delta-calculator.js';
import { AnomalyDetector }        from './pipeline/anomaly-detector.js';

// ── Internal pipeline stage contracts (opaque — not exported) ─────────────────
// Structural interfaces hide concrete class names from the declaration output.
// TypeScript's structural typing ensures the real implementations satisfy them.
interface _IBp {
  readonly bufferUtilization: number;
  readonly totalDropped: number;
  start(): void;
  stop(): void;
  destroy(): void;
  pushMany(rows: StreamRow[]): void;
}
interface _IDelta {
  diff(row: StreamRow): CellChange[];
  evict(ids: string[]): void;
  reset(): void;
}
interface _IAnom {
  process(row: StreamRow, schema: string[]): AnomalyEvent[];
  getStats(column: string): AnomalyStats | null;
  reset(): void;
}
import { SimulatedAdapter }       from './adapters/simulated.js';
import { WebSocketAdapter }       from './adapters/websocket.js';
import { SSEAdapter }             from './adapters/sse.js';
import { HTTPPollingAdapter }     from './adapters/http-polling.js';
import { WebTransportAdapter }    from './adapters/web-transport.js';

import type {
  StreamConfig,
  StreamRow,
  StreamMetrics,
  CellChange,
  AnomalyEvent,
  AnomalyStats,
  IStreamingEngine,
  StreamStatus,
} from './types.js';

/** Max age (ms) before a row's delta state is evicted from DeltaCalculator. */
const DELTA_ROW_TTL_MS = 60_000;   // 1 minute
/** How often to run eviction sweep. */
const DELTA_EVICT_INTERVAL_MS = 10_000;  // every 10 seconds

export interface EngineCallbacks {
  onRows?:    (rows: StreamRow[], changes: CellChange[]) => void;
  onAnomaly?: (events: AnomalyEvent[]) => void;
  onStatus?:  (status: StreamStatus) => void;
  onMetrics?: (metrics: StreamMetrics) => void;
  onDrop?:    (count: number) => void;
}

export class StreamingEngine implements IStreamingEngine {
  // ── Pipeline stages (typed as opaque interfaces, not concrete classes) ────
  private readonly _bp:    _IBp;
  private readonly _delta: _IDelta;
  private readonly _anom:  _IAnom;

  // ── Adapters ──────────────────────────────────────────────────────────────
  private _simulated?: SimulatedAdapter;
  private _ws?:        WebSocketAdapter;
  private _sse?:       SSEAdapter;
  private _poll?:      HTTPPollingAdapter;
  private _wt?:        WebTransportAdapter;

  // ── State ─────────────────────────────────────────────────────────────────
  private _status:    StreamStatus = 'disconnected';
  private _metrics:   StreamMetrics;
  private _startedAt = 0;
  private _rowsIn    = 0;
  private _anomCount = 0;
  private _schema:   string[] = [];

  /** Track last-seen time per rowId for DeltaCalculator TTL eviction */
  private _rowLastSeen = new Map<string, number>();
  private _evictTimer:  ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly _cfg: StreamConfig,
    private readonly _cb:  EngineCallbacks = {},
  ) {
    this._metrics = this._zeroMetrics();

    this._bp = new BackpressureController(
      _cfg.backpressure ?? {},
      {
        onFlush: (rows) => this._processRows(rows),
        onDrop:  (n)    => {
          this._metrics.droppedRows += n;
          this._cb.onDrop?.(n);
        },
      },
    );

    this._delta = new DeltaCalculator();
    this._anom  = new AnomalyDetector(_cfg.anomaly ?? {});
  }

  // ── IStreamingEngine ──────────────────────────────────────────────────────

  start(): void {
    if (this._status === 'connected') return;
    this._setStatus('connecting');
    this._bp.start();
    this._startedAt = Date.now();
    this._startEvictionSweep();

    const { adapter } = this._cfg;

    if (adapter.type === 'simulated') {
      this._simulated = new SimulatedAdapter(
        adapter,
        (rows) => this._handleRawRows(rows),
        (connected) => this._setStatus(connected ? 'connected' : 'disconnected'),
      );
      this._simulated.start();
      return;
    }

    if (adapter.type === 'websocket') {
      this._ws = new WebSocketAdapter(
        adapter,
        (rows) => this._handleRawRows(rows),
        (connected, err) => this._setStatus(connected ? 'connected' : 'error', err),
        (latency) => { this._metrics.latencyMs = latency; },
      );
      this._ws.connect();
      return;
    }

    if (adapter.type === 'sse') {
      this._sse = new SSEAdapter(
        adapter,
        (rows) => this._handleRawRows(rows),
        (connected, err) => this._setStatus(connected ? 'connected' : 'error', err),
      );
      this._sse.connect();
      return;
    }

    if (adapter.type === 'http-polling') {
      this._poll = new HTTPPollingAdapter(
        adapter,
        (rows) => this._handleRawRows(rows),
        (connected, err) => this._setStatus(connected ? 'connected' : 'error', err),
      );
      this._poll.start();
      return;
    }

    if (adapter.type === 'webtransport') {
      this._wt = new WebTransportAdapter(
        adapter,
        (rows) => this._handleRawRows(rows),
        (connected, _transport, err) => this._setStatus(connected ? 'connected' : 'error', err),
      );
      void this._wt.connect();
      return;
    }
  }

  stop(): void {
    this._simulated?.stop();
    this._ws?.disconnect();
    this._sse?.disconnect();
    this._poll?.stop();
    this._wt?.disconnect();
    this._bp.stop();
    this._stopEvictionSweep();
    this._setStatus('disconnected');
  }

  /**
   * Pause data delivery to the UI without disconnecting the adapter.
   * Rows continue to buffer in the BackpressureController.
   */
  pause(): void {
    if (this._status !== 'connected') return;
    this._bp.stop();
    this._setStatus('paused');
  }

  /**
   * Resume delivery after a pause — drains buffered rows immediately.
   */
  resume(): void {
    if (this._status !== 'paused') return;
    this._setStatus('connected');
    this._bp.start();
  }

  destroy(): void {
    this.stop();
    this._bp.destroy();
    this._delta.reset();
    this._anom.reset();
    this._rowLastSeen.clear();
  }

  get status():  StreamStatus  { return this._status; }
  get metrics(): StreamMetrics { return { ...this._metrics, uptime: this._uptimeMs() }; }

  getAnomalyStats(column: string) { return this._anom.getStats(column); }

  resetMetrics(): void {
    this._metrics = this._zeroMetrics();
    this._startedAt = Date.now();
    this._rowsIn    = 0;
    this._anomCount = 0;
  }

  /**
   * Inject rows directly through the full pipeline (backpressure → delta → anomaly detector).
   * Useful for demos, synthetic event injection, and testing.
   */
  injectRows(rows: StreamRow[]): void {
    this._handleRawRows(rows);
  }

  // ── Internal pipeline ──────────────────────────────────────────────────────

  private _handleRawRows(rows: StreamRow[]): void {
    this._rowsIn += rows.length;
    this._metrics.totalRows += rows.length;
    this._metrics.rowsPerSecond = this._calcRps();
    this._bp.pushMany(rows);
  }

  private _processRows(rows: StreamRow[]): void {
    if (rows.length === 0) return;

    const now = Date.now();

    // Infer schema from first non-empty row
    if (this._schema.length === 0 && rows[0]) {
      this._schema = Object.keys(rows[0]);
    }

    // Delta calculation + track last-seen for TTL eviction
    const allChanges: CellChange[] = [];
    for (const row of rows) {
      this._rowLastSeen.set(row.id, now);
      const changes = this._delta.diff(row);
      allChanges.push(...changes);
    }

    // Anomaly detection
    const allAnoms: AnomalyEvent[] = [];
    if (this._cfg.anomaly?.enabled !== false) {
      for (const row of rows) {
        const events = this._anom.process(row, this._schema);
        allAnoms.push(...events);
      }
    }

    // Emit
    this._cb.onRows?.(rows, allChanges);

    if (allAnoms.length) {
      this._anomCount += allAnoms.length;
      this._metrics.anomalyCount = this._anomCount;
      this._cb.onAnomaly?.(allAnoms);
    }

    // Update buffer metrics
    this._metrics.bufferUtilization = this._bp.bufferUtilization;
    this._metrics.droppedRows       = this._bp.totalDropped;

    this._cb.onMetrics?.({ ...this._metrics, uptime: this._uptimeMs() });
  }

  private _setStatus(status: StreamStatus, error?: string): void {
    this._status = status;
    if (error) console.warn('[DataFlow]', error);
    this._cb.onStatus?.(status);
  }

  private _calcRps(): number {
    const elapsed = (Date.now() - this._startedAt) / 1000;
    return elapsed > 0 ? Math.round(this._rowsIn / elapsed) : 0;
  }

  private _uptimeMs(): number {
    return this._startedAt > 0 ? Date.now() - this._startedAt : 0;
  }

  /**
   * Periodic sweep to evict DeltaCalculator entries for rows not seen
   * in the last DELTA_ROW_TTL_MS milliseconds. Prevents unbounded memory growth
   * in streams with high row turnover (e.g. log streams with unique IDs).
   */
  private _startEvictionSweep(): void {
    this._evictTimer = setInterval(() => {
      const now = Date.now();
      const stale: string[] = [];
      for (const [id, lastSeen] of this._rowLastSeen) {
        if (now - lastSeen > DELTA_ROW_TTL_MS) stale.push(id);
      }
      if (stale.length > 0) {
        this._delta.evict(stale);
        for (const id of stale) this._rowLastSeen.delete(id);
      }
    }, DELTA_EVICT_INTERVAL_MS);
  }

  private _stopEvictionSweep(): void {
    if (this._evictTimer) { clearInterval(this._evictTimer); this._evictTimer = null; }
  }

  private _zeroMetrics(): StreamMetrics {
    return {
      totalRows:         0,
      rowsPerSecond:     0,
      droppedRows:       0,
      anomalyCount:      0,
      latencyMs:         0,
      bufferUtilization: 0,
      uptime:            0,
    };
  }
}
