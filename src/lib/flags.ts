// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Flags: signs that conflation goes wrong for a spider, and whose fault
// it likely is. They are computed here in the browser from the counts in
// spider-stats.parquet, not in the pipeline, so that the thresholds can be
// tuned without waiting for a weekly run.
//
// The thresholds were tuned on the 2026-11-09 planet run (5,780 spiders,
// 4,103 with rows). The first ones, from osmdiffs-app#2, flagged 3,694
// spiders; most limits sat near the median. Now each flag asks for enough
// features to mean something, and fires on a few percent of spiders.

import type { BrandCount, SpiderStats } from './data/spiderStats.ts';

export type LikelyCause = 'spider' | 'matcher' | 'source' | 'license';

export interface Flag {
  id: string;
  label: string;
  likelyCause: LikelyCause;
  // Says who is likely at fault where CAUSE_LABELS is too broad.
  causeLabel?: string;
  // Whether the flag applies; `bins` are the distance histogram's bounds.
  test: (s: SpiderStats, bins: number[]) => boolean;
  // A one-line reason, with the numbers.
  explain: (s: SpiderStats, bins: number[]) => string;
  // Worth knowing, but not a problem to fix: not counted as a flag in
  // the spider list's order.
  info?: boolean;
}

const percent = (part: number, whole: number) => `${Math.round((100 * part) / whole)}%`;
const meters = (m: number) => `${Math.round(Math.abs(m))} m`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// The share of a histogram at or beyond `threshold` meters.
function shareAtLeast(hist: number[], bins: number[], threshold: number): { part: number; total: number } {
  // Bin i (i > 0) counts [bins[i-1], bins[i]); the last counts >= last bound.
  const first = bins.indexOf(threshold) + 1;
  const total = sum(hist);
  return { part: first > 0 ? sum(hist.slice(first)) : 0, total };
}

function offsetLength(east: number | null, north: number | null): number {
  return Math.hypot(east ?? 0, north ?? 0);
}

// "150 m west, 20 m north" for an offset, naming the larger part first.
export function describeOffset(east: number, north: number): string {
  const ew = `${meters(east)} ${east < 0 ? 'west' : 'east'}`;
  const ns = `${meters(north)} ${north < 0 ? 'south' : 'north'}`;
  return Math.abs(east) >= Math.abs(north) ? `${ew}, ${ns}` : `${ns}, ${ew}`;
}

const SHIFT_MIN_MATCHES = 20;
const SHIFT_MIN_METERS = 50;

// Brand and country rows whose matches are shifted, for spiders whose
// overall median hides a shift in one country.
export function shiftedBrands(s: SpiderStats): BrandCount[] {
  return s.brands.filter(
    (b) => b.same >= SHIFT_MIN_MATCHES && offsetLength(b.offsetEastM, b.offsetNorthM) > SHIFT_MIN_METERS,
  );
}

const LOW_COVERAGE_MIN = 20;

// Brand and country rows where OpenStreetMap has more than twice as many
// features as the spider. Only for the spider's own brands: at least 20
// of its features, and at least half of its rows. A spider that lists a
// brand in passing, such as a fuel card network listing Shell stations,
// isn't expected to have them all.
export function lowCoverageBrands(s: SpiderStats): BrandCount[] {
  return s.brands.filter(
    (b) =>
      b.wikidataId !== null &&
      b.osmFeatures !== null &&
      b.atpFeatures >= LOW_COVERAGE_MIN &&
      2 * b.atpFeatures >= s.rows &&
      b.osmFeatures > 2 * b.atpFeatures,
  );
}

// Positions copied from Google Maps place URLs (brawer/osmdiffs#973).
// The `@lat,lon` of such a URL is the map's camera center, about 0.0022°
// of longitude west of the place. The rule is the pipeline's own, which
// decides whether conflation tries the corrected position too: enough
// hits, well above the mirrored control window (dense data such as city
// trees has about as many of each), and at least a tenth of the probed
// features, so that a large spider with a few stores entered by hand
// isn't flagged.
export interface CameraCounts {
  exact: number;
  hits: number;
  control: number;
}

