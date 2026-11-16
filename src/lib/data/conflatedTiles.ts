// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Everything the app knows about the format of conflated.pmtiles, as
// described in https://github.com/brawer/osmdiffs/blob/main/docs/outputs/CONFLATED_TILES.md.
// The pipeline calls the file a debugging aid whose shape may change
// without notice, so its layer names, property names and join rules all
// live here: a format change should touch this file and no other.
//
// In short: three layers of rows, `matched`, `unmatched` and
// `deletion_candidate`. At z0–12 ("overview") each row is one feature
// with only `spider`, `relation`, `importance` and, where there is an
// OpenStreetMap side, `osm:type`/`osm:id`. At z13 and deeper ("detail")
// a row splits into up to three features that share a per-run `fid`: the
// AllThePlaces point (`part: "atp"`), the OSM shape (`part: "osm"`, or
// `"host"` for located_in rows) and a connector line (`part: "link"`),
// carrying the full `atp:*` and `osm:*` tags. The detail goes up to the
// archive's max zoom, which is read from its header: z14 from
// brawer/osmdiffs#956 on, z16 before.
//
// A deletion_candidate row (brawer/osmdiffs#952) is an OpenStreetMap
// feature that nothing in AllThePlaces matched, but that may be gone. It
// has no AllThePlaces side, and so no `spider`: at every zoom it is one
// feature, the OSM shape (`part: "osm"` in the detail), with `rule`
// saying why it was flagged and, in the detail, `local_share` for the
// `wikidata` and `name` rules. It joins its detail feature on
// `osm:type`/`osm:id`, like a matched row.

import { VectorTile } from '@mapbox/vector-tile';
import type { Geometry, Position } from 'geojson';
import { PbfReader } from 'pbf';
import { PMTiles } from 'pmtiles';
import type { OsmType, Selection } from '../route.ts';

export const MATCHED_LAYER = 'matched';
export const UNMATCHED_LAYER = 'unmatched';
export const DELETION_LAYER = 'deletion_candidate';
// In drawing order, bottom first.
export const SOURCE_LAYERS = [MATCHED_LAYER, UNMATCHED_LAYER, DELETION_LAYER] as const;
// The layers whose rows are found by their OpenStreetMap object.
export const OSM_KEYED_LAYERS: readonly string[] = [MATCHED_LAYER, DELETION_LAYER];

// The first zoom with full tags; below it, the overview.
export const DETAIL_ZOOM = 13;

// The relations the app has colours and words for. The pipeline may add
// more, which the app shows as "other".
export const KNOWN_RELATIONS = ['same', 'missing_in_osm', 'located_in', 'deletion_candidate'] as const;
export type KnownRelation = (typeof KNOWN_RELATIONS)[number];

export function isKnownRelation(relation: string): relation is KnownRelation {
  return (KNOWN_RELATIONS as readonly string[]).includes(relation);
}

export type Properties = Record<string, string | number | boolean>;

// What the map's own rendered feature says about a row, at any zoom.
export interface OverviewFacts {
  relation: string;
  // Empty for a deletion candidate, which has no AllThePlaces side.
  spider: string;
  importance?: number;
  osm?: { type: OsmType; id: number };
  // Why a deletion candidate was flagged.
  rule?: string;
}

// The relations whose rows are selected by their OpenStreetMap object.
export function isOsmKeyed(relation: string): boolean {
  return relation === 'same' || relation === 'deletion_candidate';
}

// The `position` of an AllThePlaces point moved east from a Google Maps
// camera center, with `position_shift_deg` saying how far.
export const GOOGLE_CAMERA_COORDS = 'google_camera_coords';

// One conflated.parquet row, put back together from its detail features.
export interface ConflatedRecord {
  // The per-run ID its detail features share.
  fid?: number;
  relation: string;
  spider: string;
  // Tags without their "atp:" or "osm:" prefix.
  atpTags: Record<string, string>;
  osmTags: Record<string, string>;
  // Where the AllThePlaces side is drawn, as [lng, lat]. Usually where
  // AllThePlaces puts the place, but see positionShiftDeg.
  atpPosition?: Position;
  // For a feature whose position looks copied from a Google Maps URL
  // and that matched better moved east (brawer/osmdiffs#973): how far,
  // in degrees of longitude. atpPosition is then the moved position;
  // subtract this to get the one AllThePlaces gave.
  positionShiftDeg?: number;
  osm?: { type: OsmType; id: number };
  // The connector line's length; undefined when there is no line, which
  // the pipeline omits for offsets under 5 m.
  offsetMeters?: number;
  // For a deletion candidate: why it was flagged, and for the wikidata
  // and name rules, the share of OpenStreetMap features of that brand
  // nearby that AllThePlaces matched.
  rule?: string;
  localShare?: number;
}

