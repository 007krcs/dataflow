/**
 * Typed localStorage layer for the Analyst page.
 *
 * Everything stored here is **client-side only** until the SaaS phase
 * adds a backend. Keys live in the user's browser, never on our server.
 *
 * When phase 2 adds auth + persistence, this layer is swapped for an
 * API client with the same shape — the React components don't change.
 *
 * Namespacing: every key is prefixed `df-analyst:` to avoid collisions
 * with other apps on the same origin.
 */

const KEY_PREFIX = 'df-analyst:';

// ─── Schema ──────────────────────────────────────────────────────────────────

export type AdapterKind = 'websocket' | 'sse' | 'http-polling';

export interface ApiConfig {
  kind:        AdapterKind;
  url:         string;
  authToken?:  string;
  // HTTP polling-only
  intervalMs?: number;
  method?:     'GET' | 'POST';
  body?:       string;       // raw JSON the user typed
  // SSE / WS optional
  headers?:    Record<string, string>;
}

export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface LlmConfig {
  /** Provider — drives request body shape and default endpoint. */
  provider:    LlmProvider;
  /** Endpoint URL. Optional — each provider has a sane default. */
  endpoint?:   string;
  /** API key. NEVER logged. NEVER sent anywhere except the endpoint. */
  apiKey:      string;
  /** Model name as the provider expects it, e.g. "gpt-4o-mini", "claude-3-5-sonnet-latest", "gemini-1.5-pro", "llama3:latest" */
  model:       string;
  /** System / instruction prompt — appears once at the top of every conversation */
  systemPrompt?: string;
  /** When true, the latest row sample is injected into the system prompt for context */
  includeData?: boolean;
}

export interface SavedPrompt {
  id:        string;
  label:     string;
  template:  string;
  createdAt: number;
}

// ─── Generic get/set with JSON safety ────────────────────────────────────────

function readKey<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeKey(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
  } catch {
    // quota exceeded or storage disabled — silently drop, the UI keeps in-memory state
  }
}

function deleteKey(key: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(KEY_PREFIX + key); } catch {}
}

// ─── Typed accessors ─────────────────────────────────────────────────────────

export const storage = {
  // API connection config
  getApiConfig: (): ApiConfig | null     => readKey<ApiConfig | null>('api', null),
  setApiConfig: (cfg: ApiConfig): void   => writeKey('api', cfg),
  clearApiConfig: ():            void    => deleteKey('api'),

  // LLM config
  getLlmConfig: (): LlmConfig | null     => readKey<LlmConfig | null>('llm', null),
  setLlmConfig: (cfg: LlmConfig): void   => writeKey('llm', cfg),
  clearLlmConfig: ():            void    => deleteKey('llm'),

  // Saved prompt templates
  getPrompts:  (): SavedPrompt[]         => readKey<SavedPrompt[]>('prompts', []),
  setPrompts:  (list: SavedPrompt[]): void => writeKey('prompts', list),
  addPrompt:   (p: SavedPrompt): void => {
    const list = readKey<SavedPrompt[]>('prompts', []);
    list.push(p);
    writeKey('prompts', list);
  },
  removePrompt: (id: string): void => {
    const list = readKey<SavedPrompt[]>('prompts', []).filter((p) => p.id !== id);
    writeKey('prompts', list);
  },

  // Nuke everything (settings panel "Clear local data" button)
  clearAll: (): void => {
    if (typeof window === 'undefined') return;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  },
};
