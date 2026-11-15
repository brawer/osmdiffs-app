// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Draws conflated.pmtiles: at z0–12 one dot (or small shape) per row,
// coloured by its relation and a little larger the more important it is;
// from z13 on, the AllThePlaces point, the OpenStreetMap shape as an outline,
// and a faint line between the two. The detail tiles stop at z14 (z16
// before brawer/osmdiffs#956), and MapLibre overzooms them beyond that.

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
  // The selected row's relation, and the fids of its rows, once known.
  selectedRelation?: string | undefined;
  selectedFids?: readonly number[] | undefined;
  // How important the selected row is, which sets its dot's size.
  selectedImportance?: number | undefined;
  // Draws only this spider's features, for its spider page.
  spider?: string | undefined;
}

function relationColor(relation: MapColors['relation']): ExpressionSpecification {
  return [
    'match',
    ['get', 'relation'],
    ...KNOWN_RELATIONS.flatMap((r) => [r, relation[r]]),
    relation.other,
  ] as unknown as ExpressionSpecification;
}

const isPoint: ExpressionSpecification = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
const isLine: ExpressionSpecification = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const isPolygon: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
const isOsmShape: ExpressionSpecification = ['match', ['get', 'part'], ['osm', 'host'], true, false];

function visible(hidden: ReadonlySet<KnownRelation>, spider: string | undefined): ExpressionSpecification {
  const relation: ExpressionSpecification = ['!', ['in', ['get', 'relation'], ['literal', [...hidden]]]];
  return spider === undefined ? relation : ['all', relation, ['==', ['get', 'spider'], spider]];
}

// Dots grow with zoom, and the most important rows a little more.
const OVERVIEW_RADIUS_STOPS = [
  [0, 1.2, 1.3],
  [6, 1.8, 1.5],
  [12, 2.5, 1.5],
] as const;

function overviewRadiusStops(extra: number): (number | ExpressionSpecification)[] {
  return OVERVIEW_RADIUS_STOPS.flatMap(([zoom, base, scale]) => [
    zoom,
    ['+', base + extra, ['*', scale, ['to-number', ['get', 'importance'], 0]]] as ExpressionSpecification,
  ]);
}

function overviewRadius(extra: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], ...overviewRadiusStops(extra)] as ExpressionSpecification;
}

// How a set of layers is drawn. `normal` when nothing is selected;
// `dimmed` for everything while something is; `selected` redraws the
// selected row on top, in full colour and a little larger.
type Mode = 'normal' | 'dimmed' | 'selected';

function layersFor(
  sourceLayer: string,
  options: ConflationOptions,
  colors: MapColors,
  mode: Mode,
  only?: ExpressionSpecification,
): LayerSpecification[] {
  const color = relationColor(mode === 'dimmed' ? colors.dimmed.relation : colors.relation);
  const link = mode === 'dimmed' ? colors.dimmed.link : colors.link;
  const show = visible(options.hidden, options.spider);
  const base = { source: SOURCE_ID, 'source-layer': sourceLayer } as const;
  const id = (name: string) => (mode === 'selected' ? `selected-${sourceLayer}-${name}` : `${sourceLayer}-${name}`);
  const all = (...conditions: ExpressionSpecification[]): FilterSpecification =>
    ['all', show, ...(only ? [only] : []), ...conditions] as FilterSpecification;
  const big = mode === 'selected';
  return [
    // Overview, z0–12.
    {
      ...base,
      id: id('overview-fill'),
      type: 'fill',
      maxzoom: DETAIL_ZOOM,
      filter: all(isPolygon),
      paint: { 'fill-color': color, 'fill-opacity': big ? 0.5 : 0.35 },
    },
    {
      ...base,
      id: id('overview-line'),
      type: 'line',
      maxzoom: DETAIL_ZOOM,
      filter: all(['any', isLine, isPolygon]),
      paint: { 'line-color': color, 'line-width': big ? 2 : 1 },
    },
    {
      ...base,
      id: id('overview-dot'),
      type: 'circle',
      maxzoom: DETAIL_ZOOM,
      filter: all(isPoint),
      paint: {
        'circle-color': color,
        'circle-radius': overviewRadius(big ? 3 : 0),
        'circle-stroke-color': colors.halo,
        'circle-stroke-width': big ? 2 : 0.6,
      },
    },
    // Detail, from z13 on: the OpenStreetMap side first, so the AllThePlaces
    // point lands on top of it.
    {
      ...base,
      id: id('osm-fill'),
      type: 'fill',
      minzoom: DETAIL_ZOOM,
      filter: all(isOsmShape, isPolygon),
      paint: { 'fill-color': color, 'fill-opacity': big ? 0.25 : 0.12 },
    },
    {
      ...base,
      id: id('osm-line'),
      type: 'line',
      minzoom: DETAIL_ZOOM,
      filter: all(isOsmShape, ['any', isLine, isPolygon]),
      paint: { 'line-color': color, 'line-width': big ? 2.5 : 1.5 },
    },
    {
      ...base,
      id: id('link'),
      type: 'line',
      minzoom: DETAIL_ZOOM,
      filter: all(['==', ['get', 'part'], 'link']),
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': link, 'line-width': big ? 1.6 : 1.2, 'line-dasharray': [2, 2] },
    },
    // An OSM node: a ring, so it reads as "OpenStreetMap's", unlike the
    // filled AllThePlaces dot.
    {
      ...base,
      id: id('osm-node'),
      type: 'circle',
      minzoom: DETAIL_ZOOM,
      filter: all(isOsmShape, isPoint),
      paint: {
        'circle-color': 'rgba(0, 0, 0, 0)',
        'circle-radius': big ? 8 : 6,
        'circle-stroke-color': color,
        'circle-stroke-width': big ? 2.5 : 2,
      },
    },
    {
      ...base,
      id: id('atp'),
      type: 'circle',
      minzoom: DETAIL_ZOOM,
      filter: all(['==', ['get', 'part'], 'atp']),
      paint: {
        'circle-color': color,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, big ? 6 : 4, 16, big ? 8 : 6],
        'circle-stroke-color': colors.halo,
        'circle-stroke-width': big ? 1.5 : 1.2,
      },
    },
  ];
}

