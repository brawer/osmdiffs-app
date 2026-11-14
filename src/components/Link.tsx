// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// An in-app link: a real <a href> (so it can be opened in a new tab or
// copied), which navigates without a page load on a plain click.

import type { MouseEvent, ReactNode } from 'react';
import { routeToUrl, type Route } from '../lib/route.ts';
import { getRoute, navigate } from '../lib/useRoute.ts';

interface LinkProps {
  // The route to go to, built from the current one; keeps the camera
  // unless the builder drops it.
  to: (current: Route) => Route;
  className?: string;
  onNavigate?: () => void;
  children: ReactNode;
}

export default function Link({ to, className, onNavigate, children }: LinkProps) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to(getRoute()));
    onNavigate?.();
  };
  return (
    <a href={routeToUrl(to(getRoute()))} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
