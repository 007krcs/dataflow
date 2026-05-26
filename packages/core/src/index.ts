// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * @gridstorm/dataflow-core — Public API surface
 */

// Engine
export { StreamingEngine }         from './engine.js';
export type { EngineCallbacks }    from './engine.js';

// Adapters (public — users may need to subclass or reference these)
export { SimulatedAdapter }        from './adapters/simulated.js';
export { WebSocketAdapter }        from './adapters/websocket.js';
export { SSEAdapter }              from './adapters/sse.js';
export { HTTPPollingAdapter }      from './adapters/http-polling.js';
export { WebTransportAdapter, detectBestTransport } from './adapters/web-transport.js';

// NOTE: Internal pipeline classes (RingBuffer, BackpressureController,
// DeltaCalculator, AnomalyDetector, SustainedAnomalyDetector) are intentionally
// NOT exported. They are implementation details of StreamingEngine.

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
