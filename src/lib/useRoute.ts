// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Keeps the current Route in sync with the browser's address bar, through
// the History API. Components read it with useRoute() and change it with
// navigate(); the back and forward buttons work as usual.

import { useSyncExternalStore } from 'react';
import { parseRoute, routeToUrl, type Route } from './route.ts';

const listeners = new Set<() => void>();
let current: Route = parseRoute(window.location.pathname, window.location.search);

function notify() {
  for (const listener of listeners) listener();
}

window.addEventListener('popstate', () => {
  current = parseRoute(window.location.pathname, window.location.search);
  notify();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRoute(): Route {
  return current;
}

// Goes to a new route. `replace` swaps the current history entry instead of
// adding one, for changes that shouldn't each take a press of the back
// button, such as the map camera following a pan.
export function navigate(route: Route, { replace = false }: { replace?: boolean } = {}): void {
  const url = routeToUrl(route);
  current = route;
  if (url !== window.location.pathname + window.location.search) {
    if (replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
  }
  notify();
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute);
}
