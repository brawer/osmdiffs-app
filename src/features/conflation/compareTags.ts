// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Lines up an AllThePlaces tag set with an OpenStreetMap one, key by key,
// for the side-by-side table in the detail panel.

export type TagAgreement = 'same' | 'differ' | 'atp-only' | 'osm-only';

export interface TagRow {
  key: string;
  atp?: string;
  osm?: string;
  agreement: TagAgreement;
}

// Keys a reader looks for first, in this order; the rest follow
// alphabetically.
const FIRST = ['name', 'brand', 'brand:wikidata', 'operator', 'operator:wikidata', 'shop', 'amenity'];

function order(a: string, b: string): number {
  const ia = FIRST.indexOf(a);
  const ib = FIRST.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareTags(atp: Record<string, string>, osm: Record<string, string>): TagRow[] {
  const keys = [...new Set([...Object.keys(atp), ...Object.keys(osm)])].sort(order);
  return keys.map((key) => {
    const a = atp[key];
    const o = osm[key];
    const row: TagRow = {
      key,
      agreement: a === undefined ? 'osm-only' : o === undefined ? 'atp-only' : a === o ? 'same' : 'differ',
    };
    if (a !== undefined) row.atp = a;
    if (o !== undefined) row.osm = o;
    return row;
  });
}
