// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The current version and tags of one OpenStreetMap object, from the
// OpenStreetMap API (osmdiffs-app#45). The detail panel asks for the
// object a user selected, one request per selection, which the API usage
// policy (https://operations.osmfoundation.org/policies/api/) allows for
// interactive use. Nothing here fetches on hover or for features in view.

import type { OsmType } from '../route.ts';

export const OSM_API = 'https://api.openstreetmap.org/api/0.6';

export type OsmLookup =
  | { status: 'found'; version: number; tags: Record<string, string> }
  // HTTP 410: the object was deleted.
  | { status: 'deleted' };

export function elementUrl(type: OsmType, id: number): string {
  return `${OSM_API}/${type}/${id}.json`;
}

// Reads an API response body, such as
// {"elements":[{"type":"node","id":1,"version":3,"tags":{…}}]}.
export function parseElement(body: unknown, type: OsmType, id: number): OsmLookup {
  const elements = (body as { elements?: unknown } | null)?.elements;
  const element = Array.isArray(elements)
    ? (elements as Record<string, unknown>[]).find((e) => e?.type === type && e?.id === id)
    : undefined;
  if (!element || typeof element.version !== 'number') throw new Error(`No ${type}/${id} in the API response`);
  const tags: Record<string, string> = {};
  if (element.tags && typeof element.tags === 'object') {
    for (const [key, value] of Object.entries(element.tags as Record<string, unknown>)) {
      if (typeof value === 'string') tags[key] = value;
    }
  }
  return { status: 'found', version: element.version, tags };
}

export async function fetchElement(
  type: OsmType,
  id: number,
  fetchFn: typeof fetch = fetch,
): Promise<OsmLookup> {
  const res = await fetchFn(elementUrl(type, id), { headers: { Accept: 'application/json' } });
  if (res.status === 410) return { status: 'deleted' };
  if (!res.ok) throw new Error(`OpenStreetMap API: HTTP ${res.status} for ${type}/${id}`);
  return parseElement(await res.json(), type, id);
}

// Lookups done or under way, so that going back to an earlier selection
// doesn't ask again. A failed lookup is forgotten, so selecting the
// object again retries.
const MAX_CACHED = 100;
const cache = new Map<string, Promise<OsmLookup>>();

export function lookupElement(type: OsmType, id: number, fetchFn: typeof fetch = fetch): Promise<OsmLookup> {
  const key = `${type}/${id}`;
  let lookup = cache.get(key);
  if (!lookup) {
    lookup = fetchElement(type, id, fetchFn).catch((err: unknown) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, lookup);
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  }
  return lookup;
}

export function clearElementCache() {
  cache.clear();
}
