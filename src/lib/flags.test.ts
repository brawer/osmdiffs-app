// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { toSpiderStats, type BrandCount, type SpiderStats } from './data/spiderStats.ts';
import { describeOffset, flagsFor } from './flags.ts';

const BINS = [1, 10, 25, 50, 100, 250, 1000];

// A healthy spider of 100 features, all matched close by.
function spider(overrides: Partial<SpiderStats> = {}): SpiderStats {
  return {
    ...toSpiderStats({ spider: 'test' }),
    atpFeatures: 100,
    atpErrors: 0,
    dumpFeatures: 100,
    notForOsm: 0,
    rows: 100,
    same: 100,
    offsetEastM: 1,
    offsetNorthM: -2,
    distanceM: [10, 80, 10, 0, 0, 0, 0, 0],
    chanceSampled: 100,
    chanceMatched: 1,
    openingHoursTopShare: 0.2,
    ...overrides,
  };
}

function brand(overrides: Partial<BrandCount>): BrandCount {
  return {
    country: 'NL',
    wikidataId: 'Q1',
    name: 'Brand',
    atpFeatures: 50,
    same: 50,
    locatedIn: 0,
    missingInOsm: 0,
    osmFeatures: 50,
    deletionCandidates: 0,
    offsetEastM: 0,
    offsetNorthM: 0,
    bbox: null,
    ...overrides,
  };
}

const ids = (s: SpiderStats) => flagsFor(s, BINS).map((f) => f.flag.id);

