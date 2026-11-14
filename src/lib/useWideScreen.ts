// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from 'react';

// From this width up, the side panel is a column beside the map rather
// than a bottom sheet over it. Keep in sync with the media queries in
// app.css.
export const WIDE_QUERY = '(min-width: 900px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(WIDE_QUERY);
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isWide(): boolean {
  return window.matchMedia?.(WIDE_QUERY).matches ?? window.innerWidth >= 900;
}

export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, isWide);
}
