/**
 * DataFlow Core — Type Definitions
 * All public types for the streaming engine.
 */

// ─── Stream Lifecycle ─────────────────────────────────────────────────────────

export type StreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'paused'
  | 'reconnecting'
  | 'error'
  | 'closed';

export type AdapterType =
  | 'websocket'
  | 'sse'
  | 'http-polling'
  | 'simulated'
  | 'web-transport';

// ─── Data Model ───────────────────────────────────────────────────────────────

export type CellValue = string | number | boolean | null;

export interface StreamRow {
  /** Unique stable row identifier */
  id: string;
  /** Unix ms timestamp when the row was received */
  timestamp: number;
  [column: string]: CellValue;
}

export type ColumnType = 'number' | 'string' | 'boolean' | 'timestamp' | 'currency' | 'percentage';

export interface StreamColumn {
  id: string;
  label: string;
  type: ColumnType;
  unit?: string;
  /** printf-style format, e.g. "%.2f" */
  format?: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  /** Whether anomaly detection applies to this column */
  monitorAnomaly?: boolean;
}

export interface StreamSchema {
  columns: StreamColumn[];
  /** Column that uniquely identifies a row (for upsert semantics) */
  idColumn?: string;
  /** Column that contains timestamps */
  timestampColumn?: string;
}

// ─── Cell Change Tracking ─────────────────────────────────────────────────────

export type CellChangeDirection = 'up' | 'down' | 'flat';

export interface CellChange {
  rowId: string;
  columnId: string;
  oldValue: CellValue;
  newValue: CellValue;
  direction: CellChangeDirection;
  /** Percentage change for numeric columns, null otherwise */
  changePercent: number | null;
  timestamp: number;
}

// ─── Anomaly Detection ────────────────────────────────────────────────────────

export type AnomalySeverity = 'info' | 'warning' | 'critical';
export type AnomalyMethod = 'zscore' | 'iqr' | 'mad' | 'threshold';

export interface AnomalyStats {
  mean: number;
  stddev: number;
  median: number;
  mad: number;      // Median Absolute Deviation
  q1: number;
  q3: number;
  iqr: number;
  min: number;
  max: number;
  sampleCount: number;
}

export interface AnomalyEvent {
  id: string;
  rowId: string;
  columnId: string;
  value: number;
  stats: AnomalyStats;
  severity: AnomalySeverity;
  method: AnomalyMethod;
  zScore: number | null;
  iqrDeviation: number | null;
  timestamp: number;
  message: string;
}

// ─── Stream Frame (one render cycle of data) ─────────────────────────────────

export interface StreamFrame {
  /** Rows to upsert into the grid */
  rows: StreamRow[];
  /** Cell-level changes since last frame */
  changes: CellChange[];
  /** Anomalies detected in this frame */
  anomalies: AnomalyEvent[];
  timestamp: number;
  sequenceNumber: number;
  /** True when this frame was dropped due to backpressure */
  wasDegraded: boolean;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface StreamMetrics {
  messagesPerSecond: number;
  framesPerSecond: number;
  totalMessages: number;
  droppedMessages: number;
  latencyMs: number;
  /** 0-1, how full the internal ring buffer is */
  bufferUtilization: number;
  anomalyCount: number;
  connectedAt: number | null;
  uptimeMs: number;
  /** Total bytes received (WebSocket/SSE) */
  bytesReceived: number;
}

// ─── Adapter Configuration ────────────────────────────────────────────────────

export interface WebSocketAdapterConfig {
  type: 'websocket';
  url: string;
  protocols?: string[];
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  heartbeatIntervalMs?: number;
  /** Parse raw message string into a StreamRow. Default: JSON.parse */
  messageToRow?: (data: string) => StreamRow | null;
}

export interface SSEAdapterConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
  reconnectDelayMs?: number;
  eventName?: string;
  messageToRow?: (data: string) => StreamRow | null;
}

