// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// How many places of each relation the map currently draws, for the
// legend: the dots in view, plus at z0–12 what the hexagons in view count
// for the rows that aren't dots yet. A hexagon counts fully once any part
// of it is in view, hence "in view" rather than an exact total.

import type * as maplibregl from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { DETAIL_ZOOM, hexCounts, SOURCE_LAYERS, type Properties } from '../../lib/data/conflatedTiles.ts';
import { HEX_LAYER_IDS } from './conflationOverlay.ts';

const OVERVIEW_LAYERS = SOURCE_LAYERS.flatMap((l) => [`${l}-overview-dot`, `${l}-overview-fill`, `${l}-overview-line`]);
const DETAIL_LAYERS = SOURCE_LAYERS.map((l) => `${l}-atp`);

// One key per row: a feature near a tile edge shows up in each tile that
// buffers it, and a polygon as both fill and outline.
function rowKey(feature: maplibregl.MapGeoJSONFeature): string {
  const p = feature.properties;
  if (typeof p.fid === 'number') return `fid:${p.fid}`;
  const g = feature.geometry;
  const first = g.type === 'Point' ? g.coordinates : g.type === 'Polygon' ? g.coordinates[0]?.[0] : undefined;
  const at = first ? `${first[0]!.toFixed(4)},${first[1]!.toFixed(4)}` : '';
  return `${feature.sourceLayer}|${p.relation}|${p.spider}|${p['osm:id'] ?? ''}|${at}`;
}

export function countRendered(map: maplibregl.Map): Record<string, number> {
  const overview = map.getZoom() < DETAIL_ZOOM;
  const ids = (overview ? OVERVIEW_LAYERS : DETAIL_LAYERS).filter((id) => map.getLayer(id));
  const hexIds = overview ? HEX_LAYER_IDS.filter((id) => id.endsWith('-fill') && map.getLayer(id)) : [];
  if (ids.length === 0 && hexIds.length === 0) return {};
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  const add = (relation: string, n: number) => {
    if (n > 0) counts[relation] = (counts[relation] ?? 0) + n;
  };
  if (ids.length > 0) {
    for (const feature of map.queryRenderedFeatures({ layers: ids })) {
      const key = rowKey(feature);
      if (seen.has(key)) continue;
      seen.add(key);
      add(String(feature.properties.relation), 1);
    }
  }
  if (hexIds.length > 0) {
    // A cell near a tile edge is in every tile that buffers it.
    for (const feature of map.queryRenderedFeatures({ layers: hexIds })) {
      const hex = hexCounts(feature.properties as Properties);
      const key = `hex|${hex.spider ?? ''}|${hex.h3}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const [relation, n] of Object.entries(hex.counts)) add(relation, n);
    }
  }
  return counts;
}

export function useInViewCounts(map: maplibregl.Map | null): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!map) return;
    // 'idle' fires once the map has finished drawing after a move or a
    // style change, which is when the count can change.
    const update = () => setCounts(countRendered(map));
    map.on('idle', update);
    return () => {
      map.off('idle', update);
    };
  }, [map]);
  return counts;
}
