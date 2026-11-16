// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FileMetaData } from 'hyparquet';
import { bboxBounds } from './bbox.ts';
import { distanceBins, readSpiderStats, toSpiderStats } from './spiderStats.ts';

// Written by `osmdiffs conflate` from the pipeline's own test data.
function fixture(): ArrayBuffer {
  const b = readFileSync(new URL('./testdata/spider-stats.parquet', import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

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
    });
    expect(denner.brands).toEqual([
      expect.objectContaining({ country: 'CH', wikidataId: 'Q379911', name: 'Denner', osmFeatures: 1 }),
    ]);
    expect(denner.datasetAttributes?.['spider:lineage']).toBe('S_ATP_BRANDS');
  });

  it('keeps the funnel adding up', async () => {
    const { spiders } = await readSpiderStats(fixture());
    for (const s of spiders) {
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
