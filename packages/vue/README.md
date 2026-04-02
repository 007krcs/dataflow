# @gridstorm/dataflow-vue

Vue 3 composables for [DataFlow](https://dataflow.tekivex.com) — real-time streaming data with Composition API.

## Install

```bash
npm install @gridstorm/dataflow-core @gridstorm/dataflow-vue
```

## Quick Start

```vue
<script setup>
import { useStream } from '@gridstorm/dataflow-vue';
import { WebSocketAdapter } from '@gridstorm/dataflow-core';

const { rows, status } = useStream({
  adapter: new WebSocketAdapter('wss://data.example.com/feed'),
  fps: 60,
});
</script>

<template>
  <div v-for="row in rows" :key="row.id">
    {{ row.symbol }}: {{ row.price }}
  </div>
</template>
```

## Composables

| Composable | Description |
|---|---|
| `useStream` | Reactive stream subscription |
| `useStreamMetrics` | Throughput and latency metrics |
| `useAnomaly` | Anomaly detection alerts |

## Links

- [Live Demo](https://dataflow.tekivex.com)
- [GitHub](https://github.com/007krcs/dataflow)

## License

MIT © [Tekivex](https://tekivex.com)
