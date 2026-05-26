# DataFlow React API

`@gridstorm/dataflow-react` provides hooks and components that connect DataFlow streams to React 18+ applications.

---

## Table of Contents

1. [Hooks](#hooks)
   - [useStream](#usestream)
   - [useStreamMetrics](#usestreammetrics)
   - [useAnomaly](#useanomaly)
2. [Components](#components)
   - [ConnectionBadge](#connectionbadge)
   - [MetricBar](#metricbar)
   - [AnomalyPanel](#anomalypanel)
3. [TypeScript Types](#typescript-types)
4. [Patterns & Recipes](#patterns--recipes)

---

## Hooks

### `useStream`

The primary hook. Connects to a stream and returns live rows, cell changes, metrics, anomalies, and control functions.

```ts
function useStream(
  config: StreamConfig,
  options?: UseStreamOptions
): UseStreamResult
```

#### Options

```ts
interface UseStreamOptions {
  maxRows?:   number;   // Max rows to keep in state. Default: 500
  autoStart?: boolean;  // Start automatically on mount. Default: true
}
```

#### Return Value

```ts
interface UseStreamResult {
  rows:      StreamRow[];     // Live rows, rolling window (maxRows)
  changes:   CellChange[];    // Cell changes from the last tick
  status:    StreamStatus;    // 'disconnected' | 'connecting' | 'connected' | ...
  metrics:   StreamMetrics;   // Throughput, dropped rows, buffer utilization
  anomalies: AnomalyEvent[];  // Detected anomalies, rolling (max 200)
  start:     () => void;      // Manually start the stream
  stop:      () => void;      // Manually stop the stream
}
```

#### Basic usage

```tsx
import { useStream } from '@gridstorm/dataflow-react';

function LiveTable() {
  const { rows, status, metrics } = useStream({
    adapter: {
      type:    'websocket',
      url:     'wss://feed.example.com/stocks',
      authToken: process.env.REACT_APP_API_KEY,
    },
    anomaly: { enabled: true },
  });

  if (status === 'connecting') return <p>Connecting…</p>;
  if (status === 'error')      return <p>Connection failed</p>;

  return (
    <div>
      <p>{metrics.rowsPerSecond} rows/sec</p>
      {rows.map((row) => (
        <div key={row.id}>{String(row.symbol)}: ${Number(row.price).toFixed(2)}</div>
      ))}
    </div>
  );
}
```

#### Manual start/stop

```tsx
function ControlledStream() {
  const { rows, status, start, stop } = useStream(
    { adapter: { type: 'simulated', scenario: 'financial' } },
    { autoStart: false }   // don't start on mount
  );

  return (
    <div>
      <button onClick={start} disabled={status === 'connected'}>Start</button>
      <button onClick={stop}  disabled={status !== 'connected'}>Stop</button>
      <p>Status: {status}</p>
    </div>
  );
}
```

#### Responding to cell changes (flash animations)

```tsx
function FlashTable() {
  const { rows, changes } = useStream({ adapter: { type: 'simulated', scenario: 'financial' } });
  const [flashMap, setFlashMap] = useState(new Map<string, 'up' | 'down'>());

  useEffect(() => {
    if (!changes.length) return;
    const next = new Map(flashMap);
    for (const c of changes) {
      if (c.direction !== 'flat') {
        const key = `${c.rowId}::${c.columnId}`;
        next.set(key, c.direction as 'up' | 'down');
        setTimeout(() => setFlashMap((m) => { const n = new Map(m); n.delete(key); return n; }), 600);
      }
    }
    setFlashMap(next);
  }, [changes]);

  return (
    <table>
      {rows.map((row) => (
        <tr key={row.id}>
          <td>{String(row.symbol)}</td>
          <td style={{
            background: flashMap.get(`${row.id}::price`) === 'up'   ? '#d1fae5' :
                        flashMap.get(`${row.id}::price`) === 'down'  ? '#fee2e2' : 'transparent'
          }}>
            ${Number(row.price).toFixed(2)}
          </td>
        </tr>
      ))}
    </table>
  );
}
```

#### Keeping only the latest row per key (upsert semantics)

```tsx
// Replace rows by ID instead of appending
const latestById = useMemo(() => {
  const map = new Map<string, StreamRow>();
  for (const row of rows) map.set(row.id, row);
  return Array.from(map.values());
}, [rows]);
```

---

### `useStreamMetrics`

Lightweight hook that only subscribes to metrics. Use this when you have a separate metrics panel that shouldn't re-render the data table.

```ts
function useStreamMetrics(config: StreamConfig): UseStreamMetricsResult
```

```ts
interface UseStreamMetricsResult {
  metrics: StreamMetrics;
  status:  StreamStatus;
  engine:  StreamingEngine | null;  // direct engine access if needed
}
```

#### Usage

```tsx
import { useStreamMetrics } from '@gridstorm/dataflow-react';

function MetricsPanel({ config }: { config: StreamConfig }) {
  const { metrics, status } = useStreamMetrics(config);

  return (
    <div className="metrics">
      <span>Status: {status}</span>
      <span>{metrics.rowsPerSecond} rows/sec</span>
      <span>{metrics.droppedRows} dropped</span>
      <span>{(metrics.bufferUtilization * 100).toFixed(0)}% buffer</span>
    </div>
  );
}
```

> **Note:** `useStreamMetrics` starts its own engine instance. If you also use `useStream` with the same config, you'll have two connections. Either share one config and pass the engine reference down, or use only one hook per stream.

---

### `useAnomaly`

Subscribe only to anomaly events. Use when you have a dedicated anomaly panel component that shouldn't affect the data grid's render cycle.

```ts
function useAnomaly(config: StreamConfig, maxEvents?: number): UseAnomalyResult
```

```ts
interface UseAnomalyResult {
  anomalies: AnomalyEvent[];               // flat list of all events
  byColumn:  Map<string, AnomalyEvent[]>;  // grouped by column name
  clearAll:  () => void;                   // clear the event list
}
```

#### Usage

```tsx
import { useAnomaly } from '@gridstorm/dataflow-react';

function AnomalySidebar({ config }: { config: StreamConfig }) {
  const { anomalies, byColumn, clearAll } = useAnomaly(config, 100);

  return (
    <aside>
      <button onClick={clearAll}>Clear ({anomalies.length})</button>
      {Array.from(byColumn.entries()).map(([col, events]) => (
        <div key={col}>
          <h4>{col}</h4>
          {events.slice(-5).map((ev) => (
            <p key={ev.id} style={{ color: ev.severity === 'critical' ? 'red' : 'orange' }}>
              {ev.message}
            </p>
          ))}
        </div>
      ))}
    </aside>
  );
}
```

---

## Components

### `ConnectionBadge`

A status indicator pill that shows the current connection state with a pulsing dot.

```tsx
import { ConnectionBadge } from '@gridstorm/dataflow-react';

<ConnectionBadge
  status={status}           // required: StreamStatus
  latencyMs={metrics.latencyMs}  // optional: shows Xms when connected
  className="my-badge"     // optional: extra CSS class
/>
```

**Renders:**
- 🟢 **Live** — connected (green, pulsing dot)
- 🟡 **Connecting…** — connecting (amber)
- 🟡 **Reconnecting…** — reconnecting after drop (amber)
- 🔴 **Error** — max retries exceeded (red)
- 🟣 **Paused** — manually paused (purple)
- ⚫ **Disconnected** — not started (grey)

---

### `MetricBar`

A horizontal bar of 5 metric tiles showing real-time stream health.

```tsx
import { MetricBar } from '@gridstorm/dataflow-react';

<MetricBar
  metrics={metrics}        // required: StreamMetrics
  className="my-metrics"  // optional
/>
```

**Tiles:**
| Tile | Description | Color when hot |
|------|-------------|----------------|
| Total Rows | Cumulative rows received | — |
| Rows/sec | Current throughput | Green |
| Dropped | Rows dropped by backpressure | Amber if > 0 |
| Anomalies | Total anomaly events | Red if > 0 |
| Buffer | Ring buffer utilization % | Red > 80%, Amber > 50% |

Numbers are auto-formatted: `1234567` → `1.2M`, `50000` → `50K`.

---

### `AnomalyPanel`

A scrollable feed of anomaly events with severity, method, and message.

```tsx
import { AnomalyPanel } from '@gridstorm/dataflow-react';

<AnomalyPanel
  anomalies={anomalies}   // required: AnomalyEvent[]
  maxVisible={50}         // optional: how many to show (default: 50)
  onClear={() => {}}      // optional: callback for Clear button
  className="my-panel"   // optional
/>
```

Each row shows:
- Colored severity dot (blue=info, amber=warning, red=critical)
- The human-readable `message` (e.g. `"price = 210.45 is 3.2σ from mean 182.33"`)
- Method badge (ZSCORE / IQR / MAD)
- Severity label
- Time ago ("3s ago", "2m ago")
- Row ID

---

## TypeScript Types

All types are exported from both packages:

```ts
import type {
  // Stream
  StreamRow,
  StreamStatus,
  StreamMetrics,
  StreamConfig,
  StreamFrame,

  // Changes
  CellChange,
  CellChangeDirection,
  CellValue,

  // Anomalies
  AnomalyEvent,
  AnomalyMethod,
  AnomalySeverity,
  AnomalyStats,

  // Adapters
  SimulatedAdapterConfig,
  WebSocketAdapterConfig,
  SSEAdapterConfig,
  HTTPPollingAdapterConfig,
  WebTransportAdapterConfig,

  // Config
  BackpressureConfig,
  AnomalyConfig,
} from '@gridstorm/dataflow-core';
```

---

## Patterns & Recipes

### Pattern 1 — Shared config across hooks

```tsx
// Define config once, use in multiple hooks without double-connecting
const STREAM_CONFIG: StreamConfig = {
  adapter: { type: 'simulated', scenario: 'financial' },
  anomaly: { enabled: true },
};

function Dashboard() {
  const { rows, changes, status } = useStream(STREAM_CONFIG);
  // MetricBar and AnomalyPanel read from the same rows/anomalies state
  // No second connection is made
  return <>...</>;
}
```

### Pattern 2 — Stop stream when tab is not visible

```tsx
function BackgroundAwareStream() {
  const { rows, status, start, stop } = useStream(config);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [start, stop]);

  return <div>...</div>;
}
```

### Pattern 3 — Only show anomalies above a severity threshold

```tsx
const { anomalies } = useStream(config);

const criticalOnly = anomalies.filter((ev) => ev.severity === 'critical');
const warnAndAbove = anomalies.filter((ev) => ev.severity !== 'info');
```

### Pattern 4 — Sparkline data per row

```tsx
// Keep last 20 price values per symbol for a sparkline
const [history, setHistory] = useState(new Map<string, number[]>());

const { rows } = useStream(config);

useEffect(() => {
  setHistory((prev) => {
    const next = new Map(prev);
    for (const row of rows) {
      const key = String(row.symbol);
      const prices = next.get(key) ?? [];
      prices.push(Number(row.price));
      next.set(key, prices.slice(-20));  // keep last 20
    }
    return next;
  });
}, [rows]);
```

### Pattern 5 — Connect to a real WebSocket and map its format

```tsx
// Your server sends: { "s": "AAPL", "p": 182.45, "t": 1711234567890 }
// You need:          { "id": "AAPL", "symbol": "AAPL", "price": 182.45, "timestamp": 1711234567890 }

// Use a proxy / middleware on your server, OR:
// For now, pre-process in a WebSocket message handler before feeding to engine.
// A messageToRow adapter option is on the v0.4.0 roadmap.
```

### Pattern 6 — Using StreamingEngine directly (no React)

```ts
import { StreamingEngine } from '@gridstorm/dataflow-core';

const engine = new StreamingEngine(
  {
    adapter:  { type: 'simulated', scenario: 'iot' },
    anomaly:  { enabled: true },
  },
  {
    onRows(rows, changes) {
      updateTable(rows);
      highlightCells(changes);
    },
    onAnomaly(events) {
      events.forEach((ev) => showAlert(ev.message, ev.severity));
    },
    onStatus(status) {
      updateStatusIndicator(status);
    },
    onMetrics(metrics) {
      updateFooter(metrics);
    },
  }
);

engine.start();

// Later:
engine.stop();    // pause (state preserved)
engine.destroy(); // full cleanup
```
