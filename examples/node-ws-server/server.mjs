// © 2025 GridStorm / Tekivex — MIT
/**
 * DataFlow reference WebSocket server.
 *
 * Emits one or many StreamRow JSON messages per tick over a plain ws:// socket.
 * Designed to drop straight into any DataFlow WebSocket adapter:
 *
 *   useStream({
 *     adapter: { type: 'websocket', url: 'ws://localhost:8080?scenario=financial' },
 *   });
 *
 * Wire protocol (matches packages/core/src/adapters/websocket.ts):
 *   - Server → client : JSON `{ id, timestamp, ...fields }` OR JSON array of same
 *   - Client → server : JSON `{ type: 'ping', seq }`   (heartbeat)
 *   - Server → client : JSON `{ type: 'pong', seq }`   (responded immediately)
 *
 * Config via env:
 *   PORT           default 8080
 *   SCENARIO       default 'financial'  ('financial' | 'iot' | 'ecommerce')
 *   ENTITY_COUNT   default 20
 *   TICK_MS        default 400          (interval between emissions)
 *   ANOMALY_RATE   default 0.02         (per-tick chance of injecting an outlier)
 *   BATCH          default 'all'        ('all' = one frame per tick; 'each' = one msg per row)
 *
 * Run:
 *   npm install
 *   npm start                       # financial @ 400ms
 *   SCENARIO=iot npm start
 *   PORT=9000 TICK_MS=100 npm start  # firehose mode
 */

import { WebSocketServer } from 'ws';
import { URL } from 'node:url';

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT          = Number(process.env.PORT          ?? 8080);
const DEFAULT_SCEN  = process.env.SCENARIO             ?? 'financial';
const ENTITY_COUNT  = Number(process.env.ENTITY_COUNT  ?? 20);
const TICK_MS       = Number(process.env.TICK_MS       ?? 400);
const ANOMALY_RATE  = Number(process.env.ANOMALY_RATE  ?? 0.02);
const BATCH         = (process.env.BATCH               ?? 'all').toLowerCase();
const SEED          = Number(process.env.SEED          ?? Date.now() & 0xffffffff);

// ─── Seeded PRNG (Mulberry32) — matches the simulated adapter for reproducibility
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Scenario: Financial (Geometric Brownian Motion) ─────────────────────────

const STOCK_SYMBOLS = [
  'AAPL','GOOGL','MSFT','AMZN','NVDA','TSLA','META','NFLX','AMD','INTC',
  'ORCL','ADBE','CRM','UBER','SPOT','LYFT','SNAP','TWTR','ZOOM','SHOP',
];

function initFinancial(count, rng) {
  return STOCK_SYMBOLS.slice(0, count).map((symbol) => ({
    symbol,
    price:      50 + rng() * 400,
    mu:         (rng() - 0.5) * 0.02,
    sigma:      0.005 + rng() * 0.015,
    baseVolume: 100_000 + rng() * 2_000_000,
  }));
}

function tickFinancial(states, rng, ts, anomalyRate) {
  const dt = 1 / (252 * 6.5 * 3600);
  return states.map((s) => {
    const u1 = rng(), u2 = rng();
    const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
    s.price *= Math.exp((s.mu - 0.5 * s.sigma * s.sigma) * dt + s.sigma * Math.sqrt(dt) * z);

    // Occasional spike — DataFlow's z-score / IQR detector will flag it
    if (rng() < anomalyRate) s.price *= rng() > 0.5 ? 1.08 : 0.92;

    const volume = Math.round(s.baseVolume * (0.5 + rng()));
    return {
      id:        s.symbol,
      timestamp: ts,
      symbol:    s.symbol,
      price:     +s.price.toFixed(2),
      open:      +(s.price * (0.995 + rng() * 0.01)).toFixed(2),
      high:      +(s.price * (1 + rng() * 0.005)).toFixed(2),
      low:       +(s.price * (1 - rng() * 0.005)).toFixed(2),
      bid:       +(s.price * 0.9998).toFixed(2),
      ask:       +(s.price * 1.0002).toFixed(2),
      volume,
      marketCap: +((s.price * (1e9 + rng() * 1e11)) / 1e9).toFixed(2),
    };
  });
}

// ─── Scenario: IoT sensors ────────────────────────────────────────────────────

const IOT_LOCATIONS = ['Building A','Building B','Building C','Data Center','Warehouse'];

function initIoT(count, rng) {
  return Array.from({ length: count }, (_, i) => ({
    id:        `sensor-${String(i + 1).padStart(3, '0')}`,
    location:  IOT_LOCATIONS[i % IOT_LOCATIONS.length],
    temp:      20 + rng() * 10,
    humidity:  40 + rng() * 30,
    pressure:  1010 + rng() * 20,
    co2:       400 + rng() * 200,
  }));
}

function tickIoT(states, rng, ts, anomalyRate) {
  const noise = () => (rng() - 0.5) * 0.5;
  return states.map((s) => {
    const tempSpike     = rng() < anomalyRate;
    const humiditySpike = rng() < anomalyRate * 0.6;
    const co2Spike      = rng() < anomalyRate * 0.4;

    s.temp     += noise() + (tempSpike ? (rng() > 0.5 ? 10 : -10) : 0);
    s.humidity += noise() * 0.8 + (humiditySpike ? (rng() > 0.5 ? 20 : -15) : 0);
    s.pressure += noise() * 0.3;
    s.co2      += (rng() - 0.45) * 5 + (co2Spike ? 300 : 0);

    s.temp     = Math.max(0,   Math.min(80,   s.temp));
    s.humidity = Math.max(10,  Math.min(100,  s.humidity));
    s.pressure = Math.max(990, Math.min(1040, s.pressure));
    s.co2      = Math.max(300, Math.min(2000, s.co2));

    const status = s.temp > 35 || s.co2 > 1200 ? 'ALERT' : s.temp > 28 ? 'WARN' : 'OK';
    return {
      id:          s.id,
      timestamp:   ts,
      location:    s.location,
      temperature: +s.temp.toFixed(2),
      humidity:    +s.humidity.toFixed(1),
      pressure:    +s.pressure.toFixed(1),
      co2:         Math.round(s.co2),
      status,
    };
  });
}

