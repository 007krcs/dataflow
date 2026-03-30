/**
 * SSEAdapter — Server-Sent Events client.
 *
 * SSE is the simplest streaming protocol: HTTP/1.1 or HTTP/2 with
 * Content-Type: text/event-stream. The browser handles reconnection
 * natively via EventSource, but we layer custom retry logic on top
 * to track metrics and honour config.
 *
 * Event envelope:
 *   data: <JSON row or array>
 *   event: row | batch | error | heartbeat
 *   id: <last-event-id for reconnect cursor>
 */

import type { SSEAdapterConfig, StreamRow } from '../types.js';

export type SSEOnData   = (rows: StreamRow[]) => void;
export type SSEOnStatus = (connected: boolean, error?: string) => void;

export class SSEAdapter {
  private _es:      EventSource | null = null;
  private _retries  = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _stopped  = false;
  private _lastEventId = '';

  constructor(
    private readonly _cfg: SSEAdapterConfig,
    private readonly _onData:   SSEOnData,
    private readonly _onStatus: SSEOnStatus,
  ) {}

  connect(): void {
    this._stopped = false;
    this._open();
  }

  disconnect(): void {
    this._stopped = true;
    this._clearRetry();
    if (this._es) { this._es.close(); this._es = null; }
    this._onStatus(false);
  }

  get isConnected(): boolean { return this._es?.readyState === EventSource.OPEN; }

  private _open(): void {
    const url = this._buildUrl();
    try {
      this._es = new EventSource(url, { withCredentials: this._cfg.withCredentials ?? false });
    } catch (err) {
      this._scheduleReconnect(String(err));
      return;
    }

    this._es.onopen = () => {
      this._retries = 0;
      this._onStatus(true);
    };

    this._es.onerror = (_evt) => {
      // EventSource readyState: CONNECTING=0, OPEN=1, CLOSED=2
      if (this._es?.readyState === EventSource.CLOSED) {
        this._onStatus(false);
        if (!this._stopped) this._scheduleReconnect('SSE connection closed');
      }
    };

    // Generic message event (event: message)
    this._es.onmessage = (evt) => {
      this._handleData(evt.data as string);
    };

    // Named events
    for (const eventName of ['row', 'batch', 'update', 'data']) {
      this._es.addEventListener(eventName, (evt) => {
        const me = evt as MessageEvent;
        if (me.lastEventId) this._lastEventId = me.lastEventId;
        this._handleData(me.data as string);
      });
    }

    this._es.addEventListener('heartbeat', () => { /* keep-alive, ignore */ });
    this._es.addEventListener('error-event', (evt) => {
      const me = evt as MessageEvent;
      this._onStatus(false, me.data as string);
    });
  }

  private _handleData(raw: string): void {
    try {
      const payload = JSON.parse(raw);
      const rows = this._normalize(payload);
      if (rows.length) this._onData(rows);
    } catch {
      // Non-JSON heartbeat or comment — ignore
    }
  }

  private _normalize(payload: unknown): StreamRow[] {
    if (Array.isArray(payload)) return payload as StreamRow[];
    if (typeof payload === 'object' && payload !== null) {
      const p = payload as Record<string, unknown>;
      for (const key of ['data', 'rows', 'records', 'items']) {
        if (Array.isArray(p[key])) return p[key] as StreamRow[];
      }
      return [payload as StreamRow];
    }
    return [];
  }

  private _buildUrl(): string {
    const base = this._cfg.url;
    const params = new URLSearchParams();
    if (this._lastEventId)              params.set('lastEventId', this._lastEventId);
    if (this._cfg.authToken)            params.set('token', this._cfg.authToken);
    const qs = params.toString();
    return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
  }

  private _scheduleReconnect(reason: string): void {
    const maxRetries = this._cfg.maxRetries ?? 8;
    if (this._retries >= maxRetries) {
      this._onStatus(false, `Max retries: ${reason}`);
      return;
    }
    const base   = this._cfg.reconnectBaseMs ?? 1_000;
    const maxMs  = this._cfg.reconnectMaxMs  ?? 30_000;
    const delay  = Math.min(base * Math.pow(2, this._retries), maxMs);
    this._retries++;
    this._retryTimer = setTimeout(() => this._open(), delay);
  }

  private _clearRetry(): void {
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
  }
}
