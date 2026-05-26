# @gridstorm/dataflow-svelte

Svelte 5 stores for [DataFlow](https://dataflow.tekivex.com) — real-time streaming data with fine-grained reactivity. Works with both Svelte 5 runes and the Svelte 4 store contract.

**Svelte 5+** · TypeScript · MIT

## Install

```bash
npm install @gridstorm/dataflow-core @gridstorm/dataflow-svelte
```

## Quick Start

```svelte
<script lang="ts">
  import { createStream } from '@gridstorm/dataflow-svelte';

  const stream = createStream({
    adapter: {
      type: 'websocket',
      url:  'wss://data.example.com/feed',
      reconnectBaseMs: 500,
    },
    backpressure: { maxBufferSize: 5000, targetFps: 30 },
    anomaly:      { enabled: true, methods: ['zscore', 'iqr'] },
  }, { autoStart: true });
</script>

<p>Status: {$stream.status} · {$stream.metrics.rowsPerSecond} rows/sec</p>

{#each $stream.rows as row (row.id)}
  <div>{row.symbol}: ${Number(row.price).toFixed(2)}</div>
{/each}
```

## Try without a backend

```ts
const stream = createStream(
  { adapter: { type: 'simulated', scenario: 'financial', entityCount: 20, seed: 42 } },
  { autoStart: true },
);
```

## Stores

`createStream(config, options?)` returns a `StreamStore`:

| Property | Type | Description |
|---|---|---|
| `rows` | `Readable<StreamRow[]>` | Rolling window of live rows |
| `changes` | `Readable<CellChange[]>` | Per-cell direction + % change since last tick |
| `status` | `Readable<StreamStatus>` | `disconnected / connecting / connected / paused / reconnecting / error` |
| `metrics` | `Readable<StreamMetrics>` | Throughput, drops, buffer utilization, latency, uptime |
| `anomalies` | `Readable<AnomalyEvent[]>` | Detected outliers with z-score / IQR / MAD / threshold |
| `anomalyCount` | `Readable<number>` | Unread anomaly counter |

Plus methods: `start() / stop() / pause() / resume() / clearAnomalies() / destroy()`.

`createAnomalyStore(config)` is also available if you only need anomaly events.

## Links

- [Live Demo](https://dataflow.tekivex.com)
- [GitHub](https://github.com/007krcs/dataflow)
- [Core engine](https://www.npmjs.com/package/@gridstorm/dataflow-core)

## License

MIT © [Tekivex](https://tekivex.com)
