// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * SimulatedAdapter — Generates realistic streaming data for demos and testing.
 *
 * Scenarios:
 *   financial  — Stock prices using Geometric Brownian Motion
 *   crypto     — Crypto pairs with higher volatility
 *   iot        — Temperature / humidity / pressure / CO2 sensors
 *   ecommerce  — Live orders, revenue, conversion rate
 *   logs       — Application log stream with severity levels
 *   social     — Social media engagement metrics (posts, likes, shares)
 */

import type { SimulatedAdapterConfig, StreamRow } from '../types.js';

export type SimulatedOnTick   = (rows: StreamRow[]) => void;
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
  const u1 = rng(); const u2 = rng();
  const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return price * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
}

// ─── FINANCIAL SCENARIO ───────────────────────────────────────────────────────

const STOCK_SYMBOLS = ['AAPL','GOOGL','MSFT','AMZN','NVDA','TSLA','META','NFLX',
                       'AMD', 'INTC', 'ORCL','ADBE','CRM', 'UBER','SPOT','LYFT',
                       'SNAP','TWTR', 'ZOOM','SHOP'];
const CRYPTO_SYMBOLS = ['BTC/USD','ETH/USD','SOL/USD','BNB/USD','XRP/USD','ADA/USD',
                        'DOT/USD','MATIC/USD','LINK/USD','AVAX/USD','LUNA/USD','DOGE/USD',
                        'SHIB/USD','LTC/USD','ATOM/USD','ALGO/USD','XLM/USD','VET/USD',
                        'FTM/USD','SAND/USD'];

interface FinancialState { symbol: string; price: number; volume: number; mu: number; sigma: number; baseVolume: number; }

function initFinancial(count: number, rng: () => number, crypto = false): FinancialState[] {
  const syms = crypto ? CRYPTO_SYMBOLS : STOCK_SYMBOLS;
  return syms.slice(0, count).map((s) => ({
    symbol: s,
    price:  crypto ? (s.startsWith('BTC') ? 40000 + rng() * 10000 : 100 + rng() * 3000) : 50 + rng() * 400,
    volume: 0,
    mu:    (rng() - 0.5) * 0.02,
    sigma: 0.005 + rng() * (crypto ? 0.04 : 0.015),
    baseVolume: 100000 + rng() * 2000000,
  }));
}

function tickFinancial(states: FinancialState[], rng: () => number, ts: number, crypto = false): StreamRow[] {
  const dt = 1 / (252 * 6.5 * 3600);
  return states.map((s) => {
    s.price  = gbmStep(s.price, s.mu, s.sigma, dt, rng);
    s.volume = Math.round(s.baseVolume * (0.5 + rng()));
    return {
      id: s.symbol, timestamp: ts,
      symbol:    s.symbol,
      price:     parseFloat(s.price.toFixed(crypto ? 4 : 2)),
      open:      parseFloat((s.price * (0.995 + rng() * 0.01)).toFixed(2)),
      high:      parseFloat((s.price * (1 + rng() * 0.005)).toFixed(2)),
      low:       parseFloat((s.price * (1 - rng() * 0.005)).toFixed(2)),
      bid:       parseFloat((s.price * 0.9998).toFixed(2)),
      ask:       parseFloat((s.price * 1.0002).toFixed(2)),
      volume:    s.volume,
      marketCap: parseFloat(((crypto ? s.price * (1e6 + rng() * 1e7) : s.price * (1e9 + rng() * 1e11)) / 1e9).toFixed(2)),
    };
  });
}

// ─── IoT SCENARIO ─────────────────────────────────────────────────────────────

const IOT_LOCATIONS = ['Building A','Building B','Building C','Data Center','Warehouse'];
const IOT_TYPES     = ['ENV','ENV','HVAC','AIR','ENV'];

interface IoTState {
  id: string; location: string; sensor: string; sensorType: string;
  temp: number; humidity: number; pressure: number; co2: number;
  phase: number; driftRate: number;
}

function initIoT(count: number, rng: () => number): IoTState[] {
  return Array.from({ length: count }, (_, i) => ({
    id:         `sensor-${String(i + 1).padStart(3, '0')}`,
    location:   IOT_LOCATIONS[i % IOT_LOCATIONS.length]!,
    sensor:     `S${String(i + 1).padStart(3, '0')}`,
    sensorType: IOT_TYPES[i % IOT_TYPES.length]!,
    temp:       20 + rng() * 10,
    humidity:   40 + rng() * 30,
    pressure:   1010 + rng() * 20,
    co2:        400 + rng() * 200,
    phase:      rng() * Math.PI * 2,
    driftRate:  (rng() - 0.5) * 0.001,
  }));
}

