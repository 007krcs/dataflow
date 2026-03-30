# DataFlow Adapters

An adapter is the bridge between a data source and the DataFlow pipeline. You configure one adapter per stream. All adapters produce `StreamRow[]` and feed the same pipeline (backpressure → delta → anomaly).

---

## Table of Contents

1. [WebSocket Adapter](#1-websocket-adapter)
2. [SSE Adapter (Server-Sent Events)](#2-sse-adapter)
3. [HTTP Polling Adapter](#3-http-polling-adapter)
4. [Simulated Adapter](#4-simulated-adapter)
5. [WebTransport Adapter (HTTP/3)](#5-webtransport-adapter)
6. [Message Format](#message-format)
7. [Writing a Custom Adapter](#writing-a-custom-adapter)

---

## 1. WebSocket Adapter

**Best for:** Trading feeds, IoT telemetry, multiplayer games, collaborative apps — anything requiring sub-second latency and bidirectional communication.

```ts
adapter: {
  type: 'websocket',
  url:  'wss://feed.example.com/stream',

  // Optional: sub-protocol negotiation
  protocols: ['v2.json', 'v1.json'],

  // Optional: JWT or API key sent in first frame after connect
  authToken: 'eyJhbGc...',

  // Reconnection (exponential back-off with jitter)
  reconnectBaseMs: 500,    // first retry delay (default: 500ms)
  reconnectMaxMs:  30000,  // cap delay at 30s (default: 30s)
  maxRetries:      10,     // give up after 10 attempts (default: 10)

  // Keep-alive ping/pong
  heartbeatMs: 15000,      // send ping every 15s (default: 15s)
                           // measures round-trip latency automatically
}
```

### How reconnection works

```
Connect
  └─► Success → reset retry counter
  └─► Fail    → wait (500ms × 2^attempt + jitter) → retry
                 Attempt 1:  ~500ms
                 Attempt 2:  ~1000ms
                 Attempt 3:  ~2000ms
                 ...
                 Attempt 8:  ~30000ms (capped)
                 Attempt 10: give up, status → 'error'
```

### Auth token flow

When `authToken` is set, DataFlow sends this frame immediately on `onopen`:
```json
{ "type": "auth", "token": "eyJhbGc..." }
```
Your server should acknowledge or close the connection.

### Binary frames

DataFlow automatically handles `ArrayBuffer` and `Blob` frames. It decodes them as UTF-8 JSON. For custom binary formats, wrap the adapter and pre-process frames before they reach the engine.

### Expected message shapes

DataFlow auto-detects these envelope formats:
```json
[{ "id": "AAPL", "price": 182.45, "timestamp": 1711234567 }]

{ "data": [ ... ] }

{ "rows": [ ... ] }

{ "payload": [ ... ] }

{ "id": "AAPL", "price": 182.45, "timestamp": 1711234567 }
```

---

## 2. SSE Adapter

**Best for:** Server push (notifications, activity feeds, live dashboards), when you don't need the client to send data.

SSE is simpler than WebSocket — it's a plain HTTP/1.1 or HTTP/2 connection where the server streams `text/event-stream`. The browser's `EventSource` handles reconnection natively; DataFlow adds cursor-aware URL reconstruction and auth.

```ts
adapter: {
  type: 'sse',
  url:  'https://api.example.com/events',

  // Send credentials (cookies) with the request
  withCredentials: false,   // default: false

  // Appended as ?token=... query param
  authToken: 'your-api-key',

  // Custom headers (not supported by EventSource natively —
  // DataFlow adds them as query params instead)
  headers: { 'X-Client-ID': 'dashboard-v2' },

  // Reconnection
  reconnectBaseMs: 1000,
  reconnectMaxMs:  30000,
  maxRetries:      8,
}
```

### Server side (Node.js example)

```js
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => {
    res.write(`event: row\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Named events DataFlow listens to: row, batch, update, data
  const interval = setInterval(() => {
    send({ id: 'sensor-1', timestamp: Date.now(), temp: 22.4 });
  }, 500);

  req.on('close', () => clearInterval(interval));
});
```

### Cursor-based reconnection

SSE natively sends `id:` fields per event. If the server sets them, DataFlow stores `lastEventId` and appends it as `?lastEventId=X` on reconnect so the server can resume from where it left off.

---

## 3. HTTP Polling Adapter

**Best for:** Any existing REST API, paginated data sources, environments where WebSocket is blocked (corporate firewalls).

Three strategies:

### `fixed` — constant interval

```ts
adapter: {
  type:       'http-polling',
  url:        'https://api.example.com/ticker',
  strategy:   'fixed',
  intervalMs: 1000,           // poll every 1 second
  authToken:  'Bearer sk-...',
}
```

### `adaptive` — speeds up when busy, slows down when idle

```ts
adapter: {
  type:         'http-polling',
  url:          'https://api.example.com/events',
  strategy:     'adaptive',
  intervalMs:   1000,
  minIntervalMs: 250,   // floor: poll every 250ms when bursting
  maxIntervalMs: 10000, // ceiling: back off to 10s when idle

  // DataFlow doubles interval after each empty response (up to maxIntervalMs)
  // DataFlow halves interval after each non-empty response (down to minIntervalMs)
}
```

### `long-poll` — server holds the connection until data is available

```ts
adapter: {
  type:      'http-polling',
  url:       'https://api.example.com/wait-for-events',
  strategy:  'long-poll',
  timeoutMs: 30000,       // server timeout (default: 30s)
}
```

### Full config reference

```ts
adapter: {
  type:          'http-polling',
  url:           'https://api.example.com/data',
  method:        'GET',             // or 'POST'
  body:          { filter: 'BTC' }, // POST body (JSON serialized)
  headers:       { 'X-API-Version': '2' },
  authToken:     'Bearer sk-...',   // added as Authorization header
  timeoutMs:     30000,
  strategy:      'adaptive',        // 'fixed' | 'adaptive' | 'long-poll'
  intervalMs:    1000,
  minIntervalMs: 250,
  maxIntervalMs: 10000,
  maxRetries:    0,                 // 0 = retry forever
}
```

### Deduplication

DataFlow sends `If-Modified-Since` and `If-None-Match` headers on every request. If the server returns `304 Not Modified`, DataFlow treats it as an empty response (no rows emitted, interval backed off).

### Cursor pagination

If your API returns a `cursor` or `nextCursor` field, DataFlow automatically appends it to the next request URL:
```
GET /data?cursor=eyJsYXN0SWQiOiI1MDAifQ
```

---

## 4. Simulated Adapter

**Best for:** Development, demos, testing, Storybook stories — no server required.

DataFlow ships four built-in scenarios:

### `financial` — Stock market prices

Uses **Geometric Brownian Motion** (the same model as Black-Scholes) to generate realistic price paths. Each symbol has independent drift (μ) and volatility (σ) parameters sampled at initialization.

```ts
adapter: {
  type:           'simulated',
  scenario:       'financial',
  entityCount:    20,            // up to 20 NASDAQ/NYSE symbols
  tickIntervalMs: 400,           // emit new prices every 400ms
  seed:           42,            // deterministic: same seed = same stream
  anomalyRate:    0.02,          // 2% chance of price spike per tick
}
```

**Emitted columns:** `symbol`, `price`, `open`, `high`, `low`, `bid`, `ask`, `volume`, `marketCap`

### `crypto` — Cryptocurrency pairs

Same GBM model as financial, but with higher volatility (σ up to 4× vs stocks) and BTC starting near $40,000–50,000.

```ts
adapter: {
  type:           'simulated',
  scenario:       'crypto',
  entityCount:    20,            // BTC/USD, ETH/USD, SOL/USD, ...
  tickIntervalMs: 300,           // faster ticks (300ms)
  anomalyRate:    0.04,          // 4% anomaly injection
}
```

**Emitted columns:** same as financial, prices with 4 decimal places

### `iot` — Sensor telemetry

Simulates 25 environmental sensors across 5 building locations. Values drift slowly with sinusoidal components plus noise. `anomalyRate` injects sudden temperature spikes.

```ts
adapter: {
  type:        'simulated',
  scenario:    'iot',
  entityCount: 25,             // 25 sensors
  anomalyRate: 0.05,           // 5% chance of anomaly per tick
}
```

**Emitted columns:** `sensor`, `location`, `type`, `temperature`, `humidity`, `pressure`, `co2`, `status` (OK/WARN/ALERT), `uptime`

**Status logic:**
- `ALERT` — temperature > 35°C or CO₂ > 1200 ppm
- `WARN`  — temperature > 28°C
- `OK`    — otherwise

### `ecommerce` — Order & revenue metrics

Tracks 8 product categories × 5 geographic regions = 16 segments. Each tick adds new orders with random order values.

```ts
adapter: {
  type:           'simulated',
  scenario:       'ecommerce',
  entityCount:    16,
  tickIntervalMs: 600,
}
```

**Emitted columns:** `category`, `region`, `orders`, `newOrders`, `revenue`, `avgOrderValue`, `conversionRate`, `cartAbandonment`

### Reproducibility

Set `seed` to any integer to get a deterministic stream. The same seed always produces the same sequence of prices, making it perfect for visual regression tests and screenshots.

```ts
// These two streams are byte-for-byte identical:
adapter: { type: 'simulated', scenario: 'financial', seed: 99 }
adapter: { type: 'simulated', scenario: 'financial', seed: 99 }
```

---

## 5. WebTransport Adapter

**Best for:** Ultra-low latency applications where milliseconds matter — HFT-style data, real-time gaming, live video metadata.

WebTransport uses **HTTP/3 over QUIC**, which eliminates head-of-line blocking (the main cause of WebSocket jitter). Unreliable datagrams give you the lowest possible latency; reliable streams give you ordered delivery when needed.

> **Browser support:** Chrome 97+, Edge 97+. Not available in Firefox or Safari yet.
> DataFlow detects support and emits an error status if unavailable — you can fall back to WebSocket.

```ts
adapter: {
  type: 'webtransport',
  url:  'https://stream.example.com/wt',   // must be HTTPS

  // Self-signed cert fingerprint (for dev/staging)
  serverCertificateHashes: [{
    algorithm: 'sha-256',
    value: Uint8Array.from(atob('...base64...'), c => c.charCodeAt(0)),
  }],
}
```

### Detecting support

```ts
import { detectBestTransport } from '@dataflow/core';

const transport = detectBestTransport();
// Returns: 'webtransport' | 'websocket' | 'sse'

const adapter = transport === 'webtransport'
  ? { type: 'webtransport', url: 'https://...' }
  : { type: 'websocket',    url: 'wss://...' };
```

### Binary frame format

DataFlow uses a 6-byte header for datagram frames:
```
Byte 0: type  (0x01=tick, 0x02=schema, 0x03=snapshot, 0x04=heartbeat)
Byte 1: flags (reserved)
Bytes 2-3: sequence high word (uint16)
Bytes 4-5: sequence low word  (uint16)
Bytes 6+: JSON payload (UTF-8)
```

---

## Message Format

### Auto-detected envelope shapes

DataFlow accepts any of these from any adapter:

```js
// 1. Array of rows (most common)
[{ "id": "R1", "timestamp": 1711234567, "price": 100 }]

// 2. Wrapped in data key
{ "data": [...] }

// 3. Wrapped in rows key
{ "rows": [...] }

// 4. Any of: records, items, results, payload
{ "records": [...] }

// 5. Single row object
{ "id": "R1", "timestamp": 1711234567, "price": 100 }
```

### Required fields

Every row **must** have:
- `id` — string, uniquely identifies the row (used for delta calculation)
- `timestamp` — number, Unix milliseconds (used for ordering and time-travel)

All other fields are your data columns.

### Custom parsing

If your server sends a non-standard format, preprocess it server-side or use a proxy. WebSocket and SSE adapters accept a `messageToRow` function (on the adapter config type) for custom parsing.

---

## Writing a Custom Adapter

If none of the built-in adapters fit your use case (e.g. Kafka consumer via Confluent REST Proxy, gRPC-Web, MQTT), you can drive the engine directly:

```ts
import { StreamingEngine } from '@dataflow/core';

const engine = new StreamingEngine(
  { adapter: { type: 'simulated', scenario: 'financial' } }, // placeholder
  {
    onRows:    (rows, changes) => updateUI(rows, changes),
    onStatus:  (status)        => setStatus(status),
    onMetrics: (metrics)       => setMetrics(metrics),
    onAnomaly: (events)        => setAnomalies(events),
  },
);

// Instead of calling engine.start(), drive it manually:
myCustomSource.on('data', (rawData) => {
  const rows = parseMyFormat(rawData);
  // Inject rows directly into the pipeline:
  engine['_handleRawRows'](rows);   // internal API — contact us for a stable hook
});
```

> A first-class `CustomAdapter` interface is on the roadmap for v0.4.0.
