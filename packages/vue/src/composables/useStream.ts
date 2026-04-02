/**
 * useStream — Vue 3 composable for DataFlow real-time streaming.
 *
 * Wraps StreamingEngine with Vue 3 reactivity:
 *  - `ref` for status, metrics, anomalies
 *  - `shallowRef` for rows and changes (avoids deep reactive overhead)
 *  - Lifecycle managed via `onMounted` / `onUnmounted`
 *
 * Usage (Options API / Composition API / <script setup>):
 *
 *   <script setup>
 *   import { useStream } from '@gridstorm/dataflow-vue';
 *   const config = { adapter: { type: 'simulated', scenario: 'financial' } };
 *   const { rows, status, metrics, anomalies, start, stop } = useStream(config);
 *   </script>
 */

import { ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { StreamingEngine } from '@gridstorm/dataflow-core';
import type {
  StreamConfig,
  StreamRow,
  StreamStatus,
  StreamMetrics,
  CellChange,
  AnomalyEvent,
} from '@gridstorm/dataflow-core';

export interface UseStreamOptions {
  /** Maximum rows to keep in the reactive `rows` ref. Default: 500 */
  maxRows?:   number;
  /** Start the stream automatically on mount. Default: true */
  autoStart?: boolean;
  /**
   * Change `key` to tear down and recreate the engine with the latest config.
   * Useful when config changes after mount.
   */
  key?: string | number;
}

export interface UseStreamResult {
  rows:      ReturnType<typeof shallowRef<StreamRow[]>>;
  changes:   ReturnType<typeof shallowRef<CellChange[]>>;
  status:    ReturnType<typeof ref<StreamStatus>>;
  metrics:   ReturnType<typeof ref<StreamMetrics>>;
  anomalies: ReturnType<typeof shallowRef<AnomalyEvent[]>>;
  start:     () => void;
  stop:      () => void;
  pause:     () => void;
  resume:    () => void;
}

const EMPTY_METRICS: StreamMetrics = {
  totalRows: 0, rowsPerSecond: 0, droppedRows: 0,
  anomalyCount: 0, latencyMs: 0, bufferUtilization: 0, uptime: 0,
};

export function useStream(
  config: StreamConfig,
  options: UseStreamOptions = {},
): UseStreamResult {
  const { maxRows = 500, autoStart = true } = options;

  const rows      = shallowRef<StreamRow[]>([]);
  const changes   = shallowRef<CellChange[]>([]);
  const status    = ref<StreamStatus>('disconnected');
  const metrics   = ref<StreamMetrics>({ ...EMPTY_METRICS });
  const anomalies = shallowRef<AnomalyEvent[]>([]);

  let engine: StreamingEngine | null = null;

  function createEngine(): void {
    engine?.destroy();

    engine = new StreamingEngine(config, {
      onRows(newRows: StreamRow[], newChanges: CellChange[]) {
        const combined = [...rows.value, ...newRows];
        rows.value    = combined.length > maxRows ? combined.slice(combined.length - maxRows) : combined;
        changes.value = newChanges;
      },
      onStatus(s: StreamStatus) {
        status.value = s;
      },
      onMetrics(m: StreamMetrics) {
        metrics.value = m;
      },
      onAnomaly(evs: AnomalyEvent[]) {
        const combined = [...anomalies.value, ...evs];
        anomalies.value = combined.length > 200 ? combined.slice(combined.length - 200) : combined;
      },
    });

    if (autoStart) engine.start();
  }

  onMounted(() => { createEngine(); });

  onUnmounted(() => {
    engine?.destroy();
    engine = null;
  });

  const start  = () => engine?.start();
  const stop   = () => engine?.stop();
  const pause  = () => engine?.pause();
  const resume = () => engine?.resume();

  return {
    rows:      rows      as ReturnType<typeof shallowRef<StreamRow[]>>,
    changes:   changes   as ReturnType<typeof shallowRef<CellChange[]>>,
    status:    status    as ReturnType<typeof ref<StreamStatus>>,
    metrics:   metrics   as ReturnType<typeof ref<StreamMetrics>>,
    anomalies: anomalies as ReturnType<typeof shallowRef<AnomalyEvent[]>>,
    start, stop, pause, resume,
  };
}
