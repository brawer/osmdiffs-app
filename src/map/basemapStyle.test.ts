// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { basemapStyle } from './basemapStyle.ts';

describe('basemapStyle', () => {
  it('is a valid MapLibre style', () => {
    // MapLibre only logs invalid layers at runtime and draws the rest, so a
    // mistake here would otherwise go unnoticed.
    expect(validateStyleMin(basemapStyle())).toEqual([]);
  });

  it('has no POI or shield layers competing with the data', () => {
    const sourceLayers = basemapStyle().layers.map((l) => ('source-layer' in l ? l['source-layer'] : undefined));
    expect(sourceLayers).not.toContain('poi');
    expect(sourceLayers).not.toContain('transportation_name_shield');
  });
});
