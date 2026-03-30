# DataFlow Configuration Reference

Complete reference for every configuration option in DataFlow.

---

## StreamConfig

The top-level configuration object passed to `useStream()` or `new StreamingEngine()`.

```ts
interface StreamConfig {
  id?:          string;           // Optional label for debugging
  name?:        string;           // Optional display name
  adapter:      AdapterConfig;    // REQUIRED — which data source to use
  backpressure?: BackpressureConfig;
  anomaly?:     AnomalyConfig;
  schema?:      StreamSchema;     // Optional column metadata
  autoStart?:   boolean;          // Default: true (via useStream hook)
}
```

---

## AdapterConfig

Exactly one of these must be provided:

### WebSocketAdapterConfig

```ts
{
  type: 'websocket',              // REQUIRED
  url:  'wss://...',             // REQUIRED — WebSocket URL

  protocols?:       string[];     // Sub-protocols for WebSocket handshake
  authToken?:       string;       // Sent as { type: 'auth', token: '...' } on connect
  reconnectBaseMs?: number;       // Base delay for back-off (default: 500)
  reconnectMaxMs?:  number;       // Maximum retry delay (default: 30000)
  maxRetries?:      number;       // Give up after N failures (default: 10)
  heartbeatMs?:     number;       // Ping interval in ms (default: 15000)
                                  // Set to 0 to disable
}
```

### SSEAdapterConfig

```ts
{
  type: 'sse',                    // REQUIRED
  url:  'https://...',           // REQUIRED — SSE endpoint URL

  withCredentials?: boolean;      // Send cookies (default: false)
  authToken?:       string;       // Appended as ?token=... query param
  headers?:         Record<string, string>;  // Extra query params
  reconnectBaseMs?: number;       // (default: 1000)
  reconnectMaxMs?:  number;       // (default: 30000)
  maxRetries?:      number;       // (default: 8)
}
```

### HTTPPollingAdapterConfig

```ts
{
  type: 'http-polling',           // REQUIRED
  url:  'https://...',           // REQUIRED — Polling endpoint URL

  method?:        'GET' | 'POST'; // HTTP method (default: 'GET')
  body?:          unknown;        // POST body (JSON-serialized)
  headers?:       Record<string, string>;
  authToken?:     string;         // Added as Authorization: Bearer <token>
  intervalMs?:    number;         // Poll interval (default: 1000)
  timeoutMs?:     number;         // Request timeout (default: 30000)
  strategy?:      'fixed' | 'adaptive' | 'long-poll';   // (default: 'fixed')
  minIntervalMs?: number;         // Adaptive: floor interval (default: 250)
  maxIntervalMs?: number;         // Adaptive: ceiling interval (default: 10000)
  maxRetries?:    number;         // 0 = retry forever (default: 0)
}
```

### SimulatedAdapterConfig

```ts
{
  type: 'simulated',              // REQUIRED
  scenario: 'financial'           // REQUIRED
    | 'crypto'
    | 'iot'
    | 'ecommerce',

  entityCount?:    number;        // How many symbols/sensors (default: 20)
  tickIntervalMs?: number;        // Milliseconds between ticks (default: 250)
  anomalyRate?:    number;        // 0–1 probability of anomaly injection (default: 0.02)
  seed?:           number;        // Integer seed for reproducibility
}
```

### WebTransportAdapterConfig

```ts
{
  type: 'webtransport',           // REQUIRED
  url:  'https://...',           // REQUIRED — Must be HTTPS

  serverCertificateHashes?: {
    algorithm: string;            // e.g. 'sha-256'
    value:     BufferSource;      // Certificate fingerprint
  }[];                            // For self-signed certs (dev/staging)
}
```

---

## BackpressureConfig

Controls how fast data flows to the UI and what happens when data arrives faster than the UI can render.

```ts
interface BackpressureConfig {
  maxBufferSize?:     number;                        // Default: 50000
  targetFps?:         number;                        // Default: 30
  dropStrategy?:      'oldest' | 'newest' | 'sample'; // Default: 'oldest'
  minFrameIntervalMs?: number;                       // Default: 1000/targetFps
}
```

| Option | Description | Recommended values |
|--------|-------------|-------------------|
| `maxBufferSize` | Ring buffer capacity in rows. When full, `dropStrategy` kicks in. | 10× expected burst size |
| `targetFps` | Target render framerate. Higher = smoother, more CPU. | 30 (default), 60 (premium UI) |
| `dropStrategy` | Which rows to evict when buffer is full. | `'oldest'` for live data, `'sample'` for analytics |
| `minFrameIntervalMs` | Minimum ms between flush calls. Computed from targetFps if not set. | Leave unset |

### Drop strategies

- **`oldest`** — evict the oldest rows first. Best for live trading / monitoring where fresh data is most valuable.
- **`newest`** — evict the most recently received rows. Useful when you need sequence continuity.
- **`sample`** — evict every other row (50% sample). Preserves temporal spread while reducing volume.

### Sizing the buffer

```
maxBufferSize = (rows/sec from source) × (seconds to buffer) × 1.5 safety factor

Examples:
- 100 rows/sec, buffer 5 seconds → 100 × 5 × 1.5 = 750
- 1000 rows/sec, buffer 10 seconds → 1000 × 10 × 1.5 = 15000
- IoT, 50 sensors × 2 Hz = 100 rows/sec, 30s buffer → 4500
```

