// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  compare,
  dropScore,
  featuresDropped,
  matchRatePoints,
  matchRateDropped,
  previousOf,
} from './changes.ts';
import { readSpiderStats, toSpiderStats, type SpiderStats, type SpiderStatsFile } from './data/spiderStats.ts';
import { flagsFor } from './flags.ts';

const BINS = [1, 10, 25, 50, 100, 250, 1000];

function spider(name: string, features: number, matched = features, rows = features): SpiderStats {
  return toSpiderStats({
    spider: name,
    atp_features: features,
    dump_features: features,
    rows,
    same: matched,
    missing_in_osm: rows - matched,
  });
}

function file(spiders: SpiderStats[], previous: string | null = null): SpiderStatsFile {
  return {
    spiders,
    previous: previous === null ? null : { name: previous, url: previous, date: '2026-11-09' },
    distanceBinsM: BINS,
  };
}

describe('compare', () => {
  const now = file([spider('kept', 100), spider('new_one', 10)], 'spider-stats-20261109-a1b2c3d4.parquet');
  const then = file([spider('kept', 90), spider('gone_b', 5), spider('gone_a', 7)]);

  it('finds each spider last time, new ones, and the ones that are gone', () => {
    const c = compare(now, then)!;
    expect(c.ref.date).toBe('2026-11-09');
    expect(previousOf(c, 'kept')?.atpFeatures).toBe(90);
    expect(previousOf(c, 'new_one')).toBeNull();
    expect(c.removed.map((s) => s.spider)).toEqual(['gone_a', 'gone_b']);
  });

  it('compares nothing for a file that names no previous one', () => {
    expect(compare(file([spider('kept', 1)]), then)).toBeNull();
    expect(previousOf(null, 'kept')).toBeUndefined();
  });
});

describe('drops', () => {
  it('counts halved features as dropped, but not for tiny spiders', () => {
    expect(featuresDropped(spider('x', 50), spider('x', 100))).toBe(true);
    expect(featuresDropped(spider('x', 0), spider('x', 100))).toBe(true);
    expect(featuresDropped(spider('x', 51), spider('x', 100))).toBe(false);
    expect(featuresDropped(spider('x', 0), spider('x', 19))).toBe(false);
  });

  it('counts a match rate down by 20 points or more as dropped', () => {
    const before = spider('x', 100, 80);
    expect(matchRatePoints(spider('x', 100, 60), before)).toBe(-20);
    expect(matchRateDropped(spider('x', 100, 60), before)).toBe(true);
    expect(matchRateDropped(spider('x', 100, 61), before)).toBe(false);
    // Too few rows to say.
    expect(matchRateDropped(spider('x', 40, 0), spider('x', 40, 40))).toBe(false);
  });

  it('scores a large spider that broke above a small one, and growth as zero', () => {
    const big = dropScore(spider('x', 0), spider('x', 5000));
    const small = dropScore(spider('x', 0), spider('x', 30));
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
    expect(dropScore(spider('x', 200), spider('x', 100))).toBe(0);
    expect(dropScore(spider('x', 0), null)).toBe(0);
    expect(dropScore(spider('x', 0), undefined)).toBe(0);
  });
});

describe('the dropped flag', () => {
  const reasons = (s: SpiderStats, previous: SpiderStats | null | undefined, since: string | null = '2026-11-09') =>
    flagsFor(s, BINS, { previous, since })
      .filter((f) => f.flag.id === 'dropped')
      .map((f) => f.reason);

  it('says how far features fell, and since when', () => {
    expect(reasons(spider('x', 0), spider('x', 1200))).toEqual(['Features fell from 1200 to 0 since 2026-11-09']);
    expect(reasons(spider('x', 0), spider('x', 1200), null)).toEqual(['Features fell from 1200 to 0 since last time']);
  });

  it('says how far the match rate fell', () => {
    expect(reasons(spider('x', 100, 45), spider('x', 100, 80))).toEqual([
      'The match rate fell from 80% to 45% since 2026-11-09',
    ]);
    expect(reasons(spider('x', 60, 0), spider('x', 200, 160))).toEqual([
      'Features fell from 200 to 60 since 2026-11-09; the match rate fell from 80% to 0%',
    ]);
  });

  it('stays down without a previous spider', () => {
    expect(reasons(spider('x', 0), null)).toEqual([]);
    expect(reasons(spider('x', 0), undefined)).toEqual([]);
    expect(flagsFor(spider('x', 0), BINS).map((f) => f.flag.id)).not.toContain('dropped');
  });
});

describe('the test files', () => {
  const read = (name: string) => {
    const b = readFileSync(new URL(`./data/testdata/${name}`, import.meta.url));
    return readSpiderStats(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), `https://x.example/data/${name}`);
  };

  it('compare the current file with the one it names', async () => {
    const current = await read('spider-stats.parquet');
    const previous = await read(current.previous!.name);
    const c = compare(current, previous)!;
    expect(c.removed.map((s) => s.spider)).toEqual(['gone_ch']);
    expect(current.spiders.filter((s) => previousOf(c, s.spider) === null).map((s) => s.spider)).toEqual([
      'empty',
      'winterthur_ch',
    ]);
    const denner = current.spiders.find((s) => s.spider === 'denner_ch')!;
    expect(flagsFor(denner, current.distanceBinsM, { previous: previousOf(c, 'denner_ch'), since: c.ref.date })
      .find((f) => f.flag.id === 'dropped')?.reason).toBe('Features fell from 40 to 1 since 2025-12-29');
  });
});
