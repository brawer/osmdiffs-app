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

import {
  featureCount,
  featuresDropped,
  matchRate,
  matchRateDropped,
  type Previous,
} from './changes.ts';
import type { BrandCount, SpiderStats, ValueCount } from './data/spiderStats.ts';

export type LikelyCause = 'spider' | 'matcher' | 'source' | 'license';

// What flags about change compare against.
export interface FlagContext {
  // The spider in the previous file; see Previous.
  previous: Previous;
  // That file's date, such as 2026-11-09, if known.
  since: string | null;
}

const NO_PREVIOUS: FlagContext = { previous: undefined, since: null };

export interface Flag {
  id: string;
  label: string;
  likelyCause: LikelyCause;
  // Says who is likely at fault where CAUSE_LABELS is too broad.
  causeLabel?: string;
  // Whether the flag applies; `bins` are the distance histogram's bounds.
  test: (s: SpiderStats, bins: number[], context: FlagContext) => boolean;
  // A one-line reason, with the numbers.
  explain: (s: SpiderStats, bins: number[], context: FlagContext) => string;
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

// Stacking among features of the same kind (brawer/osmdiffs#975), so that
// a car dealer's sales and service, or a bank's branch and ATM, don't
// count; older files only have the counts over all features.
const sharedPositions = (s: SpiderStats) => s.sharedPositionsSameKind ?? s.sharedPositions;
const sharedOsmFeatures = (s: SpiderStats) => s.sharedOsmFeaturesSameKind ?? s.sharedOsmFeatures;

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)';
const DAY_SELECTOR = `${DAY}(?:\\s*-\\s*${DAY})?(?:\\s*,\\s*${DAY}(?:\\s*-\\s*${DAY})?)*`;
const SPAN = '\\d{1,2}:\\d{2}\\s*-\\s*\\d{1,2}:\\d{2}';
// One day selector, if any, with its time spans; a comma may follow and
// start the next one, as in `Mo-Fr 00:00-24:00, Sa,Su 00:00-24:00`.
const SEGMENT = new RegExp(`\\s*(${DAY_SELECTOR})?\\s*(${SPAN}(?:\\s*,\\s*${SPAN})*)\\s*(?:,|$)`, 'y');

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return 60 * h! + m!;
};

// The weekdays (0 for Monday) of a selector such as `Mo-Fr,Su`; public
// and school holidays add none.
function weekdays(selector: string): number[] {
  const days: number[] = [];
  for (const part of selector.split(',')) {
    const [from, to] = part.split('-').map((d) => DAYS.indexOf(d.trim()));
    if (from === undefined || from < 0) continue;
    const end = to === undefined ? from : to;
    if (end < 0) continue;
    for (let d = from; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === end) break;
    }
  }
  return days;
}

