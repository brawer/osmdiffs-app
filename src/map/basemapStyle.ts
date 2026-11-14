// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The basemap is background, nothing more: land, water, parks, roads,
// buildings and a few labels, painted in the faint paper tones of
// theme.css (--map-*), so that the OSMDiffs data drawn on top of it is the
// one saturated thing on screen.
//
// Rather than fetching OpenFreeMap's "liberty" style and trimming it, as
// osmviews-app does, this builds a small style of its own against the same
// OpenFreeMap vector tiles (OpenMapTiles schema,
// https://openmaptiles.org/schema/). Liberty colors every road class, POI
// and land-use type; recoloring all of that would mean an allowlist of
// dozens of layer IDs that breaks whenever OpenFreeMap renames one. A
// dozen layers of our own are easier to keep quiet. No POI icons, no
// shields, no hillshade: they'd compete with our own points.

import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { cssVar } from '../lib/theme.ts';

const OPENFREEMAP_TILES = 'https://tiles.openfreemap.org/planet';
const OPENFREEMAP_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

// Labels are set in Karla, the app's own font, wherever it has the
// glyphs, and in OpenFreeMap's Noto Sans for everything else. MapLibre
// draws a character from the style's `font-faces` files when one covers
// it, and otherwise falls back to the glyph server's pre-rendered Noto.
// The names stay "Noto Sans Regular" and "Noto Sans Italic" because those
// are the font stacks the fallback requests from OpenFreeMap. Water
// names are italic, as on most maps.
//
// Karla covers only the Latin script: Google Fonts cuts it into a
// "latin" and a "latin-ext" subset, and we self-host both (public/fonts/),
// so that names such as "Česko" or "Łódź" don't switch fonts mid-word.
// Cyrillic, Greek, CJK and the rest come from Noto. The upright "latin"
// file is the one the page uses too, so the browser loads it once for
// both; the other three are for the map only. Ranges are from Google
// Fonts' @font-face rules (fonts.googleapis.com/css2?family=Karla:ital,
// wght@0,200..800;1,200..800).
const FONT = ['Noto Sans Regular'];
const FONT_ITALIC = ['Noto Sans Italic'];
const LATIN = [
  'U+0000-00FF',
  'U+0131',
  'U+0152-0153',
  'U+02BB-02BC',
  'U+02C6',
  'U+02DA',
  'U+02DC',
  'U+0304',
  'U+0308',
  'U+0329',
  'U+2000-206F',
  'U+20AC',
  'U+2122',
  'U+2191',
  'U+2193',
  'U+2212',
  'U+2215',
  'U+FEFF',
  'U+FFFD',
];
const LATIN_EXT = [
  'U+0100-02BA',
  'U+02BD-02C5',
  'U+02C7-02CC',
  'U+02CE-02D7',
  'U+02DD-02FF',
  'U+0304',
  'U+0308',
  'U+0329',
  'U+1D00-1DBF',
  'U+1E00-1E9F',
  'U+1EF2-1EFF',
  'U+2020',
  'U+20A0-20AB',
  'U+20AD-20C4',
  'U+2113',
  'U+2C60-2C7F',
  'U+A720-A7FF',
];

function karlaFaces(origin: string, italic: boolean) {
  const prefix = italic ? '/fonts/karla-italic-' : '/fonts/karla-';
  return [
    { url: new URL(`${prefix}latin-variable.woff2`, origin).href, 'unicode-range': LATIN },
    { url: new URL(`${prefix}latin-ext-variable.woff2`, origin).href, 'unicode-range': LATIN_EXT },
  ];
}

export interface BasemapColors {
  land: string;
  water: string;
  park: string;
  road: string;
  roadCasing: string;
  building: string;
  boundary: string;
  label: string;
  labelHalo: string;
}

// Light-theme fallbacks, for when theme.css hasn't been applied (tests).
export const BASEMAP_FALLBACK: BasemapColors = {
  land: '#f4f2ec',
  water: '#dfe3e3',
  park: '#ecede3',
  road: '#ffffff',
  roadCasing: '#e4e0d6',
  building: '#e9e5dc',
  boundary: '#c9c3b4',
  label: '#6a6454',
  labelHalo: '#f4f2ec',
};