const OSM_TYPES: readonly string[] = ['node', 'way', 'relation'];

function osmRef(props: Properties): { type: OsmType; id: number } | undefined {
  const type = props['osm:type'];
  const id = props['osm:id'];
  if (typeof type !== 'string' || !OSM_TYPES.includes(type) || typeof id !== 'number') return undefined;
  return { type: type as OsmType, id };
}

export function overviewFacts(props: Properties): OverviewFacts {
  const facts: OverviewFacts = {
    relation: String(props.relation ?? ''),
    spider: String(props.spider ?? ''),
  };
  if (typeof props.importance === 'number') facts.importance = props.importance;
  const osm = osmRef(props);
  if (osm) facts.osm = osm;
  if (typeof props.rule === 'string') facts.rule = props.rule;
  return facts;
}

// What clicking a feature selects. A matched row or a deletion candidate
// is the OpenStreetMap object. Everything else, including a located_in
// row, whose OSM ID belongs to its host and is shared with every other
// store inside it, is the AllThePlaces place at the given position.
export function selectionFor(facts: OverviewFacts, position: Position): Selection {
  if (isOsmKeyed(facts.relation) && facts.osm) return { kind: 'osm', ...facts.osm };
  return { kind: 'atp', spider: facts.spider, lng: position[0]!, lat: position[1]! };
}

// A decoded detail-tile feature.
export interface TileFeature {
  layer: string;
  properties: Properties;
  // Decodes the geometry into longitude and latitude; only called for
  // the few features a lookup is interested in.
  geometry: () => Geometry;
}

export function decodeTile(data: ArrayBuffer | Uint8Array, x: number, y: number, z: number): TileFeature[] {
  const tile = new VectorTile(new PbfReader(data instanceof Uint8Array ? data : new Uint8Array(data)));
  const features: TileFeature[] = [];
  for (const name of SOURCE_LAYERS) {
    const layer = tile.layers[name];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      features.push({ layer: name, properties: feature.properties, geometry: () => feature.toGeoJSON(x, y, z).geometry });
    }
  }
  return features;
}

// The tile at `zoom` that contains a position.
export function tileFor(lng: number, lat: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  const clamp = (v: number) => Math.min(n - 1, Math.max(0, v));
  return [clamp(x), clamp(y)];
}

// The 3×3 block of tiles at `zoom` (by default, the first detail zoom)
// around a position. A matched shape can be large enough (a retail park,
// say) for its AllThePlaces point to sit in a neighbouring tile. Wraps
// around the antimeridian; drops rows past the poles.
export function detailBlock(lng: number, lat: number, zoom: number = DETAIL_ZOOM): [number, number, number][] {
  const n = 2 ** zoom;
  const [cx, cy] = tileFor(lng, lat, zoom);
  const tiles: [number, number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= n) continue;
    for (let dx = -1; dx <= 1; dx++) {
      tiles.push([zoom, (((cx + dx) % n) + n) % n, y]);
    }
  }
  return tiles;
}

// Great-circle distance in meters.
export function distanceMeters(a: Position, b: Position): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b[1]! - a[1]!) * rad;
  const dLng = (b[0]! - a[0]!) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1]! * rad) * Math.cos(b[1]! * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function lineLength(geometry: Geometry): number | undefined {
  if (geometry.type !== 'LineString') return undefined;
  let total = 0;
  for (let i = 1; i < geometry.coordinates.length; i++) {
    total += distanceMeters(geometry.coordinates[i - 1]!, geometry.coordinates[i]!);
  }
  return total;
}

function prefixed(props: Properties, prefix: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith(prefix) && key !== 'osm:type' && key !== 'osm:id') {
      tags[key.slice(prefix.length)] = String(value);
    }
  }
  return tags;
}

