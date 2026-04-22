// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * WebSocketAdapter — Production-grade WebSocket client with:
 *   - Exponential back-off reconnection (jitter to avoid thundering herd)
 *   - Per-message JSON parsing with schema-inferred row IDs
 *   - Heartbeat / ping-pong keep-alive
 *   - Binary (ArrayBuffer/Blob) framing support for high-throughput feeds
 */

import type { WebSocketAdapterConfig, StreamRow } from '../types.js';

export type WsOnData    = (rows: StreamRow[]) => void;
export type WsOnStatus  = (connected: boolean, error?: string) => void;
export type WsOnMetrics = (latency: number) => void;

const DEFAULT_RECONNECT_BASE_MS  = 500;
const DEFAULT_RECONNECT_MAX_MS   = 30_000;
const DEFAULT_HEARTBEAT_MS       = 15_000;
const DEFAULT_MAX_RETRIES        = 10;

interface PingEntry { seq: number; sentAt: number; }

export class WebSocketAdapter {
  private _ws:      WebSocket | null = null;
  private _retries  = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _pingSeq  = 0;
  private _pending  = new Map<number, PingEntry>();
  private _stopped  = false;

  constructor(
    private readonly _cfg: WebSocketAdapterConfig,
    private readonly _onData:    WsOnData,
    private readonly _onStatus:  WsOnStatus,
    private readonly _onMetrics?: WsOnMetrics,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  connect(): void {
    this._stopped = false;
    this._open();
  }

  disconnect(): void {
    this._stopped = true;
    this._clearTimers();
    if (this._ws) {
      this._ws.onclose = null; // prevent reconnect trigger
      this._ws.close(1000, 'Client disconnect');
      this._ws = null;
    }
    this._onStatus(false);
  }

  send(data: unknown): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  get isConnected(): boolean {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _open(): void {
    try {
      const protocols = this._cfg.protocols ?? [];
      this._ws = protocols.length
        ? new WebSocket(this._cfg.url, protocols)
        : new WebSocket(this._cfg.url);

      this._ws.binaryType = 'arraybuffer';
      this._ws.onopen    = this._onOpen.bind(this);
      this._ws.onmessage = this._onMessage.bind(this);
      this._ws.onerror   = this._onError.bind(this);
      this._ws.onclose   = this._onClose.bind(this);
    } catch (err) {
      this._scheduleReconnect(String(err));
    }
  }

  private _onOpen(): void {
    this._retries = 0;
    this._onStatus(true);
    this._startHeartbeat();
    // Send auth token / initial subscription if configured
    if (this._cfg.authToken) {
      this.send({ type: 'auth', token: this._cfg.authToken });
    }
  }

  private _onMessage(evt: MessageEvent): void {
    try {
      let payload: unknown;

      if (evt.data instanceof ArrayBuffer) {
        // Assume UTF-8 JSON encoded in binary frame
        payload = JSON.parse(new TextDecoder().decode(evt.data));
      } else if (evt.data instanceof Blob) {
        evt.data.arrayBuffer().then((ab) => {
          const rows = this._parse(JSON.parse(new TextDecoder().decode(ab)));
          if (rows.length) this._onData(rows);
        });
        return;
      } else {
        payload = JSON.parse(evt.data as string);
      }

      // Handle pong frames
      if (this._isPong(payload)) {
        this._handlePong(payload as { type: string; seq: number });
        return;
      }

      const rows = this._parse(payload);
      if (rows.length) this._onData(rows);
    } catch {
      // Malformed message — ignore silently
    }
  }

  private _onError(_evt: Event): void {
    // onClose fires immediately after onError in WebSocket lifecycle
  }

  private _onClose(evt: CloseEvent): void {
    this._stopHeartbeat();
    this._onStatus(false);
    if (!this._stopped && evt.code !== 1000) {
      this._scheduleReconnect(`ws closed (code=${evt.code})`);
    }
  }

  private _scheduleReconnect(reason: string): void {
    const maxRetries = this._cfg.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (this._retries >= maxRetries) {
      this._onStatus(false, `Max retries reached: ${reason}`);
      return;
    }
    const base    = this._cfg.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    const maxMs   = this._cfg.reconnectMaxMs  ?? DEFAULT_RECONNECT_MAX_MS;
    const backoff = Math.min(base * Math.pow(2, this._retries), maxMs);
    const jitter  = backoff * 0.2 * Math.random();
    this._retries++;
    this._retryTimer = setTimeout(() => this._open(), backoff + jitter);
  }

  private _startHeartbeat(): void {
    const interval = this._cfg.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    this._heartbeatTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        const seq = ++this._pingSeq;
        this._pending.set(seq, { seq, sentAt: Date.now() });
        this._ws.send(JSON.stringify({ type: 'ping', seq }));
        // Evict stale pings after 2× interval
        setTimeout(() => this._pending.delete(seq), interval * 2);
      }
    }, interval);
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
  }

  private _clearTimers(): void {
    this._stopHeartbeat();
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
  }

  private _isPong(p: unknown): boolean {
    return typeof p === 'object' && p !== null && (p as Record<string, unknown>).type === 'pong';
  }

  private _handlePong(p: { type: string; seq: number }): void {
    const entry = this._pending.get(p.seq);
    if (entry && this._onMetrics) {
      this._onMetrics(Date.now() - entry.sentAt);
      this._pending.delete(p.seq);
    }
  }

  private _parse(payload: unknown): StreamRow[] {
    if (Array.isArray(payload)) {
      return payload.filter((r) => typeof r === 'object' && r !== null) as StreamRow[];
    }
    if (typeof payload === 'object' && payload !== null) {
      const p = payload as Record<string, unknown>;
      // Common envelope shapes: { data: [...] }, { rows: [...] }, { payload: [...] }
      for (const key of ['data', 'rows', 'payload', 'records', 'items']) {
        if (Array.isArray(p[key])) return p[key] as StreamRow[];
      }
      // Single row object
      if ('id' in p || 'timestamp' in p) return [payload as StreamRow];
    }
    return [];
  }
}
