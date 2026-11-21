// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Reads spider-stats.parquet, as described in
// https://github.com/brawer/osmdiffs/blob/main/docs/outputs/SPIDER_STATS.md,
// into typed rows. Like conflated.pmtiles it is a debugging aid whose
// shape may change, so nothing outside this module knows its columns.
//
// The whole file is read once per session: the spider list needs every
// row anyway, and on the planet the file is small. Reading single row
// groups with range requests can come later without touching callers.

import { decompress as zstd } from 'fzstd';
import type { Bbox } from './bbox.ts';
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects, type FileMetaData } from 'hyparquet';

export interface RuleCount {
  rule: string;
  rows: number;
}

// How a tag's values agree or differ, such as `same_schedule` or `small`
// for opening_hours; see OPENING_HOURS_KINDS.
export interface KindCount {
  kind: string;
  rows: number;
}

export interface TagCount {
  tag: string;
  atp: number;
  agreeing: number;
  differing: number;
  missingInOsm: number;
  // Empty for tags whose kinds aren't told apart, and in files from
  // before brawer/osmdiffs#1000.
  kinds: KindCount[];
}

// The quality of one key's values over all of a spider's rows, matched
// or not, by the key as written.
export interface ValueCount {
  key: string;
  // Rows whose ATP feature has the key.
  atp: number;
  // Of these, values that can't be read, such as phone numbers not in
  // international format; null for keys without a reader, such as name.
  unparsed: number | null;
  // Rows with the most common value.
  topValueAtp: number;
}

export interface BrandCount {
  country: string | null;
  wikidataId: string | null;
  name: string | null;
  atpFeatures: number;
  same: number;
  locatedIn: number;
  missingInOsm: number;
  osmFeatures: number | null;
  // Deletion candidates with this Wikidata ID in the country; null for
  // the row without an ID.
  deletionCandidates: number | null;
  // Deletion candidates without any Wikidata ID whose brand, operator or
  // network name one of the spider's features of this brand also has.
  // Disjoint from deletionCandidates, but weaker evidence, and the kind
  // of feature isn't compared. Null if none of the brand's features has a
  // name, and in files from before brawer/osmdiffs#1002.
  deletionCandidatesByName: number | null;
  offsetEastM: number | null;
  offsetNorthM: number | null;
  bbox: Bbox | null;
}

export interface SpiderStats {
  spider: string;
  atpFeatures: number | null;
  atpErrors: number | null;
  dumpFeatures: number | null;
  notForOsm: number | null;
  // Left out because AllThePlaces gives no geometry, because the geometry
  // can't be used, or because no tag says what kind of place it is.
  // Null in files from before brawer/osmdiffs#1013.
  noGeometry: number | null;
  badGeometry: number | null;
  noKind: number | null;
  // In files from before brawer/osmdiffs#1013, what is now noGeometry,
  // badGeometry and noKind, and also the kinds that no matcher handles.
  // Null in newer files.
  invalid: number | null;
  // Features of a kind that no matcher handles. In files from before
  // brawer/osmdiffs#1013, only those kept at import; the others were
  // counted under invalid.
  noMatcher: number | null;
  inChina: number | null;
  datum: string | null;
  datasetAttributes: Record<string, string> | null;
  // Probes for positions copied from Google Maps place URLs, whose
  // `@lat,lon` is the map's camera center, about 0.0022° of longitude
  // west of the place (brawer/osmdiffs#973). Null in older files.
  // Features within 30 m of an OSM feature with the same Wikidata ID.
  exactCoordsHits: number | null;
  // Features that aren't, but have one 0.0018–0.0030° east.
  googleCameraCoordsHits: number | null;
  // The same in the mirrored window to the west.
  googleCameraCoordsControl: number | null;
  // Median longitude offset of the hits, ATP minus OSM, so negative.
  googleCameraCoordsOffsetDeg: number | null;
  rows: number;
  same: number;
  locatedIn: number;
  missingInOsm: number;
  // `same` rows that matched at the position corrected for a Google Maps
  // camera center; their distances are measured from there.
  sameGoogleCameraCoords: number;
  sharedOsmFeatures: number;
  sharedPositions: number;
  // The same, but only among features of the same kind: the same main
  // category and the same brand, operator and network Wikidata IDs, so
  // that a car dealer's sales and service, or a bank's branch and ATM,
  // don't count. Null in files from before brawer/osmdiffs#975.
  sharedOsmFeaturesSameKind: number | null;
  sharedPositionsSameKind: number | null;
  offsetEastM: number | null;
  offsetNorthM: number | null;
  // Null for a spider without rows, and in files from before v0.8.17.
  bbox: Bbox | null;
  // Histogram over distanceBinsM: one more bin than bounds.
  distanceM: number[];
  missingNoCandidate: number;
  missingRejected: number;
  missingTaken: number;
  rejectedDistanceM: number[];
  chanceSampled: number;
  chanceMatched: number;
  openingHoursTopShare: number | null;
  // The most common opening_hours, as the spider wrote it. Null if no
  // feature has any, and in files from before brawer/osmdiffs#975.
  openingHoursTopValue: string | null;
  rules: RuleCount[];
  tags: TagCount[];
  // Empty in files from before brawer/osmdiffs#1000.
  values: ValueCount[];
  brands: BrandCount[];
}

