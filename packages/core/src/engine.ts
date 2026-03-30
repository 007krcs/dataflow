/**
 * StreamingEngine — Central orchestrator for the DataFlow pipeline.
 *
 * Pipeline:
 *   Adapter (data source)
 *     └─► BackpressureController (ring buffer + rAF scheduler)
 *           └─► DeltaCalculator (cell-change direction)
 *                 └─► AnomalyDetector (statistical outlier detection)
 *                       └─► consumer callbacks (onRows, onAnomaly, onMetrics)
 *
 * The engine is adapter-agnostic: any source that calls _handleRawRows()
 * feeds the same pipeline.
 */

import { BackpressureController } from './pipeline/backpressure.js';
import { DeltaCalculator }        from './pipeline/delta-calculator.js';
import { AnomalyDetector }        from './pipeline/anomaly-detector.js';
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
  IStreamingEngine,
  StreamStatus,
} from './types.js';

export interface EngineCallbacks {
  onRows?:    (rows: StreamRow[], changes: CellChange[]) => void;
  onAnomaly?: (events: AnomalyEvent[]) => void;
  onStatus?:  (status: StreamStatus) => void;
  onMetrics?: (metrics: StreamMetrics) => void;
  onDrop?:    (count: number) => void;
}

export class StreamingEngine implements IStreamingEngine {
  // ── Pipeline stages ──────────────────────────────────────────────────────
  private readonly _bp:    BackpressureController;
  private readonly _delta: DeltaCalculator;
  private readonly _anom:  AnomalyDetector;

  // ── Adapters ──────────────────────────────────────────────────────────────
  private _simulated?: SimulatedAdapter;
  private _ws?:        WebSocketAdapter;
  private _sse?:       SSEAdapter;
  private _poll?:      HTTPPollingAdapter;
  private _wt?:        WebTransportAdapter;

  // ── State ─────────────────────────────────────────────────────────────────
  private _status:      StreamStatus = 'disconnected';
  private _metrics:     StreamMetrics;
  private _startedAt  = 0;
  private _rowsIn     = 0;
  private _anomCount  = 0;
  private _schema:    string[] = [];

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
    this._setStatus('disconnected');
  }

  destroy(): void {
    this.stop();
    this._bp.destroy();
    this._delta.reset();
    this._anom.reset();
  }

  get status():  StreamStatus  { return this._status; }
  get metrics(): StreamMetrics { return { ...this._metrics }; }

  getAnomalyStats(column: string) { return this._anom.getStats(column); }

  resetMetrics(): void {
    this._metrics = this._zeroMetrics();
    this._startedAt = Date.now();
    this._rowsIn    = 0;
    this._anomCount = 0;
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

    // Infer schema from first non-empty row
    if (this._schema.length === 0 && rows[0]) {
      this._schema = Object.keys(rows[0]);
    }

    // Delta calculation
    const allChanges: CellChange[] = [];
    for (const row of rows) {
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

    this._cb.onMetrics?.({ ...this._metrics });
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

  private _zeroMetrics(): StreamMetrics {
    return {
      totalRows:        0,
      rowsPerSecond:    0,
      droppedRows:      0,
      anomalyCount:     0,
      latencyMs:        0,
      bufferUtilization: 0,
      uptime:           0,
    };
  }
}