function tickIoT(states: IoTState[], rng: () => number, ts: number, anomalyRate: number): StreamRow[] {
  const t = ts / 10000;
  return states.map((s) => {
    s.phase += s.driftRate;
    const noise = () => (rng() - 0.5) * 0.5;

    // Each anomaly type has an independent chance — multi-column anomalies
    const tempAnomaly     = rng() < anomalyRate;
    const humidityAnomaly = rng() < anomalyRate * 0.6;
    const co2Anomaly      = rng() < anomalyRate * 0.4;

    s.temp     += noise() + (tempAnomaly     ? (rng() > 0.5 ? 10 : -10) : 0);
    s.humidity += noise() * 0.8 + (humidityAnomaly ? (rng() > 0.5 ? 20 : -15) : 0);
    s.pressure += noise() * 0.3;
    s.co2      += (rng() - 0.45) * 5 + (co2Anomaly ? 300 : 0);

    s.temp     = Math.max(0,   Math.min(80,   s.temp));
    s.humidity = Math.max(10,  Math.min(100,  s.humidity));
    s.pressure = Math.max(990, Math.min(1040, s.pressure));
    s.co2      = Math.max(300, Math.min(2000, s.co2));

    const status = s.temp > 35 || s.co2 > 1200 ? 'ALERT' : s.temp > 28 ? 'WARN' : 'OK';
    return {
      id: s.id, timestamp: ts,
      sensor:      s.sensor,
      location:    s.location,
      type:        s.sensorType,
      temperature: parseFloat(s.temp.toFixed(2)),
      humidity:    parseFloat(s.humidity.toFixed(1)),
      pressure:    parseFloat(s.pressure.toFixed(1)),
      co2:         Math.round(s.co2),
      status,
      uptime:      Math.round(t * 100) / 100,
    };
  });
}

// ─── ECOMMERCE SCENARIO ───────────────────────────────────────────────────────

const EC_CATEGORIES = ['Electronics','Clothing','Books','Home','Sports','Beauty','Toys','Food'];
const EC_REGIONS    = ['North America','Europe','Asia Pacific','Latin America','Middle East'];

// Traffic profile: higher multiplier = more orders (matches real-world Poisson distribution)
const TRAFFIC_PROFILES = [1.8, 1.2, 0.6, 1.0, 1.4, 0.9, 0.7, 1.5, 1.1, 0.8, 2.0, 0.5, 1.3, 0.6, 0.9, 1.7];

interface EcomState { id: string; category: string; region: string; orders: number; revenue: number; trafficMultiplier: number; }

function initEcom(count: number, rng: () => number): EcomState[] {
  return Array.from({ length: count }, (_, i) => ({
    id:               `${EC_CATEGORIES[i % EC_CATEGORIES.length]}-${EC_REGIONS[i % EC_REGIONS.length]}`,
    category:         EC_CATEGORIES[i % EC_CATEGORIES.length]!,
    region:           EC_REGIONS[i % EC_REGIONS.length]!,
    orders:           Math.round(rng() * 500),
    revenue:          rng() * 50000,
    trafficMultiplier: TRAFFIC_PROFILES[i % TRAFFIC_PROFILES.length]!,
  }));
}

function tickEcom(states: EcomState[], rng: () => number, ts: number): StreamRow[] {
  return states.map((s) => {
    // Poisson-like new orders (more realistic than uniform random)
    const lambda    = s.trafficMultiplier * 3;  // expected orders per tick
    const newOrders = Math.max(0, Math.round(lambda + (rng() - 0.5) * lambda * 1.5));
    const avgOrderValue = 20 + rng() * 200;
    const cvr       = parseFloat(Math.max(0.5, Math.min(25, 3 + s.trafficMultiplier * 2 + (rng() - 0.5) * 2)).toFixed(2));
    // Abandonment inversely correlated with CVR (realistic)
    const abandon   = parseFloat(Math.max(30, Math.min(90, 85 - cvr * 2.5 + (rng() - 0.5) * 5)).toFixed(1));
    s.orders  += newOrders;
    s.revenue += newOrders * avgOrderValue;
    return {
      id: s.id, timestamp: ts,
      category:        s.category,
      region:          s.region,
      orders:          s.orders,
      revenue:         parseFloat(s.revenue.toFixed(2)),
      newOrders,
      avgOrderValue:   parseFloat(avgOrderValue.toFixed(2)),
      conversionRate:  cvr,
      cartAbandonment: abandon,
    };
  });
}

