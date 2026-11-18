// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The rows of the spider list, and how it sorts and filters them.

import {
  difference,
  dropScore,
  featureCount,
  featuresDropped,
  matchRate,
  matchRateDropped,
  matchRatePoints,
  previousOf,
  type Comparison,
  type Previous,
} from '../../lib/changes.ts';
import type { BrandCount, SpiderStats, SpiderStatsFile } from '../../lib/data/spiderStats.ts';
import { flagsFor, type RaisedFlag } from '../../lib/flags.ts';

export interface SpiderRow {
  stats: SpiderStats;
  flags: RaisedFlag[];
  // Features in the spider's file of the dump, or what AllThePlaces
  // says it wrote if there is no file.
  features: number;
  // (same + located_in) / rows, or null without rows.
  matchRate: number | null;
  // The spider in the previous file; see Previous.
  previous: Previous;
  // Since then: features gained or lost, and the match rate's change in
  // percentage points. Null without a previous spider, or a rate.
  featuresChange: number | null;
  matchRateChange: number | null;
  // How steeply it fell since then, for the "largest drop" order.
  drop: number;
  // Whether the features or the match rate fell enough to raise the
  // dropped flag.
  featuresDropped: boolean;
  matchRateDropped: boolean;
  countries: string[];
  // Flags that point to a problem, not just information.
  problems: number;
  // For the default order: flagged spiders first, larger ones higher.
  weight: number;
}

// `comparison` is the previous file, if there is one to compare with.
export function spiderRow(stats: SpiderStats, bins: number[], comparison: Comparison | null = null): SpiderRow {
  const previous = previousOf(comparison, stats.spider);
  const flags = flagsFor(stats, bins, { previous, since: comparison?.ref.date ?? null });
  const problems = flags.filter((f) => !f.flag.info).length;
  const features = featureCount(stats);
  const countries = [...new Set(stats.brands.map((b) => b.country).filter((c): c is string => c !== null))].sort();
  return {
    stats,
    flags,
    features,
    matchRate: matchRate(stats),
    previous,
    featuresChange: previous ? difference(features, featureCount(previous)) : null,
    matchRateChange: previous ? matchRatePoints(stats, previous) : null,
    drop: dropScore(stats, previous),
    featuresDropped: !!previous && featuresDropped(stats, previous),
    matchRateDropped: !!previous && matchRateDropped(stats, previous),
    countries,
    problems,
    // log2(2 + n) keeps a broken spider without features above zero; a
    // spider that lost its features weighs what it had last time.
    weight: problems * Math.log2(2 + Math.max(features, stats.atpFeatures ?? 0, previous ? featureCount(previous) : 0)),
  };
}

export type SortKey = 'default' | 'spider' | 'features' | 'matchRate' | 'flags' | 'drop';

export interface Filter {
  search: string;
  flag: string;
  country: string;
}

export function filterRows(rows: SpiderRow[], { search, flag, country }: Filter): SpiderRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (needle === '' || r.stats.spider.toLowerCase().includes(needle)) &&
      (flag === '' || r.flags.some((f) => f.flag.id === flag)) &&
      (country === '' || r.countries.includes(country)),
  );
}

const byName = (a: SpiderRow, b: SpiderRow) => a.stats.spider.localeCompare(b.stats.spider);

const COMPARE: Record<SortKey, (a: SpiderRow, b: SpiderRow) => number> = {
  default: (a, b) => b.weight - a.weight || b.features - a.features || byName(a, b),
  spider: byName,
  features: (a, b) => b.features - a.features || byName(a, b),
  // Spiders without rows last.
  matchRate: (a, b) => (a.matchRate ?? 2) - (b.matchRate ?? 2) || b.features - a.features,
  flags: (a, b) => b.problems - a.problems || b.flags.length - a.flags.length || b.features - a.features,
  // Steepest fall first, then the largest loss of features.
  drop: (a, b) => b.drop - a.drop || (a.featuresChange ?? 0) - (b.featuresChange ?? 0) || byName(a, b),
};

// Sorts by `key`; `reverse` flips the key's natural direction (largest
// first for counts, lowest match rate first, A to Z for names, steepest
// drop first).
export function sortRows(rows: SpiderRow[], key: SortKey, reverse = false): SpiderRow[] {
  const compare = COMPARE[key];
  return [...rows].sort(reverse ? (a, b) => compare(b, a) : compare);
}

export function allCountries(rows: SpiderRow[]): string[] {
  return [...new Set(rows.flatMap((r) => r.countries))].sort();
}

// For a Wikidata page: every spider and country with features of `qid`.
export interface Coverage {
  spider: string;
  brand: BrandCount;
}

export function coverageOf(file: SpiderStatsFile, qid: string): Coverage[] {
  return file.spiders
    .flatMap((s) => s.brands.filter((b) => b.wikidataId === qid).map((brand) => ({ spider: s.spider, brand })))
    .sort(
      (a, b) =>
        (a.brand.country ?? '').localeCompare(b.brand.country ?? '') || b.brand.atpFeatures - a.brand.atpFeatures,
    );
}
