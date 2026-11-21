// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearElementCache, elementUrl, fetchElement, lookupElement, parseElement } from './osmApi.ts';

// What https://api.openstreetmap.org/api/0.6/node/13426824598.json says.
const BODY = {
  version: '0.6',
  elements: [
    {
      type: 'node',
      id: 13426824598,
      lat: 47.1832325,
      lon: 8.523223,
      version: 1,
      tags: { highway: 'bus_stop', name: 'Grienbach', operator: 'ZVB' },
    },
  ],
};

function respond(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

beforeEach(() => clearElementCache());

describe('the OpenStreetMap API', () => {
  it('asks for one object', () => {
    expect(elementUrl('way', 42)).toBe('https://api.openstreetmap.org/api/0.6/way/42.json');
  });

  it('reads an object’s version and tags', async () => {
    expect(await fetchElement('node', 13426824598, respond(200, BODY))).toEqual({
      status: 'found',
      version: 1,
      tags: { highway: 'bus_stop', name: 'Grienbach', operator: 'ZVB' },
    });
  });

  it('reads an object without tags', () => {
    expect(parseElement({ elements: [{ type: 'way', id: 3, version: 2 }] }, 'way', 3)).toEqual({
      status: 'found',
      version: 2,
      tags: {},
    });
  });

  it('tells a deleted object', async () => {
    expect(await fetchElement('node', 1, respond(410))).toEqual({ status: 'deleted' });
  });

  it('fails on other errors, and on a response for another object', async () => {
    await expect(fetchElement('node', 1, respond(509))).rejects.toThrow('HTTP 509');
    await expect(fetchElement('node', 1, respond(200, BODY))).rejects.toThrow('No node/1');
  });

  it('asks once per object, but again after a failure', async () => {
    const ok = respond(200, BODY);
    await lookupElement('node', 13426824598, ok);
    await lookupElement('node', 13426824598, ok);
    expect(ok).toHaveBeenCalledTimes(1);

    const failing = respond(500);
    await expect(lookupElement('way', 7, failing)).rejects.toThrow();
    await expect(lookupElement('way', 7, failing)).rejects.toThrow();
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