export function cameraCounts(s: SpiderStats): CameraCounts | null {
  if (s.googleCameraCoordsHits === null) return null;
  return {
    exact: s.exactCoordsHits ?? 0,
    hits: s.googleCameraCoordsHits,
    control: s.googleCameraCoordsControl ?? 0,
  };
}

export function hasGoogleCameraCoords(s: SpiderStats): boolean {
  const c = cameraCounts(s);
  return c !== null && c.hits >= 8 && c.hits >= 4 * (c.control + 1) && 10 * c.hits >= c.hits + c.exact;
}

const METERS_PER_DEGREE = 111_320;

// The latitude in the middle of a spider's features, if known; the file
// has no median, so this is the middle of its box.
function middleLatitude(s: SpiderStats): number | null {
  return s.bbox ? (s.bbox.ymin + s.bbox.ymax) / 2 : null;
}

// "0.0022°", and "0.0022° (165 m)" where the latitude is known.
export function describeLongitudeShift(deg: number, latitude: number | null): string {
  const degrees = `${Math.abs(deg).toFixed(4)}°`;
  if (latitude === null) return degrees;
  const m = Math.abs(deg) * METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180);
  return `${degrees} (${Math.round(m)} m)`;
}

// Minimum sizes, below which a share says little.
const MIN_MATCHES = 20;
const MIN_ROWS = 20;
const MIN_MISSING = 50;

