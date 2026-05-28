/**
 * ThemeToggle — sun/moon button in the topbar.
 *
 * Reads the bridged mode context from TkxThemeBridge. The actual theme tokens
 * are owned by tekivex-ui's ThemeProvider; this button only flips a mode flag.
 */

import React from 'react';
import { useThemeMode } from '../theme/TkxThemeBridge.tsx';

export function ThemeToggle() {
  const { mode, toggle } = useThemeMode();
  const isLight = mode === 'light';
  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      {isLight ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
