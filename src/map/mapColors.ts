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
  // While something is selected, everything else is drawn in these:
  // the same colours, mostly faded into the land, so the selected place
  // stands out but the map still reads.
  dimmed: {
    relation: Record<KnownRelation | 'other', string>;
    link: string;
  };
}

// How much of its own colour a dimmed feature keeps; the rest is land.
const DIMMED_STRENGTH = 0.3;

function hexToRgb(hex: string): [number, number, number] | undefined {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return undefined;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

// `color` blended into `background`, keeping `strength` of `color`.
// Mixing, rather than lowering the opacity, keeps overlapping dots from
// adding up to dark clumps.
export function fade(color: string, background: string, strength = DIMMED_STRENGTH): string {
  const a = hexToRgb(color);
  const b = hexToRgb(background);
  if (!a || !b) return color;
  const mixed = a.map((v, i) => Math.round(v * strength + b[i]! * (1 - strength)));
  return '#' + mixed.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function withDimmed(colors: Omit<MapColors, 'dimmed'>): MapColors {
  const land = colors.basemap.land;
  const relation = Object.fromEntries(
    Object.entries(colors.relation).map(([k, v]) => [k, fade(v, land)]),
  ) as MapColors['relation'];
  return { ...colors, dimmed: { relation, link: fade(colors.link, land) } };
}

// Light-theme fallbacks, for when theme.css hasn't been applied (tests).
const FALLBACK = {
  same: '#3d6f96',
  missing: '#8c3f5c',
  locatedIn: '#e2823f',
  other: '#6a6454',
};

export function currentMapColors(): MapColors {
  const get = (name: `--${string}`, fallback: string) => cssVar(name) || fallback;
  const basemap = currentBasemapColors();
  return withDimmed({
    basemap,
    relation: {
      same: get('--rel-same', FALLBACK.same),
      missing_in_osm: get('--rel-missing', FALLBACK.missing),
      located_in: get('--rel-located-in', FALLBACK.locatedIn),
      other: get('--rel-other', FALLBACK.other),
    },
    link: get('--ink-faint', FALLBACK.other),
    halo: basemap.land,
  });
}

export function fallbackMapColors(): MapColors {
  return withDimmed({
    basemap: BASEMAP_FALLBACK,
    relation: {
      same: FALLBACK.same,
      missing_in_osm: FALLBACK.missing,
      located_in: FALLBACK.locatedIn,
      other: FALLBACK.other,
    },
    link: FALLBACK.other,
    halo: BASEMAP_FALLBACK.land,
  });
}