// Builds one record from the detail features that share a fid.
function assemble(parts: TileFeature[]): ConflatedRecord {
  const first = parts[0]!.properties;
  const record: ConflatedRecord = {
    relation: String(first.relation ?? ''),
    spider: String(first.spider ?? ''),
    atpTags: {},
    osmTags: {},
  };
  if (typeof first.fid === 'number') record.fid = first.fid;
  if (typeof first.rule === 'string') record.rule = first.rule;
  if (typeof first.local_share === 'number') record.localShare = first.local_share;
  for (const part of parts) {
    const props = part.properties;
    switch (props.part) {
      case 'atp': {
        record.atpTags = prefixed(props, 'atp:');
        const geometry = part.geometry();
        if (geometry.type === 'Point') record.atpPosition = geometry.coordinates;
        if (props.position === GOOGLE_CAMERA_COORDS && typeof props.position_shift_deg === 'number') {
          record.positionShiftDeg = props.position_shift_deg;
        }
        break;
      }
      case 'osm':
      case 'host': {
        record.osmTags = prefixed(props, 'osm:');
        const osm = osmRef(props);
        if (osm) record.osm = osm;
        break;
      }
      case 'link': {
        const length = lineLength(part.geometry());
        if (length !== undefined) record.offsetMeters = length;
        // The link carries both sides' tags; use them if the end features
        // fell outside the searched tiles.
        if (Object.keys(record.atpTags).length === 0) record.atpTags = prefixed(props, 'atp:');
        if (Object.keys(record.osmTags).length === 0) record.osmTags = prefixed(props, 'osm:');
        const osm = osmRef(props);
        if (osm && !record.osm) record.osm = osm;
        break;
      }
    }
  }
  return record;
}

// The same feature shows up in every tile whose buffer it overlaps, so
// group by fid and keep one feature per part.
function groupByFid(features: TileFeature[], fids: Set<number>): TileFeature[][] {
  const groups = new Map<number, Map<string, TileFeature>>();
  for (const f of features) {
    const fid = f.properties.fid;
    if (typeof fid !== 'number' || !fids.has(fid)) continue;
    let parts = groups.get(fid);
    if (!parts) groups.set(fid, (parts = new Map()));
    const part = String(f.properties.part);
    if (!parts.has(part)) parts.set(part, f);
  }
  return [...fids].flatMap((fid) => {
    const parts = groups.get(fid);
    return parts ? [[...parts.values()]] : [];
  });
}

// Whether a record has both of its sides: a matched or located_in row
// whose AllThePlaces point or OpenStreetMap shape sits in another tile
// lacks one. A deletion candidate only has the OpenStreetMap side.
export function isComplete(record: ConflatedRecord): boolean {
  if (record.relation === 'deletion_candidate') return record.osm !== undefined;
  const needsOsm = record.relation === 'same' || record.relation === 'located_in';
  return record.atpPosition !== undefined && (!needsOsm || record.osm !== undefined);
}

// How close, in meters, a record's AllThePlaces point must be to an
// AllThePlaces selection's position to count as that very place. A shared
// link carries the exact position, so only tile-coordinate rounding (about
// a meter at z13) separates them; another branch of the same chain is
// usually much farther away.
export const SAME_PLACE_METERS = 10;

// Whether a record is the place an AllThePlaces selection points at, and
// not merely the nearest branch of the same chain among the features
// searched. An OpenStreetMap selection names its object by ID, so its
// records always are.
export function isAtSelection(record: ConflatedRecord, selection: Selection): boolean {
  if (selection.kind !== 'atp') return true;
  if (!record.atpPosition) return false;
  return distanceMeters([selection.lng, selection.lat], record.atpPosition) <= SAME_PLACE_METERS;
}

