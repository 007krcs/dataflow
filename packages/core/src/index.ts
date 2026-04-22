// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * @gridstorm/dataflow-core — Public API surface
 */

// Engine
export { StreamingEngine }         from './engine.js';
export type { EngineCallbacks }    from './engine.js';

// Adapters
export { SimulatedAdapter }        from './adapters/simulated.js';
export { WebSocketAdapter }        from './adapters/websocket.js';
export { SSEAdapter }              from './adapters/sse.js';
export { HTTPPollingAdapter }      from './adapters/http-polling.js';
export { WebTransportAdapter, detectBestTransport } from './adapters/web-transport.js';

// Pipeline primitives
export { RingBuffer }              from './pipeline/ring-buffer.js';
export { BackpressureController }  from './pipeline/backpressure.js';
export { DeltaCalculator }         from './pipeline/delta-calculator.js';
export { AnomalyDetector }         from './pipeline/anomaly-detector.js';
export { SustainedAnomalyDetector } from './pipeline/sustained-anomaly.js';
export type { SustainedEvent, SustainedAnomalyOptions, SustainedType } from './pipeline/sustained-anomaly.js';

// Schema utilities
export { inferSchema, mergeSchemas, SchemaInferrer } from './schema/infer.js';
export type { InferSchemaOptions }                   from './schema/infer.js';

// Stream join utilities
export { joinStreams, mergeStreams } from './join/stream-join.js';
export type { JoinOptions, JoinResult, JoinStrategy } from './join/stream-join.js';

// Time-travel replay
export { StreamRecorder, ReplayPlayer }  from './replay/index.js';
export type {
  RecordedFrame, RecorderOptions,
  PlayerState, PlayerCallbacks, PlayerOptions,
} from './replay/index.js';

// Types (re-export everything)
export type {
  // Core stream
  StreamStatus,
  StreamRow,
  StreamColumn,
  StreamSchema,
  ColumnType,
  StreamFrame,
  StreamMetrics,
  IStreamingEngine,
  StreamConfig,

  // Changes & anomalies
  CellValue,
  CellChange,
  CellChangeDirection,
  AnomalyEvent,
  AnomalyMethod,
  AnomalySeverity,
  AnomalyStats,
  ColumnThreshold,

  // Configs
  BackpressureConfig,
  AnomalyConfig,
  AdapterType,
  SimulatedAdapterConfig,
  WebSocketAdapterConfig,
  SSEAdapterConfig,
  HTTPPollingAdapterConfig,
  WebTransportAdapterConfig,
} from './types.js';
