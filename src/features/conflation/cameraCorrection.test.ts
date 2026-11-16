// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { ConflatedRecord } from '../../lib/data/conflatedTiles.ts';
import { toSpiderStats, type SpiderStats } from '../../lib/data/spiderStats.ts';
import { cameraCorrection } from './cameraCorrection.ts';

function record(overrides: Partial<ConflatedRecord>): ConflatedRecord {
  return { relation: 'same', spider: 'c_and_a', atpTags: {}, osmTags: {}, atpPosition: [7.5905, 47.5555], ...overrides };
}

const flagged: SpiderStats = {
  ...toSpiderStats({ spider: 'c_and_a' }),
  exactCoordsHits: 0,
  googleCameraCoordsHits: 46,
  googleCameraCoordsControl: 0,
  googleCameraCoordsOffsetDeg: -0.0022,
};

describe('cameraCorrection', () => {
  it('goes back to where AllThePlaces put a moved place', () => {
    const c = cameraCorrection(record({ positionShiftDeg: 0.0022 }), undefined);
    expect(c?.kind).toBe('moved');
    expect(c?.corrected).toEqual([7.5905, 47.5555]);
    expect(c?.published[0]).toBeCloseTo(7.5883, 6);
    expect(c?.published[1]).toBe(47.5555);
  });

  it('guesses where an unmatched place of a flagged spider may be', () => {
    const c = cameraCorrection(record({ relation: 'missing_in_osm' }), flagged);
    expect(c?.kind).toBe('guessed');
    expect(c?.published).toEqual([7.5905, 47.5555]);
    expect(c?.corrected[0]).toBeCloseTo(7.5927, 6);
    expect(c?.shiftDeg).toBeCloseTo(0.0022, 6);
  });

  it('leaves everything else alone', () => {
    // A match at the published position.
    expect(cameraCorrection(record({}), flagged)).toBeUndefined();
    // A spider that isn't flagged, or whose numbers aren't loaded.
    const unflagged = { ...flagged, googleCameraCoordsHits: 3 };
    expect(cameraCorrection(record({ relation: 'missing_in_osm' }), unflagged)).toBeUndefined();
    expect(cameraCorrection(record({ relation: 'missing_in_osm' }), undefined)).toBeUndefined();
    // Inside another place: its host matched where it is.
    expect(cameraCorrection(record({ relation: 'located_in' }), flagged)).toBeUndefined();
    expect(cameraCorrection(undefined, flagged)).toBeUndefined();
  });
});
