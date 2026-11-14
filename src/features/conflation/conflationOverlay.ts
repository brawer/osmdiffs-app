// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Draws conflated.pmtiles: at z0–12 one dot (or small shape) per row,
// coloured by its relation and a little larger the more important it is;
// at z13–16 the AllThePlaces point, the OpenStreetMap shape as an outline,
// and a faint line between the two.

import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  SourceSpecification,
} from 'maplibre-gl';
import {
  DETAIL_ZOOM,
  KNOWN_RELATIONS,
  MATCHED_LAYER,
  SOURCE_LAYERS,
  type KnownRelation,
} from '../../lib/data/conflatedTiles.ts';
import type { Selection } from '../../lib/route.ts';
import type { MapColors } from '../../map/mapColors.ts';
import type { Overlay } from '../../map/overlay.ts';

export const SOURCE_ID = 'conflated';
const SELECTION_SOURCE_ID = 'selection';

export interface ConflationOptions {
  // The `pmtiles://` URL of the archive.
  sourceUrl: string;
  // Relations the legend has switched off.
  hidden: ReadonlySet<KnownRelation>;
  selection: Selection | undefined;
  // Where the selected place is, as [lng, lat], once known.
  selectedPosition: [number, number] | undefined;
}

function relationColor(colors: MapColors): ExpressionSpecification {
  return [
    'match',
    ['get', 'relation'],
    ...KNOWN_RELATIONS.flatMap((r) => [r, colors.relation[r]]),
    colors.relation.other,
  ] as unknown as ExpressionSpecification;
}

const isPoint: ExpressionSpecification = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
const isLine: ExpressionSpecification = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const isPolygon: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const isOsmShape: ExpressionSpecification = ['match', ['get', 'part'], ['osm', 'host'], true, false];

function visible(hidden: ReadonlySet<KnownRelation>): ExpressionSpecification {
  return ['!', ['in', ['get', 'relation'], ['literal', [...hidden]]]];
}

// Dots grow with zoom, and the most important rows a little more.
const OVERVIEW_RADIUS: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  0,
  ['+', 1.2, ['*', 1.3, ['to-number', ['get', 'importance'], 0]]],
  6,
  ['+', 1.8, ['*', 1.5, ['to-number', ['get', 'importance'], 0]]],
  12,
  ['+', 2.5, ['*', 1.5, ['to-number', ['get', 'importance'], 0]]],
];

function layersFor(sourceLayer: string, options: ConflationOptions, colors: MapColors): LayerSpecification[] {
  const color = relationColor(colors);
  const show = visible(options.hidden);
  const base = { source: SOURCE_ID, 'source-layer': sourceLayer } as const;
  const all = (...conditions: ExpressionSpecification[]): FilterSpecification =>
    ['all', show, ...conditions] as FilterSpecification;
  return [
    // Overview, z0–12.
    {
      ...base,
      id: `${sourceLayer}-overview-fill`,
      type: 'fill',
      maxzoom: DETAIL_ZOOM,
      filter: all(isPolygon),
      paint: { 'fill-color': color, 'fill-opacity': 0.35 },
    },
    {
      ...base,
      id: `${sourceLayer}-overview-line`,
      type: 'line',
      maxzoom: DETAIL_ZOOM,
      filter: all(['any', isLine, isPolygon]),
      paint: { 'line-color': color, 'line-width': 1 },
    },
    {
      ...base,
      id: `${sourceLayer}-overview-dot`,
      type: 'circle',
      maxzoom: DETAIL_ZOOM,
      filter: all(isPoint),
      paint: {
        'circle-color': color,
        'circle-radius': OVERVIEW_RADIUS,
        'circle-stroke-color': colors.halo,
        'circle-stroke-width': 0.6,
      },
    },
    // Detail, z13–16: the OpenStreetMap side first, so the AllThePlaces
    // point lands on top of it.
    {
      ...base,
      id: `${sourceLayer}-osm-fill`,
      type: 'fill',
      minzoom: DETAIL_ZOOM,
      filter: all(isOsmShape, isPolygon),
      paint: { 'fill-color': color, 'fill-opacity': 0.12 },
    },
    {
      ...base,
      id: `${sourceLayer}-osm-line`,
      type: 'line',
      minzoom: DETAIL_ZOOM,
      filter: all(isOsmShape, ['any', isLine, isPolygon]),
      paint: { 'line-color': color, 'line-width': 1.5 },
    },
    {
      ...base,
      id: `${sourceLayer}-link`,
      type: 'line',
      minzoom: DETAIL_ZOOM,
      filter: all(['==', ['get', 'part'], 'link']),
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': colors.link, 'line-width': 1.2, 'line-dasharray': [2, 2] },
    },
    // An OSM node: a ring, so it reads as "OpenStreetMap's", unlike the
    // filled AllThePlaces dot.
    {
      ...base,
      id: `${sourceLayer}-osm-node`,
      type: 'circle',
      minzoom: DETAIL_ZOOM,
      filter: all(isOsmShape, isPoint),
      paint: {
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-radius': 6,
        'circle-stroke-color': color,
        'circle-stroke-width': 2,
      },
    },
    {
      ...base,
      id: `${sourceLayer}-atp`,
      type: 'circle',
      minzoom: DETAIL_ZOOM,
      filter: all(['==', ['get', 'part'], 'atp']),
      paint: {
        'circle-color': color,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 6],
        'circle-stroke-color': colors.halo,
        'circle-stroke-width': 1.2,
      },
    },
  ];
}

