# Backpressure Control in DataFlow

When a data source produces rows faster than the browser can render them, the UI can freeze or fall behind in a way that's worse than no data at all. DataFlow's `BackpressureController` solves this problem.

---

## The Problem

A WebSocket ticker might deliver 5,000 rows/second. React can render maybe 100–200 meaningful updates per second before the browser thread blocks. Without backpressure:

```
Tick 1 (0ms):    200 rows arrive → React re-renders → 16ms
Tick 2 (1ms):    200 rows arrive → React re-renders → 16ms (already behind)
Tick 3 (2ms):    200 rows arrive → enqueued
...
After 1 second:  5000 rows queued, UI frozen trying to catch up
```

---

## The Solution — Ring Buffer + requestAnimationFrame

```
Source (any rate)          BackpressureController       UI (≤targetFps)
       │                          │                          │
  rows arrive ──────────► RingBuffer ◄──── evict oldest     │
                           (50,000 cap)    when full         │
                                │                           │
                       requestAnimationFrame ──────────────► onFlush(rows)
                          (every 33ms at 30 FPS)             └─► React setState
```

### Ring Buffer

A **circular buffer** with a fixed, pre-allocated capacity. When full:
- If `dropStrategy: 'oldest'`: the oldest unread row is evicted to make room
- The eviction count is tracked in `metrics.droppedRows`

No heap allocation after initialization. For a buffer of 50,000 `StreamRow` objects, memory usage is approximately `50,000 × avg_row_size_bytes`.

### requestAnimationFrame scheduler

On each animation frame (browser calls this at your display's refresh rate — typically 60/120Hz):

1. Check if `elapsed >= minFrameIntervalMs` (throttle to `targetFps`)
2. If yes, drain up to `maxBufferSize / targetFps` rows from the buffer
3. Deliver the batch to `onFlush(rows)`
4. Schedule the next frame

```
minFrameIntervalMs = 1000 / targetFps
maxRowsPerFrame    = maxBufferSize / targetFps

At 30 FPS, maxBufferSize=50000:
  - Drain up to 1,666 rows per frame
  - At max throughput: 1,666 × 30 = ~50,000 rows/sec delivered to UI
```

---

## Configuration

```ts
backpressure: {
  maxBufferSize:      50000,    // Ring buffer capacity (rows). Default: 50000
  targetFps:          30,       // Target UI update rate. Default: 30
  dropStrategy:       'oldest', // 'oldest' | 'newest' | 'sample'. Default: 'oldest'
  minFrameIntervalMs: 33,       // Computed from targetFps if not set
}
```

---

## Drop Strategies

### `'oldest'` (default)

When the buffer is full, the oldest row is overwritten:
```
Buffer: [ROW-1, ROW-2, ROW-3, ROW-4, ROW-5]  ← full
New row arrives:
Buffer: [ROW-2, ROW-3, ROW-4, ROW-5, ROW-6]  ← ROW-1 evicted
```

**Best for:** Live trading, monitoring dashboards — you always want the most recent data, not data from 10 seconds ago.

### `'newest'`

When the buffer is full, the new row is discarded:
```
Buffer: [ROW-1, ROW-2, ROW-3, ROW-4, ROW-5]  ← full
New row arrives:
Buffer: [ROW-1, ROW-2, ROW-3, ROW-4, ROW-5]  ← ROW-6 dropped
```

**Best for:** Order books, event logs where sequence continuity matters more than recency.

### `'sample'`

Every other arriving row is discarded (50% sample):
```
Row 1 → accepted
Row 2 → dropped
Row 3 → accepted
Row 4 → dropped
```

**Best for:** Analytics / aggregation use cases where temporal spread matters more than seeing every individual update.

---

## Metrics

The controller exposes these metrics (available in `StreamMetrics`):

| Metric | Description |
|--------|-------------|
| `bufferUtilization` | 0.0–1.0. How full the ring buffer currently is. |
| `droppedRows` | Cumulative rows evicted due to buffer overflow. |

Watch these to tune your buffer:

- **`bufferUtilization` consistently > 0.8** → increase `maxBufferSize` or decrease your source's tick rate
- **`droppedRows` > 0** → you're exceeding the buffer. Either increase `maxBufferSize` or raise `targetFps`
- **UI feels sluggish but `bufferUtilization` is low** → lower `targetFps` or reduce `maxRows` in `useStream`

---

## Tuning Guide

### Scenario: High-frequency feed (10,000+ rows/sec)

```ts
backpressure: {
  maxBufferSize: 100000,  // large buffer for burst tolerance
  targetFps:     60,      // smooth UI
  dropStrategy:  'oldest',
}
```

### Scenario: Low-frequency monitoring (1 row/sec)

```ts
backpressure: {
  maxBufferSize: 500,     // small buffer is fine
  targetFps:     10,      // no need for 60fps at 1 row/sec
}
```

### Scenario: IoT (100 sensors × 1 Hz = 100 rows/sec)

```ts
backpressure: {
  maxBufferSize: 5000,    // 50 seconds of buffer
  targetFps:     20,      // sensors don't need 60fps
  dropStrategy:  'sample', // preserve temporal distribution
}
```

### Scenario: Analytics (want to see all data, not live)

```ts
backpressure: {
  maxBufferSize: 500000,  // massive buffer
  targetFps:     1,       // update UI every second
  dropStrategy:  'newest', // never drop — process everything
}
```

---

## The rAF Loop in Detail

```ts
private _schedule(): void {
  this._rafId = requestAnimationFrame((now) => {
    const elapsed = now - this._lastFlush;

    if (elapsed >= this._cfg.minFrameIntervalMs && !this._buf.isEmpty) {
      this._lastFlush = now;
      const maxRows = Math.ceil(this._cfg.maxBufferSize / this._cfg.targetFps);
      const rows = this._buf.popN(maxRows);   // O(maxRows)
      if (rows.length > 0) this._cb.onFlush(rows);
    }

    this._schedule();   // schedule next frame
  });
}
```

`requestAnimationFrame` is automatically suspended when the tab is hidden (browser optimization). This means backpressure builds up while the tab is in the background, but the buffer cap prevents unbounded growth.

---

## Memory Usage

For a `maxBufferSize` of 50,000 and rows with 10 columns:

```
Each StreamRow ≈ 10 string keys + 10 values ≈ ~400 bytes (V8 estimate)
50,000 rows × 400 bytes = ~20 MB

For 100,000 rows: ~40 MB
For 500,000 rows: ~200 MB
```

Keep `maxBufferSize` proportional to your available memory budget. For mobile, use 5,000–10,000. For desktop data terminals, 100,000 is fine.

---

## Backpressure vs. Throttling

| Approach | How it works | DataFlow uses |
|----------|-------------|---------------|
| **Throttle** | Drop/delay rows at the source before they enter the buffer | No |
| **Backpressure** | Accept all rows into a buffer, drain at a controlled rate | ✅ Yes |
| **Debounce** | Delay delivery until quiet period | No |
| **Sampling** | Keep 1 in N rows | `dropStrategy: 'sample'` |

DataFlow uses backpressure (not throttling) because: data is accepted immediately into the ring buffer, preserving the most recent state. Only when the buffer overflows are rows evicted.
