// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { basemapStyle } from '../../map/basemapStyle.ts';
import { fallbackMapColors } from '../../map/mapColors.ts';
import { compareTags } from './compareTags.ts';
import { conflationOverlay, INTERACTIVE_LAYER_IDS } from './conflationOverlay.ts';
import type { ConflationOptions } from './conflationOverlay.ts';

function fullStyle(options: ConflationOptions) {
  const colors = fallbackMapColors();
  const overlay = conflationOverlay(options);
  const style = basemapStyle(colors.basemap);
  return {
    ...style,
    sources: { ...style.sources, ...overlay.sources },
    layers: [...style.layers, ...overlay.layers(colors)],
  };
}

const BASE: ConflationOptions = {
  sourceUrl: 'pmtiles://https://osmdiffs.brawer.ch/data/conflated.pmtiles',
  hidden: new Set(),
  selection: undefined,
  selectedPosition: undefined,
};

describe('conflationOverlay', () => {
  it('makes a valid style, with or without a selection or hidden relations', () => {
    // MapLibre only logs invalid layers at runtime and draws the rest, so a
    // mistake here would otherwise go unnoticed.
    expect(validateStyleMin(fullStyle(BASE))).toEqual([]);
    expect(
      validateStyleMin(
        fullStyle({
          ...BASE,
          hidden: new Set(['same', 'located_in']),
          selection: { kind: 'osm', type: 'way', id: 608979139 },
          selectedPosition: [8.54, 47.37],
        }),
      ),
    ).toEqual([]);
    expect(
      validateStyleMin(
        fullStyle({ ...BASE, selection: { kind: 'atp', spider: 'denner_ch', lat: 47.37, lng: 8.54 } }),
      ),
    ).toEqual([]);
  });

  it('only lists layers that exist as clickable', () => {
    const ids = new Set(fullStyle(BASE).layers.map((l) => l.id));
    for (const id of INTERACTIVE_LAYER_IDS) expect(ids).toContain(id);
  });
});

describe('compareTags', () => {
  it('lines up both sides, the most telling keys first', () => {
    expect(
      compareTags(
        { name: 'k kiosk HB', shop: 'convenience', 'addr:city': 'Zürich', brand: 'k kiosk' },
        { name: 'k kiosk', shop: 'convenience', operator: 'Valora' },
      ),
    ).toEqual([
      { key: 'name', atp: 'k kiosk HB', osm: 'k kiosk', agreement: 'differ' },
      { key: 'brand', atp: 'k kiosk', agreement: 'atp-only' },
      { key: 'operator', osm: 'Valora', agreement: 'osm-only' },
      { key: 'shop', atp: 'convenience', osm: 'convenience', agreement: 'same' },
      { key: 'addr:city', atp: 'Zürich', agreement: 'atp-only' },
    ]);
  });
});
