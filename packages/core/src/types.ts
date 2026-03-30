/**
 * DataFlow Core — Type Definitions
 * All public types for the streaming engine.
 */

// ─── Stream Lifecycle ─────────────────────────────────────────────────────────

export type StreamStatus =
  | 'disconnected'
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
  | 'webtransport';

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
  format?: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  monitorAnomaly?: boolean;
}

export interface StreamSchema {
  columns: StreamColumn[];
  idColumn?: string;
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
  mad: number;
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

// ─── Stream Frame ─────────────────────────────────────────────────────────────

export interface StreamFrame {
  rows: StreamRow[];
  changes: CellChange[];
  anomalies: AnomalyEvent[];
  timestamp: number;
  sequenceNumber: number;
  wasDegraded: boolean;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface StreamMetrics {
  totalRows: number;
  rowsPerSecond: number;
  droppedRows: number;
  anomalyCount: number;
  latencyMs: number;
  bufferUtilization: number;
  uptime: number;
}

// ─── Adapter Configuration ────────────────────────────────────────────────────

export interface WebSocketAdapterConfig {
  type: 'websocket';
  url: string;
  protocols?: string[];
  authToken?: string;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  heartbeatMs?: number;
  maxRetries?: number;
  messageToRow?: (data: string) => StreamRow | null;
}

export interface SSEAdapterConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
  withCredentials?: boolean;
  authToken?: string;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  maxRetries?: number;
  messageToRow?: (data: string) => StreamRow | null;
}

export interface HTTPPollingAdapterConfig {
  type: 'http-polling';
  url: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  authToken?: string;
  intervalMs?: number;
  timeoutMs?: number;
  strategy?: 'fixed' | 'adaptive' | 'long-poll';
  minIntervalMs?: number;
  maxIntervalMs?: number;
  maxRetries?: number;
  extractRows?: (response: unknown) => StreamRow[];
  cursored?: boolean;
}

export type SimulatedScenario = 'financial' | 'iot' | 'logs' | 'ecommerce' | 'social' | 'crypto';

export interface SimulatedAdapterConfig {
  type: 'simulated';
  scenario: SimulatedScenario;
  entityCount?: number;
  tickIntervalMs?: number;
  anomalyRate?: number;
  seed?: number;
}

export interface WebTransportAdapterConfig {
  type: 'webtransport';
  url: string;
  fallbackUrl?: string;
  serverCertificateHashes?: { algorithm: string; value: BufferSource }[];
}

export type AdapterConfig =
  | WebSocketAdapterConfig
  | SSEAdapterConfig
  | HTTPPollingAdapterConfig
  | SimulatedAdapterConfig
  | WebTransportAdapterConfig;

// ─── Backpressure ─────────────────────────────────────────────────────────────

export interface BackpressureConfig {
  maxBufferSize?: number;
  targetFps?: number;
  dropStrategy?: 'oldest' | 'newest' | 'sample';
  minFrameIntervalMs?: number;
}

// ─── Anomaly Config ───────────────────────────────────────────────────────────

export interface AnomalyConfig {
  enabled?: boolean;
  methods?: AnomalyMethod[];
  zScoreThreshold?: number;
  iqrMultiplier?: number;
  windowSize?: number;
  columns?: string[];
  minSamples?: number;
  severityThresholds?: { warning: number; critical: number };
}

// ─── Main Stream Config ───────────────────────────────────────────────────────

export interface StreamConfig {
  id?: string;
  name?: string;
  adapter: AdapterConfig;
  schema?: StreamSchema;
  backpressure?: BackpressureConfig;
  anomaly?: AnomalyConfig;
  autoStart?: boolean;
}

// ─── Public Engine Interface ──────────────────────────────────────────────────

export interface IStreamingEngine {
  readonly status: StreamStatus;
  readonly metrics: StreamMetrics;

  start(): void;
  stop(): void;
  destroy(): void;
}