// Outlines the selected OpenStreetMap object wherever the tiles draw it.
function osmSelectionLayers(selection: Selection | undefined, colors: MapColors): LayerSpecification[] {
  const filter: ExpressionSpecification =
    selection?.kind === 'osm'
      ? ['all', ['==', ['get', 'osm:type'], selection.type], ['==', ['get', 'osm:id'], selection.id]]
      : ['literal', false];
  const notLink: ExpressionSpecification = ['!=', ['get', 'part'], 'link'];
  const base = { source: SOURCE_ID, 'source-layer': MATCHED_LAYER } as const;
  return [
    {
      ...base,
      id: 'selected-osm-line',
      type: 'line',
      filter: ['all', filter, notLink, ['any', isLine, isPolygon]] as FilterSpecification,
      paint: { 'line-color': colors.selection, 'line-width': 3 },
    },
    {
      ...base,
      id: 'selected-osm-node',
      type: 'circle',
      filter: ['all', filter, notLink, isPoint] as FilterSpecification,
      paint: {
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-radius': 9,
        'circle-stroke-color': colors.selection,
        'circle-stroke-width': 2.5,
      },
    },
  ];
}

export const INTERACTIVE_LAYER_IDS = SOURCE_LAYERS.flatMap((l) => [
  `${l}-overview-fill`,
  `${l}-overview-line`,
  `${l}-overview-dot`,
  `${l}-osm-fill`,
  `${l}-osm-line`,
  `${l}-osm-node`,
  `${l}-atp`,
]);

export function conflationOverlay(options: ConflationOptions): Overlay {
  const position = options.selectedPosition;
  const sources: Record<string, SourceSpecification> = {
    [SOURCE_ID]: { type: 'vector', url: options.sourceUrl },
    [SELECTION_SOURCE_ID]: {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: position ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: position } }] : [],
      },
    },
  };
  return {
    sources,
    interactiveLayerIds: INTERACTIVE_LAYER_IDS,
    layers: (colors) => [
      // Matched rows at the bottom and unmatched ones on top, since places
      // missing from OpenStreetMap are what a mapper looks for.
      ...layersFor(MATCHED_LAYER, options, colors),
      ...SOURCE_LAYERS.filter((l) => l !== MATCHED_LAYER).flatMap((l) => layersFor(l, options, colors)),
      ...osmSelectionLayers(options.selection, colors),
      {
        id: 'selected-position',
        type: 'circle',
        source: SELECTION_SOURCE_ID,
        paint: {
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-radius': 11,
          'circle-stroke-color': colors.selection,
          'circle-stroke-width': 2.5,
        },
      },
    ],
  };
}