// ─── Scenario: Ecommerce orders ───────────────────────────────────────────────

const EC_CATEGORIES = ['Electronics','Clothing','Books','Home','Sports','Beauty','Toys','Food'];
const EC_REGIONS    = ['North America','Europe','Asia Pacific','Latin America','Middle East'];

function initEcom(count, rng) {
  return Array.from({ length: count }, (_, i) => ({
    id:       `${EC_CATEGORIES[i % EC_CATEGORIES.length]}-${EC_REGIONS[i % EC_REGIONS.length]}`,
    category: EC_CATEGORIES[i % EC_CATEGORIES.length],
    region:   EC_REGIONS[i % EC_REGIONS.length],
    orders:   Math.round(rng() * 500),
    revenue:  rng() * 50_000,
  }));
}

function tickEcom(states, rng, ts) {
  return states.map((s) => {
    const newOrders     = Math.max(0, Math.round(3 + (rng() - 0.5) * 6));
    const avgOrderValue = 20 + rng() * 200;
    s.orders  += newOrders;
    s.revenue += newOrders * avgOrderValue;
    return {
      id:              s.id,
      timestamp:       ts,
      category:        s.category,
      region:          s.region,
      orders:          s.orders,
      revenue:         +s.revenue.toFixed(2),
      newOrders,
      avgOrderValue:   +avgOrderValue.toFixed(2),
      conversionRate:  +(3 + (rng() - 0.5) * 2).toFixed(2),
    };
  });
}

// ─── Scenario registry ────────────────────────────────────────────────────────

const SCENARIOS = {
  financial: { init: initFinancial, tick: tickFinancial },
  iot:       { init: initIoT,       tick: tickIoT },
  ecommerce: { init: initEcom,      tick: (s, r, ts) => tickEcom(s, r, ts) },
};

// ─── Per-scenario broadcaster ─────────────────────────────────────────────────
// One ticker per scenario, shared across all connected clients of that scenario.

const broadcasters = new Map(); // scenario → { clients: Set<ws>, timer, states, rng }

function getBroadcaster(scenario) {
  if (broadcasters.has(scenario)) return broadcasters.get(scenario);

  const def = SCENARIOS[scenario];
  if (!def) return null;

  const rng    = mulberry32(SEED + hashCode(scenario));
  const states = def.init(ENTITY_COUNT, rng);

  const b = { clients: new Set(), timer: null, states, rng, scenario, tickCount: 0 };

  b.timer = setInterval(() => {
    if (b.clients.size === 0) return; // no listeners → skip work
    const ts   = Date.now();
    const rows = def.tick(b.states, b.rng, ts, ANOMALY_RATE);
    b.tickCount++;

    const payload = BATCH === 'each'
      ? rows.map((r) => JSON.stringify(r))
      : [JSON.stringify(rows)];

    for (const ws of b.clients) {
      if (ws.readyState !== 1 /* OPEN */) continue;
      for (const msg of payload) ws.send(msg);
    }
  }, TICK_MS);

  broadcasters.set(scenario, b);
  return b;
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// ─── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  // Parse ?scenario=... ; default from env
  const url      = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const scenario = (url.searchParams.get('scenario') ?? DEFAULT_SCEN).toLowerCase();
  const b        = getBroadcaster(scenario);

  if (!b) {
    ws.send(JSON.stringify({
      error: `unknown scenario: ${scenario}`,
      available: Object.keys(SCENARIOS),
    }));
    ws.close(1008, 'Unknown scenario');
    return;
  }

  b.clients.add(ws);
  console.log(`[ws] +client  scenario=${scenario}  clients=${b.clients.size}  from=${req.socket.remoteAddress}`);

  // Welcome frame so the client knows it's wired up — adapters will accept and ignore it
  ws.send(JSON.stringify({ type: 'hello', scenario, entityCount: ENTITY_COUNT, tickMs: TICK_MS, batch: BATCH }));

  // Heartbeat: respond to DataFlow's `{ type: 'ping', seq }` with `{ type: 'pong', seq }`
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg && msg.type === 'ping' && typeof msg.seq === 'number') {
      ws.send(JSON.stringify({ type: 'pong', seq: msg.seq }));
    }
  });

  ws.on('close', () => {
    b.clients.delete(ws);
    console.log(`[ws] -client  scenario=${scenario}  clients=${b.clients.size}`);
  });

  ws.on('error', (err) => {
    console.warn(`[ws] error scenario=${scenario}: ${err.message}`);
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

console.log(`
DataFlow reference WebSocket server

  url:           ws://localhost:${PORT}
  default scen:  ${DEFAULT_SCEN}            (override with ?scenario=...)
  entities:      ${ENTITY_COUNT}
  tick:          every ${TICK_MS} ms
  anomaly rate:  ${ANOMALY_RATE}
  batch mode:    ${BATCH}                 (env BATCH=each for one msg per row)
  seed:          ${SEED}

Try:
  ws://localhost:${PORT}?scenario=financial
  ws://localhost:${PORT}?scenario=iot
  ws://localhost:${PORT}?scenario=ecommerce

Stop with Ctrl-C.
`);

// Clean shutdown
function shutdown() {
  console.log('\n[ws] shutting down...');
  for (const b of broadcasters.values()) clearInterval(b.timer);
  wss.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
