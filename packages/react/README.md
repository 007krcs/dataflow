# @gridstorm/dataflow-react

React hooks and components for [DataFlow](https://dataflow.tekivex.com) — real-time streaming data in React 18+ with zero boilerplate.

## Install

```bash
npm install @gridstorm/dataflow-core @gridstorm/dataflow-react
```

## Quick Start

```tsx
import { useStream } from '@gridstorm/dataflow-react';
import { WebSocketAdapter } from '@gridstorm/dataflow-core';

function LiveTable() {
  const { rows, status, metrics } = useStream({
    adapter: new WebSocketAdapter('wss://data.example.com/feed'),
    batchSize: 50,
    fps: 60,
  });

  return (
    <table>
      {rows.map((row) => (
        <tr key={row.id}>
          <td>{row.symbol}</td>
          <td style={{ color: row.__dir?.price === 'up' ? 'green' : 'red' }}>
            {row.price}
          </td>
        </tr>
      ))}
    </table>
  );
}
```

## Hooks

| Hook | Description |
|---|---|
| `useStream` | Subscribe to a live data stream |
| `useStreamMetrics` | Throughput, latency, and drop rate metrics |
| `useAnomaly` | Anomaly detection alerts for a stream |

## Links

- [Live Demo](https://dataflow.tekivex.com)
- [GitHub](https://github.com/007krcs/dataflow)

## License

MIT © [Tekivex](https://tekivex.com)
