// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Draws conflated.pmtiles: at z0–12 one dot (or small shape) per row,
// coloured by its relation and a little larger the more important it is;
// from z13 on, the AllThePlaces point, the OpenStreetMap shape as an outline,
// and a faint line between the two. The detail tiles stop at z14 (z16
// before brawer/osmdiffs#956), and MapLibre overzooms them beyond that.
//
// A deletion candidate has only an OpenStreetMap side, so from z13 on it
// is just that shape: an outline, or a ring for a node, in its own colour
// and with no AllThePlaces dot. Below z13 its dot is a ring as well, so it
// stands apart from the filled dots of AllThePlaces places, and is drawn
// on top of them: there are far fewer of them, and the ring lets what is
// underneath show through. It has no spider either, so a map
// filtered to one spider leaves it out.
//
// A map filtered to one spider can't use the overview below z9: the
// tiles there are thinned for all spiders alike, so one spider keeps only
// a few of its dots. Up to z8 such a map draws the spider's
// `spider_cells` instead, one bubble per grid cell, sized by how many
// places are in it. The bubble nests one disc per relation, each by
// area: matched outermost, then located_in, and the places missing from
// OpenStreetMap at its core, so its colours read as the cell's mix.

import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  SourceSpecification,
} from 'maplibre-gl';
import {
  DELETION_LAYER,
  DETAIL_ZOOM,
  KNOWN_RELATIONS,
  MATCHED_LAYER,
  SOURCE_LAYERS,
  SPIDER_CELL_RELATIONS,
  SPIDER_CELLS_END_ZOOM,
  SPIDER_CELLS_LAYER,
  type KnownRelation,
} from '../../lib/data/conflatedTiles.ts';
import type { Selection } from '../../lib/route.ts';
import type { CameraCorrection } from './cameraCorrection.ts';
import type { MapColors } from '../../map/mapColors.ts';
import type { Overlay } from '../../map/overlay.ts';

export const SOURCE_ID = 'conflated';
const SELECTION_SOURCE_ID = 'selection';
const CORRECTION_SOURCE_ID = 'camera-correction';

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
  // For a selected place whose position looks copied from Google Maps:
  // a line from where AllThePlaces put it to where it is, or may be.
  correction?: CameraCorrection | undefined;
}

