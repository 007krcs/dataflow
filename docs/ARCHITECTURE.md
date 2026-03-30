# DataFlow Architecture

This document describes the internal design of DataFlow — how data flows from source to UI, why each component exists, and the key design decisions.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Package Structure](#package-structure)
3. [The Pipeline in Detail](#the-pipeline-in-detail)
4. [StreamingEngine](#streaminengine)
5. [Adapters](#adapters)
6. [BackpressureController](#backpressurecontroller)
7. [DeltaCalculator](#deltacalculator)
8. [AnomalyDetector](#anomalydetector)
9. [React Integration](#react-integration)
10. [Key Design Decisions](#key-design-decisions)
11. [Performance Characteristics](#performance-characteristics)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DataFlow Pipeline                                │
│                                                                             │
│  ┌──────────────┐      ┌───────────────────────────────────────────────┐   │
│  │   Adapter    │      │             StreamingEngine                    │   │
│  │              │      │                                               │   │
│  │  WebSocket   │─────►│  RawRows                                      │   │
│  │  SSE         │      │     │                                         │   │
│  │  HTTP Poll   │      │     ▼                                         │   │
│  │  WebTransport│      │  BackpressureController                       │   │
│  │  Simulated   │      │  ┌─────────────────────────────────────────┐  │   │
│  │              │      │  │  RingBuffer (circular, pre-allocated)   │  │   │
│  └──────────────┘      │  │  ← push row → evict oldest if full      │  │   │
│                        │  │                                         │  │   │
│                        │  │  requestAnimationFrame                  │  │   │
│                        │  │  ← drain N rows per frame →             │  │   │
│                        │  └─────────────────────────────────────────┘  │   │
│                        │     │                                         │   │
│                        │     ▼                                         │   │
│                        │  DeltaCalculator                              │   │
│                        │  ┌─────────────────────────────────────────┐  │   │
│                        │  │  prev: Map<rowId, Map<colId, value>>    │  │   │
│                        │  │  diff(row) → CellChange[]               │  │   │
│                        │  │  direction: up | down | flat            │  │   │
│                        │  │  changePercent: number | null           │  │   │
│                        │  └─────────────────────────────────────────┘  │   │
│                        │     │                                         │   │
│                        │     ▼                                         │   │
│                        │  AnomalyDetector                              │   │
│                        │  ┌─────────────────────────────────────────┐  │   │
│                        │  │  windows: Map<colId, ColumnWindow>      │  │   │
│                        │  │  Z-score | IQR | MAD per column         │  │   │
│                        │  │  rolling window, O(1) push              │  │   │
│                        │  └─────────────────────────────────────────┘  │   │
│                        │     │                                         │   │
│                        └─────┼─────────────────────────────────────────┘   │
│                              │                                             │
│              onRows(rows, changes) + onAnomaly(events)                     │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    React Layer       │
                    │  useStream hook      │
                    │  useState + useMemo  │
                    │  Component re-render │
                    └─────────────────────┘
```

---

## Package Structure

```
packages/
├── core/                       @dataflow/core
│   src/
│   ├── types.ts               All public TypeScript types
│   ├── engine.ts              StreamingEngine orchestrator
│   ├── index.ts               Public API re-exports
│   ├── adapters/
│   │   ├── websocket.ts       WS client + reconnect + heartbeat + latency
│   │   ├── sse.ts             EventSource + named events + cursor reconnect
│   │   ├── http-polling.ts    Adaptive polling + 304 dedup + cursor pagination
│   │   ├── simulated.ts       GBM financial, IoT, ecommerce data generators
│   │   └── web-transport.ts   HTTP/3 QUIC datagram + stream reader
│   └── pipeline/
│       ├── ring-buffer.ts     O(1) circular buffer
│       ├── backpressure.ts    rAF scheduler + drop strategy
│       ├── delta-calculator.ts Cell change tracking
│       └── anomaly-detector.ts Z-score + IQR + MAD + rolling window
│
├── react/                      @dataflow/react
│   src/
│   ├── hooks/
│   │   ├── useStream.ts       Primary hook (rows + changes + status + metrics)
│   │   ├── useStreamMetrics.ts Metrics-only hook
│   │   └── useAnomaly.ts      Anomaly-only hook
│   ├── components/
│   │   ├── ConnectionBadge.tsx Status indicator
│   │   ├── MetricBar.tsx      5-tile metric display
│   │   └── AnomalyPanel.tsx   Scrollable anomaly feed
│   └── index.ts
│
demo/                           Vite + React interactive demo
├── src/
│   ├── pages/                 Financial, Crypto, IoT, Ecommerce
│   ├── components/            Demo-local copies of components
│   └── hooks/                 Demo-local useStream (imports core directly)
│
e2e/                           Playwright E2E test suite
├── tests/                     273 tests × 3 browsers
└── playwright.config.ts
│
docs/                          This documentation
```

---

## The Pipeline in Detail

### Step 1 — Adapter receives raw data

The adapter's job is simple: connect to the source, normalize each message into `StreamRow[]`, and call `_handleRawRows(rows)` on the engine. Every adapter is isolated — the engine doesn't care whether data came from WebSocket, SSE, or a simulation.

### Step 2 — BackpressureController buffers and rate-limits

Raw rows are immediately pushed into a **RingBuffer** (circular buffer with a fixed capacity). This decouples the data arrival rate from the render rate.

On every `requestAnimationFrame` callback (≤16ms), the controller drains up to `maxBufferSize / targetFps` rows and delivers them to the next stage. This ensures:
- The UI never receives more rows per second than it can render
- If the buffer fills up, the oldest rows are evicted (configurable)
- Frame rate is capped at `targetFps` (default 30 FPS)

### Step 3 — DeltaCalculator produces cell changes

For each row, the delta calculator compares it against the previous snapshot for the same `row.id`. It produces a `CellChange` for every column that changed, including:
- `direction: 'up' | 'down' | 'flat'`
- `changePercent: number | null`

The first time a row is seen, changes are not emitted (there's no previous value to compare against).

### Step 4 — AnomalyDetector flags outliers

For each numeric value in each row, the detector maintains a rolling window of recent observations. Once `minSamples` is reached, it runs the configured statistical tests and emits `AnomalyEvent[]` for any flagged values.

### Step 5 — Callbacks deliver to UI

The engine calls:
```ts
callbacks.onRows(rows, changes)    // every frame
callbacks.onAnomaly(events)        // when anomalies are detected
callbacks.onMetrics(metrics)       // after every frame
callbacks.onStatus(status)         // on connection state changes
```

---

## StreamingEngine

`StreamingEngine` is the orchestrator. It owns all three pipeline stages and all adapter instances.

```ts
class StreamingEngine {
  private _bp:    BackpressureController;
  private _delta: DeltaCalculator;
  private _anom:  AnomalyDetector;

  // One of these is active at a time:
  private _simulated?: SimulatedAdapter;
  private _ws?:        WebSocketAdapter;
  private _sse?:       SSEAdapter;
  private _poll?:      HTTPPollingAdapter;
  private _wt?:        WebTransportAdapter;

  start(): void    // creates adapter, starts pipeline
  stop(): void     // stops adapter, stops rAF loop
  destroy(): void  // stop + clear buffers + reset state
}
```

**Lifecycle:**
```
new StreamingEngine(config, callbacks)
  → constructor: creates BackpressureController, DeltaCalculator, AnomalyDetector

engine.start()
  → creates the correct adapter based on config.adapter.type
  → calls adapter.connect() or adapter.start()
  → calls _bp.start() to begin rAF loop

engine.stop()
  → calls adapter.disconnect() or adapter.stop()
  → calls _bp.stop() (rAF loop pauses, buffer preserved)

engine.destroy()
  → stop()
  → _bp.destroy() (clear buffer)
  → _delta.reset()
  → _anom.reset()
```

---

## Adapters

Each adapter implements a simple contract:
1. Connect to the data source
2. Call `onData(rows: StreamRow[])` when data arrives
3. Call `onStatus(connected: boolean, error?: string)` on state changes
4. Expose `connect()` / `disconnect()` (or `start()` / `stop()`)

They are completely independent of the pipeline — they only know about `StreamRow[]`.

---

## BackpressureController

```
High-throughput source (e.g. 10,000 rows/sec)
     ↓
RingBuffer (capacity: 50,000)
     ↓  [requestAnimationFrame — up to 1,666 rows/frame at 30 FPS]
onFlush([rows]) → DeltaCalculator
```

The `RingBuffer` is a pre-allocated array of fixed size. When full, it evicts the oldest item. This is O(1) push and O(1) pop with no heap allocation after initialization.

The rAF loop checks `elapsed >= minFrameIntervalMs` before draining, ensuring we don't exceed `targetFps` even if the browser calls rAF faster.

---

## DeltaCalculator

Maintains a `Map<rowId, Map<colId, value>>` snapshot. On each row:
1. If the row is new: store all values, return no changes
2. If the row exists: compare each column, emit `CellChange` for changed values

Memory is bounded by the number of active rows × columns. For 1,000 rows × 20 columns = 20,000 entries. Call `evict(rowIds)` to remove rows that are no longer in the stream.

---

## AnomalyDetector

Each column gets its own `ColumnWindow`:
```ts
interface ColumnWindow {
  values: number[];  // pre-allocated circular array
  head:   number;    // write pointer
  count:  number;    // current fill level
  sum:    number;    // running sum (for O(1) mean)
  sumSq:  number;    // running sum of squares (for O(1) variance)
}
```

Running `sum` and `sumSq` let us compute mean and stddev in O(1). Sorting is only needed for IQR/MAD (O(n log n)), and only when those methods are enabled.

---

## React Integration

`useStream` creates one `StreamingEngine` on mount and destroys it on unmount:

```ts
useEffect(() => {
  const engine = new StreamingEngine(config, {
    onRows:    (rows, changes) => setRows(...),
    onAnomaly: (events)        => setAnomalies(...),
    onStatus:  (status)        => setStatus(status),
    onMetrics: (metrics)       => setMetrics(metrics),
  });
  engine.start();
  return () => engine.destroy();   // React StrictMode calls this on every dev mount
}, []);   // empty deps — engine is created once
```

**Why empty deps?** The config is read once at mount. If you need to change the adapter URL or anomaly config, destroy and recreate the engine (or use a `key` prop to remount the component).

---

## Key Design Decisions

### 1. Headless core, no React dependency in `@dataflow/core`

The core engine is pure TypeScript with zero dependencies. It works in React, Vue, Angular, Svelte, or vanilla JS. The React package (`@dataflow/react`) is a thin wrapper.

### 2. RingBuffer over dynamic arrays

A pre-allocated circular buffer avoids GC pressure from continuous array allocation. For a stream at 10,000 rows/sec, a naive approach creates ~10,000 objects/sec to be garbage collected. The ring buffer reuses memory.

### 3. requestAnimationFrame for rendering

We never render more than the browser can display. rAF naturally throttles to the display's refresh rate (60/120/144 Hz). The `minFrameIntervalMs` config reduces this further to save CPU when 60 FPS is unnecessary.

### 4. Running sum for mean/stddev

Maintaining `sum` and `sumSq` alongside the circular buffer gives O(1) updates:
```
new_mean    = (sum - evicted + new_value) / count
new_variance = (sumSq - evicted² + new_value²) / count - mean²
```
No need to iterate the window on every push.

### 5. Seeded PRNG for simulated data

The `simulated` adapter uses **Mulberry32**, a high-quality 32-bit PRNG that fits in 5 lines. Setting `seed` makes the stream fully reproducible — essential for visual regression tests and demos.

### 6. Adapters are decoupled from the pipeline

The adapter only knows `StreamRow[]`. This means:
- Easy to add new adapters without touching the pipeline
- Easy to test the pipeline with mock data
- Easy to swap adapters at runtime (stop/destroy engine, create new one with different adapter config)

---

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Row push to buffer | O(1) | Ring buffer, pre-allocated |
| Delta calculation | O(k) | k = number of columns |
| Anomaly push to window | O(1) | Running sum maintained |
| Anomaly Z-score check | O(1) | Uses running sum |
| Anomaly IQR/MAD check | O(n log n) | Requires sort of window snapshot |
| React state update | O(m) | m = maxRows in state |
| rAF drain | O(r) | r = rows drained per frame |

**Throughput benchmark** (simulated, Chrome, M2 MacBook):
| Rows/sec | Columns | Anomaly methods | CPU% |
|----------|---------|----------------|------|
| 1,000    | 10      | zscore + iqr   | ~2% |
| 10,000   | 10      | zscore + iqr   | ~8% |
| 100,000  | 10      | zscore only    | ~25% |
| 100,000  | 10      | all three      | ~40% |

For >50,000 rows/sec, disable IQR/MAD and use only Z-score, or limit monitored columns with `anomaly.columns`.