export function currentBasemapColors(): BasemapColors {
  const get = (name: `--${string}`, fallback: string) => cssVar(name) || fallback;
  return {
    land: get('--map-land', BASEMAP_FALLBACK.land),
    water: get('--map-water', BASEMAP_FALLBACK.water),
    park: get('--map-park', BASEMAP_FALLBACK.park),
    road: get('--map-road', BASEMAP_FALLBACK.road),
    roadCasing: get('--map-road-casing', BASEMAP_FALLBACK.roadCasing),
    building: get('--map-building', BASEMAP_FALLBACK.building),
    boundary: get('--map-boundary', BASEMAP_FALLBACK.boundary),
    label: get('--map-label', BASEMAP_FALLBACK.label),
    labelHalo: get('--map-label-halo', BASEMAP_FALLBACK.labelHalo),
  };
}

// Local names, preferring a Latin-script one where OpenMapTiles has it.
const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:latin'], ['get', 'name']];

const MAJOR_ROADS: ExpressionSpecification = ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false];
const MINOR_ROADS: ExpressionSpecification = [
  'match',
  ['get', 'class'],
  ['secondary', 'tertiary', 'minor', 'service'],
  true,
  false,
];

// Road widths in pixels by zoom, as [zoom, width] stops; thin, so roads
// read as texture. A casing is the same line, `extra` pixels wider: MapLibre
// only allows ["zoom"] at the top of an interpolation, so the casing can't
// be written as ["+", width, extra] and gets its own stops instead.
const MAJOR_STOPS: [number, number][] = [
  [6, 0.5],
  [12, 2],
  [18, 14],
];
const MINOR_STOPS: [number, number][] = [
  [11, 0.5],
  [14, 1.5],
  [18, 10],
];

function roadWidth(stops: [number, number][], extra = 0): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flatMap(([z, w]) => [z, w + extra])];
}

// `origin` resolves the self-hosted fonts' URLs; MapLibre fetches font
// files itself and needs absolute ones.
export function basemapStyle(c: BasemapColors = BASEMAP_FALLBACK, origin = 'https://osmdiffs.brawer.ch'): StyleSpecification {
  return {
    version: 8,
    glyphs: OPENFREEMAP_GLYPHS,
    'font-faces': {
      [FONT[0]!]: karlaFaces(origin, false),
      [FONT_ITALIC[0]!]: karlaFaces(origin, true),
    },
    sources: {
      openmaptiles: { type: 'vector', url: OPENFREEMAP_TILES },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': c.land } },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': c.park },
      },
      {
        id: 'landcover-green',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['wood', 'grass'], true, false],
        paint: { 'fill-color': c.park, 'fill-opacity': 0.7 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': c.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        minzoom: 8,
        paint: { 'line-color': c.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 16, 3] },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: { 'fill-color': c.building },
      },
      {
        id: 'road-minor-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: MINOR_ROADS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.roadCasing, 'line-width': roadWidth(MINOR_STOPS, 1.5) },
      },
      {
        id: 'road-major-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 6,
        filter: MAJOR_ROADS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.roadCasing, 'line-width': roadWidth(MAJOR_STOPS, 1.5) },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: MINOR_ROADS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.road, 'line-width': roadWidth(MINOR_STOPS) },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 6,
        filter: MAJOR_ROADS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.road, 'line-width': roadWidth(MAJOR_STOPS) },
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': c.boundary, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 10, 1.5] },
      },
      {
        id: 'boundary-state',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        minzoom: 4,
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': c.boundary, 'line-width': 0.6, 'line-dasharray': [3, 2] },
      },
      {
        id: 'water-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        layout: { 'text-field': NAME, 'text-font': FONT_ITALIC, 'text-size': 12 },
        paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': 1 },
      },
      {
        id: 'road-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 15,
        layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 11, 'symbol-placement': 'line' },
        paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': 1 },
      },
      {
        id: 'place-minor',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 10,
        filter: ['match', ['get', 'class'], ['village', 'suburb', 'hamlet', 'neighbourhood'], true, false],
        layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 11 },
        paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.2 },
      },
      {
        id: 'place-city',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 4,
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
        layout: {
          'text-field': NAME,
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 12, 15],
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.2 },
      },
      {
        id: 'place-country',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        maxzoom: 8,
        filter: ['==', ['get', 'class'], 'country'],
        layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 12, 'text-transform': 'uppercase' },
        paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.2 },
      },
    ],
  };
}
