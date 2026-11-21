// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FileMetaData } from 'hyparquet';
import { bboxBounds } from './bbox.ts';
import { dateInName, distanceBins, hasSplitLeftOut, previousFile, readSpiderStats, toSpiderStats } from './spiderStats.ts';

// Written by `osmdiffs conflate` from the pipeline's own test data.
function fixture(name = 'spider-stats.parquet'): ArrayBuffer {
  const b = readFileSync(new URL(`./testdata/${name}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// What spider-stats.parquet names in `osmdiffs:previous`; a smaller file
// made from it, with other counts, as last week's.
const PREVIOUS_FIXTURE = 'spider-stats-20251229-a1b2c3d4.parquet';

describe('readSpiderStats', () => {
  it('reads every spider, with the bins from the metadata', async () => {
    const file = await readSpiderStats(fixture());
    expect(file.distanceBinsM).toEqual([1, 10, 25, 50, 100, 250, 1000]);
    expect(file.spiders.map((s) => s.spider)).toEqual([
      'denner_ch',
      'empty',
      'mediamarkt',
      'misenso_ch',
      'tchibo',
      'winterthur_ch',
    ]);
  });

  it('turns counts into numbers and keeps nested lists', async () => {
    const { spiders } = await readSpiderStats(fixture());
    const denner = spiders.find((s) => s.spider === 'denner_ch')!;
    expect(denner.rows).toBe(1);
    expect(denner.same).toBe(1);
    expect(denner.distanceM).toEqual([0, 0, 1, 0, 0, 0, 0, 0]);
    expect(denner.offsetEastM).toBeCloseTo(-24.42, 1);
    expect(denner.rules).toEqual([{ rule: 'brand_wikidata', rows: 1 }]);
    expect(denner.tags.find((t) => t.tag === 'opening_hours')).toEqual({
      tag: 'opening_hours',
      atp: 1,
      agreeing: 0,
      differing: 1,
      missingInOsm: 0,
      kinds: [{ kind: 'unparsed', rows: 1 }],
    });
    expect(denner.tags.find((t) => t.tag === 'name')?.kinds).toEqual([]);
    expect(denner.values.find((v) => v.key === 'website')).toEqual({ key: 'website', atp: 1, unparsed: 0, topValueAtp: 1 });
    // No reader for names.
    expect(denner.values.find((v) => v.key === 'name')?.unparsed).toBeNull();
    expect(denner.brands).toEqual([
      expect.objectContaining({
        country: 'CH',
        wikidataId: 'Q379911',
        name: 'Denner',
        osmFeatures: 2,
        deletionCandidates: 1,
        deletionCandidatesByName: 0,
      }),
    ]);
    expect(denner.datasetAttributes?.['spider:lineage']).toBe('S_ATP_BRANDS');
  });

  it('reads a file from before deletion candidates by name', async () => {
    const { spiders } = await readSpiderStats(fixture('spider-stats-before-osmdiffs-1002.parquet'));
    const brands = spiders.flatMap((s) => s.brands);
    expect(brands.length).toBeGreaterThan(0);
    for (const b of brands) expect(b.deletionCandidatesByName).toBeNull();
  });

  it('reads a file from before kinds and values as empty lists', async () => {
    const { spiders } = await readSpiderStats(fixture('spider-stats-before-osmdiffs-1002.parquet'));
    expect(spiders.some((s) => s.tags.length > 0)).toBe(true);
    for (const s of spiders) {
      expect(s.values).toEqual([]);
      for (const t of s.tags) expect(t.kinds).toEqual([]);
    }
  });

  it('keeps the funnel adding up', async () => {
    const { spiders } = await readSpiderStats(fixture());
    for (const s of spiders) {
      expect(hasSplitLeftOut(s)).toBe(true);
      expect(s.invalid).toBeNull();
      const leftOut = (s.noGeometry ?? 0) + (s.badGeometry ?? 0) + (s.noKind ?? 0);
      expect((s.notForOsm ?? 0) + leftOut + (s.noMatcher ?? 0) + s.rows).toBe(s.dumpFeatures);
      expect(s.same + s.locatedIn + s.missingInOsm).toBe(s.rows);
      expect(s.missingNoCandidate + s.missingRejected + s.missingTaken).toBe(s.missingInOsm);
    }
  });

  it('keeps the funnel adding up in a file from before the split of invalid', async () => {
    const { spiders } = await readSpiderStats(fixture(PREVIOUS_FIXTURE));
    for (const s of spiders) {
      expect(hasSplitLeftOut(s)).toBe(false);
      expect(s.noGeometry).toBeNull();
      expect((s.notForOsm ?? 0) + (s.invalid ?? 0) + (s.noMatcher ?? 0) + s.rows).toBe(s.dumpFeatures);
      expect(s.same + s.locatedIn + s.missingInOsm).toBe(s.rows);
      expect(s.missingNoCandidate + s.missingRejected + s.missingTaken).toBe(s.missingInOsm);
    }
  });
});

describe('toSpiderStats', () => {
  it('reads BigInts, nulls and a map given as entries', () => {
    const s = toSpiderStats({
      spider: 'x',
      atp_features: 5n,
      dump_features: null,
      rows: 3n,
      dataset_attributes: [{ key: 'license', value: 'CC0' }],
      brands: [{ country: 'DE', wikidata_id: null, atp_features: 2n, osm_features: null }],
    });
    expect(s.atpFeatures).toBe(5);
    expect(s.dumpFeatures).toBeNull();
    expect(s.rows).toBe(3);
    expect(s.same).toBe(0);
    expect(s.distanceM).toEqual([]);
    expect(s.datasetAttributes).toEqual({ license: 'CC0' });
    expect(s.brands[0]).toMatchObject({ country: 'DE', wikidataId: null, atpFeatures: 2, osmFeatures: null });
    // Files from before v0.8.17 have no bounding boxes.
    expect(s.bbox).toBeNull();
    expect(s.brands[0]?.bbox).toBeNull();
    // Nor the Google Maps camera center probes, from before brawer/osmdiffs#973.
    expect(s.googleCameraCoordsHits).toBeNull();
    expect(s.sameGoogleCameraCoords).toBe(0);
    // Nor the same-kind counts and top opening hours, from before brawer/osmdiffs#975.
    expect(s.sharedPositionsSameKind).toBeNull();
    expect(s.sharedOsmFeaturesSameKind).toBeNull();
    expect(s.openingHoursTopValue).toBeNull();
    // Nor deletion candidates by name, from before brawer/osmdiffs#1002.
    expect(s.brands[0]?.deletionCandidatesByName).toBeNull();
  });

  it('reads deletion candidates by name, also for brands without an ID', () => {
    const s = toSpiderStats({
      spider: 'x',
      brands: [
        { country: 'CH', wikidata_id: 'Q1', deletion_candidates: 3n, deletion_candidates_by_name: 5n },
        { country: 'CH', wikidata_id: null, deletion_candidates: null, deletion_candidates_by_name: 2n },
      ],
    });
    expect(s.brands.map((b) => [b.deletionCandidates, b.deletionCandidatesByName])).toEqual([
      [3, 5],
      [null, 2],
    ]);
  });

  it('reads the same-kind counts and the top opening hours', () => {
    const s = toSpiderStats({
      spider: 'renault',
      shared_positions: 30n,
      shared_positions_same_kind: 2n,
      shared_osm_features: 25n,
      shared_osm_features_same_kind: 0n,
      opening_hours_top_share: 0.5,
      opening_hours_top_value: 'Mo-Fr 08:00-18:00',
    });
    expect(s.sharedPositions).toBe(30);
    expect(s.sharedPositionsSameKind).toBe(2);
    expect(s.sharedOsmFeatures).toBe(25);
    expect(s.sharedOsmFeaturesSameKind).toBe(0);
    expect(s.openingHoursTopValue).toBe('Mo-Fr 08:00-18:00');
  });

  it('reads the Google Maps camera center probes', () => {
    const s = toSpiderStats({
      spider: 'c_and_a',
      exact_coords_hits: 0n,
      google_camera_coords_hits: 46n,
      google_camera_coords_control: 0n,
      google_camera_coords_offset_deg: -0.0022116,
      same_google_camera_coords: 60n,
    });
    expect(s).toMatchObject({
      exactCoordsHits: 0,
      googleCameraCoordsHits: 46,
      googleCameraCoordsControl: 0,
      googleCameraCoordsOffsetDeg: -0.0022116,
      sameGoogleCameraCoords: 60,
    });
  });

  it('reads bounding boxes', () => {
    const box = { xmin: 5.9, ymin: 45.8, xmax: 10.5, ymax: 47.8 };
    const s = toSpiderStats({ spider: 'x', bbox: box, brands: [{ country: 'CH', bbox: box }] });
    expect(s.bbox).toEqual(box);
    expect(s.brands[0]?.bbox).toEqual(box);
  });
});

describe('bboxBounds', () => {
  it('gives west-south and east-north corners', () => {
    expect(bboxBounds({ xmin: 5.9, ymin: 45.8, xmax: 10.5, ymax: 47.8 })).toEqual([
      [5.9, 45.8],
      [10.5, 47.8],
    ]);
  });

  it('goes east across the antimeridian', () => {
    expect(bboxBounds({ xmin: 177, ymin: -19, xmax: -179, ymax: -16 })).toEqual([
      [177, -19],
      [181, -16],
    ]);
  });
});

describe('the previous file', () => {
  const meta = (value?: string) =>
    ({ key_value_metadata: value === undefined ? [] : [{ key: 'osmdiffs:previous', value }] }) as unknown as FileMetaData;
  const here = 'https://osmdiffs.example/data/spider-stats-20261116-0f0f0f0f.parquet';

  it('resolves next to the current file, with the date in its name', () => {
    expect(previousFile(meta('spider-stats-20261109-a1b2c3d4.parquet'), here)).toEqual({
      name: 'spider-stats-20261109-a1b2c3d4.parquet',
      url: 'https://osmdiffs.example/data/spider-stats-20261109-a1b2c3d4.parquet',
      date: '2026-11-09',
    });
  });

  it('is null without the key', () => {
    expect(previousFile(meta(), here)).toBeNull();
    expect(previousFile(meta(''), here)).toBeNull();
  });

  it('keeps a name it can’t resolve, and one without a date', () => {
    expect(previousFile(meta('old.parquet'), '')).toEqual({ name: 'old.parquet', url: 'old.parquet', date: null });
    expect(dateInName('spider-stats-2026110-x.parquet')).toBeNull();
  });

  it('is named in the fixture, which the previous one names none', async () => {
    const url = 'https://osmdiffs.example/data/spider-stats.parquet';
    const current = await readSpiderStats(fixture(), url);
    expect(current.previous).toEqual({
      name: PREVIOUS_FIXTURE,
      url: `https://osmdiffs.example/data/${PREVIOUS_FIXTURE}`,
      date: dateInName(PREVIOUS_FIXTURE),
    });
    const previous = await readSpiderStats(fixture(PREVIOUS_FIXTURE), url);
    expect(previous.previous).toBeNull();
    expect(previous.spiders.length).toBeLessThan(current.spiders.length);
    // Nor in files from before brawer/osmdiffs#1004.
    expect((await readSpiderStats(fixture('spider-stats-before-osmdiffs-1002.parquet'), url)).previous).toBeNull();
  });
});

describe('distanceBins', () => {
  const meta = (value?: string) =>
    ({ key_value_metadata: value === undefined ? [] : [{ key: 'osmdiffs:distance_bins_m', value }] }) as unknown as FileMetaData;

  it('reads comma-separated and JSON bounds', () => {
    expect(distanceBins(meta('1,10,100'))).toEqual([1, 10, 100]);
    expect(distanceBins(meta('[5, 50]'))).toEqual([5, 50]);
  });

  it('falls back to the default bounds', () => {
    expect(distanceBins(meta())).toEqual([1, 10, 25, 50, 100, 250, 1000]);
    expect(distanceBins(meta('nonsense'))).toEqual([1, 10, 25, 50, 100, 250, 1000]);
  });
});
