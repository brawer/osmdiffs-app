// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The app's state that belongs in the URL, so that any view can be shared
// as a link and survives a reload: which view is open, which item on the
// map is selected, and where the map is looking.
//
//   /                                   the map, default camera
//   /12/47.37/8.54                      the map at zoom 12 over Zurich
//   /spiders                            the spider list
//   /spiders/denner_ch                  one spider
//   /wikidata/Q379911                   one brand, operator or network
//   /spiders/denner_ch/14/47.37/8.54    any view, plus a camera
//   ...?sel=way/608979139               any of the above, plus a selection
//   ...?sel=atp/denner_ch/47.37011/8.54012
//
// Path-based like osmviews-app's /<zoom>/<lat>/<lng>, not a #-fragment.
// Deep links rely on the CDN's 404 -> index.html fallback
// (brawer/production#39), which is set up for osmdiffs.brawer.ch.

export type View =
  | { kind: 'map' }
  | { kind: 'spiders' }
  | { kind: 'spider'; spider: string }
  | { kind: 'wikidata'; qid: string };

export interface Camera {
  zoom: number;
  lat: number;
  lng: number;
}

export type OsmType = 'node' | 'way' | 'relation';

// A selected item on the map. Anything with an OpenStreetMap side (a
// matched place, the host of a located_in place, a deletion candidate) is
// selected by its OSM ID. A place that only AllThePlaces has carries no
// stable ID (see docs/outputs/CONFLATED_TILES.md in brawer/osmdiffs), so it
// is selected by its spider and position, and found again as the nearest
// feature of that spider.
export type Selection =
  | { kind: 'osm'; type: OsmType; id: number }
  | { kind: 'atp'; spider: string; lat: number; lng: number };

export interface Route {
  view: View;
  camera?: Camera;
  selection?: Selection;
}

export const DEFAULT_CAMERA: Camera = { zoom: 2, lat: 20, lng: 0 };

// AllThePlaces spider names, such as "denner_ch" or "c_and_a".
const SPIDER = '[A-Za-z0-9_][A-Za-z0-9_.-]*';
const QID = 'Q[1-9][0-9]*';
const NUM = '-?\\d+(?:\\.\\d+)?';
const CAMERA = `(?:/(${NUM})/(${NUM})/(${NUM}))?`;

const VIEW_PATTERNS: [RegExp, (m: RegExpMatchArray) => View][] = [
  [new RegExp(`^${CAMERA}/?$`), () => ({ kind: 'map' })],
  [new RegExp(`^/spiders${CAMERA}/?$`), () => ({ kind: 'spiders' })],
  [new RegExp(`^/spiders/(${SPIDER})${CAMERA}/?$`), (m) => ({ kind: 'spider', spider: m[1]! })],
  [new RegExp(`^/wikidata/(${QID})${CAMERA}/?$`), (m) => ({ kind: 'wikidata', qid: m[1]! })],
];

function parseCamera(zoom?: string, lat?: string, lng?: string): Camera | undefined {
  if (zoom === undefined || lat === undefined || lng === undefined) return undefined;
  const camera = { zoom: Number(zoom), lat: Number(lat), lng: Number(lng) };
  if (camera.zoom < 0 || camera.zoom > 24 || Math.abs(camera.lat) > 90 || Math.abs(camera.lng) > 180) {
    return undefined;
  }
  return camera;
}

const OSM_SELECTION = /^(node|way|relation)\/([1-9][0-9]*)$/;
const ATP_SELECTION = new RegExp(`^atp/(${SPIDER})/(${NUM})/(${NUM})$`);

export function parseSelection(value: string | null): Selection | undefined {
  if (!value) return undefined;
  const osm = value.match(OSM_SELECTION);
  if (osm) {
    const id = Number(osm[2]);
    if (!Number.isSafeInteger(id)) return undefined;
    return { kind: 'osm', type: osm[1] as OsmType, id };
  }
  const atp = value.match(ATP_SELECTION);
  if (atp) {
    const lat = Number(atp[2]);
    const lng = Number(atp[3]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
    return { kind: 'atp', spider: atp[1]!, lat, lng };
  }
  return undefined;
}

export function selectionToString(selection: Selection): string {
  return selection.kind === 'osm'
    ? `${selection.type}/${selection.id}`
    : `atp/${selection.spider}/${round(selection.lat, 7)}/${round(selection.lng, 7)}`;
}

// Parses a URL's path and query into a Route. A path the app doesn't know
// opens the plain map, rather than an error page.
export function parseRoute(pathname: string, search = ''): Route {
  let route: Route = { view: { kind: 'map' } };
  for (const [pattern, toView] of VIEW_PATTERNS) {
    const m = pathname.match(pattern);
    if (!m) continue;
    // The camera's three groups are always the last three.
    const camera = parseCamera(m.at(-3), m.at(-2), m.at(-1));
    route = { view: toView(m) };
    if (camera) route.camera = camera;
    break;
  }
  const selection = parseSelection(new URLSearchParams(search).get('sel'));
  if (selection) route.selection = selection;
  return route;
}

function viewToPath(view: View): string {
  switch (view.kind) {
    case 'map':
      return '';
    case 'spiders':
      return '/spiders';
    case 'spider':
      return `/spiders/${view.spider}`;
    case 'wikidata':
      return `/wikidata/${view.qid}`;
  }
}

export function routeToUrl(route: Route): string {
  let path = viewToPath(route.view);
  if (route.camera) {
    const { zoom, lat, lng } = route.camera;
    path += `/${round(zoom, 2)}/${round(lat, 5)}/${round(lng, 5)}`;
  }
  if (path === '') path = '/';
  // Not URLSearchParams.toString(), which would escape the slashes.
  return route.selection ? `${path}?sel=${selectionToString(route.selection)}` : path;
}

function round(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}
