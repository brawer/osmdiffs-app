// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConflatedRecord } from '../../lib/data/conflatedTiles.ts';
import { cameraCorrection, type CameraCorrection } from './cameraCorrection.ts';
import FeatureDetail from './FeatureDetail.tsx';

const record: ConflatedRecord = {
  relation: 'same',
  spider: 'c_and_a',
  atpTags: { name: 'C&A' },
  osmTags: { name: 'C&A' },
  atpPosition: [7.5905, 47.5555],
  osm: { type: 'node', id: 1 },
  offsetMeters: 4,
};

function render(r: ConflatedRecord, correction: CameraCorrection | undefined = cameraCorrection(r, undefined)): string {
  return renderToStaticMarkup(
    <FeatureDetail
      selection={{ kind: 'osm', type: 'node', id: 1 }}
      facts={undefined}
      detail={{ status: 'ready', records: [r] }}
      correction={correction}
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
});
