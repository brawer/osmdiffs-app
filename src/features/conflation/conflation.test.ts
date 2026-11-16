// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { createExpression, validateStyleMin, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { basemapStyle } from '../../map/basemapStyle.ts';
import { fade, fallbackMapColors } from '../../map/mapColors.ts';
import { compareTags } from './compareTags.ts';
import { conflationOverlay, HEX_DIP, INTERACTIVE_LAYER_IDS } from './conflationOverlay.ts';
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

  it('draws nothing extra when nothing is selected', () => {
    const ids = conflationOverlay(BASE).layers(fallbackMapColors()).map((l) => l.id);
    expect(ids.some((id) => id.startsWith('selected-') && id !== 'selected-position')).toBe(false);
  });

  it('only lists layers that exist as clickable', () => {
    const ids = new Set(fullStyle(BASE).layers.map((l) => l.id));
    for (const id of INTERACTIVE_LAYER_IDS) expect(ids).toContain(id);
  });
});

describe('hexagons', () => {
  const colors = fallbackMapColors();
  const layer = (options: ConflationOptions, id: string) =>
    conflationOverlay(options)
      .layers(colors)
      .find((l) => l.id === id) as { 'source-layer': string; filter: unknown; paint: Record<string, unknown> };
  const CELL = { h3: '871f8322dffffff', n: 100, same: 0, missing_in_osm: 90, located_in: 10, deletion_candidate: 0 };

  // Evaluates a paint property or filter of the overlay on one feature.
  function evaluate(value: unknown, properties: Record<string, unknown>, zoom = 10.5, type = 'color') {
    const spec = { type, 'property-type': 'data-driven', expression: { interpolated: true, parameters: ['zoom', 'feature'] } };
    const parsed = createExpression(value, 'test', spec as unknown as StylePropertySpecification);
    if (parsed.result !== 'success') throw new Error(JSON.stringify(parsed.value));
    return parsed.value.evaluate({ zoom }, { type: 'Polygon', properties } as never);
  }

  it('makes a valid style on spider pages too', () => {
    expect(validateStyleMin(fullStyle({ ...BASE, spider: 'aldi_sud_ch', hidden: new Set(['same']) }))).toEqual([]);
  });

  it('draws hex below everything, or spider_hex filtered to the spider', () => {
    const ids = conflationOverlay(BASE).layers(colors).map((l) => l.id);
    expect(ids.indexOf('hex-fill')).toBeLessThan(ids.indexOf('matched-overview-dot'));
    expect(layer(BASE, 'hex-fill')['source-layer']).toBe('hex');
    const spider = layer({ ...BASE, spider: 'aldi_sud_ch' }, 'hex-fill');
    expect(spider['source-layer']).toBe('spider_hex');
    expect(evaluate(spider.filter, { ...CELL, spider: 'aldi_sud_ch' }, 10, 'boolean')).toBe(true);
    expect(evaluate(spider.filter, { ...CELL, spider: 'lidl_ch' }, 10, 'boolean')).toBe(false);
  });

  it('mixes the relation colours by their share', () => {
    const fill = (options: ConflationOptions, properties: Record<string, unknown>) =>
      evaluate(layer(options, 'hex-fill').paint['fill-color'], properties).toString();
    const rgb = (hex: string) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},1)`;
    expect(fill(BASE, { ...CELL, same: 100, missing_in_osm: 0, located_in: 0 })).toBe(rgb(colors.relation.same));
    // With located_in hidden, only the missing places are left.
    expect(fill({ ...BASE, hidden: new Set(['located_in']) }, CELL)).toBe(rgb(colors.relation.missing_in_osm));
    expect(fill(BASE, CELL)).not.toBe(rgb(colors.relation.missing_in_osm));
  });

  it('hides a cell whose relations are all hidden', () => {
    const filter = layer({ ...BASE, hidden: new Set(['missing_in_osm', 'located_in']) }, 'hex-fill').filter;
    expect(evaluate(filter, CELL, 10, 'boolean')).toBe(false);
    expect(evaluate(filter, { ...CELL, same: 1, n: 101 }, 10, 'boolean')).toBe(true);
  });

  it('is fuller the more places a cell holds, and dips at whole zooms', () => {
    const opacity = (properties: Record<string, unknown>, zoom: number) =>
      evaluate(layer(BASE, 'hex-fill').paint['fill-opacity'], properties, zoom, 'number') as number;
    const one = { ...CELL, n: 1, missing_in_osm: 1, located_in: 0 };
    expect(opacity(one, 10.5)).toBeCloseTo(0.25);
    expect(opacity({ ...CELL, n: 5000, missing_in_osm: 5000 }, 10.5)).toBeCloseTo(0.7);
    expect(opacity(CELL, 10.5)).toBeGreaterThan(opacity(one, 10.5));
    expect(opacity(one, 11)).toBeCloseTo(0.25 * HEX_DIP);
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
