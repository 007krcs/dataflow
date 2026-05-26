/**
 * engine-throughput — measures how many rows/sec StreamingEngine can ingest,
 * route through backpressure + delta + (optional) anomaly, and deliver to
 * the consumer callback.
 *
 * Methodology:
 *   - We construct a StreamingEngine wired to a callback that simply counts.
 *   - We fire `BATCH` rows through `injectRows` in a tight loop for `WARMUP_MS`,
 *     then for `MEASURE_MS`. We report rows delivered / second during the
 *     measurement window.
 *   - We polyfill `requestAnimationFrame` in Node so the engine's rAF-paced
 *     flush still drains the buffer.
 *   - Anomaly detection is toggled on a second pass — the gap is the
 *     marginal cost of running z-score + IQR per column.
 *
 * Caveats:
 *   - Node + rAF polyfill is not equivalent to a real browser frame budget.
 *     These numbers are an upper bound on engine work, not on rendered
 *     throughput. Use `canvas-render` (browser, Playwright) for that.
 *   - We measure delivered rows, not generated rows — backpressure drops
 *     count against the engine.
 */

import { StreamingEngine } from '@gridstorm/dataflow-core';
import type { StreamRow }  from '@gridstorm/dataflow-core';
import type { SuiteResult, BenchSample } from '../types.js';
import { installRafPolyfill, uninstallRafPolyfill } from '../harness/raf-polyfill.js';

const BATCH       = 100;        // rows per injectRows call
const WARMUP_MS   = 300;
const MEASURE_MS  = 2000;

function makeRow(id: string, ts: number): StreamRow {
  return {
    id,
    timestamp: ts,
    price:  100 + Math.random() * 50,
    volume: Math.round(Math.random() * 1_000_000),
    bid:    99 + Math.random() * 50,
    ask:    101 + Math.random() * 50,
    high:   105 + Math.random() * 50,
    low:    95 + Math.random() * 50,
  };
}

function makeBatch(entityCount: number, startIdx: number): StreamRow[] {
  const now = Date.now();
  const out: StreamRow[] = new Array(BATCH);
  for (let i = 0; i < BATCH; i++) {
    out[i] = makeRow(`E${(startIdx + i) % entityCount}`, now);
  }
  return out;
}

interface Scenario { entityCount: number; anomaly: boolean; label: string; }

const SCENARIOS: Scenario[] = [
  { entityCount: 100,  anomaly: false, label: '100 entities, no anomaly'  },
  { entityCount: 100,  anomaly: true,  label: '100 entities, z+IQR'       },
  { entityCount: 1000, anomaly: false, label: '1 000 entities, no anomaly' },
  { entityCount: 1000, anomaly: true,  label: '1 000 entities, z+IQR'      },
  { entityCount: 5000, anomaly: false, label: '5 000 entities, no anomaly' },
];

async function runOne(s: Scenario): Promise<BenchSample> {
  let delivered = 0;
  let dropped   = 0;

  const engine = new StreamingEngine(
    {
      adapter: { type: 'simulated', scenario: 'financial', entityCount: 1, tickIntervalMs: 99_999 },
      backpressure: { maxBufferSize: 50_000, targetFps: 60 },
      anomaly: {
        enabled: s.anomaly,
        methods: ['zscore', 'iqr'],
        windowSize: 100,
        minSamples: 20,
      },
    },
    {
      onRows: (rows) => { delivered += rows.length; },
      onDrop: (n)    => { dropped += n; },
    },
  );

  // Start the rAF loop but don't let the simulated adapter actually run
  engine.start();

  // Warmup
  const warmEnd = performance.now() + WARMUP_MS;
  let idx = 0;
  while (performance.now() < warmEnd) {
    engine.injectRows(makeBatch(s.entityCount, idx));
    idx += BATCH;
    await tick();
  }

  // Measure
  delivered = 0;
  dropped   = 0;
  const start = performance.now();
  const end   = start + MEASURE_MS;
  while (performance.now() < end) {
    engine.injectRows(makeBatch(s.entityCount, idx));
    idx += BATCH;
    await tick();
  }

  // Allow one final rAF tick to flush
  await new Promise<void>((r) => setTimeout(r, 50));
  const elapsedMs = performance.now() - start;
  engine.destroy();

  const rps = Math.round((delivered * 1000) / elapsedMs);
  return {
    label: s.label,
    unit:  'rows/sec',
    value: rps,
    detail: {
      entities:    s.entityCount,
      anomaly:     s.anomaly ? 'on' : 'off',
      delivered:   delivered.toLocaleString('en-US'),
      dropped:     dropped.toLocaleString('en-US'),
      elapsed_ms:  Math.round(elapsedMs),
    },
  };
}

function tick(): Promise<void> {
  return new Promise((r) => setImmediate(r));
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
    id:    'engine-throughput',
    title: 'Engine throughput (Node + rAF polyfill)',
    columns: ['Scenario', 'rows/sec', 'entities', 'anomaly', 'delivered', 'dropped'],
    samples,
    durationMs: performance.now() - t0,
    notes:
      'Pure ingestion + pipeline work. Excludes UI render cost — see ' +
      'canvas-render suite for browser-side numbers. ' +
      `Each scenario: ${WARMUP_MS}ms warmup, ${MEASURE_MS}ms measure window, ` +
      `batches of ${BATCH} rows.`,
  };
}
