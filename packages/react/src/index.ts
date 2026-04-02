// Hooks
export { useStream }        from './hooks/useStream.js';
export { useStreamMetrics } from './hooks/useStreamMetrics.js';
export { useAnomaly }       from './hooks/useAnomaly.js';
export type { UseStreamOptions, UseStreamResult }    from './hooks/useStream.js';
export type { UseStreamMetricsResult }               from './hooks/useStreamMetrics.js';
export type { UseAnomalyResult }                     from './hooks/useAnomaly.js';

// Components
export { ConnectionBadge } from './components/ConnectionBadge.js';
export { MetricBar }       from './components/MetricBar.js';
export { AnomalyPanel }    from './components/AnomalyPanel.js';

// Re-export core types for convenience
export type {
  StreamRow, StreamStatus, StreamMetrics, AnomalyEvent, CellChange,
  StreamConfig, SimulatedAdapterConfig, WebSocketAdapterConfig, SSEAdapterConfig,
} from '@gridstorm/dataflow-core';
