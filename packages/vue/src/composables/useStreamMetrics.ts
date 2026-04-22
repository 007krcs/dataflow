// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * useStreamMetrics — Lightweight composable that only subscribes to metrics.
 *
 * Useful when you only need throughput/latency/buffer stats without
 * receiving row data (e.g. a status bar in a separate component).
 *
 * Usage:
 *   const { metrics, status } = useStreamMetrics(config);
 */

import { ref, onMounted, onUnmounted } from 'vue';
import { StreamingEngine } from '@gridstorm/dataflow-core';
import type { StreamConfig, StreamMetrics, StreamStatus } from '@gridstorm/dataflow-core';

export interface UseStreamMetricsResult {
  metrics: ReturnType<typeof ref<StreamMetrics>>;
  status:  ReturnType<typeof ref<StreamStatus>>;
  start:   () => void;
  stop:    () => void;
}

const EMPTY: StreamMetrics = {
  totalRows: 0, rowsPerSecond: 0, droppedRows: 0,
  anomalyCount: 0, latencyMs: 0, bufferUtilization: 0, uptime: 0,
};

export function useStreamMetrics(
  config: StreamConfig,
  autoStart = true,
): UseStreamMetricsResult {
  const metrics = ref<StreamMetrics>({ ...EMPTY });
  const status  = ref<StreamStatus>('disconnected');
  let engine: StreamingEngine | null = null;

  onMounted(() => {
    engine = new StreamingEngine(config, {
      onRows:    () => { /* metrics only — intentionally empty */ },
      onStatus:  (s) => { status.value = s; },
      onMetrics: (m) => { metrics.value = m; },
    });
    if (autoStart) engine.start();
  });

  onUnmounted(() => { engine?.destroy(); engine = null; });

  return {
    metrics: metrics as ReturnType<typeof ref<StreamMetrics>>,
    status:  status  as ReturnType<typeof ref<StreamStatus>>,
    start: () => engine?.start(),
    stop:  () => engine?.stop(),
  };
}
