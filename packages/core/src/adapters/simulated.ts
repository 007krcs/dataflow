/**
 * SimulatedAdapter — Generates realistic streaming data for demos and testing.
 *
 * Scenarios:
 *   financial  — Stock/crypto prices using Geometric Brownian Motion
 *   crypto     — Crypto pairs with higher volatility
 *   iot        — Temperature / humidity / pressure sensors
 *   ecommerce  — Live orders, revenue, conversion rate
 *   logs       — System log entries with severity levels
 *   social     — Social media engagement metrics
 */

import type { SimulatedAdapterConfig, StreamRow } from '../types.js';

export type SimulatedOnTick = (rows: StreamRow[]) => void;
export type SimulatedOnStatus = (connected: boolean) => void;

// ─── Seeded PRNG (Mulberry32) ─────────────────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─── Geometric Brownian Motion ────────────────────────────────────────────────

function gbmStep(price: number, mu: number, sigma: number, dt: number, rng: () => number): number {
  // Box-Muller transform: uniform → normal
  const u1 = rng(); const u2 = rng();
  const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return price * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
}

// ─── FINANCIAL SCENARIO ───────────────────────────────────────────────────────

const STOCK_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'NVDA', 'TSLA', 'META', 'NFLX',
                       'AMD',  'INTC',  'ORCL', 'ADBE', 'CRM',  'UBER', 'SPOT', 'LYFT',
                       'SNAP', 'TWTR',  'ZOOM', 'SHOP'];
const CRYPTO_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD',
                        'DOT/USD', 'MATIC/USD','LINK/USD','AVAX/USD','LUNA/USD','DOGE/USD',
                        'SHIB/USD','LTC/USD', 'ATOM/USD','ALGO/USD','XLM/USD','VET/USD',
                        'FTM/USD', 'SAND/USD'];

interface FinancialState {
  symbol: string; price: number; volume: number;
  mu: number; sigma: number; baseVolume: number;
}

function initFinancial(count: number, rng: () => number, crypto = false): FinancialState[] {
  const syms = crypto ? CRYPTO_SYMBOLS : STOCK_SYMBOLS;
  return syms.slice(0, count).map((s) => {
    const price = crypto
      ? (s.startsWith('BTC') ? 40000 + rng() * 10000 : 100 + rng() * 3000)
      : 50 + rng() * 400;
    return {
      symbol: s, price,
      volume: 0,
      mu:     (rng() - 0.5) * 0.02,   // drift
      sigma:  0.005 + rng() * (crypto ? 0.04 : 0.015),  // volatility
      baseVolume: 100000 + rng() * 2000000,
    };
  });
}

function tickFinancial(states: FinancialState[], rng: () => number, ts: number, crypto = false): StreamRow[] {
  const dt = 1 / (252 * 6.5 * 3600); // one second in trading-year fraction
  return states.map((s) => {
    s.price  = gbmStep(s.price, s.mu, s.sigma, dt, rng);
    s.volume = Math.round(s.baseVolume * (0.5 + rng()));
    const open  = s.price * (0.995 + rng() * 0.01);
    const high  = s.price * (1 + rng() * 0.005);
    const low   = s.price * (1 - rng() * 0.005);
    const bid   = s.price * (1 - 0.0002);
    const ask   = s.price * (1 + 0.0002);
    const mktCap = crypto ? s.price * (1e6 + rng() * 1e7) : s.price * (1e9 + rng() * 1e11);
    return {
      id: s.symbol, timestamp: ts,
      symbol: s.symbol,
      price:  parseFloat(s.price.toFixed(crypto ? 4 : 2)),
      open:   parseFloat(open.toFixed(2)),
      high:   parseFloat(high.toFixed(2)),
      low:    parseFloat(low.toFixed(2)),
      bid:    parseFloat(bid.toFixed(2)),
      ask:    parseFloat(ask.toFixed(2)),
      volume: s.volume,
      marketCap: parseFloat((mktCap / 1e9).toFixed(2)),
    };
  });
}

// ─── IoT SCENARIO ─────────────────────────────────────────────────────────────

const IOT_LOCATIONS = ['Building A', 'Building B', 'Building C', 'Data Center', 'Warehouse'];
const IOT_TYPES     = ['Temperature', 'Humidity', 'Pressure', 'CO2', 'Motion'];

interface IoTState {
  id: string; location: string; sensor: string; sensorType: string;
  temp: number; humidity: number; pressure: number; co2: number;
  phase: number; driftRate: number;
}