// Whether time spans such as `00:00-12:00,12:00-24:00` cover the day.
function wholeDay(spans: string): boolean {
  const ranges = spans
    .split(',')
    .map((span) => span.split('-').map((t) => minutes(t.trim())) as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  for (const [start, end] of ranges) {
    if (start > covered) return false;
    covered = Math.max(covered, end);
  }
  return covered >= 24 * 60;
}

// Whether an opening_hours value means open around the clock: `24/7`,
// but also `Mo-Su 00:00-24:00`, `00:00-24:00` or `Mo-Fr 00:00-24:00;
// Sa,Su 00:00-24:00`, where every rule covers whole days and together they
// cover the week. Anything this doesn't understand, such as `off` or
// month selectors, counts as not always open.
export function isAlwaysOpen(value: string): boolean {
  const covered = new Set<number>();
  for (const rule of value.split(/;|\|\|/)) {
    const text = rule.trim();
    if (text === '') continue;
    if (text === '24/7') {
      DAYS.forEach((_, d) => covered.add(d));
      continue;
    }
    SEGMENT.lastIndex = 0;
    while (SEGMENT.lastIndex < text.length) {
      const m = SEGMENT.exec(text);
      if (!m) return false;
      const [, selector, spans] = m;
      if (!wholeDay(spans!)) return false;
      (selector ? weekdays(selector) : DAYS.map((_, d) => d)).forEach((d) => covered.add(d));
    }
  }
  return covered.size === DAYS.length;
}

// Opening hours to quote in a reason, cut if long.
function quoteHours(value: string): string {
  const max = 60;
  return `“${value.length > max ? `${value.slice(0, max - 1)}…` : value}”`;
}

// Value quality (brawer/osmdiffs#1000): values the pipeline can't read,
// and one value given to many features. The thresholds are a first
// guess, to be tuned on the next planet run, as for osmdiffs-app#25.
export const VALUES_MIN_FEATURES = 20;
// Share of a key's values that can't be read, above which it is flagged.
export const UNPARSED_MAX_SHARE = 0.5;
// Share of the most common value, above which it is suspicious for keys
// whose value should differ from feature to feature. For name and brand,
// a high share is normal.
export const TOP_VALUE_MAX_SHARE = 0.5;
export const SHARED_VALUE_KEYS = new Set(['phone', 'email', 'opening_hours', 'addr:street']);
// The keys the shared-contact flag looks at; opening_hours has its own
// flag, and a shared street is only a hint.
const SHARED_CONTACT_KEYS = ['phone', 'email'];

export function unparsedShare(v: ValueCount): number | null {
  return v.unparsed === null || v.atp === 0 ? null : v.unparsed / v.atp;
}

export function topValueShare(v: ValueCount): number | null {
  return v.atp === 0 ? null : v.topValueAtp / v.atp;
}

export function hasManyUnparsed(v: ValueCount): boolean {
  return v.atp >= VALUES_MIN_FEATURES && (unparsedShare(v) ?? 0) > UNPARSED_MAX_SHARE;
}

export function hasSuspiciousTopValue(v: ValueCount): boolean {
  return SHARED_VALUE_KEYS.has(v.key) && v.atp >= VALUES_MIN_FEATURES && (topValueShare(v) ?? 0) > TOP_VALUE_MAX_SHARE;
}

// Keys with many values that can't be read, the worst first.
export function badValueKeys(s: SpiderStats): ValueCount[] {
  return s.values.filter(hasManyUnparsed).sort((a, b) => unparsedShare(b)! - unparsedShare(a)!);
}

// phone and email keys that most features share one value of, the way
// a spider may give its head office's number to every store.
export function sharedContactKeys(s: SpiderStats): ValueCount[] {
  return s.values
    .filter((v) => SHARED_CONTACT_KEYS.includes(v.key) && hasSuspiciousTopValue(v))
    .sort((a, b) => topValueShare(b)! - topValueShare(a)!);
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
    id: 'dropped',
    label: 'Dropped',
    likelyCause: 'spider',
    causeLabel: 'Likely the spider or its source',
    test: (s, _, { previous }) => !!previous && (featuresDropped(s, previous) || matchRateDropped(s, previous)),
    explain: (s, _, { previous, since }) => {
      const when = since ? `since ${since}` : 'since last time';
      const parts: string[] = [];
      if (featuresDropped(s, previous!)) {
        parts.push(`Features fell from ${featureCount(previous!)} to ${featureCount(s)} ${when}`);
      }
      if (matchRateDropped(s, previous!)) {
        const pct = (rate: number | null) => `${Math.round(100 * (rate ?? 0))}%`;
        parts.push(`${parts.length ? 'the' : 'The'} match rate fell from ${pct(matchRate(previous!))} to ${pct(matchRate(s))}${parts.length ? '' : ` ${when}`}`);
      }
      return parts.join('; ');
    },
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
    // spot, which is right; 10% caught too many of them. Files from
    // brawer/osmdiffs#975 on leave those out, so this can come down once
    // retuned on a planet run with them.
    test: (s) => s.rows >= MIN_ROWS && sharedPositions(s) / s.rows > 0.25,
    explain: (s) =>
      `${percent(sharedPositions(s), s.rows)} of features share their position with another` +
      (s.sharedPositionsSameKind === null ? '' : ' of the same kind'),
  },
  {
    id: 'same-hours',
    label: 'Same hours everywhere',
    likelyCause: 'spider',
    // 24/7 convenience stores and fuel stations really do share their
    // hours. Files from brawer/osmdiffs#975 on say which hours, so those
    // are skipped; older ones need nearly all alike. The threshold can
    // likely come down once retuned on a planet run with them.
    test: (s) =>
      (s.openingHoursTopShare ?? 0) > 0.99 &&
      s.rows >= 50 &&
      (s.openingHoursTopValue === null || !isAlwaysOpen(s.openingHoursTopValue)),
    explain: (s) => {
      const share = `${Math.round((s.openingHoursTopShare ?? 0) * 100)}%`;
      return s.openingHoursTopValue === null
        ? `${share} of features have the same opening hours`
        : `${share} of features have ${quoteHours(s.openingHoursTopValue)}`;
    },
  },
  {
    id: 'bad-values',
    label: 'Unreadable values',
    likelyCause: 'spider',
    test: (s) => badValueKeys(s).length > 0,
    explain: (s) => {
      const keys = badValueKeys(s);
      const [worst] = keys;
      const more = keys.length > 1 ? `; also ${keys.slice(1).map((v) => `${v.key} (${percent(v.unparsed!, v.atp)})`).join(', ')}` : '';
      return `${percent(worst!.unparsed!, worst!.atp)} of ${worst!.key} values can’t be read${more}`;
    },
  },
  {
    id: 'shared-contact',
    label: 'Shared phone or email',
    likelyCause: 'spider',
    test: (s) => sharedContactKeys(s).length > 0,
    explain: (s) =>
      sharedContactKeys(s)
        .map((v) => `${percent(v.topValueAtp, v.atp)} of features with ${v.key} have the same one`)
        .join('; '),
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
    test: (s) => s.same >= MIN_MATCHES && sharedOsmFeatures(s) / s.same > 0.2,
    explain: (s) =>
      `${percent(sharedOsmFeatures(s), s.same)} of matches share their OpenStreetMap feature` +
      (s.sharedOsmFeaturesSameKind === null ? '' : ' with one of the same kind'),
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

// `context` is what flags about change compare against; without it they
// don't fire.
export function flagsFor(s: SpiderStats, bins: number[], context: FlagContext = NO_PREVIOUS): RaisedFlag[] {
  return FLAGS.filter((f) => f.test(s, bins, context)).map((flag) => ({ flag, reason: flag.explain(s, bins, context) }));
}

export const CAUSE_LABELS: Record<LikelyCause, string> = {
  spider: 'Likely the spider',
  matcher: 'Likely our matcher',
  source: 'Spider or OpenStreetMap',
  license: 'License',
};
