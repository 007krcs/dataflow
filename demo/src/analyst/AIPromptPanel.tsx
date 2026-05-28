/**
 * AIPromptPanel — bring-your-own-LLM chat against the current data.
 *
 * Wave 5: built entirely on tekivex-ui/agent + TkxChat. The library owns:
 *   - Provider abstraction (OpenAI, Anthropic, Gemini, Ollama)
 *   - SSE streaming + token assembly
 *   - Message memory + conversation state
 *   - Chat UI rendering (bubbles, timestamps, streaming indicator)
 *
 * This file owns:
 *   - Provider config form (provider picker, endpoint, key, model, system prompt)
 *   - localStorage persistence of the LlmConfig
 *   - Data-context injection (latest N rows folded into the system prompt)
 *   - Wiring useAgent → TkxChat
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TkxCard, TkxCardHeader, TkxCardBody, TkxInput, TkxSelect, TkxButton, TkxAlert, TkxBadge, TkxToggle, TkxChat } from 'tekivex-ui';
import type { ChatMessage } from 'tekivex-ui';
import {
  AnthropicProvider,
  OpenAIProvider,
  GeminiProvider,
  OllamaProvider,
  useAgent,
} from 'tekivex-ui/agent';
import type { Provider } from 'tekivex-ui/agent';

import type { StreamRow } from '@gridstorm/dataflow-core';
import { storage, type LlmConfig, type LlmProvider } from './storage.ts';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AIPromptPanelProps {
  /** Live row buffer — when `includeData` is on, a snapshot is folded into the system prompt. */
  rows: StreamRow[];
}

// ─── Provider catalogue ──────────────────────────────────────────────────────

const PROVIDER_OPTIONS = [
  { value: 'openai',    label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'gemini',    label: 'Google Gemini' },
  { value: 'ollama',    label: 'Ollama (local)' },
];

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai:    'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini:    'gemini-1.5-flash',
  ollama:    'llama3',
};

const DEFAULT_ENDPOINTS: Record<LlmProvider, string> = {
  openai:    'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini:    'https://generativelanguage.googleapis.com/v1beta/models',
  ollama:    'http://localhost:11434/api/chat',
};

// ─── Empty / default config ──────────────────────────────────────────────────

const EMPTY_CONFIG: LlmConfig = {
  provider:     'openai',
  apiKey:       '',
  model:        DEFAULT_MODELS.openai,
  systemPrompt: 'You are a senior data analyst. Be concise and quantitative.',
  includeData:  true,
};

// ─── Data-context formatter ──────────────────────────────────────────────────

const MAX_CONTEXT_ROWS = 50;

function buildSystemWithData(base: string | undefined, rows: StreamRow[]): string {
  const baseLine = (base ?? '').trim();
  if (rows.length === 0) return baseLine;

  const sample = rows.slice(-MAX_CONTEXT_ROWS);
  const columns = Object.keys(sample[0] ?? {}).filter((k) => k !== 'id' && k !== 'timestamp');
  const compactRows = sample.map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c] = r[c];
    return out;
  });

  const ctxBlock =
    `[DATA CONTEXT]\n` +
    `Live stream snapshot — ${rows.length.toLocaleString('en-US')} total rows, showing the latest ${sample.length}.\n` +
    `Columns: ${columns.join(', ')}\n` +
    `Sample (JSON):\n${JSON.stringify(compactRows, null, 0)}\n` +
    `[/DATA CONTEXT]`;

  return baseLine ? `${baseLine}\n\n${ctxBlock}` : ctxBlock;
}

// ─── Provider instantiation ─────────────────────────────────────────────────

