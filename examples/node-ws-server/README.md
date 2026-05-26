# Node WebSocket reference server

A drop-in Node server that emits **real-time row frames** in the exact wire format the [DataFlow](https://dataflow.tekivex.com) WebSocket adapter expects.

Use this when:

- You want to try `@gridstorm/dataflow-react` (or `-vue` / `-svelte`) against a real `ws://` socket, not just the in-browser `simulated` adapter.
- You're evaluating DataFlow and don't have a backend yet.
- You want a baseline to write your own server against.

**~250 lines of standalone JS, one dependency (`ws`), three built-in scenarios.**

## Run it

```bash
cd examples/node-ws-server
npm install
npm start                          # financial scenario @ ws://localhost:8080
```

Other scenarios:

```bash
npm run start:iot                  # 20 IoT sensors with anomaly spikes
npm run start:ecommerce            # category × region order stream
```

Override anything with env vars:

```bash
PORT=9000 TICK_MS=100 ENTITY_COUNT=80 ANOMALY_RATE=0.08 npm start
```

| Env | Default | Notes |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `SCENARIO` | `financial` | Default if client doesn't pass `?scenario=` |
| `ENTITY_COUNT` | `20` | Number of symbols / sensors / segments per tick |
| `TICK_MS` | `400` | Milliseconds between emissions |
| `ANOMALY_RATE` | `0.02` | Per-tick chance of injecting an outlier (z-score / IQR will catch them) |
| `BATCH` | `all` | `all` = one JSON array per tick · `each` = one JSON row per message |
| `SEED` | random | Set to any integer for reproducible streams |

## Point a DataFlow client at it

### React

```tsx
import { useStream } from '@gridstorm/dataflow-react';

export function LiveTicker() {
  const { rows, status, metrics, anomalies } = useStream({
    adapter: {
      type: 'websocket',
      url:  'ws://localhost:8080?scenario=financial',
      reconnectBaseMs: 500,
      heartbeatMs:     15000,
    },
    backpressure: { maxBufferSize: 5000, targetFps: 30 },
    anomaly:      { enabled: true, methods: ['zscore', 'iqr'] },
  });

  return (
    <>
      <p>{status} · {metrics.rowsPerSecond} rows/sec · {anomalies.length} anomalies</p>
      {rows.slice(-20).map((r) => (
        <div key={r.id}>{String(r.symbol)} ${Number(r.price).toFixed(2)}</div>
      ))}
    </>
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { useStream } from '@gridstorm/dataflow-vue';

const { rows, status, metrics } = useStream({
  adapter: { type: 'websocket', url: 'ws://localhost:8080?scenario=iot' },
  anomaly: { enabled: true, methods: ['zscore', 'iqr', 'mad'] },
});
</script>
```

### Svelte

```svelte
<script lang="ts">
  import { createStream } from '@gridstorm/dataflow-svelte';

  const stream = createStream(
    { adapter: { type: 'websocket', url: 'ws://localhost:8080?scenario=ecommerce' } },
    { autoStart: true },
  );
</script>

{#each $stream.rows as row (row.id)} <div>{row.category}: ${row.revenue}</div> {/each}
```

## Wire protocol

Bidirectional plain JSON over a single `ws://` socket. Matches `packages/core/src/adapters/websocket.ts`.

**Server → client** (every `TICK_MS`):

```jsonc
// BATCH=all (default) — one frame per tick
[
  { "id": "AAPL", "timestamp": 1748275200000, "symbol": "AAPL", "price": 189.42, "volume": 1234567, ... },
  { "id": "GOOGL", ... }
]
```

```jsonc
// BATCH=each — one message per row
{ "id": "AAPL", "timestamp": 1748275200000, "symbol": "AAPL", "price": 189.42, ... }
```

Plus a one-time welcome frame on connect:

```jsonc
{ "type": "hello", "scenario": "financial", "entityCount": 20, "tickMs": 400, "batch": "all" }
```

**Client → server** (heartbeat, every `heartbeatMs` from the adapter):

```jsonc
{ "type": "ping", "seq": 1 }
```

**Server → client** (heartbeat reply, used for latency measurement):

```jsonc
{ "type": "pong", "seq": 1 }
```

## Scenarios — quick reference

| Scenario | Entities | Per-row fields | Best demo of |
|---|---|---|---|
| `financial` | 20 NYSE/NASDAQ symbols | `symbol, price, open, high, low, bid, ask, volume, marketCap` | GBM price walks + spike anomalies; OHLC charts |
| `iot` | 20 sensors across 5 locations | `location, temperature, humidity, pressure, co2, status` | Multi-column anomalies; status thresholds |
| `ecommerce` | 20 category × region segments | `category, region, orders, revenue, newOrders, avgOrderValue, conversionRate` | Cumulative metrics; running KPIs |

Each scenario shares state across all clients connected with the same `?scenario=` value, so multiple browser tabs see the same prices — like a real exchange feed.

## Extending

Add your own scenario in `server.mjs`:

```js
function initMyScenario(count, rng) { /* return entity states */ }
function tickMyScenario(states, rng, ts, anomalyRate) { /* return StreamRow[] */ }

SCENARIOS.myscenario = { init: initMyScenario, tick: tickMyScenario };
```

Then connect with `ws://localhost:8080?scenario=myscenario`.

## License

MIT — same as the rest of DataFlow.
