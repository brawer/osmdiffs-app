// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The rows of the spider list, and how it sorts and filters them.

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
  countries: string[];
  // For the default order: flagged spiders first, larger ones higher.
  weight: number;
}

export function spiderRow(stats: SpiderStats, bins: number[]): SpiderRow {
  const flags = flagsFor(stats, bins);
  const features = stats.dumpFeatures ?? stats.atpFeatures ?? 0;
  const countries = [...new Set(stats.brands.map((b) => b.country).filter((c): c is string => c !== null))].sort();
  return {
    stats,
    flags,
    features,
    matchRate: stats.rows > 0 ? (stats.same + stats.locatedIn) / stats.rows : null,
    countries,
    // log2(2 + n) keeps a broken spider without features above zero.
    weight: flags.length * Math.log2(2 + Math.max(features, stats.atpFeatures ?? 0)),
  };
}

export type SortKey = 'default' | 'spider' | 'features' | 'matchRate' | 'flags';

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
  flags: (a, b) => b.flags.length - a.flags.length || b.features - a.features,
};

// Sorts by `key`; `reverse` flips the key's natural direction (largest
// first for counts, lowest match rate first, A to Z for names).
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