function buildProvider(cfg: LlmConfig): Provider {
  const endpoint = cfg.endpoint?.trim() || DEFAULT_ENDPOINTS[cfg.provider];
  switch (cfg.provider) {
    case 'openai':    return new OpenAIProvider({ endpoint, apiKey: cfg.apiKey });
    case 'anthropic': return new AnthropicProvider({ endpoint, apiKey: cfg.apiKey });
    case 'gemini':    return new GeminiProvider({ endpoint, apiKey: cfg.apiKey });
    case 'ollama':    return new OllamaProvider({ endpoint });
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AIPromptPanel({ rows }: AIPromptPanelProps) {
  // Form state — hydrated from localStorage
  const [cfg,        setCfg]        = useState<LlmConfig>(EMPTY_CONFIG);
  const [configOpen, setConfigOpen] = useState(true);
  const [saved,      setSaved]      = useState(false); // tracks "config saved at least once this session"

  useEffect(() => {
    const stored = storage.getLlmConfig();
    if (stored) {
      setCfg({ ...EMPTY_CONFIG, ...stored });
      setSaved(true);
      setConfigOpen(false);
    }
  }, []);

  // Build the agent options whenever config or data context changes
  const agentOptions = useMemo(() => {
    if (!saved || !cfg.apiKey.trim() && cfg.provider !== 'ollama') {
      return null;
    }
    return {
      provider: buildProvider(cfg),
      model:    cfg.model.trim() || DEFAULT_MODELS[cfg.provider],
      system:   cfg.includeData ? buildSystemWithData(cfg.systemPrompt, rows) : (cfg.systemPrompt ?? ''),
      temperature: 0.4,
      maxTokens:   2048,
    };
    // Re-create when rows change AND data injection is on, otherwise stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, cfg.provider, cfg.apiKey, cfg.model, cfg.endpoint, cfg.systemPrompt, cfg.includeData, cfg.includeData ? rows : null]);

  // The agent hook ALWAYS needs valid options; if user hasn't saved, we pass a
  // dummy provider that will never be called (gate the UI on `saved` instead).
  const safeOptions = agentOptions ?? {
    provider: new OllamaProvider({ endpoint: DEFAULT_ENDPOINTS.ollama }),
    model:    'noop',
    system:   '',
  };
  const { messages, streamingText, isStreaming, error, send, stop, reset } = useAgent(safeOptions);

  const handleSaveConfig = useCallback(() => {
    storage.setLlmConfig(cfg);
    setSaved(true);
    setConfigOpen(false);
  }, [cfg]);

  const handleSend = useCallback((text: string) => {
    if (!agentOptions) {
      setConfigOpen(true);
      return;
    }
    void send(text);
  }, [agentOptions, send]);

  // Map agent messages → TkxChat ChatMessage[]
  const chatMessages: ChatMessage[] = useMemo(() => {
    const out: ChatMessage[] = [];
    let i = 0;
    for (const m of messages) {
      if (m.role === 'tool' || m.role === 'system') continue;
      out.push({
        id:      `m-${i++}`,
        role:    m.role,
        content: typeof m.content === 'string' ? m.content : flattenContent(m.content),
      });
    }
    if (isStreaming && streamingText) {
      out.push({
        id:          'stream',
        role:        'assistant',
        content:     streamingText,
        isStreaming: true,
      });
    }
    return out;
  }, [messages, isStreaming, streamingText]);

  const needsKey  = cfg.provider !== 'ollama' && !cfg.apiKey.trim();
  const needsModel = !cfg.model.trim();
  const canSave   = !needsKey && !needsModel;

  return (
    <TkxCard variant="elevated" padding="md">
      <TkxCardHeader
        title="🤖 Ask the data"
        subtitle={
          saved
            ? `${cfg.provider} · ${cfg.model} · ${rows.length.toLocaleString('en-US')} rows in context`
            : 'Configure your LLM provider to start.'
        }
        action={
          <TkxButton
            variant="ghost"
            size="sm"
            leftIcon={configOpen ? '▼' : '⚙'}
            onClick={() => setConfigOpen((o) => !o)}
          >
            {configOpen ? 'Hide config' : 'Provider'}
          </TkxButton>
        }
      />
      <TkxCardBody>
        {/* ── Configuration form ─────────────────────────────────────── */}
        {configOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            <TkxAlert variant="info">
              Your API key stays in this browser&apos;s localStorage. Requests go directly from
              your browser to the endpoint you configure.
            </TkxAlert>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <TkxSelect
                  label="Provider"
                  options={PROVIDER_OPTIONS}
                  value={cfg.provider}
                  onChange={(v) => {
                    const p = v as LlmProvider;
                    setCfg((prev) => ({
                      ...prev,
                      provider: p,
                      model:    prev.model && prev.provider === p ? prev.model : DEFAULT_MODELS[p],
                    }));
                  }}
                  size="md"
                />
              </div>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <TkxInput
                  label="Model"
                  value={cfg.model}
                  onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
                  placeholder={DEFAULT_MODELS[cfg.provider]}
                  hint={`Provider default: ${DEFAULT_MODELS[cfg.provider]}`}
                />
              </div>
            </div>

            <TkxInput
              label="API key"
              type="password"
              value={cfg.apiKey}
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
              placeholder={cfg.provider === 'ollama' ? 'Not required for local Ollama' : 'paste your key'}
              hint={cfg.provider === 'ollama' ? 'Ollama runs locally; no key needed.' : 'Never logged. Never sent except to the endpoint above.'}
              disabled={cfg.provider === 'ollama'}
              spellCheck={false}
              autoComplete="off"
            />

            <TkxInput
              label="Endpoint (optional)"
              type="url"
              value={cfg.endpoint ?? ''}
              onChange={(e) => setCfg({ ...cfg, endpoint: e.target.value })}
              placeholder={DEFAULT_ENDPOINTS[cfg.provider]}
              hint={`Leave blank to use the provider default.`}
              spellCheck={false}
              autoComplete="off"
            />

            <TkxInput
              label="System prompt"
              value={cfg.systemPrompt ?? ''}
              onChange={(e) => setCfg({ ...cfg, systemPrompt: e.target.value })}
              placeholder="You are a senior data analyst…"
              hint="Sent once at the top of every conversation."
            />

            <TkxToggle
              checked={cfg.includeData ?? false}
              onChange={(c) => setCfg({ ...cfg, includeData: c })}
              label="Include latest data sample in the system prompt"
              size="md"
            />

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <TkxButton
                variant="solid"
                colorScheme="primary"
                size="md"
                onClick={handleSaveConfig}
                isDisabled={!canSave}
              >
                Save and start chat
              </TkxButton>
              {saved && (
                <TkxButton variant="ghost" size="md" onClick={() => { storage.clearLlmConfig(); setSaved(false); setCfg(EMPTY_CONFIG); reset(); }}>
                  Forget this config
                </TkxButton>
              )}
              {!canSave && (
                <TkxBadge variant="warning" size="sm">
                  {needsKey ? 'API key required' : 'Model required'}
                </TkxBadge>
              )}
            </div>
          </div>
        )}

        {/* ── Chat ──────────────────────────────────────────────────── */}
        {saved && (
          <>
            {error && (
              <div style={{ marginBottom: 10 }}>
                <TkxAlert variant="danger" title="LLM error">{error.message}</TkxAlert>
              </div>
            )}

            <TkxChat
              messages={chatMessages}
              onSend={handleSend}
              isLoading={isStreaming}
              placeholder={cfg.includeData
                ? 'Ask about the live data — e.g. "Which row has the highest anomaly?"'
                : 'Ask anything…'}
              height={420}
              inputPosition="bottom"
              showTimestamps={false}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {isStreaming && (
                <TkxButton variant="outline" colorScheme="danger" size="sm" onClick={stop}>
                  ⏹ Stop
                </TkxButton>
              )}
              {chatMessages.length > 0 && !isStreaming && (
                <TkxButton variant="ghost" size="sm" onClick={reset}>
                  Clear conversation
                </TkxButton>
              )}
            </div>
          </>
        )}

        {!saved && !configOpen && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
            No provider configured. Click <strong>Provider</strong> above to set one.
          </div>
        )}
      </TkxCardBody>
    </TkxCard>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ContentBlockText { type: 'text'; text: string; }

function flattenContent(blocks: unknown): string {
  if (!Array.isArray(blocks)) return String(blocks);
  return blocks
    .filter((b): b is ContentBlockText =>
      typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text' && typeof (b as { text?: unknown }).text === 'string',
    )
    .map((b) => b.text)
    .join('');
}