// Which tile features belong to the selected rows, if the tiles can tell.
// A matched OpenStreetMap object is known by its ID at every zoom (only
// on `same` rows: a located_in row carries its host's ID). In the detail
// tiles, though, only the OSM shape and link carry that ID; every part
// of a row carries its fid, known once the rows are looked up. Below the
// detail tiles, an AllThePlaces place is drawn from its position instead.
function selectedFilter(options: ConflationOptions): ExpressionSpecification | undefined {
  const selection = options.selection;
  const fids = options.selectedFids ?? [];
  const byFid: ExpressionSpecification | undefined =
    fids.length > 0 ? ['in', ['get', 'fid'], ['literal', [...fids]]] : undefined;
  if (selection?.kind === 'osm') {
    const byOsm: ExpressionSpecification = [
      'all',
      ['==', ['get', 'relation'], 'same'],
      ['==', ['get', 'osm:type'], selection.type],
      ['==', ['get', 'osm:id'], selection.id],
    ];
    return byFid ? ['any', byOsm, byFid] : byOsm;
  }
  return selection ? byFid : undefined;
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
  const selection = options.selection;
  // An AllThePlaces place, drawn from where it is: the overview tiles
  // can't single it out, and the detail tiles only once its fid is known.
  const position = selection?.kind === 'atp' ? options.selectedPosition : undefined;
  const relation = options.selectedRelation;
  const importance = options.selectedImportance ?? 0;
  const point =
    position && relation !== undefined && !options.hidden.has(relation as KnownRelation)
      ? [{ type: 'Feature' as const, properties: { relation, importance }, geometry: { type: 'Point' as const, coordinates: position } }]
      : [];
  const sources: Record<string, SourceSpecification> = {
    [SOURCE_ID]: { type: 'vector', url: options.sourceUrl },
    [SELECTION_SOURCE_ID]: { type: 'geojson', data: { type: 'FeatureCollection', features: point } },
  };
  const mode: Mode = selection ? 'dimmed' : 'normal';
  const only = selectedFilter(options);
  return {
    sources,
    interactiveLayerIds: INTERACTIVE_LAYER_IDS,
    layers: (colors) => [
      // Matched rows at the bottom and unmatched ones on top, since places
      // missing from OpenStreetMap are what a mapper looks for.
      ...layersFor(MATCHED_LAYER, options, colors, mode),
      ...SOURCE_LAYERS.filter((l) => l !== MATCHED_LAYER).flatMap((l) => layersFor(l, options, colors, mode)),
      ...(only ? SOURCE_LAYERS.flatMap((l) => layersFor(l, options, colors, 'selected', only)) : []),
      {
        id: 'selected-position',
        type: 'circle',
        source: SELECTION_SOURCE_ID,
        paint: {
          'circle-color': relationColor(colors.relation),
          // Like a selected dot of the overview, then of the detail.
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            ...overviewRadiusStops(3),
            DETAIL_ZOOM,
            6,
            16,
            8,
          ] as ExpressionSpecification,
          'circle-stroke-color': colors.halo,
          'circle-stroke-width': ['step', ['zoom'], 2, DETAIL_ZOOM, 1.5],
        },
      },
    ],
  };
}