---

## AnomalyConfig

```ts
interface AnomalyConfig {
  enabled?:  boolean;             // Master switch (default: true)
  methods?:  AnomalyMethod[];     // Default: ['zscore', 'iqr']
                                  // Options: 'zscore' | 'iqr' | 'mad' | 'threshold'

  // Z-score & MAD threshold
  zScoreThreshold?:  number;      // Default: 2.5
                                  // Flag if |z| or MAD-score > this value

  // IQR multiplier (Tukey fences)
  iqrMultiplier?:    number;      // Default: 1.5
                                  // Flag if outside Q1 - k*IQR or Q3 + k*IQR

  // Rolling window
  windowSize?:       number;      // Default: 100
                                  // Number of recent observations per column

  // Warm-up period
  minSamples?:       number;      // Default: 20
                                  // Don't flag until this many samples collected

  // Column filter
  columns?:          string[];    // Default: [] = all numeric columns
                                  // Specify column names to limit detection scope

  // Severity thresholds (z-score scale)
  severityThresholds?: {
    warning:  number;             // Default: 2.5
    critical: number;             // Default: 4.0
  };
}
```

---

## StreamSchema

Optional metadata about your columns. Enables better formatting and validation in future versions.

```ts
interface StreamSchema {
  columns: StreamColumn[];
  idColumn?:        string;   // Which column is the unique identifier
  timestampColumn?: string;   // Which column contains timestamps
}

interface StreamColumn {
  id:       string;           // Column key in StreamRow
  label:    string;           // Display label
  type:     'number' | 'string' | 'boolean' | 'timestamp' | 'currency' | 'percentage';
  unit?:    string;           // e.g. '°C', 'USD', 'ppm'
  format?:  string;           // printf-style format string
  width?:   number;           // Suggested column width in pixels
  align?:   'left' | 'right' | 'center';
  monitorAnomaly?: boolean;   // Include in anomaly detection
}
```

**Example:**
```ts
schema: {
  idColumn: 'symbol',
  timestampColumn: 'timestamp',
  columns: [
    { id: 'symbol',    label: 'Symbol',    type: 'string',   align: 'left' },
    { id: 'price',     label: 'Price',     type: 'currency', unit: 'USD',  align: 'right', monitorAnomaly: true },
    { id: 'volume',    label: 'Volume',    type: 'number',   align: 'right' },
    { id: 'timestamp', label: 'Time',      type: 'timestamp' },
  ],
}
```

---

## useStream Options

Additional options for the React hook:

```ts
interface UseStreamOptions {
  maxRows?:   number;   // Max rows to keep in React state. Default: 500
  autoStart?: boolean;  // Start automatically on mount. Default: true
}
```

---

## Complete Example Configurations

### High-frequency trading

```ts
{
  adapter: {
    type:            'websocket',
    url:             'wss://feed.exchange.com/quotes',
    authToken:       process.env.API_KEY,
    reconnectBaseMs: 200,    // fast reconnect
    reconnectMaxMs:  5000,   // cap at 5s
    heartbeatMs:     10000,
  },
  backpressure: {
    maxBufferSize: 100000,   // large buffer for burst tolerance
    targetFps:     60,       // smooth 60 FPS UI
    dropStrategy:  'oldest', // always show newest prices
  },
  anomaly: {
    methods:         ['zscore', 'mad'],  // MAD handles flash crashes
    zScoreThreshold: 3.0,   // fewer false positives for HFT
    windowSize:      50,    // fast adaptation to market regimes
    minSamples:      15,
    columns:         ['price', 'bid', 'ask'],  // only monitor price columns
  },
}
```

### IoT monitoring dashboard

```ts
{
  adapter: {
    type:           'simulated',
    scenario:       'iot',
    entityCount:    100,
    tickIntervalMs: 1000,
    anomalyRate:    0.03,
  },
  backpressure: {
    maxBufferSize: 5000,
    targetFps:     10,     // IoT doesn't need 60fps
    dropStrategy:  'sample', // preserve temporal distribution
  },
  anomaly: {
    methods:     ['iqr', 'mad'],
    iqrMultiplier: 2.0,
    windowSize:  200,      // larger window = stable baselines
    minSamples:  30,
    columns:     ['temperature', 'co2', 'pressure'],
    severityThresholds: { warning: 2.5, critical: 5.0 },
  },
}
```

### REST API polling (existing backend)

```ts
{
  adapter: {
    type:         'http-polling',
    url:          'https://api.yourcompany.com/v2/metrics/live',
    strategy:     'adaptive',
    intervalMs:   2000,
    minIntervalMs: 500,
    maxIntervalMs: 30000,
    authToken:    `Bearer ${getUserToken()}`,
    headers:      { 'X-Client-Version': '2.0' },
  },
  backpressure: {
    maxBufferSize: 2000,
    targetFps:     30,
  },
  anomaly: { enabled: false },  // disable if data is already processed server-side
}
```

### Demo / Storybook story

```ts
{
  adapter: {
    type:           'simulated',
    scenario:       'financial',
    entityCount:    5,
    tickIntervalMs: 1000,
    seed:           42,  // deterministic — same every render
  },
  anomaly: { enabled: false },
}
```
