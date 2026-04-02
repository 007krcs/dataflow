/**
 * createStream — Svelte 5 store factory for DataFlow real-time streaming.
 *
 * Returns a set of readable stores driven by a StreamingEngine.
 * Compatible with both Svelte 5 runes and Svelte 4 stores (the stores
 * implement the Svelte store contract: subscribe/unsubscribe).
 *
 * Usage (Svelte 5 runes):
 *   <script>
 *   import { createStream } from '@gridstorm/dataflow-svelte';
 *   const stream = createStream({ adapter: { type: 'simulated', scenario: 'financial' } });
 *   // stream.rows, stream.status, stream.metrics, stream.anomalies are readable
 *   stream.start();
 *   </script>
 *   {#each $stream.rows as row} ... {/each}
 *
 * Usage (Svelte 4 / component onMount):
 *   import { onMount, onDestroy } from 'svelte';
 *   const stream = createStream(config);
 *   onMount(() => stream.start());
 *   onDestroy(() => stream.destroy());
 */

import { writable, derived, type Readable } from 'svelte/store';
import { StreamingEngine } from '@gridstorm/dataflow-core';
import type {
  StreamConfig,
  StreamRow,
  StreamStatus,
  StreamMetrics,
  CellChange,
  AnomalyEvent,
} from '@gridstorm/dataflow-core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StreamStoreOptions {
  /** Maximum rows to keep in the `rows` store. Default: 500 */
  maxRows?:   number;
  /** Start automatically when `createStream` is called. Default: false */
  autoStart?: boolean;
}

export interface StreamStore {
  rows:       Readable<StreamRow[]>;
  changes:    Readable<CellChange[]>;
  status:     Readable<StreamStatus>;
  metrics:    Readable<StreamMetrics>;
  anomalies:  Readable<AnomalyEvent[]>;
  /** Count of unread anomaly events */
  anomalyCount: Readable<number>;

  start:   () => void;
  stop:    () => void;
  pause:   () => void;
  resume:  () => void;
  /** Clear accumulated anomaly events */
  clearAnomalies: () => void;
  /** Tear down the engine and clean up subscriptions */
  destroy: () => void;
}

const EMPTY_METRICS: StreamMetrics = {
  totalRows: 0, rowsPerSecond: 0, droppedRows: 0,
  anomalyCount: 0, latencyMs: 0, bufferUtilization: 0, uptime: 0,
};

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createStream(
  config: StreamConfig,
  opts: StreamStoreOptions = {},
): StreamStore {
  const { maxRows = 500, autoStart = false } = opts;

  // Internal writable stores
  const _rows      = writable<StreamRow[]>([]);
  const _changes   = writable<CellChange[]>([]);
  const _status    = writable<StreamStatus>('disconnected');
  const _metrics   = writable<StreamMetrics>({ ...EMPTY_METRICS });
  const _anomalies = writable<AnomalyEvent[]>([]);

  const engine = new StreamingEngine(config, {
    onRows(newRows: StreamRow[], newChanges: CellChange[]) {
      _rows.update((prev) => {
        const combined = [...prev, ...newRows];
        return combined.length > maxRows ? combined.slice(combined.length - maxRows) : combined;
      });
      _changes.set(newChanges);
    },
    onStatus:  (s) => _status.set(s),
    onMetrics: (m) => _metrics.set(m),
    onAnomaly(evs: AnomalyEvent[]) {
      _anomalies.update((prev) => {
        const combined = [...prev, ...evs];
        return combined.length > 200 ? combined.slice(combined.length - 200) : combined;
      });
    },
  });

  if (autoStart) engine.start();

  // Derived anomaly count
  const anomalyCount = derived(_anomalies, ($a) => $a.length);

  return {
    rows:         { subscribe: _rows.subscribe },
    changes:      { subscribe: _changes.subscribe },
    status:       { subscribe: _status.subscribe },
    metrics:      { subscribe: _metrics.subscribe },
    anomalies:    { subscribe: _anomalies.subscribe },
    anomalyCount: { subscribe: anomalyCount.subscribe },

    start:          () => engine.start(),
    stop:           () => engine.stop(),
    pause:          () => engine.pause(),
    resume:         () => engine.resume(),
    clearAnomalies: () => _anomalies.set([]),
    destroy:        () => { engine.destroy(); },
  };
}