describe('flagsFor', () => {
  it('raises nothing for a healthy spider', () => {
    expect(ids(spider())).toEqual([]);
  });

  it('flags a broken spider', () => {
    expect(ids(spider({ atpErrors: 3, dumpFeatures: 0, rows: 0, same: 0 }))).toContain('broken');
    const [flag] = flagsFor(spider({ atpFeatures: 120 }), BINS);
    expect(flag?.flag.id).toBe('broken');
    expect(flag?.reason).toBe('AllThePlaces reports 120 features, the dump has 100');
  });

  it('flags a shift, like c_and_a 150 m west', () => {
    const [flag] = flagsFor(spider({ offsetEastM: -155, offsetNorthM: 3 }), BINS);
    expect(flag?.flag.id).toBe('shifted');
    expect(flag?.reason).toBe('Matches lie a median 155 m west, 3 m north of OpenStreetMap');
  });

  it('flags a shift in one country only, like hema in the Netherlands', () => {
    const s = spider({ brands: [brand({ country: 'NL', offsetNorthM: 99 }), brand({ country: 'BE' })] });
    const [flag] = flagsFor(s, BINS);
    expect(flag?.flag.id).toBe('shifted');
    expect(flag?.reason).toBe('Shifted in NL');
  });

  it('ignores a shift with too few matches', () => {
    expect(ids(spider({ same: 5, rows: 5, offsetEastM: -155 }))).not.toContain('shifted');
  });

  it('flags far matches from 100 m on', () => {
    const s = spider({ distanceM: [10, 30, 10, 0, 5, 30, 15, 0] });
    expect(flagsFor(s, BINS).find((f) => f.flag.id === 'far')?.reason).toBe('45% of matches are 100 m or more apart');
    expect(ids(spider({ distanceM: [10, 50, 10, 0, 5, 20, 5, 0] }))).not.toContain('far');
    expect(ids(spider({ same: 10, rows: 10, distanceM: [0, 0, 0, 0, 0, 10, 0, 0] }))).not.toContain('far');
  });

  it('flags stacked positions', () => {
    expect(ids(spider({ sharedPositions: 26 }))).toContain('stacked');
    expect(ids(spider({ sharedPositions: 25 }))).not.toContain('stacked');
  });

  it('flags the same hours everywhere, like shell', () => {
    expect(ids(spider({ openingHoursTopShare: 0.995 }))).toContain('same-hours');
    expect(ids(spider({ openingHoursTopShare: 0.95 }))).not.toContain('same-hours');
    expect(ids(spider({ openingHoursTopShare: 0.995, rows: 40, same: 40, dumpFeatures: 40, atpFeatures: 40 }))).not.toContain(
      'same-hours',
    );
  });

  it('flags chance matches', () => {
    expect(ids(spider({ chanceMatched: 11 }))).toContain('chance');
    expect(ids(spider({ chanceMatched: 10 }))).not.toContain('chance');
    expect(ids(spider({ chanceSampled: 10, chanceMatched: 5 }))).not.toContain('chance');
  });

  it('flags rejected candidates within 10 m', () => {
    const s = spider({ same: 50, missingInOsm: 50, missingRejected: 50, rejectedDistanceM: [10, 15, 25, 0, 0, 0, 0, 0] });
    expect(flagsFor(s, BINS).find((f) => f.flag.id === 'rejected-next-door')?.reason).toBe(
      '50% of missing features have a rejected candidate within 10 m',
    );
    const few = spider({ same: 70, missingInOsm: 30, missingRejected: 30, rejectedDistanceM: [30, 0, 0, 0, 0, 0, 0, 0] });
    expect(ids(few)).not.toContain('rejected-next-door');
  });

  it('flags shared OpenStreetMap features', () => {
    expect(ids(spider({ sharedOsmFeatures: 21 }))).toContain('shared-osm');
    expect(ids(spider({ sharedOsmFeatures: 20 }))).not.toContain('shared-osm');
  });

  it('flags low coverage, naming the largest gap', () => {
    const s = spider({
      brands: [brand({ country: 'DE', atpFeatures: 10, osmFeatures: 30 }), brand({ country: 'FR', atpFeatures: 60, osmFeatures: 300 })],
    });
    expect(flagsFor(s, BINS).find((f) => f.flag.id === 'low-coverage')?.reason).toBe(
      'Brand in FR: 300 in OpenStreetMap, 60 in AllThePlaces',
    );
    expect(ids(spider({ brands: [brand({ atpFeatures: 5, osmFeatures: 15 })] }))).not.toContain('low-coverage');
    // A brand the spider lists only in passing.
    expect(ids(spider({ brands: [brand({ atpFeatures: 25, osmFeatures: 800 })] }))).not.toContain('low-coverage');
  });

  it('flags positions copied from Google Maps, like c_and_a in Switzerland', () => {
    const s = spider({
      bbox: { xmin: 5.9, ymin: 45.8, xmax: 10.5, ymax: 47.8 },
      exactCoordsHits: 0,
      googleCameraCoordsHits: 46,
      googleCameraCoordsControl: 0,
      googleCameraCoordsOffsetDeg: -0.0022116,
      sameGoogleCameraCoords: 60,
    });
    const [flag, ...rest] = flagsFor(s, BINS);
    expect(rest).toEqual([]);
    expect(flag?.flag.id).toBe('google-camera-coords');
    expect(flag?.flag.likelyCause).toBe('source');
    expect(flag?.reason).toBe(
      '100% of the features checked sit 0.0022° (169 m) west of an OpenStreetMap feature of the brand, ' +
        'as Google Maps camera centers do; 60 matches used the corrected position',
    );
  });

  it('leaves out the meters without a bounding box', () => {
    const s = spider({
      exactCoordsHits: 30,
      googleCameraCoordsHits: 20,
      googleCameraCoordsControl: 1,
      googleCameraCoordsOffsetDeg: -0.0022,
      sameGoogleCameraCoords: 1,
    });
    expect(flagsFor(s, BINS)[0]?.reason).toBe(
      '40% of the features checked sit 0.0022° west of an OpenStreetMap feature of the brand, ' +
        'as Google Maps camera centers do; 1 match used the corrected position',
    );
  });

  it('applies the pipeline’s rule for Google Maps camera centers', () => {
    const camera = (hits: number, control: number, exact: number) =>
      ids(spider({ googleCameraCoordsHits: hits, googleCameraCoordsControl: control, exactCoordsHits: exact }));
    expect(camera(8, 1, 72)).toContain('google-camera-coords');
    // Too few hits.
    expect(camera(7, 0, 0)).not.toContain('google-camera-coords');
    // Dense data, such as stadt_zuerich_ch's trees: as many controls.
    expect(camera(516, 505, 0)).not.toContain('google-camera-coords');
    expect(camera(12, 2, 0)).toContain('google-camera-coords');
    expect(camera(11, 2, 0)).not.toContain('google-camera-coords');
    // A large spider with a few stores entered by hand, like valora.
    expect(camera(9, 0, 373)).not.toContain('google-camera-coords');
    expect(camera(8, 1, 73)).not.toContain('google-camera-coords');
    // Files from before brawer/osmdiffs#973.
    expect(ids(spider())).not.toContain('google-camera-coords');
  });

  it('flags a license that excludes OpenStreetMap', () => {
    expect(ids(spider({ notForOsm: 100, rows: 0, same: 0 }))).toEqual(['no-license']);
  });
});

describe('describeOffset', () => {
  it('names the larger part first', () => {
    expect(describeOffset(-150, 20)).toBe('150 m west, 20 m north');
    expect(describeOffset(3, -99)).toBe('99 m south, 3 m east');
  });
});