// ─── LOGS SCENARIO ────────────────────────────────────────────────────────────

const LOG_SERVICES  = ['api-gateway','auth-service','payment-service','inventory-service',
                       'notification-service','search-service','user-service','analytics-service'];
const LOG_LEVELS    = ['DEBUG','INFO','INFO','INFO','WARN','ERROR','ERROR','FATAL'] as const;
const LOG_ENDPOINTS = ['/api/v2/users','/api/v2/orders','/api/v2/products','/api/v2/payments',
                       '/api/v2/search','/api/v2/cart','/api/v2/auth','/health'];
const LOG_MESSAGES: Record<string, string[]> = {
  DEBUG: ['Cache hit for key','Query plan selected','Connection pool size','Batch size computed'],
  INFO:  ['Request completed','User authenticated','Order created','Payment processed','Cache updated'],
  WARN:  ['Slow query detected','Memory usage above 70%','Retry attempt','Rate limit approaching'],
  ERROR: ['Database connection failed','Timeout waiting for response','Null reference exception','Disk write failed'],
  FATAL: ['Out of memory','Segmentation fault','Unrecoverable state reached','Service exiting'],
};

interface LogState { id: string; service: string; errorRate: number; latencyBase: number; }

function initLogs(count: number, rng: () => number): LogState[] {
  return Array.from({ length: count }, (_, i) => ({
    id:          LOG_SERVICES[i % LOG_SERVICES.length]!,
    service:     LOG_SERVICES[i % LOG_SERVICES.length]!,
    errorRate:   0.02 + rng() * 0.08,
    latencyBase: 10 + rng() * 100,
  }));
}

let _logIdCounter = 0;
function tickLogs(states: LogState[], rng: () => number, ts: number, anomalyRate: number): StreamRow[] {
  return states.map((s) => {
    const isError   = rng() < s.errorRate;
    const isAnomaly = rng() < anomalyRate;
    const levelIdx  = isError ? (rng() < 0.1 ? 7 : rng() < 0.4 ? 5 : 6) : (isAnomaly ? 4 : Math.floor(rng() * 4));
    const level     = LOG_LEVELS[levelIdx]!;
    const msgs      = LOG_MESSAGES[level]!;
    const latency   = Math.max(1, s.latencyBase * (0.5 + rng()) * (isAnomaly ? 5 : 1));
    const endpoint  = LOG_ENDPOINTS[Math.floor(rng() * LOG_ENDPOINTS.length)]!;
    const httpStatus = level === 'ERROR' || level === 'FATAL' ? [500,503,504][Math.floor(rng()*3)]! : level === 'WARN' ? (rng() < 0.3 ? 429 : 200) : 200;
    return {
      id:        `log-${++_logIdCounter}`,
      timestamp: ts,
      service:   s.service,
      level,
      message:   msgs[Math.floor(rng() * msgs.length)]!,
      endpoint,
      latencyMs:  Math.round(latency),
      httpStatus,
      traceId:   `trace-${Math.floor(rng() * 0xFFFFFF).toString(16).padStart(6, '0')}`,
    };
  });
}

// ─── SOCIAL SCENARIO ──────────────────────────────────────────────────────────

const SOCIAL_PLATFORMS  = ['Twitter/X','Instagram','TikTok','YouTube','LinkedIn','Reddit','Facebook','Pinterest'];
const SOCIAL_HASHTAGS   = ['#tech','#ai','#webdev','#react','#typescript','#startup','#design','#ux'];
const CONTENT_TYPES     = ['video','image','text','story','reel','article','thread'];

interface SocialState {
  id: string; platform: string; hashtag: string; contentType: string;
  followers: number; engagementRate: number; viralCoeff: number;
  likes: number; shares: number; comments: number; views: number;
}

