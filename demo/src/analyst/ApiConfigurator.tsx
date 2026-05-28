/**
 * ApiConfigurator — no-code form to wire a live WebSocket / SSE / HTTP-poll
 * data source into the Analyst page.
 *
 * Captures input → builds a DataFlow `AdapterConfig` → hands it to the parent.
 * Persists everything to localStorage via the `storage` helper so a refresh
 * doesn't lose typed URL + auth.
 *
 * Wave 4: form fields rebuilt on TkxInput, TkxNumberInput, TkxSelect.
 * Tabs use TkxTabs. Status pill uses TkxBadge. Errors use TkxAlert.
 * The JSON body field stays as a plain <textarea> (no Tkx equivalent today).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TkxInput,
  TkxNumberInput,
  TkxSelect,
  TkxButton,
  TkxBadge,
  TkxAlert,
  TkxTabs,
  TkxTabList,
  TkxTab,
} from 'tekivex-ui';
import type {
  WebSocketAdapterConfig,
  SSEAdapterConfig,
  HTTPPollingAdapterConfig,
  AdapterConfig,
  StreamStatus,
} from '@gridstorm/dataflow-core';
import { storage, type ApiConfig, type AdapterKind } from './storage.ts';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ApiConfiguratorProps {
  onConnect:    (adapter: AdapterConfig) => void;
  onDisconnect: () => void;
  status:       StreamStatus;
  error?:       string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const KINDS:          AdapterKind[] = ['websocket', 'sse', 'http-polling'];
const KIND_LABELS:    Record<AdapterKind, string> = {
  'websocket':    'WebSocket',
  'sse':          'SSE',
  'http-polling': 'HTTP poll',
};

const METHOD_OPTIONS = [
  { value: 'GET',  label: 'GET'  },
  { value: 'POST', label: 'POST' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function ApiConfigurator({ onConnect, onDisconnect, status, error }: ApiConfiguratorProps) {
  const [kind,       setKind]       = useState<AdapterKind>('websocket');
  const [url,        setUrl]        = useState('');
  const [authToken,  setAuthToken]  = useState('');
  const [intervalMs, setIntervalMs] = useState(2000);
  const [method,     setMethod]     = useState<'GET' | 'POST'>('GET');
  const [body,       setBody]       = useState('');

  // Hydrate from localStorage on first mount
  useEffect(() => {
    const saved = storage.getApiConfig();
    if (!saved) return;
    setKind(saved.kind);
    setUrl(saved.url);
    setAuthToken(saved.authToken ?? '');
    setIntervalMs(saved.intervalMs ?? 2000);
    setMethod(saved.method ?? 'GET');
    setBody(saved.body ?? '');
  }, []);

  // Build the DataFlow adapter config from the current form state
  const adapter = useMemo<AdapterConfig | null>(() => {
    if (!url.trim()) return null;

    if (kind === 'websocket') {
      const wsCfg: WebSocketAdapterConfig = {
        type:            'websocket',
        url:             url.trim(),
        reconnectBaseMs: 500,
        reconnectMaxMs:  30_000,
        heartbeatMs:     15_000,
        maxRetries:      10,
      };
      if (authToken.trim()) wsCfg.authToken = authToken.trim();
      return wsCfg;
    }

    if (kind === 'sse') {
      const sseCfg: SSEAdapterConfig = {
        type:            'sse',
        url:             url.trim(),
        reconnectBaseMs: 1000,
        maxRetries:      10,
      };
      if (authToken.trim()) sseCfg.authToken = authToken.trim();
      return sseCfg;
    }

    // http-polling
    const httpCfg: HTTPPollingAdapterConfig = {
      type:        'http-polling',
      url:         url.trim(),
      method,
      intervalMs:  Math.max(100, intervalMs),
      strategy:    'fixed',
    };
    if (authToken.trim()) httpCfg.authToken = authToken.trim();
    if (method === 'POST' && body.trim()) {
      try { httpCfg.body = JSON.parse(body); } catch { httpCfg.body = body; }
    }
    return httpCfg;
  }, [kind, url, authToken, intervalMs, method, body]);

  const handleConnect = useCallback(() => {
    if (!adapter) return;
    const apiConfig: ApiConfig = {
      kind,
      url:       url.trim(),
      authToken: authToken.trim() || undefined,
      intervalMs: kind === 'http-polling' ? intervalMs : undefined,
      method:    kind === 'http-polling' ? method : undefined,
      body:      kind === 'http-polling' && method === 'POST' && body.trim() ? body : undefined,
    };
    storage.setApiConfig(apiConfig);
    onConnect(adapter);
  }, [adapter, kind, url, authToken, intervalMs, method, body, onConnect]);

  const isLive = status === 'connected' || status === 'reconnecting' || status === 'connecting';
  const kindIdx = KINDS.indexOf(kind);
  const onTabChange = useCallback((idx: number) => {
    const next = KINDS[idx];
    if (next && !isLive) setKind(next);
  }, [isLive]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Adapter type tabs */}
      <TkxTabs activeIndex={kindIdx} onChange={onTabChange}>
        <TkxTabList>
          {KINDS.map((k, i) => (
            <TkxTab key={k} index={i} disabled={isLive}>{KIND_LABELS[k]}</TkxTab>
          ))}
        </TkxTabList>
      </TkxTabs>

      {/* URL */}
      <TkxInput
        label={kind === 'websocket' ? 'WebSocket URL' : 'Endpoint URL'}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={placeholderFor(kind)}
        hint={hintFor(kind)}
        disabled={isLive}
        spellCheck={false}
        autoComplete="off"
      />

      {/* Auth token */}
      <TkxInput
        label="Auth token (optional)"
        type="password"
        value={authToken}
        onChange={(e) => setAuthToken(e.target.value)}
        placeholder="paste a bearer token"
        hint="Sent as `Authorization: Bearer <token>` header."
        disabled={isLive}
        spellCheck={false}
        autoComplete="off"
      />

      {/* HTTP polling-specific */}
      {kind === 'http-polling' && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 120px', minWidth: 0 }}>
              <TkxSelect
                label="Method"
                options={METHOD_OPTIONS}
                value={method}
                onChange={(v) => setMethod((v as string) === 'POST' ? 'POST' : 'GET')}
                isDisabled={isLive}
                size="md"
              />
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <TkxNumberInput
                label="Interval (ms)"
                value={intervalMs}
                onChange={(v) => setIntervalMs(v ?? 2000)}
                min={100}
                step={100}
                clampOnBlur
                isDisabled={isLive}
                size="md"
              />
            </div>
          </div>

          {method === 'POST' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                Request body (JSON)
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{"query": "..."}'
                disabled={isLive}
                spellCheck={false}
                rows={3}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  padding: '8px 10px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  resize: 'vertical',
                  minHeight: 60,
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Parsed as JSON if valid; sent as a string otherwise.
              </span>
            </label>
          )}
        </>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        {!isLive ? (
          <TkxButton
            variant="solid"
            colorScheme="primary"
            onClick={handleConnect}
            isDisabled={!adapter}
            leftIcon="▶"
          >
            Connect
          </TkxButton>
        ) : (
          <TkxButton
            variant="solid"
            colorScheme="danger"
            onClick={onDisconnect}
            leftIcon="⏹"
          >
            Disconnect
          </TkxButton>
        )}

        <TkxBadge variant={statusVariant(status)} size="md" pulse={isLive && status !== 'connected'}>
          {status[0]!.toUpperCase() + status.slice(1)}
        </TkxBadge>
      </div>

      {/* Engine error */}
      {error && (
        <TkxAlert variant="danger" title="Connection error">{error}</TkxAlert>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function placeholderFor(kind: AdapterKind): string {
  if (kind === 'websocket') return 'wss://example.com/feed';
  if (kind === 'sse')       return 'https://example.com/events';
  return 'https://example.com/api/data';
}

function hintFor(kind: AdapterKind): string {
  if (kind === 'websocket') return 'A wss:// or ws:// URL. Server must emit JSON rows or arrays of rows.';
  if (kind === 'sse')       return 'An https:// endpoint that streams `text/event-stream`.';
  return 'A regular HTTP endpoint that returns JSON. Polled on a fixed interval.';
}

function statusVariant(s: StreamStatus): 'success' | 'warning' | 'danger' | 'default' {
  if (s === 'connected')                       return 'success';
  if (s === 'reconnecting' || s === 'connecting') return 'warning';
  if (s === 'error')                            return 'danger';
  return 'default';
}
