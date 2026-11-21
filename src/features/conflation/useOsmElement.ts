// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The selected OpenStreetMap object as it is now, from the OpenStreetMap
// API, for the OpenStreetMap side of the detail panel (osmdiffs-app#45).

import { useEffect, useState } from 'react';
import { lookupElement, type OsmLookup } from '../../lib/data/osmApi.ts';
import type { OsmType, Selection } from '../../lib/route.ts';

export type OsmElementState = { status: 'idle' } | { status: 'loading' } | OsmLookup | { status: 'error' };

// Only an OpenStreetMap selection, a matched row or a deletion candidate,
// is looked up. A located_in row's OpenStreetMap object is its host,
// whose tags the panel doesn't compare.
export function useOsmElement(selection: Selection | undefined): OsmElementState {
  const key = selection?.kind === 'osm' ? `${selection.type}/${selection.id}` : '';
  const [result, setResult] = useState<{ key: string; state: OsmElementState } | null>(null);

  useEffect(() => {
    if (!key) return;
    const [type, id] = key.split('/') as [OsmType, string];
    let stale = false;
    lookupElement(type, Number(id)).then(
      (state) => {
        if (!stale) setResult({ key, state });
      },
      (err: unknown) => {
        console.error('Failed to fetch from the OpenStreetMap API:', err);
        if (!stale) setResult({ key, state: { status: 'error' } });
      },
    );
    return () => {
      stale = true;
    };
  }, [key]);

  if (!key) return { status: 'idle' };
  if (result && result.key === key) return result.state;
  return { status: 'loading' };
}