function initSocial(count: number, rng: () => number): SocialState[] {
  return Array.from({ length: count }, (_, i) => ({
    id:             `${SOCIAL_PLATFORMS[i % SOCIAL_PLATFORMS.length]}-${SOCIAL_HASHTAGS[i % SOCIAL_HASHTAGS.length]}`,
    platform:       SOCIAL_PLATFORMS[i % SOCIAL_PLATFORMS.length]!,
    hashtag:        SOCIAL_HASHTAGS[i % SOCIAL_HASHTAGS.length]!,
    contentType:    CONTENT_TYPES[i % CONTENT_TYPES.length]!,
    followers:      Math.round(1000 + rng() * 999000),
    engagementRate: 0.01 + rng() * 0.09,
    viralCoeff:     0.5 + rng() * 2.5,  // k-factor: > 1 means going viral
    likes:          Math.round(rng() * 10000),
    shares:         Math.round(rng() * 2000),
    comments:       Math.round(rng() * 1000),
    views:          Math.round(rng() * 100000),
  }));
}

function tickSocial(states: SocialState[], rng: () => number, ts: number, anomalyRate: number): StreamRow[] {
  return states.map((s) => {
    const isViral = rng() < anomalyRate;
    const multiplier = isViral ? s.viralCoeff * (2 + rng() * 3) : 1;
    const baseLikes    = Math.round(s.followers * s.engagementRate * 0.4 * multiplier * rng() * 2);
    const baseShares   = Math.round(baseLikes   * 0.15 * (0.5 + rng()));
    const baseComments = Math.round(baseLikes   * 0.08 * (0.5 + rng()));
    const baseViews    = Math.round(baseLikes   * (4 + rng() * 8));
    s.likes    += baseLikes;
    s.shares   += baseShares;
    s.comments += baseComments;
    s.views    += baseViews;
    const sentiment = parseFloat((-1 + rng() * 2).toFixed(3));  // -1 to +1
    return {
      id:              s.id,
      timestamp:       ts,
      platform:        s.platform,
      hashtag:         s.hashtag,
      contentType:     s.contentType,
      likes:           s.likes,
      shares:          s.shares,
      comments:        s.comments,
      views:           s.views,
      newLikes:        baseLikes,
      newShares:       baseShares,
      engagementRate:  parseFloat((s.engagementRate * 100).toFixed(2)),
      sentiment,
      isViral:         isViral ? 1 : 0,
      reach:           Math.round(s.followers * (0.05 + rng() * 0.15) * multiplier),
    };
  });
}

// ─── ADAPTER CLASS ────────────────────────────────────────────────────────────

export class SimulatedAdapter {
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _rng: () => number;
  private _states: unknown[] = [];

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
    const rng   = this._rng;

    switch (this._cfg.scenario) {
      case 'financial':  this._states = initFinancial(count, rng, false); break;
      case 'crypto':     this._states = initFinancial(count, rng, true);  break;
      case 'iot':        this._states = initIoT(count, rng);              break;
      case 'ecommerce':  this._states = initEcom(count, rng);             break;
      case 'logs':       this._states = initLogs(count, rng);             break;
      case 'social':     this._states = initSocial(count, rng);           break;
      default: {
        console.warn(`[DataFlow] Unknown scenario "${String(this._cfg.scenario)}", falling back to 'financial'`);
        this._states = initFinancial(count, rng, false);
      }
    }

    this._onStatus(true);
    this._timer = setInterval(() => {
      const ts   = Date.now();
      const rate = this._cfg.anomalyRate ?? 0.02;
      let rows: StreamRow[];
      switch (this._cfg.scenario) {
        case 'financial': rows = tickFinancial(this._states as FinancialState[], rng, ts, false); break;
        case 'crypto':    rows = tickFinancial(this._states as FinancialState[], rng, ts, true);  break;
        case 'iot':       rows = tickIoT(this._states as IoTState[], rng, ts, rate);              break;
        case 'ecommerce': rows = tickEcom(this._states as EcomState[], rng, ts);                  break;
        case 'logs':      rows = tickLogs(this._states as LogState[], rng, ts, rate);             break;
        case 'social':    rows = tickSocial(this._states as SocialState[], rng, ts, rate);        break;
        default:          rows = tickFinancial(this._states as FinancialState[], rng, ts, false);
      }
      this._onTick(rows);
    }, this._cfg.tickIntervalMs ?? 250);
  }

  stop(): void {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._onStatus(false);
  }

  get isRunning(): boolean { return this._timer !== null; }
}
