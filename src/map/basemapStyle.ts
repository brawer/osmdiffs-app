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
const FONT = ['Noto Sans Regular'];
const FONT_ITALIC = ['Noto Sans Italic'];

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
const FALLBACK: BasemapColors = {
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
    land: get('--map-land', FALLBACK.land),
    water: get('--map-water', FALLBACK.water),
    park: get('--map-park', FALLBACK.park),
    road: get('--map-road', FALLBACK.road),
    roadCasing: get('--map-road-casing', FALLBACK.roadCasing),
    building: get('--map-building', FALLBACK.building),
    boundary: get('--map-boundary', FALLBACK.boundary),
    label: get('--map-label', FALLBACK.label),
    labelHalo: get('--map-label-halo', FALLBACK.labelHalo),
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

export function basemapStyle(c: BasemapColors = FALLBACK): StyleSpecification {
  return {
    version: 8,
    glyphs: OPENFREEMAP_GLYPHS,
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
