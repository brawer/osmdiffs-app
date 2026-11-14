// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import {
  RECHECK_INTERVAL_MS,
  RECHECK_JITTER_MS,
  getResource,
  nextRecheckDelay,
  parseDatapackage,
} from './datapackage.ts';

const BASE = 'https://osmdiffs.brawer.ch/data/datapackage.json';

describe('parseDatapackage', () => {
  it('resolves resource paths against the descriptor URL', () => {
    const pkg = parseDatapackage(
      {
        version: '2026-11-02',
        resources: [
          {
            name: 'conflated-tiles',
            path: 'conflated-20261102-1a2b3c4d.pmtiles',
            bytes: 1800000000,
            hash: 'sha256:abc',
          },
          { name: 'spider-stats', path: 'spider-stats-20261102-5e6f7a8b.parquet' },
        ],
      },
      BASE,
    );
    expect(pkg.version).toBe('2026-11-02');
    expect(getResource(pkg, 'conflated-tiles')).toEqual({
      name: 'conflated-tiles',
      path: 'conflated-20261102-1a2b3c4d.pmtiles',
      url: 'https://osmdiffs.brawer.ch/data/conflated-20261102-1a2b3c4d.pmtiles',
      bytes: 1800000000,
      hash: 'sha256:abc',
    });
    expect(getResource(pkg, 'spider-stats')?.url).toBe(
      'https://osmdiffs.brawer.ch/data/spider-stats-20261102-5e6f7a8b.parquet',
    );
    expect(getResource(pkg, 'edits-tiles')).toBeUndefined();
  });

  it('skips malformed resources', () => {
    const pkg = parseDatapackage({ version: 'v', resources: [null, { name: 'x' }, { path: 'y' }] }, BASE);
    expect(pkg.resources.size).toBe(0);
  });

  it('rejects a descriptor without a version or resources', () => {
    expect(() => parseDatapackage({ resources: [] }, BASE)).toThrow(/version/);
    expect(() => parseDatapackage({ version: 'v' }, BASE)).toThrow(/resources/);
    expect(() => parseDatapackage('nonsense', BASE)).toThrow();
  });
});

describe('nextRecheckDelay', () => {
  it('stays within a day plus or minus the jitter', () => {
    expect(nextRecheckDelay(() => 0)).toBe(RECHECK_INTERVAL_MS - RECHECK_JITTER_MS);
    expect(nextRecheckDelay(() => 0.5)).toBe(RECHECK_INTERVAL_MS);
    expect(nextRecheckDelay(() => 0.999999)).toBeLessThan(RECHECK_INTERVAL_MS + RECHECK_JITTER_MS);
  });
});
