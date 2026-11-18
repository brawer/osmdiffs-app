// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { compare } from '../../lib/changes.ts';
import { toSpiderStats } from '../../lib/data/spiderStats.ts';
import { allCountries, filterRows, sortRows, spiderRow } from './spiderTable.ts';

const BINS = [1, 10, 25, 50, 100, 250, 1000];

const rows = [
  spiderRow(
    toSpiderStats({
      spider: 'big_ok',
      atp_features: 5000,
      dump_features: 5000,
      rows: 5000,
      same: 4000,
      missing_in_osm: 1000,
      brands: [{ country: 'DE', atp_features: 5000 }],
    }),
    BINS,
  ),
  spiderRow(
    toSpiderStats({
      spider: 'small_stacked',
      atp_features: 30,
      dump_features: 30,
      rows: 30,
      same: 10,
      missing_in_osm: 20,
      shared_positions: 20,
      brands: [{ country: 'FR', atp_features: 30 }],
    }),
    BINS,
  ),
  spiderRow(
    toSpiderStats({
      spider: 'large_stacked',
      atp_features: 900,
      dump_features: 900,
      rows: 900,
      same: 900,
      shared_positions: 400,
      brands: [{ country: 'FR', atp_features: 900 }, { country: 'DE', atp_features: 1 }],
    }),
    BINS,
  ),
  spiderRow(toSpiderStats({ spider: 'broken', atp_features: 0, atp_errors: 4, dump_features: 0 }), BINS),
  spiderRow(toSpiderStats({ spider: 'unlicensed', atp_features: 9000, dump_features: 9000, not_for_osm: 9000 }), BINS),
];

const names = (rs: typeof rows) => rs.map((r) => r.stats.spider);

describe('spiderRow', () => {
  it('computes the match rate and countries', () => {
    expect(rows[0]!.matchRate).toBe(0.8);
    expect(rows[2]!.countries).toEqual(['DE', 'FR']);
    expect(rows[3]!.matchRate).toBeNull();
    // A license that rules out OpenStreetMap is information, not a problem.
    expect(rows[4]!.flags.map((f) => f.flag.id)).toEqual(['no-license']);
    expect(rows[4]!.problems).toBe(0);
  });
});

describe('sortRows', () => {
  it('puts flagged spiders first, larger ones higher', () => {
    expect(names(sortRows(rows, 'default'))).toEqual(['large_stacked', 'small_stacked', 'broken', 'unlicensed', 'big_ok']);
  });

  it('sorts by features, match rate and name', () => {
    expect(names(sortRows(rows, 'features'))).toEqual(['unlicensed', 'big_ok', 'large_stacked', 'small_stacked', 'broken']);
    expect(names(sortRows(rows, 'matchRate'))).toEqual(['small_stacked', 'big_ok', 'large_stacked', 'unlicensed', 'broken']);
    expect(names(sortRows(rows, 'spider', true))).toEqual(['unlicensed', 'small_stacked', 'large_stacked', 'broken', 'big_ok']);
  });
});

describe('filterRows', () => {
  it('filters by name, flag and country', () => {
    expect(names(filterRows(rows, { search: 'STACK', flag: '', country: '' }))).toEqual(['small_stacked', 'large_stacked']);
    expect(names(filterRows(rows, { search: '', flag: 'broken', country: '' }))).toEqual(['broken']);
    expect(names(filterRows(rows, { search: '', flag: 'stacked', country: 'DE' }))).toEqual(['large_stacked']);
  });

  it('lists every country', () => {
    expect(allCountries(rows)).toEqual(['DE', 'FR']);
  });
});

describe('changes since the previous file', () => {
  const stats = (spider: string, features: number, same = features) =>
    toSpiderStats({ spider, atp_features: features, dump_features: features, rows: features, same, missing_in_osm: features - same });
  const now = [stats('steady', 1000), stats('halved', 500), stats('worse', 100, 50), stats('fresh', 10)];
  const then = [stats('steady', 990), stats('halved', 1000), stats('worse', 100, 90), stats('gone', 20)];
  const comparison = compare(
    { spiders: now, previous: { name: 'p', url: 'p', date: '2026-11-09' }, distanceBinsM: BINS },
    { spiders: then, previous: null, distanceBinsM: BINS },
  );
  const changed = now.map((s) => spiderRow(s, BINS, comparison));

  it('gives each row its change, and marks new spiders', () => {
    expect(changed.map((r) => [r.stats.spider, r.featuresChange, r.matchRateChange])).toEqual([
      ['steady', 10, 0],
      ['halved', -500, 0],
      ['worse', 0, -40],
      ['fresh', null, null],
    ]);
    expect(changed[3]!.previous).toBeNull();
    expect(changed.filter((r) => r.flags.some((f) => f.flag.id === 'dropped')).map((r) => r.stats.spider)).toEqual([
      'halved',
      'worse',
    ]);
  });

  it('sorts by the largest drop', () => {
    expect(names(sortRows(changed, 'drop'))).toEqual(['halved', 'worse', 'fresh', 'steady']);
  });

  it('has no changes without a comparison', () => {
    const row = spiderRow(now[1]!, BINS);
    expect(row.previous).toBeUndefined();
    expect(row.featuresChange).toBeNull();
    expect(row.drop).toBe(0);
  });
});