// The file published before this one, named in the metadata from
// brawer/osmdiffs#1004 on; usually a week earlier.
export interface PreviousRef {
  // Its basename, such as spider-stats-20261109-a1b2c3d4.parquet.
  name: string;
  // Resolved next to the file that names it.
  url: string;
  // The date in its name, as 2026-11-09, or null if it has none.
  date: string | null;
}

export interface SpiderStatsFile {
  spiders: SpiderStats[];
  // Null in files from before brawer/osmdiffs#1004, and in the first.
  previous: PreviousRef | null;
  // Upper bounds of the distance histogram bins, in meters: the first bin
  // counts distances below the first bound, the last one those at or
  // above the last bound.
  distanceBinsM: number[];
}

// What the pipeline wrote when this was built; used if the file doesn't
// say, which it always should.
const DEFAULT_DISTANCE_BINS_M = [1, 10, 25, 50, 100, 250, 1000];

const COMPRESSORS = { ZSTD: (input: Uint8Array) => zstd(input) };

export type { Bbox };

type Raw = Record<string, unknown>;

// Parquet UINT64 comes back as a BigInt; the counts here all fit a double.
function num(value: unknown): number | null {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return null;
}

function count(value: unknown): number {
  return num(value) ?? 0;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function list(value: unknown): Raw[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object') as Raw[]) : [];
}

// A MAP<UTF8, UTF8>, which hyparquet may give as an object or as a list
// of key/value entries.
function stringMap(value: unknown): Record<string, string> | null {
  if (value === null || value === undefined) return null;
  const out: Record<string, string> = {};
  if (Array.isArray(value)) {
    for (const entry of value as Raw[]) {
      if (typeof entry?.key === 'string') out[entry.key] = String(entry.value ?? '');
    }
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Raw)) out[k] = String(v ?? '');
  }
  return out;
}

function bbox(value: unknown): Bbox | null {
  if (!value || typeof value !== 'object') return null;
  const { xmin, ymin, xmax, ymax } = value as Raw;
  const box = { xmin: num(xmin), ymin: num(ymin), xmax: num(xmax), ymax: num(ymax) };
  return box.xmin === null || box.ymin === null || box.xmax === null || box.ymax === null ? null : (box as Bbox);
}

