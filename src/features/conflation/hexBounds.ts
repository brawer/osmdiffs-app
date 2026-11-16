// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import * as maplibregl from 'maplibre-gl';
import type { HexCounts } from '../../lib/data/conflatedTiles.ts';

// A hexagon the user clicked on, and where.
export interface ClickedHex {
  hex: HexCounts;
  sourceLayer: string;
  lngLat: [number, number];
}

// The cell's extent, from every piece of it in the loaded tiles: a cell
// across a tile edge comes in one piece per tile.
export function hexBounds(map: maplibregl.Map, sourceId: string, clicked: ClickedHex): maplibregl.LngLatBounds | undefined {
  const filter: maplibregl.FilterSpecification = clicked.hex.spider
    ? ['all', ['==', ['get', 'h3'], clicked.hex.h3], ['==', ['get', 'spider'], clicked.hex.spider]]
    : ['==', ['get', 'h3'], clicked.hex.h3];
  const bounds = new maplibregl.LngLatBounds();
  let empty = true;
  for (const feature of map.querySourceFeatures(sourceId, { sourceLayer: clicked.sourceLayer, filter })) {
    const g = feature.geometry;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const polygon of polygons) {
      for (const [x, y] of polygon[0] ?? []) {
        bounds.extend([x!, y!]);
        empty = false;
      }
    }
  }
  return empty ? undefined : bounds;
}
