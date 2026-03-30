# Getting Started with DataFlow

DataFlow is a real-time streaming data engine for the browser. It connects any live data source — WebSocket, SSE, REST polling, or HTTP/3 — to your React (or any framework) UI, with backpressure control and statistical anomaly detection built in.

---

## Table of Contents

1. [Installation](#installation)
2. [Your First Stream (5 minutes)](#your-first-stream)
3. [Core Concepts](#core-concepts)
4. [Choosing an Adapter](#choosing-an-adapter)
5. [Adding Anomaly Detection](#adding-anomaly-detection)
6. [Production Checklist](#production-checklist)

---

## Installation

```bash
# npm
npm install @dataflow/core @dataflow/react

# pnpm
pnpm add @dataflow/core @dataflow/react

# yarn
yarn add @dataflow/core @dataflow/react
```

**Peer dependencies** (for `@dataflow/react`):
```bash
npm install react react-dom   # React 18+
```

`@dataflow/core` has **zero runtime dependencies**.

---

## Your First Stream

### Step 1 — Connect to a WebSocket feed

```tsx
// StockTicker.tsx
import { useStream } from '@dataflow/react';

export function StockTicker() {
  const { rows, status, metrics } = useStream({
    adapter: {
      type: 'websocket',
      url:  'wss://your-feed.example.com/stocks',
    },
  });

  return (
    <div>
      <p>Status: {status} | {metrics.rowsPerSecond} rows/sec</p>
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

### Step 2 — Try it with simulated data (no server needed)

```tsx
import { useStream } from '@dataflow/react';

export function Demo() {
  const { rows, status } = useStream({
    adapter: {
      type:           'simulated',
      scenario:       'financial',   // financial | crypto | iot | ecommerce
      entityCount:    20,
      tickIntervalMs: 500,
    },
  });

  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>
          {String(row.symbol)}: ${Number(row.price).toFixed(2)}
        </li>
      ))}
    </ul>
  );
}
```

### Step 3 — Add the Metric Bar and Connection Badge

```tsx
import { useStream, MetricBar, ConnectionBadge } from '@dataflow/react';

export function Dashboard() {
  const { rows, status, metrics } = useStream({
    adapter: { type: 'simulated', scenario: 'financial' },
  });

  return (
    <div>
      <ConnectionBadge status={status} latencyMs={metrics.latencyMs} />
      <MetricBar metrics={metrics} />
      {/* your table here */}
    </div>
  );
}
```

### Step 4 — Enable Anomaly Detection

```tsx
const { rows, anomalies } = useStream({
  adapter: { type: 'simulated', scenario: 'iot', anomalyRate: 0.05 },
  anomaly: {
    enabled:  true,
    methods:  ['zscore', 'iqr'],
    windowSize: 100,
  },
});

// anomalies is AnomalyEvent[] — grows as outliers are detected
anomalies.forEach((ev) => {
  console.log(`[${ev.severity}] ${ev.message}`);
});
```

---

## Core Concepts

### The Pipeline

Every stream goes through this pipeline:

```
Data Source
    │
    ▼
Adapter          — connects to WS / SSE / HTTP / simulated data
    │
    ▼
BackpressureController  — ring buffer + rAF scheduler
    │                     prevents UI flood when data > render speed
    ▼
DeltaCalculator  — compares each row to previous snapshot
    │              produces CellChange[] (up/down/flat + % change)
    ▼
AnomalyDetector  — Z-score, IQR, MAD per numeric column
    │              rolling window, configurable thresholds
    ▼
Your Callbacks   — onRows(rows, changes), onAnomaly(events)
```

### StreamRow

Every row from any adapter is normalized to this shape:

```ts
interface StreamRow {
  id:        string;          // unique row identifier
  timestamp: number;          // Unix ms
  [column: string]: string | number | boolean | null;
}
```

You control the extra columns. A financial row might look like:
```json
{
  "id": "AAPL",
  "timestamp": 1711234567890,
  "symbol": "AAPL",
  "price": 182.45,
  "volume": 1234567
}
```

### StreamStatus

The connection lifecycle:

```
disconnected → connecting → connected
                               │
                           reconnecting ← (on disconnect)
                               │
                            error      ← (max retries exceeded)
                            closed     ← (manual disconnect)
                            paused     ← (manual pause)
```

### StreamConfig

The single object you pass to `useStream()` or `new StreamingEngine()`:

```ts
interface StreamConfig {
  id?:          string;          // optional label
  adapter:      AdapterConfig;   // required — which source to connect
  backpressure?: BackpressureConfig;
  anomaly?:     AnomalyConfig;
  schema?:      StreamSchema;    // optional column metadata
}
```

---

## Choosing an Adapter

| Scenario | Adapter | Why |
|----------|---------|-----|
| Real-time trading, gaming, IoT | `websocket` | Full-duplex, lowest latency |
| Server push (notifications, logs) | `sse` | Simpler than WS, HTTP/2 multiplexed |
| REST APIs, paginated data | `http-polling` | Works with any existing REST API |
| Development / demos / testing | `simulated` | No server needed, reproducible data |
| Ultra-low latency (Chrome only) | `webtransport` | HTTP/3 QUIC, future-proof |

See [ADAPTERS.md](./ADAPTERS.md) for full configuration reference.

---

## Adding Anomaly Detection

DataFlow includes three statistical algorithms that run in the browser with no ML library:

| Algorithm | Good for | Config key |
|-----------|----------|------------|
| Z-score | Normal distributions (prices, temps) | `methods: ['zscore']` |
| IQR (Tukey fences) | Skewed data, financial returns | `methods: ['iqr']` |
| MAD (Median Abs Deviation) | Heavy-tailed data, robust to outliers | `methods: ['mad']` |

```ts
anomaly: {
  enabled:           true,
  methods:           ['zscore', 'iqr'],   // use both for best coverage
  zScoreThreshold:   2.5,    // flag if |z| > 2.5
  iqrMultiplier:     1.5,    // Tukey fence multiplier
  windowSize:        100,    // rolling window (last 100 values per column)
  minSamples:        20,     // wait for 20 samples before flagging
  severityThresholds: { warning: 2.5, critical: 4.0 },
}
```

See [ANOMALY_DETECTION.md](./ANOMALY_DETECTION.md) for the math behind each method.

---

## Production Checklist

Before going to production, verify these:

- [ ] **Reconnection configured** — set `reconnectBaseMs`, `reconnectMaxMs`, `maxRetries` on your adapter
- [ ] **Auth token set** — `authToken: 'Bearer <jwt>'` for WebSocket/SSE/HTTP
- [ ] **Buffer sized appropriately** — `backpressure.maxBufferSize` should be ~10–20× your expected burst size
- [ ] **Window size tuned** — `anomaly.windowSize` should cover at least 1 minute of data
- [ ] **minSamples set** — prevents false positives on startup (recommend ≥ 30)
- [ ] **maxRows capped** in `useStream({ maxRows: N })` to prevent unbounded React state
- [ ] **Destroy on unmount** — `useStream` handles this automatically; if using `StreamingEngine` directly, call `engine.destroy()` in cleanup

---

## Next Steps

- [ADAPTERS.md](./ADAPTERS.md) — Full adapter configuration reference
- [REACT_API.md](./REACT_API.md) — All hooks and components
- [ANOMALY_DETECTION.md](./ANOMALY_DETECTION.md) — Statistical methods explained
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System design and pipeline details
- [CONFIGURATION.md](./CONFIGURATION.md) — Complete configuration reference
- [BACKPRESSURE.md](./BACKPRESSURE.md) — How backpressure control works
