# @gridstorm/dataflow-core

Zero-dependency streaming engine for real-time data feeds — the core of the [DataFlow](https://dataflow.tekivex.com) platform.

**~79 KB gzipped** · TypeScript · MIT · Browser-only

## Install

```bash
npm install @gridstorm/dataflow-core
```

## Quick Start

```ts
import { StreamingEngine } from '@gridstorm/dataflow-core';

const engine = new StreamingEngine(
  {
    adapter: {
      type: 'websocket',
      url:  'wss://data.example.com/feed',
      reconnectBaseMs: 500,
      heartbeatMs:     15000,
    },
    backpressure: { maxBufferSize: 5000, targetFps: 30 },
    anomaly:      { enabled: true, methods: ['zscore', 'iqr'] },
  },
  {
    onRows:    (rows, changes) => console.log('Live rows:', rows.length),
    onAnomaly: (events)        => console.warn('Anomaly:', events),
    onStatus:  (status)        => console.log('Status:', status),
    onMetrics: (metrics)       => console.log('Throughput:', metrics.rowsPerSecond),
  },
);

engine.start();
// engine.pause() / engine.resume() / engine.stop() / engine.destroy()
```

## Try without a backend

The `simulated` adapter generates realistic streaming data (seeded PRNG, GBM for financial) — perfect for prototyping and tests:

```ts
const engine = new StreamingEngine({
  adapter: {
    type:           'simulated',
    scenario:       'financial',   // 'financial' | 'crypto' | 'iot' | 'ecommerce' | 'logs' | 'social'
    entityCount:    20,
    tickIntervalMs: 400,
    seed:           42,            // reproducible
  },
}, { onRows: (rows) => console.log(rows) });

engine.start();
```

## Features

- **5 adapters** — WebSocket (reconnect + heartbeat + auth), SSE, HTTP polling (fixed / adaptive / long-poll), WebTransport (HTTP/3), Simulated
- **rAF backpressure** — bounded ring buffer + frame-rate scheduler with `oldest` / `newest` / `sample` drop strategies
- **Cell change tracking** — per-cell direction (↑↓), `% change`, and timestamp diffs
- **Anomaly detection** — Z-score, IQR (Tukey fences), MAD, and static `threshold` per column; rolling window with `minSamples` warm-up and severity tiers
- **Sustained-anomaly detection** — run-length and burst patterns (built into the engine)
- **Schema auto-inference** — detects `number / boolean / timestamp / currency / percentage / string` from live samples
- **Time-travel replay** — `StreamRecorder` + `ReplayPlayer` with seek, step, 0.1×–16× speed, loop mode
- **Multi-stream join** — `joinStreams` (inner / left / outer) and N-way `mergeStreams`
- **TTL eviction** — delta state for stale row IDs is automatically reaped (60 s TTL) so log-style streams don't leak memory

## Adapter config (all 5)

```ts
// WebSocket
{ type: 'websocket', url, authToken?, reconnectBaseMs?, reconnectMaxMs?, heartbeatMs?, maxRetries?, messageToRow? }

// SSE
{ type: 'sse', url, withCredentials?, authToken?, reconnectBaseMs?, messageToRow? }

// HTTP polling
{ type: 'http-polling', url, strategy: 'fixed' | 'adaptive' | 'long-poll', intervalMs?, minIntervalMs?, maxIntervalMs?, authToken?, extractRows? }

// WebTransport (HTTP/3)
{ type: 'webtransport', url, fallbackUrl?, serverCertificateHashes? }

// Simulated
{ type: 'simulated', scenario, entityCount?, tickIntervalMs?, anomalyRate?, seed? }
```

## Advanced primitives

```ts
import {
  joinStreams, mergeStreams,         // multi-stream join (SQL-style)
  StreamRecorder, ReplayPlayer,      // time-travel replay
  inferSchema, SchemaInferrer,       // schema auto-inference
  detectBestTransport,               // WebTransport → WS fallback helper
} from '@gridstorm/dataflow-core';
```

## Framework adapters

- React: [`@gridstorm/dataflow-react`](https://www.npmjs.com/package/@gridstorm/dataflow-react)
- Vue 3: [`@gridstorm/dataflow-vue`](https://www.npmjs.com/package/@gridstorm/dataflow-vue)
- Svelte 5: [`@gridstorm/dataflow-svelte`](https://www.npmjs.com/package/@gridstorm/dataflow-svelte)

## Links

- [Live Demo](https://dataflow.tekivex.com)
- [GitHub](https://github.com/007krcs/dataflow)

## License

MIT © [Tekivex](https://tekivex.com)
