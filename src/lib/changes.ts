// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// How spiders changed since the spider-stats.parquet published before
// the current one (brawer/osmdiffs#1004), usually a week earlier. A
// spider whose features halve, or whose match rate drops, most likely
// broke at its source or in its conversion.

import type { PreviousRef, SpiderStats, SpiderStatsFile } from './data/spiderStats.ts';

// What a spider is compared against: undefined where there is nothing to
// compare with (an older file, or the previous one not loaded), null
// for a spider that is new since the previous file.
export type Previous = SpiderStats | null | undefined;

// The previous file's spiders by name, and those that are gone.
export interface Comparison {
  ref: PreviousRef;
  byName: Map<string, SpiderStats>;
  // Spiders in the previous file but not in the current one, by name.
  removed: SpiderStats[];
}

export function compare(current: SpiderStatsFile, previous: SpiderStatsFile): Comparison | null {
  if (!current.previous) return null;
  const byName = new Map(previous.spiders.map((s) => [s.spider, s]));
  const now = new Set(current.spiders.map((s) => s.spider));
  const removed = previous.spiders.filter((s) => !now.has(s.spider)).sort((a, b) => a.spider.localeCompare(b.spider));
  return { ref: current.previous, byName, removed };
}

// The spider of this name in the previous file, if there is one to
// compare with.
export function previousOf(comparison: Comparison | null, spider: string): Previous {
  if (!comparison) return undefined;
  return comparison.byName.get(spider) ?? null;
}

// (same + located_in) / rows, or null without rows.
export function matchRate(s: SpiderStats): number | null {
  return s.rows > 0 ? (s.same + s.locatedIn) / s.rows : null;
}

// Features in the spider's file of the dump, or what AllThePlaces says
// it wrote if there is no file.
export function featureCount(s: SpiderStats): number {
  return s.dumpFeatures ?? s.atpFeatures ?? 0;
}

// now - then, or null if either is unknown.
export function difference(now: number | null, then: number | null): number | null {
  return now === null || then === null ? null : now - then;
}

// The change of the match rate in percentage points, rounded.
export function matchRatePoints(s: SpiderStats, previous: SpiderStats): number | null {
  const now = matchRate(s);
  const then = matchRate(previous);
  return now === null || then === null ? null : Math.round(100 * now) - Math.round(100 * then);
}

// Minimum sizes for the `dropped` flag, below which a change says
// little; a first guess, to be tuned on the first weeks of files with
// `osmdiffs:previous`, as for osmdiffs-app#25.
export const DROP_MIN_FEATURES = 20;
// Features at or below this share of last time's count.
export const DROP_MAX_FEATURE_SHARE = 0.5;
export const DROP_MIN_ROWS = 50;
// A match rate down by at least this many percentage points.
export const DROP_MIN_POINTS = 20;

export function featuresDropped(s: SpiderStats, previous: SpiderStats): boolean {
  const then = featureCount(previous);
  return then >= DROP_MIN_FEATURES && featureCount(s) <= DROP_MAX_FEATURE_SHARE * then;
}

export function matchRateDropped(s: SpiderStats, previous: SpiderStats): boolean {
  if (s.rows < DROP_MIN_ROWS || previous.rows < DROP_MIN_ROWS) return false;
  const points = matchRatePoints(s, previous);
  return points !== null && points <= -DROP_MIN_POINTS;
}

// How steeply a spider fell, for sorting: the larger of the share of
// features lost and the match rate's drop, weighted like the list's
// default order so that a large spider that broke comes before a tiny
// one. Zero for a spider that didn't fall, or has nothing to compare.
export function dropScore(s: SpiderStats, previous: Previous): number {
  if (!previous) return 0;
  const then = featureCount(previous);
  const lost = then > 0 ? Math.max(0, then - featureCount(s)) / then : 0;
  const points = matchRatePoints(s, previous) ?? 0;
  return Math.max(lost, -points / 100) * Math.log2(2 + then);
}