export function toSpiderStats(r: Raw): SpiderStats {
  return {
    spider: String(r.spider),
    atpFeatures: num(r.atp_features),
    atpErrors: num(r.atp_errors),
    dumpFeatures: num(r.dump_features),
    notForOsm: num(r.not_for_osm),
    noGeometry: num(r.no_geometry),
    badGeometry: num(r.bad_geometry),
    noKind: num(r.no_kind),
    invalid: num(r.invalid),
    noMatcher: num(r.no_matcher),
    inChina: num(r.in_china),
    datum: str(r.datum),
    datasetAttributes: stringMap(r.dataset_attributes),
    exactCoordsHits: num(r.exact_coords_hits),
    googleCameraCoordsHits: num(r.google_camera_coords_hits),
    googleCameraCoordsControl: num(r.google_camera_coords_control),
    googleCameraCoordsOffsetDeg: num(r.google_camera_coords_offset_deg),
    rows: count(r.rows),
    same: count(r.same),
    locatedIn: count(r.located_in),
    missingInOsm: count(r.missing_in_osm),
    sameGoogleCameraCoords: count(r.same_google_camera_coords),
    sharedOsmFeatures: count(r.shared_osm_features),
    sharedPositions: count(r.shared_positions),
    sharedOsmFeaturesSameKind: num(r.shared_osm_features_same_kind),
    sharedPositionsSameKind: num(r.shared_positions_same_kind),
    offsetEastM: num(r.offset_east_m),
    offsetNorthM: num(r.offset_north_m),
    bbox: bbox(r.bbox),
    distanceM: Array.isArray(r.distance_m) ? r.distance_m.map(count) : [],
    missingNoCandidate: count(r.missing_no_candidate),
    missingRejected: count(r.missing_rejected),
    missingTaken: count(r.missing_taken),
    rejectedDistanceM: Array.isArray(r.rejected_distance_m) ? r.rejected_distance_m.map(count) : [],
    chanceSampled: count(r.chance_sampled),
    chanceMatched: count(r.chance_matched),
    openingHoursTopShare: num(r.opening_hours_top_share),
    openingHoursTopValue: str(r.opening_hours_top_value),
    rules: list(r.rules).map((x) => ({ rule: String(x.rule), rows: count(x.rows) })),
    tags: list(r.tags).map((x) => ({
      tag: String(x.tag),
      atp: count(x.atp),
      agreeing: count(x.agreeing),
      differing: count(x.differing),
      missingInOsm: count(x.missing_in_osm),
      kinds: list(x.kinds).map((k) => ({ kind: String(k.kind), rows: count(k.rows) })),
    })),
    values: list(r.values).map((x) => ({
      key: String(x.key),
      atp: count(x.atp),
      unparsed: num(x.unparsed),
      topValueAtp: count(x.top_value_atp),
    })),
    brands: list(r.brands).map((x) => ({
      country: str(x.country),
      wikidataId: str(x.wikidata_id),
      name: str(x.name),
      atpFeatures: count(x.atp_features),
      same: count(x.same),
      locatedIn: count(x.located_in),
      missingInOsm: count(x.missing_in_osm),
      osmFeatures: num(x.osm_features),
      deletionCandidates: num(x.deletion_candidates),
      deletionCandidatesByName: num(x.deletion_candidates_by_name),
      offsetEastM: num(x.offset_east_m),
      offsetNorthM: num(x.offset_north_m),
      bbox: bbox(x.bbox),
    })),
  };
}

// Whether the file counts features without geometry, with bad geometry
// and without a kind apart, as files from brawer/osmdiffs#1013 on do.
export function hasSplitLeftOut(s: SpiderStats): boolean {
  return s.noGeometry !== null || s.badGeometry !== null || s.noKind !== null;
}

export function distanceBins(metadata: FileMetaData): number[] {
  const entry = metadata.key_value_metadata?.find((kv) => kv.key === 'osmdiffs:distance_bins_m');
  if (!entry?.value) return DEFAULT_DISTANCE_BINS_M;
  try {
    const parsed: unknown = JSON.parse(entry.value);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'number')) return parsed;
  } catch {
    // Fall through: a comma-separated list, say.
  }
  const values = entry.value.split(/[\s,[\]]+/).filter(Boolean).map(Number);
  return values.length > 0 && values.every(Number.isFinite) ? values : DEFAULT_DISTANCE_BINS_M;
}

// The date in a dated file name such as spider-stats-20261109-a1b2c3d4.parquet.
export function dateInName(name: string): string | null {
  const m = /(?:^|[^0-9])(\d{4})(\d{2})(\d{2})(?:[^0-9]|$)/.exec(name);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// The file named in `osmdiffs:previous`, resolved against `url`, the
// current file's own URL. Null if the key is missing or empty.
export function previousFile(metadata: FileMetaData, url: string): PreviousRef | null {
  const name = metadata.key_value_metadata?.find((kv) => kv.key === 'osmdiffs:previous')?.value?.trim();
  if (!name) return null;
  let resolved: string;
  try {
    resolved = new URL(name, url).href;
  } catch {
    // A relative or unknown base, as in tests: keep the name as it is.
    resolved = name;
  }
  return { name, url: resolved, date: dateInName(name) };
}

// `url` is where the file came from, against which the previous file's
// name resolves.
export async function readSpiderStats(file: ArrayBuffer | Awaited<ReturnType<typeof asyncBufferFromUrl>>, url = '') {
  const metadata = await parquetMetadataAsync(file);
  const raw = await parquetReadObjects({ file, metadata, compressors: COMPRESSORS });
  const result: SpiderStatsFile = {
    spiders: raw.map((r) => toSpiderStats(r)),
    previous: previousFile(metadata, url),
    distanceBinsM: distanceBins(metadata),
  };
  return result;
}

export async function fetchSpiderStats(url: string): Promise<SpiderStatsFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return readSpiderStats(await res.arrayBuffer(), url);
}
