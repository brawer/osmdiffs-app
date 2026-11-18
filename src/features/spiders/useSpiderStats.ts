// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Loads spider-stats.parquet once per session (per build, if a new week
// comes out while the tab is open) and shares it between the views.
// The file published before it is loaded after it, and only for views
// that compare, so the list doesn't wait for it.

import { useEffect, useState } from 'react';
import { getResource, type DataPackage } from '../../lib/data/datapackage.ts';
import type { SpiderStatsFile } from '../../lib/data/spiderStats.ts';

export type SpiderStatsState =
  // datapackage.json hasn't loaded yet.
  | { status: 'waiting' }
  // This build doesn't publish the file.
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'ready'; file: SpiderStatsFile; previous: PreviousState }
  | { status: 'error'; message: string };

export type PreviousState =
  // The file names no previous one, or no view compares.
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; file: SpiderStatsFile }
  // Not an error for the views: they show the stats without changes.
  | { status: 'failed'; message: string };

const loads = new Map<string, Promise<SpiderStatsFile>>();

function load(url: string): Promise<SpiderStatsFile> {
  let promise = loads.get(url);
  if (!promise) {
    // The Parquet reader is loaded only when a view needs it.
    promise = import('../../lib/data/spiderStats.ts').then(({ fetchSpiderStats }) => fetchSpiderStats(url));
    promise.catch(() => loads.delete(url));
    loads.set(url, promise);
  }
  return promise;
}

type Loaded = { url: string } & ({ status: 'ready'; file: SpiderStatsFile } | { status: 'error'; message: string });

// `enabled` is false while no view needs the file, so the plain map
// doesn't download it; `compare` is false while no view needs the
// previous file.
export function useSpiderStats(datapackage: DataPackage | null, enabled: boolean, compare = false): SpiderStatsState {
  const url = datapackage ? getResource(datapackage, 'spider-stats')?.url : undefined;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [previous, setPrevious] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!url || !enabled) return;
    let live = true;
    load(url).then(
      (file) => live && setLoaded({ url, status: 'ready', file }),
      (err: unknown) => live && setLoaded({ url, status: 'error', message: String(err) }),
    );
    return () => {
      live = false;
    };
  }, [url, enabled]);

  const current = loaded && loaded.url === url && loaded.status === 'ready' ? loaded.file : null;
  const previousUrl = compare ? current?.previous?.url : undefined;
  useEffect(() => {
    if (!previousUrl) return;
    let live = true;
    load(previousUrl).then(
      (file) => live && setPrevious({ url: previousUrl, status: 'ready', file }),
      (err: unknown) => live && setPrevious({ url: previousUrl, status: 'error', message: String(err) }),
    );
    return () => {
      live = false;
    };
  }, [previousUrl]);

  if (!datapackage) return { status: 'waiting' };
  if (!url) return { status: 'unavailable' };
  if (!loaded || loaded.url !== url) return { status: 'loading' };
  if (loaded.status === 'error') return { status: 'error', message: loaded.message };
  let prev: PreviousState = { status: 'none' };
  if (previousUrl) {
    if (!previous || previous.url !== previousUrl) prev = { status: 'loading' };
    else if (previous.status === 'ready') prev = { status: 'ready', file: previous.file };
    else prev = { status: 'failed', message: previous.message };
  }
  return { status: 'ready', file: loaded.file, previous: prev };
}