// The correction's line, and a ring at whichever end the map doesn't
// draw already: the published spot of a moved place, or the guessed spot
// of an unmatched one.
function correctionFeatures(correction: CameraCorrection | undefined, relation: string | undefined) {
  if (!correction || relation === undefined) return [];
  const { kind, published, corrected } = correction;
  const properties = { relation, kind };
  return [
    {
      type: 'Feature' as const,
      properties,
      geometry: { type: 'LineString' as const, coordinates: [published, corrected] },
    },
    {
      type: 'Feature' as const,
      properties,
      geometry: { type: 'Point' as const, coordinates: kind === 'moved' ? published : corrected },
    },
  ];
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

// A spider filter also hides every deletion candidate, which has no
// spider: the overview carries no tags to tell its brand by.
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
  const ring = sourceLayer === DELETION_LAYER;
  // For one spider, its cells stand in for the thinned overview.
  const overview = { ...base, maxzoom: DETAIL_ZOOM, ...(options.spider === undefined ? {} : { minzoom: SPIDER_CELLS_END_ZOOM }) };
  return [
    // Overview, z0–12.
    {
      ...overview,
      id: id('overview-fill'),
      type: 'fill',
      filter: all(isPolygon),
      paint: { 'fill-color': color, 'fill-opacity': big ? 0.5 : 0.35 },
    },
    {
      ...overview,
      id: id('overview-line'),
      type: 'line',
      filter: all(['any', isLine, isPolygon]),
      paint: { 'line-color': color, 'line-width': big ? 2 : 1 },
    },
    {
      ...overview,
      id: id('overview-dot'),
      type: 'circle',
      filter: all(isPoint),
      paint: ring
        ? {
            'circle-color': colors.halo,
            'circle-radius': overviewRadius(big ? 3 : 0.4),
            'circle-stroke-color': color,
            'circle-stroke-width': big ? 2.5 : 1.4,
          }
        : {
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

type CellRelation = (typeof SPIDER_CELL_RELATIONS)[number];

// The bubbles' discs, outermost first: each counts its own relation and
// every one inside it, so its ring shows how many of that relation there
// are. Relations the legend has switched off count as none.
const CELL_DISCS: readonly CellRelation[] = ['same', 'located_in', 'missing_in_osm'];

function cellCount(relations: readonly CellRelation[], hidden: ReadonlySet<KnownRelation>): ExpressionSpecification {
  const shown = relations.filter((r) => !hidden.has(r));
  if (shown.length === 0) return ['literal', 0] as unknown as ExpressionSpecification;
  return ['+', 0, ...shown.map((r) => ['to-number', ['get', r], 0])] as unknown as ExpressionSpecification;
}

// A disc's radius for a count, so that its area grows with the count: as
// big as an overview dot for one place, and a little narrower than its
// cell (64 px at the cell's own zoom) for a thousand.
export function cellRadius(count: ExpressionSpecification): ExpressionSpecification {
  return ['interpolate', ['linear'], ['sqrt', count], 0, 0, 1, 2.5, 32, 26] as ExpressionSpecification;
}

export const SPIDER_CELL_LAYER_IDS = CELL_DISCS.map((r) => `${SPIDER_CELLS_LAYER}-${r}`);

function spiderCellLayers(options: ConflationOptions, colors: MapColors, mode: Mode): LayerSpecification[] {
  const spider = options.spider;
  if (spider === undefined) return [];
  const relation = mode === 'dimmed' ? colors.dimmed.relation : colors.relation;
  return CELL_DISCS.map((r, i) => {
    const count = cellCount(CELL_DISCS.slice(i), options.hidden);
    return {
      id: SPIDER_CELL_LAYER_IDS[i]!,
      type: 'circle',
      source: SOURCE_ID,
      'source-layer': SPIDER_CELLS_LAYER,
      maxzoom: SPIDER_CELLS_END_ZOOM,
      filter: ['all', ['==', ['get', 'spider'], spider], ['>', count, 0]] as FilterSpecification,
      paint: {
        'circle-color': relation[r],
        'circle-radius': cellRadius(count),
        // A halo around the whole bubble, and a hairline between its discs.
        'circle-stroke-color': colors.halo,
        'circle-stroke-width': i === 0 ? 1 : 0.5,
      },
    } satisfies LayerSpecification;
  });
}

// Which tile features belong to the selected rows, if the tiles can tell.
// A matched OpenStreetMap object or a deletion candidate is known by its
// ID at every zoom (not a located_in row, which carries its host's ID). In the detail
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
      ['in', ['get', 'relation'], ['literal', ['same', 'deletion_candidate']]],
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
    [CORRECTION_SOURCE_ID]: {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: correctionFeatures(options.correction, relation) },
    },
  };
  const mode: Mode = selection ? 'dimmed' : 'normal';
  const only = selectedFilter(options);
  return {
    sources,
    interactiveLayerIds: options.spider === undefined ? INTERACTIVE_LAYER_IDS : [...INTERACTIVE_LAYER_IDS, ...SPIDER_CELL_LAYER_IDS],
    layers: (colors) => [
      // A spider's cells, under the rest: they only overlap the selected
      // place's own layers, which belong on top.
      ...spiderCellLayers(options, colors, mode),
      // Matched rows at the bottom and unmatched ones on top, since places
      // missing from OpenStreetMap are what a mapper looks for; deletion
      // candidates, drawn as rings, above both.
      ...layersFor(MATCHED_LAYER, options, colors, mode),
      ...SOURCE_LAYERS.filter((l) => l !== MATCHED_LAYER).flatMap((l) => layersFor(l, options, colors, mode)),
      ...(only ? SOURCE_LAYERS.flatMap((l) => layersFor(l, options, colors, 'selected', only)) : []),
      // Some 165 m: from z12 on, it is long enough to see.
      {
        id: 'camera-correction-line',
        type: 'line',
        source: CORRECTION_SOURCE_ID,
        minzoom: DETAIL_ZOOM - 1,
        filter: isLine as FilterSpecification,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': relationColor(colors.relation), 'line-width': 2, 'line-dasharray': [0.5, 2] },
      },
      {
        id: 'camera-correction-ring',
        type: 'circle',
        source: CORRECTION_SOURCE_ID,
        minzoom: DETAIL_ZOOM - 1,
        filter: isPoint as FilterSpecification,
        paint: {
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], DETAIL_ZOOM - 1, 4, 16, 7],
          'circle-stroke-color': relationColor(colors.relation),
          'circle-stroke-width': 2,
        },
      },
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
