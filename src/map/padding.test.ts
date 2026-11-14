// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { paddedCenter } from './padding.ts';

describe('paddedCenter', () => {
  it('is the middle of the map without padding', () => {
    expect(paddedCenter(1200, 800, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual([600, 400]);
  });

  it('is the middle of what the side panel leaves uncovered', () => {
    expect(paddedCenter(1200, 800, { top: 0, right: 0, bottom: 0, left: 400 })).toEqual([800, 400]);
  });

  it('is above a bottom sheet', () => {
    expect(paddedCenter(400, 800, { top: 0, right: 0, bottom: 176, left: 0 })).toEqual([200, 312]);
  });
});
