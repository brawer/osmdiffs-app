// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { toSpiderStats, type BrandCount, type SpiderStats, type ValueCount } from './data/spiderStats.ts';
import { describeOffset, flagsFor, isAlwaysOpen } from './flags.ts';

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
    deletionCandidatesByName: 0,
    offsetEastM: 0,
    offsetNorthM: 0,
    bbox: null,
    ...overrides,
  };
}

function value(key: string, overrides: Partial<ValueCount> = {}): ValueCount {
  return { key, atp: 100, unparsed: 0, topValueAtp: 1, ...overrides };
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

  it('counts stacking only within a kind where the file has it, so car dealers pass', () => {
    // A dealer listing sales, service and parts at one spot.
    expect(ids(spider({ sharedPositions: 90, sharedPositionsSameKind: 0 }))).not.toContain('stacked');
    const s = spider({ sharedPositions: 90, sharedPositionsSameKind: 40 });
    expect(flagsFor(s, BINS).find((f) => f.flag.id === 'stacked')?.reason).toBe(
      '40% of features share their position with another of the same kind',
    );
  });

  it('flags the same hours everywhere, like shell', () => {
    expect(ids(spider({ openingHoursTopShare: 0.995 }))).toContain('same-hours');
    expect(ids(spider({ openingHoursTopShare: 0.95 }))).not.toContain('same-hours');
    expect(ids(spider({ openingHoursTopShare: 0.995, rows: 40, same: 40, dumpFeatures: 40, atpFeatures: 40 }))).not.toContain(
      'same-hours',
    );
  });

  it('names the hours everyone shares', () => {
    const s = spider({ openingHoursTopShare: 0.995, openingHoursTopValue: 'Mo-Fr 08:00-17:00' });
    expect(flagsFor(s, BINS).find((f) => f.flag.id === 'same-hours')?.reason).toBe(
      '100% of features have “Mo-Fr 08:00-17:00”',
    );
    const long = spider({ openingHoursTopShare: 0.995, openingHoursTopValue: `Mo-Fr 08:00-17:00; ${'Sa 09:00-12:00; '.repeat(5)}` });
    expect(flagsFor(long, BINS).find((f) => f.flag.id === 'same-hours')?.reason).toMatch(/^100% of features have “.{59}…”$/);
  });

  it('skips chains open around the clock', () => {
    for (const value of ['24/7', 'Mo-Su 00:00-24:00', '00:00-24:00']) {
      expect(ids(spider({ openingHoursTopShare: 1, openingHoursTopValue: value }))).not.toContain('same-hours');
    }
  });

  it('flags values that can’t be read, naming the worst key first', () => {
    const s = spider({
      values: [value('phone', { unparsed: 60 }), value('start_date', { atp: 40, unparsed: 40 }), value('email')],
    });
    expect(flagsFor(s, BINS).find((f) => f.flag.id === 'bad-values')?.reason).toBe(
      '100% of start_date values can’t be read; also phone (60%)',
    );
    expect(ids(spider({ values: [value('phone', { unparsed: 50 })] }))).not.toContain('bad-values');
    expect(ids(spider({ values: [value('phone', { atp: 10, unparsed: 10 })] }))).not.toContain('bad-values');
    expect(ids(spider({ values: [value('name', { unparsed: null })] }))).not.toContain('bad-values');
  });

  it('flags a phone number or email given to most features, like shell', () => {
    const s = spider({ values: [value('phone', { topValueAtp: 95 }), value('email', { atp: 50, topValueAtp: 30 })] });
    expect(flagsFor(s, BINS).find((f) => f.flag.id === 'shared-contact')?.reason).toBe(
      '95% of features with phone have the same one; 60% of features with email have the same one',
    );
    expect(ids(spider({ values: [value('phone', { topValueAtp: 50 })] }))).not.toContain('shared-contact');
    expect(ids(spider({ values: [value('phone', { atp: 10, topValueAtp: 10 })] }))).not.toContain('shared-contact');
    // Normal for names and brands, and opening hours have their own flag.
    for (const key of ['name', 'brand', 'opening_hours']) {
      expect(ids(spider({ values: [value(key, { topValueAtp: 100 })] }))).not.toContain('shared-contact');
    }
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

  it('counts shared OpenStreetMap features only within a kind where the file has it', () => {
    // A bank's branch and ATM matching one OpenStreetMap feature.
    expect(ids(spider({ sharedOsmFeatures: 60, sharedOsmFeaturesSameKind: 4 }))).not.toContain('shared-osm');
    const s = spider({ sharedOsmFeatures: 60, sharedOsmFeaturesSameKind: 30 });
    expect(flagsFor(s, BINS).find((f) => f.flag.id === 'shared-osm')?.reason).toBe(
      '30% of matches share their OpenStreetMap feature with one of the same kind',
    );
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

describe('isAlwaysOpen', () => {
  it('knows the ways spiders write around the clock', () => {
    for (const value of [
      '24/7',
      ' 24/7 ',
      'Mo-Su 00:00-24:00',
      '00:00-24:00',
      'Mo-Fr 00:00-24:00; Sa-Su 00:00-24:00',
      'Mo-Fr 00:00-24:00, Sa,Su 00:00-24:00',
      'Mo,Tu,We,Th,Fr,Sa,Su 00:00-24:00',
      'Sa-Th 00:00-24:00; Fr 00:00-12:00,12:00-24:00',
      'Mo-Su 00:00-24:00; PH 00:00-24:00',
      '24/7; Mo-Su 00:00-24:00',
    ]) {
      expect(isAlwaysOpen(value), value).toBe(true);
    }
  });

  it('rejects anything less, or anything it doesn’t understand', () => {
    for (const value of [
      '',
      'Mo-Fr 08:00-17:00',
      'Mo-Sa 00:00-24:00',
      'Mo-Su 06:00-24:00',
      'Mo-Su 00:00-12:00,13:00-24:00',
      'Mo-Su 00:00-24:00; PH off',
      'Jan-Mar Mo-Su 00:00-24:00',
      'PH 00:00-24:00',
      // Left to AllThePlaces to fix.
      'Mo-Su 00:00-23:59',
    ]) {
      expect(isAlwaysOpen(value), value).toBe(false);
    }
  });
});

describe('describeOffset', () => {
  it('names the larger part first', () => {
    expect(describeOffset(-150, 20)).toBe('150 m west, 20 m north');
    expect(describeOffset(3, -99)).toBe('99 m south, 3 m east');
  });
});
