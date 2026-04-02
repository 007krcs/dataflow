# @gridstorm/dataflow-core

Zero-dependency streaming engine for real-time data feeds — the core of the [DataFlow](https://dataflow.tekivex.com) platform.

## Install

```bash
npm install @gridstorm/dataflow-core
```

## Quick Start

```ts
import { createStream, WebSocketAdapter } from '@gridstorm/dataflow-core';

const stream = createStream({
  adapter: new WebSocketAdapter('wss://data.example.com/feed'),
  batchSize: 50,
  fps: 60,
});

stream.subscribe((rows) => {
  console.log('Live data:', rows);
});

stream.connect();
```

## Features

- **WebSocket / SSE / HTTP polling / simulated adapters** — plug in any data source
- **Batched rAF backpressure** — configurable fps with oldest/newest/sample drop strategies
- **Cell change direction tracking** — ↑↓ direction flags with configurable flash duration
- **Anomaly detection** — Z-score, IQR, MAD, and static threshold methods
- **Schema auto-inference** — infers column types from live row samples
- **Time-travel replay** — record, seek, and variable-speed playback
- **Multi-stream join** — inner / left / outer joins and N-stream merge

## Adapters

```ts
import {
  WebSocketAdapter,
  SSEAdapter,
  HttpPollingAdapter,
  SimulatedAdapter,
} from '@gridstorm/dataflow-core';
```

## Framework Adapters

- React: `@gridstorm/dataflow-react`
- Vue 3: `@gridstorm/dataflow-vue`
- Svelte 5: `@gridstorm/dataflow-svelte`

## Links

- [Live Demo](https://dataflow.tekivex.com)
- [GitHub](https://github.com/007krcs/dataflow)

## License

MIT © [Tekivex](https://tekivex.com)