export const FLAGS: Flag[] = [
  {
    id: 'broken',
    label: 'Spider broken',
    likelyCause: 'spider',
    test: (s) =>
      ((s.atpErrors ?? 0) > 0 && (s.dumpFeatures ?? 0) === 0) ||
      (s.atpFeatures !== null && s.dumpFeatures !== null && s.atpFeatures !== s.dumpFeatures),
    explain: (s) =>
      (s.dumpFeatures ?? 0) === 0
        ? `${s.atpErrors ?? 0} errors and no features in the dump`
        : `AllThePlaces reports ${s.atpFeatures ?? 0} features, the dump has ${s.dumpFeatures ?? 0}`,
  },
  {
    id: 'shifted',
    label: 'Shifted',
    likelyCause: 'spider',
    test: (s) =>
      (s.same >= SHIFT_MIN_MATCHES && offsetLength(s.offsetEastM, s.offsetNorthM) > SHIFT_MIN_METERS) ||
      shiftedBrands(s).length > 0,
    explain: (s) => {
      if (s.same >= SHIFT_MIN_MATCHES && offsetLength(s.offsetEastM, s.offsetNorthM) > SHIFT_MIN_METERS) {
        return `Matches lie a median ${describeOffset(s.offsetEastM ?? 0, s.offsetNorthM ?? 0)} of OpenStreetMap`;
      }
      const countries = [...new Set(shiftedBrands(s).map((b) => b.country ?? '?'))];
      return `Shifted in ${countries.join(', ')}`;
    },
  },
  {
    id: 'far',
    label: 'Far matches',
    likelyCause: 'spider',
    test: (s, bins) => {
      const { part, total } = shareAtLeast(s.distanceM, bins, 100);
      return total >= MIN_MATCHES && part / total > 1 / 3;
    },
    explain: (s, bins) => {
      const { part, total } = shareAtLeast(s.distanceM, bins, 100);
      return `${percent(part, total)} of matches are 100 m or more apart`;
    },
  },
  {
    id: 'stacked',
    label: 'Stacked',
    likelyCause: 'spider',
    // Car dealers and banks often list sales, service and an ATM at one
    // spot, which is right; 10% caught too many of them.
    test: (s) => s.rows >= MIN_ROWS && s.sharedPositions / s.rows > 0.25,
    explain: (s) => `${percent(s.sharedPositions, s.rows)} of features share their position with another`,
  },
  {
    id: 'same-hours',
    label: 'Same hours everywhere',
    likelyCause: 'spider',
    // 24/7 convenience stores and fuel stations really do share their
    // hours, so only nearly all alike counts.
    test: (s) => (s.openingHoursTopShare ?? 0) > 0.99 && s.rows >= 50,
    explain: (s) => `${Math.round((s.openingHoursTopShare ?? 0) * 100)}% of features have the same opening hours`,
  },
  {
    id: 'chance',
    label: 'Chance matches',
    likelyCause: 'matcher',
    test: (s) => s.chanceSampled >= 20 && s.chanceMatched / s.chanceSampled > 0.1,
    explain: (s) =>
      `${s.chanceMatched} of ${s.chanceSampled} features moved 2 km away still matched (${percent(s.chanceMatched, s.chanceSampled)})`,
  },
  {
    id: 'rejected-next-door',
    label: 'Rejected next door',
    likelyCause: 'matcher',
    test: (s, bins) => {
      const near = sum(s.rejectedDistanceM.slice(0, bins.indexOf(10) + 1));
      return s.missingInOsm >= MIN_MISSING && near / s.missingInOsm > 0.4;
    },
    explain: (s, bins) => {
      const near = sum(s.rejectedDistanceM.slice(0, bins.indexOf(10) + 1));
      return `${percent(near, s.missingInOsm)} of missing features have a rejected candidate within 10 m`;
    },
  },
  {
    id: 'shared-osm',
    label: 'Shared OSM features',
    likelyCause: 'source',
    test: (s) => s.same >= MIN_MATCHES && s.sharedOsmFeatures / s.same > 0.2,
    explain: (s) => `${percent(s.sharedOsmFeatures, s.same)} of matches share their OpenStreetMap feature`,
  },
  {
    id: 'google-camera-coords',
    label: 'Positions copied from Google Maps',
    // The brand's own data, unless the spider reads positions from Google
    // Maps links with url_to_coords (alltheplaces/alltheplaces#20570).
    likelyCause: 'source',
    causeLabel: 'The brand’s data',
    test: hasGoogleCameraCoords,
    explain: (s) => {
      const { exact, hits } = cameraCounts(s)!;
      const offset = s.googleCameraCoordsOffsetDeg;
      const where =
        offset === null ? 'west' : `${describeLongitudeShift(offset, middleLatitude(s))} ${offset < 0 ? 'west' : 'east'}`;
      return (
        `${percent(hits, exact + hits)} of the features checked sit ${where} of an OpenStreetMap feature of the brand, ` +
        `as Google Maps camera centers do; ${s.sameGoogleCameraCoords} ${s.sameGoogleCameraCoords === 1 ? 'match' : 'matches'} used the corrected position`
      );
    },
  },
  {
    id: 'low-coverage',
    label: 'Low coverage',
    likelyCause: 'source',
    test: (s) => lowCoverageBrands(s).length > 0,
    explain: (s) => {
      const [b] = [...lowCoverageBrands(s)].sort((x, y) => (y.osmFeatures ?? 0) - (x.osmFeatures ?? 0));
      return `${b!.name ?? b!.wikidataId} in ${b!.country ?? '?'}: ${b!.osmFeatures} in OpenStreetMap, ${b!.atpFeatures} in AllThePlaces`;
    },
  },
  {
    id: 'no-license',
    label: 'No license',
    likelyCause: 'license',
    test: (s) => (s.dumpFeatures ?? 0) > 0 && s.notForOsm === s.dumpFeatures,
    explain: (s) => `All ${s.dumpFeatures} features have a license that doesn't allow OpenStreetMap`,
    info: true,
  },
];

export interface RaisedFlag {
  flag: Flag;
  reason: string;
}

export function flagsFor(s: SpiderStats, bins: number[]): RaisedFlag[] {
  return FLAGS.filter((f) => f.test(s, bins)).map((flag) => ({ flag, reason: flag.explain(s, bins) }));
}

export const CAUSE_LABELS: Record<LikelyCause, string> = {
  spider: 'Likely the spider',
  matcher: 'Likely our matcher',
  source: 'Spider or OpenStreetMap',
  license: 'License',
};
