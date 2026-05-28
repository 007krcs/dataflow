/**
 * TkxThemeBridge — wraps tekivex-ui's ThemeProvider and bridges the library's
 * `ThemeTokens` into our existing CSS variable scheme (--bg, --text, --accent,
 * --red-bg, --shadow, …) so every component that uses `var(--*)` keeps
 * working through the Wave 1 refactor.
 *
 * As subsequent waves swap inline styles to TkxCard/TkxButton/TkxInput primitives
 * (which read tekivex-ui's tokens natively), the bridged CSS variables become
 * progressively unused — but they stay correct until the migration is done.
 *
 * Mode (light/dark) is held in state here so a toggle button anywhere in the
 * tree can flip it. Persisted in localStorage at `df-theme`. Defaults to light.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, useTheme as useTkxTheme, auroraLight, quantumDark } from 'tekivex-ui';
import type { ThemeTokens } from 'tekivex-ui';

// ─── Mode controller ─────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'df-theme';

interface ModeCtx {
  mode:   ThemeMode;
  toggle: () => void;
  set:    (m: ThemeMode) => void;
}

const ModeContext = createContext<ModeCtx | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch { return 'light'; }
}

function writeStoredMode(m: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, m); } catch {}
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function TkxThemeBridge({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);

  const set = useCallback((m: ThemeMode) => {
    setMode(m);
    writeStoredMode(m);
    if (typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = m;
    }
  }, []);

  const toggle = useCallback(() => {
    set(mode === 'light' ? 'dark' : 'light');
  }, [mode, set]);

  // First-mount: apply color-scheme + cross-tab sync
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = mode;
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setMode(e.newValue === 'dark' ? 'dark' : 'light');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mode]);

  const ctxValue = useMemo(() => ({ mode, toggle, set }), [mode, toggle, set]);

  return (
    <ModeContext.Provider value={ctxValue}>
      <ThemeProvider
        lightTheme={auroraLight}
        darkTheme={quantumDark}
        mode={mode}
        defaultMode="light"
      >
        <CssVariableBridge />
        {children}
      </ThemeProvider>
    </ModeContext.Provider>
  );
}

// ─── Mode access hook (for toggle button) ────────────────────────────────────

export function useThemeMode(): ModeCtx {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useThemeMode must be used inside <TkxThemeBridge>');
  return ctx;
}

// ─── CSS variable bridge ─────────────────────────────────────────────────────
// Reads tekivex-ui's resolved theme tokens and writes them to :root as the
// CSS custom properties the rest of our app expects. Re-runs whenever the
// theme changes.

function CssVariableBridge() {
  const tkx = useTkxTheme();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const r = document.documentElement.style;
    applyVars(r, tkx);
  }, [tkx]);
  return null;
}

function applyVars(r: CSSStyleDeclaration, t: ThemeTokens): void {
  // Surfaces — map tekivex-ui's 3-tier surface to our 3-tier bg
  r.setProperty('--bg',     t.bg);
  r.setProperty('--bg-2',   t.surface);
  r.setProperty('--bg-3',   t.surfaceAlt);

  // Strokes — derive a slightly stronger border from theirs
  r.setProperty('--border',   t.border);
  r.setProperty('--border-2', mix(t.border, t.text, 0.30));

  // Text
  r.setProperty('--text',   t.text);
  r.setProperty('--text-2', t.textMuted);
  r.setProperty('--text-3', mix(t.textMuted, t.bg, 0.45));

  // Brand + status — translucent backgrounds derived via color-mix at use sites
  setColorPair(r, '--accent', '--accent-bg', '--accent-border', t.primary);
  setColorPair(r, '--green',  '--green-bg',  '--green-border',  t.success);
  setColorPair(r, '--yellow', '--yellow-bg', '--yellow-border', t.warning);
  setColorPair(r, '--red',    '--red-bg',    '--red-border',    t.danger);

  // Secondary brand
  r.setProperty('--accent-2', mix(t.primary, t.text, 0.20));

  // Flash colours for cell change animations
  r.setProperty('--flash-up',   `color-mix(in srgb, ${t.success} 18%, transparent)`);
  r.setProperty('--flash-down', `color-mix(in srgb, ${t.danger}  18%, transparent)`);

  // Shadows — tekivex-ui exports `shadows` separately. Until we wire those up
  // explicitly, our existing shadow tokens stay in styles.css and still work
  // for both themes via media-query baselines.
}

function setColorPair(r: CSSStyleDeclaration, baseVar: string, bgVar: string, borderVar: string, color: string) {
  r.setProperty(baseVar,   color);
  r.setProperty(bgVar,     `color-mix(in srgb, ${color} 10%, transparent)`);
  r.setProperty(borderVar, `color-mix(in srgb, ${color} 26%, transparent)`);
}

/** Lightweight color-mix wrapper for non-keyword values. */
function mix(a: string, b: string, ratio: number): string {
  const pct = Math.round(ratio * 100);
  return `color-mix(in srgb, ${a} ${100 - pct}%, ${b} ${pct}%)`;
}