// Finds the records for a selection among the features of the detail
// tiles around it. An OpenStreetMap selection yields every row matched to
// that object (usually one), or its deletion_candidate row; an
// AllThePlaces selection yields the row of
// the nearest AllThePlaces point of the same spider, or nothing.
export function findRecords(features: TileFeature[], selection: Selection): ConflatedRecord[] {
  const fids = new Set<number>();
  if (selection.kind === 'osm') {
    for (const f of features) {
      const p = f.properties;
      if (OSM_KEYED_LAYERS.includes(f.layer) && p['osm:type'] === selection.type && p['osm:id'] === selection.id) {
        if (typeof p.fid === 'number') fids.add(p.fid);
      }
    }
  } else {
    let best: { fid: number; distance: number } | undefined;
    const target: Position = [selection.lng, selection.lat];
    for (const f of features) {
      const p = f.properties;
      if (p.part !== 'atp' || p.spider !== selection.spider || typeof p.fid !== 'number') continue;
      const geometry = f.geometry();
      if (geometry.type !== 'Point') continue;
      const distance = distanceMeters(target, geometry.coordinates);
      if (!best || distance < best.distance) best = { fid: p.fid, distance };
    }
    if (best) fids.add(best.fid);
  }
  return groupByFid(features, fids).map(assemble);
}

// One opened conflated.pmtiles archive. The map's `pmtiles://` source and
// the detail lookups share it, and with it the archive's header and
// directory caches.
export class ConflatedTiles {
  readonly archive: PMTiles;
  private readonly decoded = new Map<string, Promise<TileFeature[]>>();

  constructor(url: string) {
    this.archive = new PMTiles(url);
  }

  get sourceUrl(): string {
    return `pmtiles://${this.archive.source.getKey()}`;
  }

  private tile(z: number, x: number, y: number): Promise<TileFeature[]> {
    const key = `${z}/${x}/${y}`;
    let tile = this.decoded.get(key);
    if (!tile) {
      tile = this.archive
        .getZxy(z, x, y)
        .then((res) => (res ? decodeTile(res.data, x, y, z) : []))
        .catch((err: unknown) => {
          this.decoded.delete(key);
          throw err;
        });
      this.decoded.set(key, tile);
      // Keep the last few blocks' worth; a z13 tile can decode to a few
      // thousand features.
      if (this.decoded.size > 36) this.decoded.delete(this.decoded.keys().next().value!);
    }
    return tile;
  }

  // Looks a selection up in the detail tiles around `near`: first the one
  // tile under it, which in a dense city can be a few hundred kilobytes,
  // and only if that doesn't hold the whole record, the 3×3 block.
  //
  // Tippecanoe thins out dense detail tiles below the archive's maximum
  // zoom, so in a city centre the z13 tiles can lack a row that the
  // deepest tiles, a few dozen kilobytes each, still hold. So if the z13
  // tile under `near` has no row for the selection, the deepest tile under
  // it is searched too, and likewise its 3×3 block after the z13 block.
  //
  // For an AllThePlaces selection, the nearest point of the same spider
  // among thinned tiles can be another branch (osmdiffs-app#18). With
  // `exact`, the selection carries the place's exact position, as a shared
  // link does: a row then only counts if it is right there, and if none
  // is, nothing is found.
  async lookup(selection: Selection, near: Position, { exact = false } = {}): Promise<ConflatedRecord[]> {
    const [lng, lat] = near as [number, number];
    const strict = exact && selection.kind === 'atp';
    const at = (r: ConflatedRecord) => !strict || isAtSelection(r, selection);
    const found = (records: ConflatedRecord[]) => records.length > 0 && records.every((r) => isComplete(r) && at(r));
    const { maxZoom } = await this.archive.getHeader();
    const stages: { tiles: [number, number, number][]; deep: boolean }[] = [
      { tiles: [[DETAIL_ZOOM, ...tileFor(lng, lat, DETAIL_ZOOM)]], deep: false },
      { tiles: [[maxZoom, ...tileFor(lng, lat, maxZoom)]], deep: true },
      { tiles: detailBlock(lng, lat), deep: false },
      { tiles: detailBlock(lng, lat, maxZoom), deep: true },
    ];
    const searched = new Map<string, TileFeature[]>();
    let records: ConflatedRecord[] = [];
    for (const stage of stages) {
      // A deeper tile only helps if thinning may have dropped the row.
      if (stage.deep && (maxZoom <= DETAIL_ZOOM || records.some(at))) continue;
      const fresh = stage.tiles.filter((t) => !searched.has(t.join('/')));
      const loaded = await Promise.all(fresh.map(([z, x, y]) => this.tile(z, x, y)));
      fresh.forEach((t, i) => searched.set(t.join('/'), loaded[i]!));
      records = findRecords([...searched.values()].flat(), selection);
      if (found(records)) return records;
    }
    return records.every(at) ? records : [];
  }
}
