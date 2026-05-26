# @gridstorm/dataflow-vue

Vue 3 composables for [DataFlow](https://dataflow.tekivex.com) — real-time streaming data with the Composition API.

**Vue 3.3+** · TypeScript · MIT

## Install

```bash
npm install @gridstorm/dataflow-core @gridstorm/dataflow-vue
```

## Quick Start

```vue
<script setup lang="ts">
import { useStream } from '@gridstorm/dataflow-vue';

const { rows, status, metrics, anomalies } = useStream({
  adapter: {
    type: 'websocket',
    url:  'wss://data.example.com/feed',
    reconnectBaseMs: 500,
  },
  backpressure: { maxBufferSize: 5000, targetFps: 30 },
  anomaly:      { enabled: true, methods: ['zscore', 'iqr'] },
});
</script>

<template>
  <p>Status: {{ status }} · {{ metrics.rowsPerSecond }} rows/sec</p>
  <div v-for="row in rows" :key="row.id">
    {{ row.symbol }}: ${{ Number(row.price).toFixed(2) }}
  </div>
</template>
```

## Try without a backend

```ts
const { rows } = useStream({
  adapter: { type: 'simulated', scenario: 'financial', entityCount: 20, seed: 42 },
});
```

## Composables

| Composable | Description |
|---|---|
| `useStream(config, options?)` | Reactive `rows`, `changes`, `status`, `metrics`, `anomalies` (refs) + `start / stop / pause / resume` |
| `useStreamMetrics(config)` | Metrics-only ref — no row re-renders |
| `useAnomaly(config)` | Anomaly events grouped by column |

All composables auto-start on `onMounted` and tear down on `onUnmounted`. Use the `key` option to recreate the engine when config changes:

```ts
useStream(config, { maxRows: 500, autoStart: true, key: selectedFeed });
```

## Links

- [Live Demo](https://dataflow.tekivex.com)
- [GitHub](https://github.com/007krcs/dataflow)
- [Core engine](https://www.npmjs.com/package/@gridstorm/dataflow-core)

## License

MIT © [Tekivex](https://tekivex.com)
