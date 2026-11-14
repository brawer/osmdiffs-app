// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Resolves the pipeline's current output via /data/datapackage.json, as
// described in https://github.com/brawer/osmdiffs/blob/main/docs/outputs/README.md.
// Every file except the descriptor is immutable (its name carries a date
// and a content hash), so the descriptor is the only thing to poll.

export const DATAPACKAGE_PATH = '/data/datapackage.json';

// The pipeline publishes weekly; a daily recheck finds a new week soon
// enough. The jitter spreads the rechecks of tabs that were opened at the
// same time (say, after a link was shared) instead of having them all hit
// the CDN in the same minute, every day.
export const RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const RECHECK_JITTER_MS = 2 * 60 * 60 * 1000;
const FIRST_LOAD_RETRY_MS = 60 * 1000;

// Resource names the app knows about. Others are kept, too, so that a
// later version can use them without touching this module.
export type ResourceName = 'conflated' | 'conflated-tiles' | 'edits-tiles' | 'spider-stats' | 'bom';

export interface Resource {
  name: string;
  // The bare file name from the descriptor, such as
  // "conflated-20261102-1a2b3c4d.parquet".
  path: string;
  // The file's URL, resolved against the descriptor's own URL.
  url: string;
  bytes?: number;
  hash?: string;
}

export interface DataPackage {
  // The release date of this build; changes when a new build is out.
  version: string;
  resources: ReadonlyMap<string, Resource>;
}

export function getResource(pkg: DataPackage, name: ResourceName): Resource | undefined {
  return pkg.resources.get(name);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Parses a datapackage.json document, resolving each resource's path
// against baseUrl (the descriptor's own URL). Throws on a document that
// lacks a version or whose resources aren't a list; skips single
// resources that lack a name or path.
export function parseDatapackage(json: unknown, baseUrl: string): DataPackage {
  if (!isObject(json) || typeof json.version !== 'string' || json.version === '') {
    throw new Error('datapackage.json has no "version"');
  }
  if (!Array.isArray(json.resources)) {
    throw new Error('datapackage.json has no "resources" list');
  }
  const resources = new Map<string, Resource>();
  for (const r of json.resources) {
    if (!isObject(r) || typeof r.name !== 'string' || typeof r.path !== 'string') continue;
    const resource: Resource = { name: r.name, path: r.path, url: new URL(r.path, baseUrl).href };
    if (typeof r.bytes === 'number') resource.bytes = r.bytes;
    if (typeof r.hash === 'string') resource.hash = r.hash;
    resources.set(r.name, resource);
  }
  return { version: json.version, resources };
}

export async function fetchDatapackage(fetchFn: typeof fetch = fetch): Promise<DataPackage> {
  const url = new URL(DATAPACKAGE_PATH, window.location.origin).href;
  const res = await fetchFn(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`GET ${DATAPACKAGE_PATH}: ${res.status}`);
  }
  return parseDatapackage(await res.json(), url);
}

// How long to wait before the next recheck: the interval, plus or minus
// up to the jitter. `random` returns a number in [0, 1), like Math.random.
export function nextRecheckDelay(random: () => number = Math.random): number {
  return RECHECK_INTERVAL_MS + (random() * 2 - 1) * RECHECK_JITTER_MS;
}

// Calls onLoad(pkg) once the descriptor has loaded, then rechecks it about
// once a day and calls onNewVersion(pkg) when its version has changed.
// Returns a function that stops watching.
export function watchDatapackage(
  onLoad: (pkg: DataPackage) => void,
  onNewVersion: (pkg: DataPackage) => void,
): () => void {
  let current: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function poll() {
    try {
      const pkg = await fetchDatapackage();
      if (stopped) return;
      if (current === null) {
        current = pkg.version;
        onLoad(pkg);
      } else if (pkg.version !== current) {
        current = pkg.version;
        onNewVersion(pkg);
      }
    } catch (err) {
      console.error(`Failed to check ${DATAPACKAGE_PATH}:`, err);
    }
    // Until the first load has worked, retry within a minute rather than
    // leaving the page without data for a day.
    if (!stopped) timer = setTimeout(poll, current === null ? FIRST_LOAD_RETRY_MS : nextRecheckDelay());
  }

  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
