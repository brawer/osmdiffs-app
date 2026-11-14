// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import Point from '@mapbox/point-geometry';
import { fromVectorTileJs, type VectorTileFeatureLike } from '@maplibre/vt-pbf';
import { describe, expect, it } from 'vitest';
import {
  DETAIL_ZOOM,
  decodeTile,
  detailBlock,
  distanceMeters,
  findRecords,
  overviewFacts,
  selectionFor,
  tileFor,
  type Properties,
} from './conflatedTiles.ts';

const EXTENT = 4096;
const Z = DETAIL_ZOOM;
// Zürich main station's z13 tile.
const [X, Y] = tileFor(8.54, 47.378, Z);

// Where a position falls in the test tile, in tile coordinates.
function toTile(lng: number, lat: number): Point {
  const n = 2 ** Z;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return new Point(Math.round((x - X) * EXTENT), Math.round((y - Y) * EXTENT));
}

type Fixture = { properties: Properties } & (
  | { point: [number, number] }
  | { line: [number, number][] }
  | { polygon: [number, number][] }
);

function feature(f: Fixture): VectorTileFeatureLike {
  const [type, rings] =
    'point' in f
      ? [1 as const, [[toTile(...f.point)]]]
      : 'line' in f
        ? [2 as const, [f.line.map((p) => toTile(...p))]]
        : [3 as const, [f.polygon.map((p) => toTile(...p))]];
  return { type, properties: f.properties, id: undefined, extent: EXTENT, loadGeometry: () => rings };
}

function encode(layers: Record<string, Fixture[]>): Uint8Array {
  return fromVectorTileJs({
    layers: Object.fromEntries(
      Object.entries(layers).map(([name, features]) => [
        name,
        { version: 2, name, extent: EXTENT, length: features.length, feature: (i: number) => feature(features[i]!) },
      ]),
    ),
  });
}

const KIOSK_ATP: [number, number] = [8.5402, 47.3775];
const KIOSK_OSM: [number, number] = [8.5404, 47.3777];

const tile = encode({
  matched: [
    {
      point: KIOSK_ATP,
      properties: { fid: 7, part: 'atp', relation: 'same', spider: 'valora', 'atp:name': 'k kiosk HB', 'atp:shop': 'convenience' },
    },
    {
      point: KIOSK_OSM,
      properties: {
        fid: 7,
        part: 'osm',
        relation: 'same',
        spider: 'valora',
        'osm:type': 'node',
        'osm:id': 4424939151,
        'osm:name': 'k kiosk',
        'osm:shop': 'newsagent',
      },
    },
    {
      line: [KIOSK_ATP, KIOSK_OSM],
      properties: { fid: 7, part: 'link', relation: 'same', spider: 'valora', 'osm:type': 'node', 'osm:id': 4424939151 },
    },
  ],
  unmatched: [
    {
      point: [8.539, 47.376],
      properties: { fid: 8, part: 'atp', relation: 'missing_in_osm', spider: 'coop_pronto_ch', 'atp:name': 'Near' },
    },
    {
      point: [8.545, 47.379],
      properties: { fid: 9, part: 'atp', relation: 'missing_in_osm', spider: 'coop_pronto_ch', 'atp:name': 'Far' },
    },
    {
      point: [8.5391, 47.3761],
      properties: { fid: 10, part: 'atp', relation: 'missing_in_osm', spider: 'other_spider', 'atp:name': 'Nearest' },
    },
    {
      point: [8.5412, 47.3768],
      properties: { fid: 11, part: 'atp', relation: 'located_in', spider: 'sushi_daily', 'atp:name': 'Sushi' },
    },
    {
      polygon: [
        [8.541, 47.3765],
        [8.5415, 47.3765],
        [8.5415, 47.377],
        [8.541, 47.377],
        [8.541, 47.3765],
      ],
      properties: {
        fid: 11,
        part: 'host',
        relation: 'located_in',
        spider: 'sushi_daily',
        'osm:type': 'way',
        'osm:id': 99,
        'osm:name': 'Coop',
      },
    },
  ],
});

