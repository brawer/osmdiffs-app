// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { parseRoute, parseSelection, routeToUrl, type Route } from './route.ts';

describe('parseRoute', () => {
  it('opens the plain map at /', () => {
    expect(parseRoute('/')).toEqual({ view: { kind: 'map' } });
  });

  it('reads a camera on the map', () => {
    expect(parseRoute('/12/47.37/8.54')).toEqual({
      view: { kind: 'map' },
      camera: { zoom: 12, lat: 47.37, lng: 8.54 },
    });
  });

  it('reads negative coordinates', () => {
    expect(parseRoute('/3/-33.87/-151.2').camera).toEqual({ zoom: 3, lat: -33.87, lng: -151.2 });
  });

  it('reads the spider list', () => {
    expect(parseRoute('/spiders')).toEqual({ view: { kind: 'spiders' } });
    expect(parseRoute('/spiders/')).toEqual({ view: { kind: 'spiders' } });
  });

  it('reads a spider, with and without a camera', () => {
    expect(parseRoute('/spiders/denner_ch')).toEqual({ view: { kind: 'spider', spider: 'denner_ch' } });
    expect(parseRoute('/spiders/c_and_a/5/50.1/8.6')).toEqual({
      view: { kind: 'spider', spider: 'c_and_a' },
      camera: { zoom: 5, lat: 50.1, lng: 8.6 },
    });
  });

  it('reads a Wikidata page', () => {
    expect(parseRoute('/wikidata/Q379911/9/46.9/7.4')).toEqual({
      view: { kind: 'wikidata', qid: 'Q379911' },
      camera: { zoom: 9, lat: 46.9, lng: 7.4 },
    });
  });

  it('falls back to the map for unknown or malformed paths', () => {
    expect(parseRoute('/nope')).toEqual({ view: { kind: 'map' } });
    expect(parseRoute('/wikidata/P31')).toEqual({ view: { kind: 'map' } });
    expect(parseRoute('/wikidata/Q0123')).toEqual({ view: { kind: 'map' } });
  });

  it('drops a camera that is out of range, but keeps the view', () => {
    expect(parseRoute('/spiders/x/12/95/8')).toEqual({ view: { kind: 'spider', spider: 'x' } });
    expect(parseRoute('/30/0/0')).toEqual({ view: { kind: 'map' } });
  });

  it('reads a selection from the query', () => {
    expect(parseRoute('/12/47.37/8.54', '?sel=way/608979139')).toEqual({
      view: { kind: 'map' },
      camera: { zoom: 12, lat: 47.37, lng: 8.54 },
      selection: { kind: 'osm', type: 'way', id: 608979139 },
    });
  });
});

describe('parseSelection', () => {
  it('reads OSM objects', () => {
    expect(parseSelection('node/1')).toEqual({ kind: 'osm', type: 'node', id: 1 });
    expect(parseSelection('relation/42')).toEqual({ kind: 'osm', type: 'relation', id: 42 });
  });

  it('reads AllThePlaces items by spider and position', () => {
    expect(parseSelection('atp/denner_ch/47.37011/8.54012')).toEqual({
      kind: 'atp',
      spider: 'denner_ch',
      lat: 47.37011,
      lng: 8.54012,
    });
  });

  it('ignores anything else', () => {
    expect(parseSelection(null)).toBeUndefined();
    expect(parseSelection('')).toBeUndefined();
    expect(parseSelection('area/1')).toBeUndefined();
    expect(parseSelection('way/0')).toBeUndefined();
    expect(parseSelection('way/99999999999999999999')).toBeUndefined();
    expect(parseSelection('atp/x/91/0')).toBeUndefined();
  });
});

describe('routeToUrl', () => {
  it('writes the plain map as /', () => {
    expect(routeToUrl({ view: { kind: 'map' } })).toBe('/');
  });

  it('rounds the camera', () => {
    expect(routeToUrl({ view: { kind: 'map' }, camera: { zoom: 12.3456, lat: 47.3712345, lng: 8.5412345 } })).toBe(
      '/12.35/47.37123/8.54123',
    );
  });

  it('keeps slashes in the selection readable', () => {
    expect(routeToUrl({ view: { kind: 'spiders' }, selection: { kind: 'osm', type: 'node', id: 7 } })).toBe(
      '/spiders?sel=node/7',
    );
  });

  it('round-trips every kind of route', () => {
    const routes: Route[] = [
      { view: { kind: 'map' } },
      { view: { kind: 'spiders' }, camera: { zoom: 4, lat: 1.5, lng: -2.25 } },
      { view: { kind: 'spider', spider: 'denner_ch' }, selection: { kind: 'osm', type: 'way', id: 608979139 } },
      {
        view: { kind: 'wikidata', qid: 'Q379911' },
        camera: { zoom: 14, lat: 47.37, lng: 8.54 },
        selection: { kind: 'atp', spider: 'denner_ch', lat: 47.37011, lng: 8.54012 },
      },
    ];
    for (const route of routes) {
      const url = new URL(routeToUrl(route), 'https://osmdiffs.brawer.ch');
      expect(parseRoute(url.pathname, url.search)).toEqual(route);
    }
  });
});
