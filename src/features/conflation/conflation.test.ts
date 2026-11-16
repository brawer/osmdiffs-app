// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { basemapStyle } from '../../map/basemapStyle.ts';
import { fade, fallbackMapColors } from '../../map/mapColors.ts';
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
          selectedFids: [1, 2],
        }),
      ),
    ).toEqual([]);
    expect(
      validateStyleMin(
        fullStyle({ ...BASE, selection: { kind: 'atp', spider: 'denner_ch', lat: 47.37, lng: 8.54 } }),
      ),
    ).toEqual([]);
    expect(
      validateStyleMin(
        fullStyle({
          ...BASE,
          selection: { kind: 'atp', spider: 'denner_ch', lat: 47.37, lng: 8.54 },
          selectedPosition: [8.54, 47.37],
          selectedRelation: 'missing_in_osm',
          selectedFids: [42],
          selectedImportance: 0.3,
        }),
      ),
    ).toEqual([]);
  });

  it('fades everything else while something is selected', () => {
    const colors = fallbackMapColors();
    const dot = (options: ConflationOptions) =>
      conflationOverlay(options)
        .layers(colors)
        .find((l) => l.id === 'unmatched-overview-dot') as { paint: Record<string, unknown> };
    const color = (options: ConflationOptions) => JSON.stringify(dot(options).paint['circle-color']);
    expect(color(BASE)).toContain(colors.relation.missing_in_osm);
    const selected = { ...BASE, selection: { kind: 'osm', type: 'way', id: 5 } } as const;
    expect(color(selected)).toContain(colors.dimmed.relation.missing_in_osm);
    // The selected object is drawn again, on top, in full colour.
    const ids = conflationOverlay(selected).layers(colors).map((l) => l.id);
    expect(ids.indexOf('selected-matched-overview-dot')).toBeGreaterThan(ids.indexOf('unmatched-overview-dot'));
  });

  it('draws deletion candidates in their own colour, and not on a spider\'s map', () => {
    const colors = fallbackMapColors();
    const layer = (options: ConflationOptions, id: string) =>
      conflationOverlay(options)
        .layers(colors)
        .find((l) => l.id === id) as { filter: unknown; paint: Record<string, unknown> };
    // A ring at every zoom, unlike the filled dots of AllThePlaces places.
    const dot = layer(BASE, 'deletion_candidate-overview-dot');
    expect(dot.paint['circle-color']).toBe(colors.halo);
    expect(JSON.stringify(dot.paint['circle-stroke-color'])).toContain(
      `"deletion_candidate","${colors.relation.deletion_candidate}"`,
    );
    expect(colors.relation.deletion_candidate).not.toBe(colors.relation.missing_in_osm);
    // From z13 on, a node is a ring, as for any OpenStreetMap shape.
    expect(layer(BASE, 'deletion_candidate-osm-node').paint['circle-stroke-color']).toBeDefined();
    // A spider filter needs a `spider`, which deletion candidates lack.
    expect(JSON.stringify(layer({ ...BASE, spider: 'denner_ch' }, 'deletion_candidate-overview-dot').filter)).toContain(
      '["get","spider"]',
    );
  });

  it('picks out a selected deletion candidate by its OpenStreetMap ID', () => {
    const options = { ...BASE, selection: { kind: 'osm', type: 'node', id: 13426824598 } } as const;
    const selected = conflationOverlay(options)
      .layers(fallbackMapColors())
      .find((l) => l.id === 'selected-deletion_candidate-overview-dot') as { filter: unknown };
    expect(JSON.stringify(selected.filter)).toContain('"deletion_candidate"');
    expect(JSON.stringify(selected.filter)).toContain('13426824598');
  });

  it('draws nothing extra when nothing is selected', () => {
    const ids = conflationOverlay(BASE).layers(fallbackMapColors()).map((l) => l.id);
    expect(ids.some((id) => id.startsWith('selected-') && id !== 'selected-position')).toBe(false);
  });

  it('only lists layers that exist as clickable', () => {
    const ids = new Set(fullStyle(BASE).layers.map((l) => l.id));
    for (const id of INTERACTIVE_LAYER_IDS) expect(ids).toContain(id);
  });
});

describe('fade', () => {
  it('blends a colour into the background', () => {
    expect(fade('#ff0000', '#ffffff', 0.3)).toBe('#ffb3b3');
    expect(fade('#000', '#ffffff', 1)).toBe('#000000');
    expect(fade('rgb(1, 2, 3)', '#ffffff')).toBe('rgb(1, 2, 3)');
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
