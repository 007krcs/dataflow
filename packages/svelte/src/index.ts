// Stores
export { createStream }      from './stores/stream.js';
export { createAnomalyStore } from './stores/anomaly.js';
export type { StreamStore, StreamStoreOptions }  from './stores/stream.js';
export type { AnomalyStoreResult }               from './stores/anomaly.js';

// Re-export core types for convenience
export type {
  StreamRow, StreamStatus, StreamMetrics, AnomalyEvent, CellChange,
  StreamConfig, SimulatedAdapterConfig, WebSocketAdapterConfig, SSEAdapterConfig,
} from '@dataflow/core';
