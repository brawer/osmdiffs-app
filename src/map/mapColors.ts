// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The colours MapLibre paints with. Paint properties can't read CSS
// variables, so these are read from theme.css (light or dark, whichever
// applies now) and the map is restyled when the system switches.

import { cssVar } from '../lib/theme.ts';
import type { KnownRelation } from '../lib/data/conflatedTiles.ts';
import { BASEMAP_FALLBACK, currentBasemapColors, type BasemapColors } from './basemapStyle.ts';

export interface MapColors {
  basemap: BasemapColors;
  relation: Record<KnownRelation | 'other', string>;
  // The connector between an AllThePlaces point and its OSM shape.
  link: string;
  // Thin ring around dots, so overlapping ones stay apart.
  halo: string;
  // The ring around the selected item.
  selection: string;
}

// Light-theme fallbacks, for when theme.css hasn't been applied (tests).
const FALLBACK = {
  same: '#3d6f96',
  missing: '#8c3f5c',
  locatedIn: '#e2823f',
  other: '#6a6454',
  ink: '#242019',
};

export function currentMapColors(): MapColors {
  const get = (name: `--${string}`, fallback: string) => cssVar(name) || fallback;
  const basemap = currentBasemapColors();
  return {
    basemap,
    relation: {
      same: get('--rel-same', FALLBACK.same),
      missing_in_osm: get('--rel-missing', FALLBACK.missing),
      located_in: get('--rel-located-in', FALLBACK.locatedIn),
      other: get('--rel-other', FALLBACK.other),
    },
    link: get('--ink-faint', FALLBACK.other),
    halo: basemap.land,
    selection: get('--ink', FALLBACK.ink),
  };
}

export function fallbackMapColors(): MapColors {
  return {
    basemap: BASEMAP_FALLBACK,
    relation: {
      same: FALLBACK.same,
      missing_in_osm: FALLBACK.missing,
      located_in: FALLBACK.locatedIn,
      other: FALLBACK.other,
    },
    link: FALLBACK.other,
    halo: BASEMAP_FALLBACK.land,
    selection: FALLBACK.ink,
  };
}