export interface HTTPPollingAdapterConfig {
  type: 'http-polling';
  url: string;
  intervalMs?: number;
  headers?: Record<string, string>;
  /** Extract rows from the API response. Default: response itself if array, else response.data */
  extractRows?: (response: unknown) => StreamRow[];
  /** Send cursor/since param on each request for incremental fetching */
  cursored?: boolean;
}

export type SimulatedScenario = 'financial' | 'iot' | 'logs' | 'ecommerce' | 'social' | 'crypto';

export interface SimulatedAdapterConfig {
  type: 'simulated';
  scenario: SimulatedScenario;
  /** Number of entities (symbols, sensors, etc.) to simulate. Default: 20 */
  entityCount?: number;
  /** Milliseconds between ticks. Default: 250 */
  tickIntervalMs?: number;
  /** 0-1 probability of injecting a synthetic anomaly per tick. Default: 0.02 */
  anomalyRate?: number;
  /** Seed for reproducible streams */
  seed?: number;
}

export interface WebTransportAdapterConfig {
  type: 'web-transport';
  url: string;
  /** Falls back to WebSocket if WebTransport unavailable */
  fallbackUrl?: string;
  messageToRow?: (data: Uint8Array) => StreamRow | null;
}

export type AdapterConfig =
  | WebSocketAdapterConfig
  | SSEAdapterConfig
  | HTTPPollingAdapterConfig
  | SimulatedAdapterConfig
  | WebTransportAdapterConfig;

// ─── Backpressure ─────────────────────────────────────────────────────────────

export interface BackpressureConfig {
  /** Maximum rows to buffer before applying drop strategy. Default: 50_000 */
  maxBufferSize?: number;
  /** Target render framerate. Default: 30 */
  targetFps?: number;
  /** What to drop when buffer is full. Default: 'oldest' */
  dropStrategy?: 'oldest' | 'newest' | 'sample';
  /** Minimum ms between renders. Computed from targetFps if not set */
  minFrameIntervalMs?: number;
}

// ─── Anomaly Config ───────────────────────────────────────────────────────────

export interface AnomalyConfig {
  enabled?: boolean;
  /** One or more detection algorithms. Default: ['zscore', 'iqr'] */
  methods?: AnomalyMethod[];
  /** Z-score threshold for 'zscore' method. Default: 2.5 */
  zScoreThreshold?: number;
  /** IQR fence multiplier. Default: 1.5 */
  iqrMultiplier?: number;
  /** Rolling window size for statistics. Default: 100 */
  windowSize?: number;
  /** Numeric columns to monitor. Default: all numeric */
  columns?: string[];
  /** Min samples before detection begins. Default: 20 */
  minSamples?: number;
  /** Severity levels for z-score thresholds */
  severityThresholds?: { warning: number; critical: number };
}

// ─── Main Stream Config ───────────────────────────────────────────────────────

export interface StreamConfig {
  id: string;
  name?: string;
  adapter: AdapterConfig;
  schema?: StreamSchema;
  backpressure?: BackpressureConfig;
  anomaly?: AnomalyConfig;
  /** Start streaming immediately on construction. Default: true */
  autoStart?: boolean;
  /** Called on every render frame */
  onFrame?: (frame: StreamFrame) => void;
  /** Called every second with updated metrics */
  onMetrics?: (metrics: StreamMetrics) => void;
  /** Called on anomaly detection */
  onAnomaly?: (event: AnomalyEvent) => void;
  /** Called on status transitions */
  onStatusChange?: (status: StreamStatus, prev: StreamStatus) => void;
  onError?: (error: Error) => void;
}

// ─── Public Engine Interface ──────────────────────────────────────────────────

export interface IStreamingEngine {
  readonly id: string;
  readonly status: StreamStatus;
  readonly metrics: StreamMetrics;
  readonly schema: StreamSchema | null;
  readonly rows: ReadonlyMap<string, StreamRow>;

  start(): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  destroy(): void;

  /** Replay: seek to a past position in the recorded ring buffer */
  seekTo(index: number): void;
  /** Get recorded history (up to ring buffer capacity) */
  getHistory(): StreamRow[];
}
