// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Click-to-enrich (osmdiffs-app#1): below z13 a rendered feature carries
// only a few facts, so the full record is looked up in the detail tiles
// around it. At z13 and above, the map has those tiles loaded already.

import * as maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useEffect, useRef, useState } from 'react';
import type { Position } from 'geojson';
import {
  ConflatedTiles,
  DETAIL_ZOOM,
  MATCHED_LAYER,
  SOURCE_LAYERS,
  findRecords,
  isAtSelection,
  isComplete,
  type ConflatedRecord,
  type Properties,
  type TileFeature,
} from '../../lib/data/conflatedTiles.ts';
import { selectionToString, type Selection } from '../../lib/route.ts';
import { INTERACTIVE_LAYER_IDS, SOURCE_ID } from './conflationOverlay.ts';

let protocol: Protocol | null = null;

// Opens an archive and makes it available to MapLibre as `pmtiles://`.
export function openConflatedTiles(url: string): ConflatedTiles {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }
  const tiles = new ConflatedTiles(url);
  protocol.add(tiles.archive);
  return tiles;
}

export type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; records: ConflatedRecord[] }
  | { status: 'unavailable' }
  | { status: 'error' };

// Records already looked up, per archive and selection, so that going
// back to an earlier selection, or the URL being corrected to a place's
// exact position, doesn't fetch again.
const cache = new WeakMap<ConflatedTiles, Map<string, ConflatedRecord[]>>();

export function rememberRecords(tiles: ConflatedTiles, selection: Selection, records: ConflatedRecord[]) {
  let byKey = cache.get(tiles);
  if (!byKey) cache.set(tiles, (byKey = new Map()));
  byKey.set(selectionToString(selection), records);
}

function remembered(tiles: ConflatedTiles, selection: Selection): ConflatedRecord[] | undefined {
  return cache.get(tiles)?.get(selectionToString(selection));
}

function osmFilter(selection: Selection & { kind: 'osm' }): maplibregl.FilterSpecification {
  return ['all', ['==', ['get', 'osm:type'], selection.type], ['==', ['get', 'osm:id'], selection.id]];
}

// A point on or in a geometry, good enough to centre a tile search on.
function representativePoint(geometry: GeoJSON.Geometry): Position | undefined {
  switch (geometry.type) {
    case 'Point':
      return geometry.coordinates;
    case 'LineString':
      return geometry.coordinates[Math.floor(geometry.coordinates.length / 2)];
    case 'Polygon':
      return geometry.coordinates[0]?.[0];
    case 'MultiPolygon':
      return geometry.coordinates[0]?.[0]?.[0];
    default:
      return undefined;
  }
}

function whenIdle(map: maplibregl.Map): Promise<void> {
  if (map.loaded() && map.areTilesLoaded()) return Promise.resolve();
  return new Promise((resolve) => map.once('idle', () => resolve()));
}

// Where on the map an OpenStreetMap selection is drawn, if it is in view.
// Used after a reload, when there was no click to say where.
async function findOnMap(map: maplibregl.Map, selection: Selection & { kind: 'osm' }): Promise<Position | undefined> {
  await whenIdle(map);
  const layers = INTERACTIVE_LAYER_IDS.filter((id) => map.getLayer(id));
  const [feature] = map.queryRenderedFeatures({ layers, filter: osmFilter(selection) });
  return feature ? representativePoint(feature.geometry) : undefined;
}

// At z13 and up the map's own tiles carry full tags: no fetch needed.
function featuresOnMap(map: maplibregl.Map, selection: Selection): TileFeature[] {
  if (map.getZoom() < DETAIL_ZOOM || !map.getSource(SOURCE_ID)) return [];
  const layers = selection.kind === 'osm' ? [MATCHED_LAYER] : SOURCE_LAYERS;
  const options = selection.kind === 'atp' ? { filter: ['==', ['get', 'spider'], selection.spider] } : {};
  return layers.flatMap((sourceLayer) =>
    map
      .querySourceFeatures(SOURCE_ID, { sourceLayer, ...options } as maplibregl.QuerySourceFeatureOptions)
      .map((f) => ({ layer: sourceLayer, properties: f.properties as Properties, geometry: () => f.geometry })),
  );
}

// The full records for a selection. `hint` is where the user clicked, if
// they did; it decides which tiles to search. For an AllThePlaces
// selection, `onExact` is told the place's exact position once known, so
// the URL can carry it and a shared link finds the same place again.
export function useConflatedDetail(
  tiles: ConflatedTiles | null,
  map: maplibregl.Map | null,
  selection: Selection | undefined,
  hint: Position | undefined,
  onExact?: (exact: Selection, records: ConflatedRecord[]) => void,
): DetailState {
  const [result, setResult] = useState<{ tiles: ConflatedTiles; key: string; state: DetailState } | null>(null);
  const key = selection ? selectionToString(selection) : '';
  const hintKey = hint ? hint.join(',') : '';
  const onExactRef = useRef(onExact);
  useEffect(() => {
    onExactRef.current = onExact;
  }, [onExact]);

  useEffect(() => {
    if (!selection || !tiles || remembered(tiles, selection)) return;
    // A later selection, or the component going away, makes this lookup
    // stale: it then finishes, but its result is dropped.
    let stale = false;
    const done = (state: DetailState) => {
      if (!stale) setResult({ tiles, key, state });
    };
    (async () => {
      // Without a click, as after opening a shared link, an AllThePlaces
      // selection carries the place's exact position. The map only holds
      // the tiles loaded so far, and their nearest point of that spider
      // can be another branch of the same chain (osmdiffs-app#18), so a
      // match is then only taken if it is right at that position.
      const exact = !hint && selection.kind === 'atp';
      let records = map ? findRecords(featuresOnMap(map, selection), selection) : [];
      if (exact) records = records.filter((r) => isAtSelection(r, selection));
      if (records.length === 0 || !records.every(isComplete)) {
        let near: Position | undefined = hint;
        if (!near && selection.kind === 'atp') near = [selection.lng, selection.lat];
        if (!near && map) near = await findOnMap(map, selection as Selection & { kind: 'osm' });
        if (!near && map) near = map.getCenter().toArray();
        if (near) {
          const found = await tiles.lookup(selection, near, { exact });
          if (found.length > 0) records = found;
        }
      }
      if (stale) return;
      if (records.length === 0) {
        done({ status: 'unavailable' });
        return;
      }
      rememberRecords(tiles, selection, records);
      done({ status: 'ready', records });
      const position = records[0]!.atpPosition;
      if (selection.kind === 'atp' && position) {
        const exact: Selection = { kind: 'atp', spider: selection.spider, lng: position[0]!, lat: position[1]! };
        if (selectionToString(exact) !== key) {
          rememberRecords(tiles, exact, records);
          onExactRef.current?.(exact, records);
        }
      }
    })().catch((err: unknown) => {
      console.error('Failed to look up details:', err);
      done({ status: 'error' });
    });
    return () => {
      stale = true;
    };
    // `selection` and `hint` are compared by value, through their keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles, map, key, hintKey]);

  if (!selection || !tiles) return { status: 'idle' };
  const known = remembered(tiles, selection);
  if (known) return { status: 'ready', records: known };
  if (result && result.tiles === tiles && result.key === key) return result.state;
  return { status: 'loading' };
}
