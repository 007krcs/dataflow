# @gridstorm/dataflow-svelte

Svelte 5 stores and runes for [DataFlow](https://dataflow.tekivex.com) — real-time streaming data with fine-grained reactivity.

## Install

```bash
npm install @gridstorm/dataflow-core @gridstorm/dataflow-svelte
```

## Quick Start

```svelte
<script>
  import { createStreamStore } from '@gridstorm/dataflow-svelte';
  import { WebSocketAdapter } from '@gridstorm/dataflow-core';

  const stream = createStreamStore({
    adapter: new WebSocketAdapter('wss://data.example.com/feed'),
    fps: 60,
  });

  stream.connect();
</script>

{#each $stream.rows as row (row.id)}
  <div>{row.symbol}: {row.price}</div>
{/each}
```

## Stores

| Store | Description |
|---|---|
| `createStreamStore` | Svelte store wrapping a live data stream |
| `createMetricsStore` | Throughput and latency metrics store |
| `createAnomalyStore` | Anomaly alert store |

## Links

- [Live Demo](https://dataflow.tekivex.com)
- [GitHub](https://github.com/007krcs/dataflow)

## License

MIT © [Tekivex](https://tekivex.com)
