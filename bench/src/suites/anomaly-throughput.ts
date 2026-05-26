/**
 * anomaly-throughput — measures the standalone cost of anomaly detection
 * by driving the engine with a single column and varying the methods.
 *
 * This gives a clean per-method number that the engine-throughput suite
 * can't isolate (engine numbers include ring buffer + delta + dispatch
 * overhead).
 *
 * We use the public engine API (not the internal AnomalyDetector class)
 * because the detector is intentionally not exported — same numbers a
 * real user would see.
 */

import { StreamingEngine } from '@gridstorm/dataflow-core';
import type { StreamRow, AnomalyMethod } from '@gridstorm/dataflow-core';
import type { SuiteResult, BenchSample }  from '../types.js';
import { installRafPolyfill, uninstallRafPolyfill } from '../harness/raf-polyfill.js';

const ROWS_PER_RUN = 200_000;
const COLUMN       = 'value';

interface Scenario {
  label:   string;
  methods: AnomalyMethod[];
}

const SCENARIOS: Scenario[] = [
  { label: 'baseline (no anomaly)',  methods: [] },
  { label: 'z-score only',            methods: ['zscore'] },
  { label: 'IQR only',                methods: ['iqr'] },
  { label: 'MAD only',                methods: ['mad'] },
  { label: 'z-score + IQR',           methods: ['zscore', 'iqr'] },
  { label: 'z-score + IQR + MAD',     methods: ['zscore', 'iqr', 'mad'] },
];

function tick(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

async function runOne(s: Scenario): Promise<BenchSample> {
  let processed = 0;
  let anomalies = 0;

  const engine = new StreamingEngine(
    {
      adapter: { type: 'simulated', scenario: 'financial', entityCount: 1, tickIntervalMs: 99_999 },
      backpressure: { maxBufferSize: 200_000, targetFps: 60 },
      anomaly: {
        enabled: s.methods.length > 0,
        methods: s.methods,
        windowSize: 100,
        minSamples: 20,
      },
    },
    {
      onRows:    (rows)   => { processed += rows.length; },
      onAnomaly: (events) => { anomalies += events.length; },
    },
  );

  engine.start();

  const t0 = performance.now();
  const BATCH = 500;
  let i = 0;
  while (i < ROWS_PER_RUN) {
    const batch: StreamRow[] = new Array(BATCH);
    for (let j = 0; j < BATCH; j++) {
      // Mostly Gaussian, occasional spike — gives the detector real work
      const noise = (Math.random() - 0.5) * 4;
      const spike = Math.random() < 0.005 ? (Math.random() > 0.5 ? 40 : -40) : 0;
      batch[j] = {
        id:        `e-${(i + j) % 50}`,
        timestamp: Date.now(),
        [COLUMN]: 100 + noise + spike,
      };
    }
    engine.injectRows(batch);
    i += BATCH;
    if (i % (BATCH * 20) === 0) await tick(); // let rAF drain
  }

  // Drain pending
  await new Promise<void>((r) => setTimeout(r, 100));
  const elapsed = performance.now() - t0;
  engine.destroy();

  const rps = Math.round((processed * 1000) / elapsed);
  return {
    label: s.label,
    unit:  'rows/sec',
    value: rps,
    detail: {
      methods:     s.methods.length === 0 ? '—' : s.methods.join('+'),
      processed:   processed.toLocaleString('en-US'),
      anomalies:   anomalies.toLocaleString('en-US'),
      elapsed_ms:  Math.round(elapsed),
    },
  };
}

export async function run(): Promise<SuiteResult> {
  installRafPolyfill();
  const t0 = performance.now();
  const samples: BenchSample[] = [];
  try {
    for (const s of SCENARIOS) {
      samples.push(await runOne(s));
    }
  } finally {
    uninstallRafPolyfill();
  }
  return {
    id:    'anomaly-throughput',
    title: 'Anomaly detector throughput (single column)',
    columns: ['Configuration', 'rows/sec', 'methods', 'processed', 'anomalies'],
    samples,
    durationMs: performance.now() - t0,
    notes:
      `Single column "value" with Gaussian noise and 0.5% spike rate. ` +
      `${ROWS_PER_RUN.toLocaleString('en-US')} rows per scenario. ` +
      `Baseline scenario has anomaly.enabled=false — use the gap to the ` +
      `other rows to read marginal cost per method.`,
  };
}
