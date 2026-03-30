/**
 * HTTPPollingAdapter — Adaptive-interval HTTP polling.
 *
 * Strategies:
 *   fixed      — constant interval (e.g., 1 s)
 *   adaptive   — back-off when server returns empty responses,
 *                speed-up when data bursts arrive
 *   long-poll  — keeps the connection open until the server
 *                responds (Comet-style), then immediately re-fires
 *
 * Deduplication: tracks `lastModified` / `etag` headers to skip
 * unchanged responses (304 Not Modified support).
 */

import type { HTTPPollingAdapterConfig, StreamRow } from '../types.js';

export type PollOnData   = (rows: StreamRow[]) => void;
export type PollOnStatus = (connected: boolean, error?: string) => void;

interface FetchState {
  lastModified: string;
  etag:         string;
  cursor:       string | null;  // pagination/cursor from response
}

export class HTTPPollingAdapter {
  private _timer:    ReturnType<typeof setTimeout> | null = null;
  private _inflight: AbortController | null = null;
  private _stopped   = false;
  private _interval: number;
  private _emptyRuns = 0;
  private _state: FetchState = { lastModified: '', etag: '', cursor: null };

  constructor(
    private readonly _cfg: HTTPPollingAdapterConfig,
    private readonly _onData:   PollOnData,
    private readonly _onStatus: PollOnStatus,
  ) {
    this._interval = _cfg.intervalMs ?? 1_000;
  }

  start(): void {
    this._stopped = false;
    this._onStatus(true);
    this._poll();
  }

  stop(): void {
    this._stopped = true;
    this._clear();
    if (this._inflight) { this._inflight.abort(); this._inflight = null; }
    this._onStatus(false);
  }

  get isRunning(): boolean { return !this._stopped; }

  private async _poll(): Promise<void> {
    if (this._stopped) return;

    this._inflight = new AbortController();
    const timeout  = this._cfg.timeoutMs ?? 30_000;
    const timeoutId = setTimeout(() => this._inflight?.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (this._state.lastModified) headers['If-Modified-Since'] = this._state.lastModified;
      if (this._state.etag)         headers['If-None-Match']      = this._state.etag;
      if (this._cfg.authToken)      headers['Authorization']      = `Bearer ${this._cfg.authToken}`;
      if (this._cfg.headers)        Object.assign(headers, this._cfg.headers);

      const url = this._buildUrl();
      const res = await fetch(url, {
        signal:  this._inflight.signal,
        headers,
        method:  this._cfg.method ?? 'GET',
        body:    this._cfg.body ? JSON.stringify(this._cfg.body) : undefined,
      });

      clearTimeout(timeoutId);

      if (res.status === 304) {
        // Not modified — same as empty
        this._adjustInterval(0);
      } else if (res.ok) {
        // Update dedup headers
        const lm  = res.headers.get('last-modified');
        const et  = res.headers.get('etag');
        if (lm) this._state.lastModified = lm;
        if (et) this._state.etag = et;

        const json = await res.json() as unknown;
        const rows = this._normalize(json);
        if (rows.length) {
          this._onData(rows);
          this._adjustInterval(rows.length);
        } else {
          this._adjustInterval(0);
        }
      } else {
        this._onStatus(false, `HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (!this._stopped) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== 'AbortError' && msg !== 'The user aborted a request.') {
          this._onStatus(false, msg);
        }
      }
    }

    this._inflight = null;
    if (!this._stopped) {
      const isLongPoll = this._cfg.strategy === 'long-poll';
      this._timer = setTimeout(() => this._poll(), isLongPoll ? 0 : this._interval);
    }
  }

  private _normalize(payload: unknown): StreamRow[] {
    if (Array.isArray(payload)) return payload as StreamRow[];
    if (typeof payload === 'object' && payload !== null) {
      const p = payload as Record<string, unknown>;
      // Cursor pagination
      if (typeof p.cursor === 'string') this._state.cursor = p.cursor;
      if (typeof p.nextCursor === 'string') this._state.cursor = p.nextCursor;
      for (const key of ['data', 'rows', 'records', 'items', 'results']) {
        if (Array.isArray(p[key])) return p[key] as StreamRow[];
      }
      if ('id' in p || 'timestamp' in p) return [payload as StreamRow];
    }
    return [];
  }

  private _buildUrl(): string {
    const base = this._cfg.url;
    if (this._state.cursor) {
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}cursor=${encodeURIComponent(this._state.cursor)}`;
    }
    return base;
  }

  private _adjustInterval(rowCount: number): void {
    if (this._cfg.strategy !== 'adaptive') return;
    const min = this._cfg.minIntervalMs ?? 250;
    const max = this._cfg.maxIntervalMs ?? 10_000;

    if (rowCount === 0) {
      this._emptyRuns++;
      // Slow down: double interval up to max
      this._interval = Math.min(this._interval * Math.pow(2, Math.min(this._emptyRuns, 4)), max);
    } else {
      this._emptyRuns = 0;
      // Speed up: halve interval down to min
      this._interval = Math.max(this._interval / 2, min);
    }
  }

  private _clear(): void {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }
}
