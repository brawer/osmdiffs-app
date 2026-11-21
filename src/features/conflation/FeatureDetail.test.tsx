// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConflatedRecord } from '../../lib/data/conflatedTiles.ts';
import { cameraCorrection, type CameraCorrection } from './cameraCorrection.ts';
import FeatureDetail from './FeatureDetail.tsx';
import type { OsmElementState } from './useOsmElement.ts';

const record: ConflatedRecord = {
  relation: 'same',
  spider: 'c_and_a',
  atpTags: { name: 'C&A' },
  osmTags: { name: 'C&A' },
  atpPosition: [7.5905, 47.5555],
  osm: { type: 'node', id: 1 },
  offsetMeters: 4,
};

function render(
  r: ConflatedRecord,
  correction: CameraCorrection | undefined = cameraCorrection(r, undefined),
  osm?: OsmElementState,
): string {
  return renderToStaticMarkup(
    <FeatureDetail
      selection={{ kind: 'osm', type: 'node', id: 1 }}
      facts={undefined}
      detail={{ status: 'ready', records: [r] }}
      correction={correction}
      {...(osm ? { osm } : {})}
    />,
  );
}

describe('FeatureDetail', () => {
  it('says when a position was moved from a Google Maps camera center', () => {
    const html = render({ ...record, positionShiftDeg: 0.0022116 });
    expect(html).toContain('Moved 0.0022° (166 m) east from where AllThePlaces put it');
    // The original spot, 0.0022116° west of the drawn one.
    expect(html).toContain('https://www.openstreetmap.org/#map=19/47.555500/7.588288');
  });

  it('says where an unmatched place may be', () => {
    const { osm: _osm, offsetMeters: _offset, ...rest } = record;
    const missing: ConflatedRecord = { ...rest, relation: 'missing_in_osm' };
    const html = render(missing, {
      kind: 'guessed',
      published: [7.5905, 47.5555],
      corrected: [7.5927116, 47.5555],
      shiftDeg: 0.0022116,
    });
    expect(html).toContain('If this one is too, the place is 0.0022° (166 m) east of where AllThePlaces put it');
    expect(html).toContain('https://www.openstreetmap.org/#map=19/47.555500/7.592712');
  });

  it('says nothing of it for a position as published', () => {
    expect(render(record)).not.toContain('Moved');
  });

  it('says why a deletion candidate was flagged, and shows its OpenStreetMap tags', () => {
    const candidate: ConflatedRecord = {
      relation: 'deletion_candidate',
      spider: '',
      atpTags: {},
      osmTags: { name: 'Denner', brand: 'Denner', 'brand:wikidata': 'Q379911', shop: 'supermarket' },
      osm: { type: 'node', id: 13426824598 },
      rule: 'wikidata',
      localShare: 0.5,
    };
    const html = render(candidate);
    expect(html).toContain('May be gone');
    expect(html).toContain('AllThePlaces has the brand <a href="/wikidata/Q379911">Denner</a> (by Wikidata ID)');
    expect(html).toContain('AllThePlaces matched 50% of the OpenStreetMap places of this brand.');
    expect(html).toContain('Nobody has checked this yet.');
    expect(html).toContain('https://www.openstreetmap.org/node/13426824598');
    expect(html).toContain('<th scope="col">OpenStreetMap</th>');
    expect(html).toContain('<td>supermarket</td>');
    expect(html).not.toContain('AllThePlaces</th>');
    expect(html).not.toContain('Spider');
  });

  it('describes the Swiss transit rules', () => {
    const stop: ConflatedRecord = {
      relation: 'deletion_candidate',
      spider: '',
      atpTags: {},
      osmTags: { name: 'Zug, Bahnhof', highway: 'bus_stop' },
      osm: { type: 'node', id: 5 },
      rule: 'swiss_transit_stop',
    };
    const html = render(stop);
    expect(html).toContain('far from any stop in the national register');
    expect(html).not.toContain('Nearby');
  });

  describe('with the OpenStreetMap side from the OpenStreetMap API', () => {
    const shop: ConflatedRecord = {
      ...record,
      atpTags: { name: 'C&A', shop: 'clothes', website: 'https://c-and-a.com' },
      osmTags: { name: 'C&A', brand: 'C&A', shop: 'clothes' },
      osmVersion: 4,
    };

    it('compares with the tags OpenStreetMap has now', () => {
      const html = render(shop, undefined, {
        status: 'found',
        version: 4,
        tags: { name: 'C&A', shop: 'clothes', website: 'https://www.c-and-a.com' },
      });
      expect(html).toContain('<td>https://www.c-and-a.com</td>');
      expect(html).toContain('detail__tag--differ');
      expect(html).not.toContain('after this run');
    });

    it('says when the object was edited after the run', () => {
      const html = render(shop, undefined, { status: 'found', version: 6, tags: { name: 'C&A' } });
      expect(html).toContain('version 4 then, 6 now');
      expect(html).toContain('some differences may already be fixed');
    });

    it('can’t tell an edit without the version in the archive', () => {
      const { osmVersion: _v, ...old } = shop;
      expect(render(old, undefined, { status: 'found', version: 6, tags: {} })).not.toContain('after this run');
    });

    it('says when the object was deleted, and keeps the archive’s tags', () => {
      const html = render(shop, undefined, { status: 'deleted' });
      expect(html).toContain('Someone deleted this from OpenStreetMap after this run.');
      expect(html).toContain('<th scope="col">OpenStreetMap</th>');
    });

    it('falls back to the archive’s tags while loading, or if the request fails', () => {
      const loading = render(shop, undefined, { status: 'loading' });
      expect(loading).toContain('Loading the tags from OpenStreetMap');
      expect(loading).toContain('<th scope="col">OpenStreetMap</th>');
      const failed = render(shop, undefined, { status: 'error' });
      expect(failed).toContain('so these are from this run');
      expect(failed).toContain('<th scope="col">OpenStreetMap</th>');
    });

    it('doesn’t compare with the few tags of a slimmer archive', () => {
      const slim: ConflatedRecord = { ...shop, osmTags: { name: 'C&A', shop: 'clothes' }, osmVersion: 4 };
      for (const osm of [{ status: 'loading' }, { status: 'error' }, { status: 'deleted' }] as OsmElementState[]) {
        expect(render(slim, undefined, osm)).not.toContain('<th scope="col">OpenStreetMap</th>');
      }
      // An older archive, without versions, has them all.
      const { osmVersion: _v, ...old } = slim;
      expect(render(old, undefined, { status: 'error' })).toContain('<th scope="col">OpenStreetMap</th>');
    });

    it('shows only the AllThePlaces side when there are no OpenStreetMap tags to compare with', () => {
      const html = render({ ...shop, osmTags: {} }, undefined, { status: 'error' });
      expect(html).toContain('Couldn’t load the tags from OpenStreetMap. Try again later.');
      expect(html).not.toContain('<th scope="col">OpenStreetMap</th>');
    });

    it('takes a deletion candidate’s brand from the fetched tags', () => {
      const candidate: ConflatedRecord = {
        relation: 'deletion_candidate',
        spider: '',
        atpTags: {},
        // A slimmer archive keeps only the name and what kind of place it is.
        osmTags: { name: 'Denner', shop: 'supermarket' },
        osm: { type: 'node', id: 13426824598 },
        osmVersion: 2,
        rule: 'wikidata',
      };
      const html = render(candidate, undefined, {
        status: 'found',
        version: 2,
        tags: { name: 'Denner', brand: 'Denner', 'brand:wikidata': 'Q379911', shop: 'supermarket' },
      });
      expect(html).toContain('AllThePlaces has the brand <a href="/wikidata/Q379911">Denner</a> (by Wikidata ID)');
      expect(html).toContain('<td>Q379911</td>');
    });

    it('doesn’t say nobody checked a deletion candidate that is gone', () => {
      const candidate: ConflatedRecord = { ...shop, relation: 'deletion_candidate', atpTags: {}, rule: 'name' };
      const html = render(candidate, undefined, { status: 'deleted' });
      expect(html).toContain('Someone deleted this from OpenStreetMap after this run.');
      expect(html).not.toContain('Nobody has checked this yet.');
    });
  });
});
