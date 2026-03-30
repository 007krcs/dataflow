# DataFlow

**Real-Time Streaming Data Platform** — open-source, framework-agnostic, built for extreme throughput.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-0.3.0-indigo)](https://github.com/007krcs/dataflow)

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
| **5 Adapters** | WebSocket, SSE, HTTP Polling (adaptive), WebTransport (HTTP/3), Simulated |
| **Backpressure Control** | Ring buffer + requestAnimationFrame scheduler, configurable drop strategies |
| **Anomaly Detection** | Z-score, IQR (Tukey fences), MAD — rolling window, per-column |
| **Cell Change Tracking** | Direction (up/down/flat), % change, flash animations |
| **React Hooks** | `useStream`, `useStreamMetrics`, `useAnomaly` |
| **React Components** | `ConnectionBadge`, `MetricBar`, `AnomalyPanel` |
| **Simulated Data** | Financial (GBM), Crypto, IoT sensors, E-commerce — seeded PRNG |
| **TypeScript First** | Full type coverage, strict mode |
| **Zero Dependencies** | Core has no runtime dependencies |

---

## Quick Start

```bash
# Install
pnpm add @dataflow/core @dataflow/react

# Or npm
npm install @dataflow/core @dataflow/react
```

```tsx
import { useStream } from '@dataflow/react';

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
import { StreamingEngine } from '@dataflow/core';

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
  core/           # Pure TypeScript, zero dependencies
    src/
      types.ts          # All TypeScript types
      engine.ts         # StreamingEngine orchestrator
      adapters/
        websocket.ts    # WS + reconnect + heartbeat
        sse.ts          # EventSource + reconnect
        http-polling.ts # Adaptive interval polling
        web-transport.ts # HTTP/3 QUIC (futuristic)
        simulated.ts    # GBM financial + IoT + ecommerce
      pipeline/
        ring-buffer.ts       # O(1) circular buffer
        backpressure.ts      # rAF scheduler
        delta-calculator.ts  # Cell change tracking
        anomaly-detector.ts  # Z-score / IQR / MAD

  react/          # React 18+ hooks and components
    src/
      hooks/
        useStream.ts
        useStreamMetrics.ts
        useAnomaly.ts
      components/
        ConnectionBadge.tsx
        MetricBar.tsx
        AnomalyPanel.tsx

demo/             # Interactive Vite + React demo app
docs/             # Architecture and API docs
```

---

## Comparison

| Feature | DataFlow | Apache Kafka (browser) | Socket.io | RxJS |
|---------|----------|------------------------|-----------|------|
| Zero server infra | ✅ | ❌ | ❌ | ✅ |
| Backpressure | ✅ | ✅ | ❌ | ✅ |
| Anomaly detection | ✅ | ❌ | ❌ | ❌ |
| Cell flash UI | ✅ | ❌ | ❌ | ❌ |
| WebTransport | ✅ | ❌ | ❌ | ❌ |
| React hooks | ✅ | ❌ | ❌ | ❌ |
| TypeScript | ✅ | ✅ | ✅ | ✅ |
| Bundle size | ~12KB | ~500KB | ~80KB | ~30KB |

---

## Roadmap

- [ ] Vue 3 adapter (`@dataflow/vue`)
- [ ] Svelte 5 adapter (`@dataflow/svelte`)
- [ ] WebGL canvas renderer for 1M+ rows/sec
- [ ] Time-travel playback (record & replay streams)
- [ ] gRPC-Web adapter
- [ ] Grafana-compatible metrics export
- [ ] WASM-accelerated anomaly detection

---

## License

MIT © 2026 [007krcs](https://github.com/007krcs)
