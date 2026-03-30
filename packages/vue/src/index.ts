// Composables
export { useStream }        from './composables/useStream.js';
export { useStreamMetrics } from './composables/useStreamMetrics.js';
export { useAnomaly }       from './composables/useAnomaly.js';
export type { UseStreamOptions, UseStreamResult }       from './composables/useStream.js';
export type { UseStreamMetricsResult }                  from './composables/useStreamMetrics.js';
export type { UseAnomalyResult }                        from './composables/useAnomaly.js';

// Re-export core types for convenience
export type {
  StreamRow, StreamStatus, StreamMetrics, AnomalyEvent, CellChange,
  StreamConfig, SimulatedAdapterConfig, WebSocketAdapterConfig, SSEAdapterConfig,
} from '@dataflow/core';
