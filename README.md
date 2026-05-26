# DataFlow

**Real-Time Streaming Data Platform** — open-source, framework-agnostic, built so your live-data dashboard doesn't drop frames or lose anomalies.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-0.3.2-indigo)](https://github.com/007krcs/dataflow)
[![React](https://img.shields.io/badge/react-18%20%7C%2019-61dafb)](https://www.npmjs.com/package/@gridstorm/dataflow-react)
[![Vue](https://img.shields.io/badge/vue-3.3%2B-42b883)](https://www.npmjs.com/package/@gridstorm/dataflow-vue)
[![Svelte](https://img.shields.io/badge/svelte-5-ff3e00)](https://www.npmjs.com/package/@gridstorm/dataflow-svelte)
[![Canvas](https://img.shields.io/badge/renderer-canvas--alpha-purple)](https://www.npmjs.com/package/@gridstorm/dataflow-canvas)

---

## What is DataFlow?

DataFlow is a headless streaming data engine that connects any real-time data source to any UI framework. It handles the hard parts of live data — backpressure, anomaly detection, reconnection, cell-change tracking — so your application doesn't have to.

```
Data Source  →  Adapter  →  BackpressureController  →  DeltaCalculator  →  AnomalyDetector  →  Your UI
                WebSocket      Ring Buffer + rAF          Cell Flashing       Z-score + IQR
                SSE            Frame-rate limiting        Direction tracking  Rolling window
                HTTP Poll      Drop strategy              % change calc       MAD method
                WebTransport
                Simulated
```

---

## Features

| Feature | Description |
|---------|-------------|
| **5 Adapters** | WebSocket, SSE, HTTP Polling (adaptive / long-poll), WebTransport (HTTP/3), Simulated |
| **Backpressure Control** | Ring buffer + requestAnimationFrame scheduler, `oldest` / `newest` / `sample` drop strategies |
| **Anomaly Detection** | Z-score, IQR (Tukey fences), MAD, static `threshold` — rolling window, per-column, severity tiers |
| **Sustained Anomalies** | Run-length and burst detection layered on point-in-time events |
| **Cell Change Tracking** | Direction (up/down/flat), % change, flash animations |
| **Time-Travel Replay** | Record live frames, scrub & seek, 0.1×–16× playback speed |
| **Multi-Stream Join** | `joinStreams` (inner / left / outer) + N-way `mergeStreams` |
| **Schema Auto-Inference** | Detects `number / boolean / timestamp / currency / percentage` from live samples |
| **React 18 / 19 Hooks** | `useStream`, `useStreamMetrics`, `useAnomaly` |
| **Vue 3 Composables** | `useStream`, `useStreamMetrics`, `useAnomaly` |
| **Svelte 5 Stores** | `createStream`, `createAnomalyStore` |
| **Components** | `ConnectionBadge`, `MetricBar`, `AnomalyPanel` (React) |
| **Simulated Data** | Financial (GBM), Crypto, IoT, E-commerce, Logs, Social — seeded PRNG |
| **TypeScript First** | Full type coverage, strict mode |
| **Zero Dependencies** | Core has no runtime dependencies |
| **Canvas Renderer (alpha)** | `@gridstorm/dataflow-canvas` — Canvas-2D streaming grid with layer cache, dirty-rect rAF, and cell-flash animations for 10K+ visible rows |
| **Footprint** | Core ≈ 79 KB gzipped · React adapter ≈ 12 KB gzipped · Canvas renderer ≈ 5 KB gzipped |

---

## Quick Start

```bash
# Install
pnpm add @gridstorm/dataflow-core @gridstorm/dataflow-react

# Or npm
npm install @gridstorm/dataflow-core @gridstorm/dataflow-react
```

```tsx
import { useStream } from '@gridstorm/dataflow-react';

export function StockTicker() {
  const { rows, status, metrics } = useStream({
    adapter: {
      type: 'websocket',
      url:  'wss://your-feed.example.com/stocks',
    },
    anomaly: { enabled: true, methods: ['zscore', 'iqr'] },
  });

  return (
    <div>
      <p>Status: {status} | Rows/sec: {metrics.rowsPerSecond}</p>
      {rows.map((row) => (
        <div key={row.id}>{row.symbol}: ${row.price}</div>
      ))}
    </div>
  );
}
```

---

## Demo

Run the interactive demo locally:

```bash
git clone https://github.com/007krcs/dataflow
cd dataflow/demo
npm install
npm run dev
# Opens at http://localhost:3400
```

Four live scenarios:
- **📈 Stocks** — 20 NYSE/NASDAQ symbols, GBM price simulation, Z-score anomalies
- **₿ Crypto** — 20 crypto pairs, higher volatility, MAD + IQR detection
- **🌡 IoT** — 25 sensors (temp/humidity/CO₂/pressure), anomaly injection
- **🛒 Commerce** — 16 category×region segments, rolling revenue KPIs

---

## Adapters

### WebSocket
```ts
import { StreamingEngine } from '@gridstorm/dataflow-core';

const engine = new StreamingEngine({
  adapter: {
    type:            'websocket',
    url:             'wss://feed.example.com/stream',
    authToken:       'your-jwt',
    reconnectBaseMs: 500,
    reconnectMaxMs:  30000,
    heartbeatMs:     15000,
    maxRetries:      10,
  },
}, callbacks);
```

### Server-Sent Events
```ts
adapter: {
  type:             'sse',
  url:              'https://api.example.com/events',
  withCredentials:  false,
  reconnectBaseMs:  1000,
}
```

### HTTP Polling
```ts
adapter: {
  type:         'http-polling',
  url:          'https://api.example.com/data',
  strategy:     'adaptive',   // 'fixed' | 'adaptive' | 'long-poll'
  intervalMs:   1000,
  minIntervalMs: 250,
  maxIntervalMs: 10000,
  authToken:    'Bearer ...',
}
```

### WebTransport (HTTP/3)
```ts
adapter: {
  type: 'webtransport',
  url:  'https://stream.example.com/wt',
}
```

### Simulated (Demo / Testing)
```ts
adapter: {
  type:           'simulated',
  scenario:       'financial',  // 'financial' | 'crypto' | 'iot' | 'ecommerce'
  entityCount:    20,
  tickIntervalMs: 400,
  seed:           42,           // reproducible
  anomalyRate:    0.02,
}
```

---

## Anomaly Detection

DataFlow includes a statistical anomaly detector with 3 algorithms:

```ts
anomaly: {
  enabled:         true,
  methods:         ['zscore', 'iqr', 'mad'],
  zScoreThreshold: 2.5,    // |z| > 2.5 triggers
  iqrMultiplier:   1.5,    // Tukey fences: Q1 - 1.5×IQR
  windowSize:      100,    // rolling window size
  minSamples:      20,     // wait for N samples before detecting
  columns:         [],     // empty = all numeric columns
  severityThresholds: { warning: 2.5, critical: 4.0 },
}
```

| Method | Description | Best for |
|--------|-------------|----------|
| `zscore` | `\|x - μ\| / σ > threshold` | Normal distributions |
| `iqr` | Outside Tukey fences | Skewed data |
| `mad` | Median Absolute Deviation | Robust to outliers |

---

## Backpressure

Prevents UI flooding when data arrives faster than the browser can render:

```ts
backpressure: {
  maxBufferSize:      50000,    // ring buffer capacity
  targetFps:          30,       // drain up to N rows per frame
  dropStrategy:       'oldest', // 'oldest' | 'newest' | 'sample'
  minFrameIntervalMs: 33,       // throttle flush calls
}
```

---

## React API

### `useStream(config, options?)`
```ts
const { rows, changes, status, metrics, anomalies, start, stop } = useStream(config, {
  maxRows:   500,   // rolling window
  autoStart: true,
});
```

### `useStreamMetrics(config)`
Subscribe only to metrics (no row re-renders):
```ts
const { metrics, status } = useStreamMetrics(config);
```

### `useAnomaly(config, maxEvents?)`
Subscribe only to anomaly events:
```ts
const { anomalies, byColumn, clearAll } = useAnomaly(config);
```

---

## Architecture

```
packages/
  core/           # @gridstorm/dataflow-core — zero runtime deps
    src/
      types.ts                       # All public TypeScript types
      engine.ts                      # StreamingEngine orchestrator
      adapters/
        websocket.ts                 # WS + reconnect + heartbeat
        sse.ts                       # EventSource + reconnect
        http-polling.ts              # Fixed / adaptive / long-poll
        web-transport.ts             # HTTP/3 + detectBestTransport fallback
        simulated.ts                 # 6 scenarios, seeded PRNG, GBM math
      pipeline/
        ring-buffer.ts               # O(1) circular buffer
        backpressure.ts              # rAF scheduler + drop strategies
        delta-calculator.ts          # Cell change tracking
        anomaly-detector.ts          # Z-score / IQR / MAD / threshold
        sustained-anomaly.ts         # Run-length + burst detection
      replay/
        recorder.ts                  # Frame recorder
        player.ts                    # ReplayPlayer (seek / step / speed / loop)
      join/
        stream-join.ts               # joinStreams + mergeStreams
      schema/
        infer.ts                     # Schema auto-inference

  react/          # @gridstorm/dataflow-react — React 18 / 19
    src/hooks/      useStream, useStreamMetrics, useAnomaly
    src/components/ ConnectionBadge, MetricBar, AnomalyPanel

  vue/            # @gridstorm/dataflow-vue — Vue 3.3+
    src/composables/ useStream, useStreamMetrics, useAnomaly

  svelte/         # @gridstorm/dataflow-svelte — Svelte 5
    src/stores/     createStream, createAnomalyStore

  canvas/         # @gridstorm/dataflow-canvas — Canvas-2D grid renderer (alpha)
    src/renderer/     CanvasGridRenderer + background/header/cells/flashes layers
    src/scheduler/    Dirty-rect rAF scheduler
    src/text/         FontCache (measureText memoization)
    src/integrations/ React <CanvasGrid> component

demo/             # Interactive Vite + React demo (dataflow.tekivex.com)
docs/             # Full documentation (7 guides)
e2e/              # Playwright E2E tests (273 tests × 3 browsers)
```

---

## Documentation

| Guide | What's covered |
|-------|---------------|
| [Getting Started](./docs/GETTING_STARTED.md) | Install, first stream in 5 min, core concepts |
| [Adapters](./docs/ADAPTERS.md) | All 5 adapters — config, auth, reconnection, message formats |
| [React API](./docs/REACT_API.md) | `useStream`, `useStreamMetrics`, `useAnomaly`, all components, recipes |
| [Anomaly Detection](./docs/ANOMALY_DETECTION.md) | Z-score, IQR, MAD explained, tuning guide, rolling window internals |
| [Architecture](./docs/ARCHITECTURE.md) | Pipeline design, class diagram, performance benchmarks |
| [Configuration](./docs/CONFIGURATION.md) | Every config option with types, defaults, and real-world examples |
| [Backpressure](./docs/BACKPRESSURE.md) | Ring buffer, rAF scheduler, drop strategies, memory sizing |

---

## Comparison

| Feature | DataFlow | Socket.io | RxJS | TanStack Query |
|---------|----------|-----------|------|----------------|
| Zero server infra | ✅ | ❌ (needs Socket.io server) | ✅ | ✅ |
| WebSocket + SSE + HTTP poll + WebTransport | ✅ | WS only | ❌ (transport-agnostic) | HTTP poll only |
| Backpressure (ring buffer + rAF) | ✅ | ❌ | Manual via operators | ❌ |
| Per-column anomaly detection | ✅ (Z-score / IQR / MAD / threshold) | ❌ | ❌ | ❌ |
| Sustained / burst anomaly patterns | ✅ | ❌ | ❌ | ❌ |
| Cell-change direction + flash | ✅ | ❌ | ❌ | ❌ |
| Time-travel record / replay | ✅ | ❌ | ❌ | ❌ |
| Multi-stream SQL-style join | ✅ | ❌ | `combineLatest` only | ❌ |
| React + Vue + Svelte adapters | ✅ | React/Vue community wrappers | ❌ | ✅ (React + Vue + Solid) |
| TypeScript | ✅ | ✅ | ✅ | ✅ |
| Core footprint (gzipped) | ~79 KB | ~30 KB client | ~30 KB | ~13 KB |

DataFlow is a complement to chart libraries (Recharts, Visx, Highcharts) and grids (AG Grid, TanStack Table) — feed their UI with our pipeline.

---

## Roadmap

**Shipped in 0.3.x:**

- [x] Vue 3 adapter — [`@gridstorm/dataflow-vue`](https://www.npmjs.com/package/@gridstorm/dataflow-vue)
- [x] Svelte 5 adapter — [`@gridstorm/dataflow-svelte`](https://www.npmjs.com/package/@gridstorm/dataflow-svelte)
- [x] Time-travel record & replay (`StreamRecorder` + `ReplayPlayer`, 0.1×–16× scrubbing)
- [x] Multi-stream join (`joinStreams` / `mergeStreams`)
- [x] Schema auto-inference (`inferSchema`)
- [x] Sustained-anomaly detection (run-length + burst)

**Next:**

- [x] Canvas-2D renderer (alpha) — [`@gridstorm/dataflow-canvas`](https://www.npmjs.com/package/@gridstorm/dataflow-canvas)
- [ ] WebGL backend for the canvas renderer (1M+ cells)
- [ ] IndexedDB sink for replay buffers (persistent recordings)
- [ ] Multivariate anomaly detection (correlated columns)
- [ ] gRPC-Web adapter
- [ ] Grafana-compatible metrics export
- [ ] WASM-accelerated rolling statistics

## Examples

| Example | What it shows |
|---|---|
| [`examples/node-ws-server`](./examples/node-ws-server) | Reference Node WebSocket server (~250 LOC, single dep) that emits financial / IoT / ecommerce rows in the exact wire format the DataFlow WS adapter expects. The fastest way to try DataFlow against a real socket. |

---

## Performance

Honest, reproducible numbers. Run `pnpm --filter @gridstorm/dataflow-bench bench` to measure on your own hardware.

**Engine throughput** (Node + rAF polyfill, 6-column financial rows, low-end Intel i3 laptop):

| Config | rows/sec |
|---|---:|
| No anomaly, 100 entities | ~24,000 |
| No anomaly, 5,000 entities | ~26,000 |
| Z-score + IQR, 100 entities | ~1,500 |
| Z-score + IQR, 1,000 entities | ~1,200 |

The headline: **the engine itself isn't the bottleneck**; per-row statistical anomaly detection is. IQR and MAD require sorting the rolling window per row per column, which scales O(n log n). On M-series hardware these numbers roughly 2–3× across the board.

If you're streaming faster than the anomaly path can sustain, use the `threshold` method (static comparison, O(1) per row) or wait for the v0.4 incremental-quantile estimator on the roadmap.

**Anomaly detector throughput** (single column, 200k rows):

| Method | rows/sec | Notes |
|---|---:|---|
| baseline (off) | ~71,000 | engine + delta calc only |
| z-score | ~21,000 | running mean/variance — cheapest |
| IQR | ~13,000 | needs sorted window |
| MAD | ~11,000 | needs sorted window + median of deviations |
| z + IQR + MAD | ~24,000 | early-exit when one fires; faster than single methods at high anomaly rates |

**Bundle sizes** (gzipped, post-obfuscation, `gzip -9` on published `dist/index.js`):

| Package | gzipped |
|---|---:|
| `@gridstorm/dataflow-core` | 78.5 KB |
| `@gridstorm/dataflow-react` | 12.4 KB |
| `@gridstorm/dataflow-vue` | 4.8 KB |
| `@gridstorm/dataflow-svelte` | 4.2 KB |
| `@gridstorm/dataflow-canvas` (core) | 5.3 KB |
| `@gridstorm/dataflow-canvas/react` | 6.0 KB |

Full methodology + JSON output format: [`bench/README.md`](./bench/README.md). Refute the numbers if you can; PRs welcome.

---

## License

MIT © 2026 [007krcs](https://github.com/007krcs)
