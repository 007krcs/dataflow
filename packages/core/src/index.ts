/**
 * @dataflow/core — Public API surface
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

// Types (re-export everything)
export type {
  // Core stream
  StreamStatus,
  StreamRow,
  StreamColumn,
  StreamSchema,
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
