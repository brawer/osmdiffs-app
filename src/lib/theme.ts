// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Reads the design tokens from theme.css, so that code which can't use CSS
// (MapLibre paint properties, inline SVG data: URLs) stays in sync with the
// stylesheet and with the system's light or dark setting.

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(DARK_QUERY).matches ?? false);
}

// The current value of a custom property such as `--ink`, from :root.
export function cssVar(name: `--${string}`): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Calls onChange whenever the system switches between light and dark.
// Returns a function that stops listening.
export function onColorSchemeChange(onChange: () => void): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
