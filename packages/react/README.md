# @gridstorm/dataflow-react

React hooks and components for [DataFlow](https://dataflow.tekivex.com) — real-time streaming data in React 18+ (React 19 ready) with zero boilerplate.

**~12 KB gzipped** · React 18 / 19 · TypeScript · MIT

## Install

```bash
npm install @gridstorm/dataflow-core @gridstorm/dataflow-react
```

## Quick Start

```tsx
import { useStream } from '@gridstorm/dataflow-react';

export function LiveTicker() {
  const { rows, status, metrics, anomalies } = useStream({
    adapter: {
      type: 'websocket',
      url:  'wss://data.example.com/feed',
      reconnectBaseMs: 500,
    },
    backpressure: { maxBufferSize: 5000, targetFps: 30 },
    anomaly:      { enabled: true, methods: ['zscore', 'iqr'] },
  });

  return (
    <div>
      <p>Status: {status} · {metrics.rowsPerSecond} rows/sec · {anomalies.length} anomalies</p>
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{String(row.symbol)}</td>
              <td>${Number(row.price).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## Try without a backend

Use the `simulated` adapter — no server required:

```tsx
const { rows, anomalies } = useStream({
  adapter: { type: 'simulated', scenario: 'financial', entityCount: 20, tickIntervalMs: 400, seed: 42 },
  anomaly: { enabled: true, methods: ['zscore', 'iqr'] },
});
```

## Hooks

| Hook | Description |
|---|---|
| `useStream(config, options?)` | Live `rows`, `changes`, `status`, `metrics`, `anomalies`, plus `start / stop / pause / resume` |
| `useStreamMetrics(config)` | Subscribe to metrics only — no row re-renders |
| `useAnomaly(config, maxEvents?)` | Subscribe only to anomaly events, grouped by column |

`useStream` options:

```ts
useStream(config, {
  maxRows:   500,    // rolling window
  autoStart: true,
  key:       feedId, // change to tear down + reconnect with new config
});
```

## Components

| Component | Description |
|---|---|
| `ConnectionBadge` | Status pill (connected / reconnecting / paused / error) with latency |
| `MetricBar` | Throughput, drop rate, buffer utilization, uptime |
| `AnomalyPanel` | Scrollable list of recent anomaly events with severity badges |

## Links

- [Live Demo](https://dataflow.tekivex.com)
- [GitHub](https://github.com/007krcs/dataflow)
- [Core engine](https://www.npmjs.com/package/@gridstorm/dataflow-core)

## License

MIT © [Tekivex](https://tekivex.com)