const features = decodeTile(tile, X, Y, Z);

describe('decodeTile and findRecords', () => {
  it('reassembles a matched row from its three parts', () => {
    const [record, ...rest] = findRecords(features, { kind: 'osm', type: 'node', id: 4424939151 });
    expect(rest).toEqual([]);
    expect(record).toMatchObject({
      relation: 'same',
      spider: 'valora',
      atpTags: { name: 'k kiosk HB', shop: 'convenience' },
      osmTags: { name: 'k kiosk', shop: 'newsagent' },
      osm: { type: 'node', id: 4424939151 },
    });
    // The link's length, about 27 m, within tile-coordinate rounding.
    expect(record!.offsetMeters).toBeGreaterThan(24);
    expect(record!.offsetMeters).toBeLessThan(30);
    expect(record!.atpPosition![0]).toBeCloseTo(KIOSK_ATP[0], 4);
    expect(record!.atpPosition![1]).toBeCloseTo(KIOSK_ATP[1], 4);
  });

  it('finds the nearest AllThePlaces point of the same spider', () => {
    const records = findRecords(features, { kind: 'atp', spider: 'coop_pronto_ch', lng: 8.5392, lat: 47.3762 });
    expect(records.map((r) => r.atpTags.name)).toEqual(['Near']);
  });

  it('keeps a located_in host apart from the place itself', () => {
    const [record] = findRecords(features, { kind: 'atp', spider: 'sushi_daily', lng: 8.5412, lat: 47.3768 });
    expect(record).toMatchObject({
      relation: 'located_in',
      atpTags: { name: 'Sushi' },
      osmTags: { name: 'Coop' },
      osm: { type: 'way', id: 99 },
    });
    expect(record!.offsetMeters).toBeUndefined();
  });

  it('finds nothing for an unknown object or spider', () => {
    expect(findRecords(features, { kind: 'osm', type: 'way', id: 1 })).toEqual([]);
    expect(findRecords(features, { kind: 'atp', spider: 'nobody', lng: 8.54, lat: 47.37 })).toEqual([]);
  });

  it('counts a feature repeated in a neighbouring tile once', () => {
    const twice = [...features, ...features];
    expect(findRecords(twice, { kind: 'osm', type: 'node', id: 4424939151 })).toHaveLength(1);
  });
});

describe('tiles', () => {
  it('finds the tile under a position', () => {
    expect(tileFor(0, 0, 1)).toEqual([1, 1]);
    expect(tileFor(-180, 85, 2)).toEqual([0, 0]);
    expect(tileFor(180, -89.9, 2)).toEqual([3, 3]);
  });

  it('takes the 3×3 block around a position, wrapping at the antimeridian', () => {
    const block = detailBlock(-179.99, 0);
    expect(block).toHaveLength(9);
    const n = 2 ** DETAIL_ZOOM;
    expect(block.map(([, x]) => x)).toContain(n - 1);
    expect(block.every(([z]) => z === DETAIL_ZOOM)).toBe(true);
  });

  it('drops rows past the pole', () => {
    expect(detailBlock(0, 85.05)).toHaveLength(6);
  });

  it('measures distances', () => {
    // One degree of latitude is about 111 km.
    expect(distanceMeters([0, 0], [0, 1])).toBeCloseTo(111195, -2);
  });
});

describe('selectionFor', () => {
  it('selects a matched row by its OpenStreetMap object', () => {
    const facts = overviewFacts({ relation: 'same', spider: 's', 'osm:type': 'way', 'osm:id': 5, importance: 0.5 });
    expect(selectionFor(facts, [8, 47])).toEqual({ kind: 'osm', type: 'way', id: 5 });
  });

  it('selects anything else, including a located_in row, by spider and position', () => {
    const facts = overviewFacts({ relation: 'located_in', spider: 's', 'osm:type': 'way', 'osm:id': 5 });
    expect(selectionFor(facts, [8, 47])).toEqual({ kind: 'atp', spider: 's', lng: 8, lat: 47 });
  });
});