function initIoT(count: number, rng: () => number): IoTState[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sensor-${String(i + 1).padStart(3, '0')}`,
    location:   IOT_LOCATIONS[i % IOT_LOCATIONS.length]!,
    sensor:     `S${String(i + 1).padStart(3, '0')}`,
    sensorType: IOT_TYPES[i % IOT_TYPES.length]!,
    temp:     20 + rng() * 10,
    humidity: 40 + rng() * 30,
    pressure: 1010 + rng() * 20,
    co2:      400 + rng() * 200,
    phase:    rng() * Math.PI * 2,
    driftRate: (rng() - 0.5) * 0.001,
  }));
}

function tickIoT(states: IoTState[], rng: () => number, ts: number, anomalyRate: number): StreamRow[] {
  const t = ts / 10000;
  return states.map((s) => {
    s.phase += s.driftRate;
    const noise = () => (rng() - 0.5) * 0.5;
    const anomaly = rng() < anomalyRate;
    const tempAnomaly = anomaly && rng() < 0.5;
    s.temp     += noise() + (tempAnomaly ? (rng() > 0.5 ? 8 : -8) : 0);
    s.humidity += noise() * 0.8;
    s.pressure += noise() * 0.3;
    s.co2      += (rng() - 0.45) * 5;
    s.temp     = Math.max(0, Math.min(80, s.temp));
    s.humidity = Math.max(10, Math.min(100, s.humidity));
    s.pressure = Math.max(990, Math.min(1040, s.pressure));
    s.co2      = Math.max(300, Math.min(2000, s.co2));
    const status = s.temp > 35 || s.co2 > 1200 ? 'ALERT' : s.temp > 28 ? 'WARN' : 'OK';
    return {
      id: s.id, timestamp: ts,
      sensor: s.sensor, location: s.location, type: s.sensorType,
      temperature: parseFloat(s.temp.toFixed(2)),
      humidity:    parseFloat(s.humidity.toFixed(1)),
      pressure:    parseFloat(s.pressure.toFixed(1)),
      co2:         Math.round(s.co2),
      status,
      uptime: Math.round(t * 100) / 100,
    };
  });
}

// ─── ECOMMERCE SCENARIO ───────────────────────────────────────────────────────

const EC_CATEGORIES = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports', 'Beauty', 'Toys', 'Food'];
const EC_REGIONS    = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East'];

interface EcomState { id: string; category: string; region: string; orders: number; revenue: number; }

function initEcom(count: number, rng: () => number): EcomState[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${EC_CATEGORIES[i % EC_CATEGORIES.length]}-${EC_REGIONS[i % EC_REGIONS.length]}`,
    category: EC_CATEGORIES[i % EC_CATEGORIES.length]!,
    region:   EC_REGIONS[i % EC_REGIONS.length]!,
    orders:   Math.round(rng() * 500),
    revenue:  rng() * 50000,
  }));
}

function tickEcom(states: EcomState[], rng: () => number, ts: number): StreamRow[] {
  return states.map((s) => {
    const newOrders = Math.round(rng() * 10);
    const avgOrderValue = 20 + rng() * 200;
    s.orders  += newOrders;
    s.revenue += newOrders * avgOrderValue;
    return {
      id: s.id, timestamp: ts,
      category: s.category, region: s.region,
      orders: s.orders,
      revenue: parseFloat(s.revenue.toFixed(2)),
      newOrders,
      avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
      conversionRate: parseFloat((2 + rng() * 8).toFixed(2)),
      cartAbandonment: parseFloat((60 + rng() * 25).toFixed(1)),
    };
  });
}

// ─── ADAPTER CLASS ────────────────────────────────────────────────────────────

export class SimulatedAdapter {
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _rng: () => number;
  private _states: unknown[] = [];
  private _seq = 0;

  constructor(
    private readonly _cfg: SimulatedAdapterConfig,
    private readonly _onTick: SimulatedOnTick,
    private readonly _onStatus: SimulatedOnStatus,
  ) {
    this._rng = mulberry32(_cfg.seed ?? Date.now());
  }

  start(): void {
    if (this._timer) return;
    const count = this._cfg.entityCount ?? 20;

    switch (this._cfg.scenario) {
      case 'financial':  this._states = initFinancial(count, this._rng, false); break;
      case 'crypto':     this._states = initFinancial(count, this._rng, true);  break;
      case 'iot':        this._states = initIoT(count, this._rng);  break;
      case 'ecommerce':  this._states = initEcom(count, this._rng); break;
      default:           this._states = initFinancial(count, this._rng, false);
    }

    this._onStatus(true);
    this._timer = setInterval(() => {
      const ts  = Date.now();
      const rate = this._cfg.anomalyRate ?? 0.02;
      let rows: StreamRow[];
      switch (this._cfg.scenario) {
        case 'financial': rows = tickFinancial(this._states as FinancialState[], this._rng, ts, false); break;
        case 'crypto':    rows = tickFinancial(this._states as FinancialState[], this._rng, ts, true);  break;
        case 'iot':       rows = tickIoT(this._states as IoTState[], this._rng, ts, rate); break;
        case 'ecommerce': rows = tickEcom(this._states as EcomState[], this._rng, ts); break;
        default:          rows = tickFinancial(this._states as FinancialState[], this._rng, ts, false);
      }
      this._seq++;
      this._onTick(rows);
    }, this._cfg.tickIntervalMs ?? 250);
  }

  stop(): void {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._onStatus(false);
  }

  get isRunning(): boolean { return this._timer !== null; }
}
