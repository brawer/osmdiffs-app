// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The panel content for the spider list, a spider page and a Wikidata
// page, once the statistics are there.

import { compare, previousOf, type Comparison } from '../../lib/changes.ts';
import type { Bbox } from '../../lib/data/bbox.ts';
import type { SpiderStatsFile } from '../../lib/data/spiderStats.ts';
import type { View } from '../../lib/route.ts';
import SpiderList from './SpiderList.tsx';
import SpiderPage from './SpiderPage.tsx';
import StatsStatus from './StatsStatus.tsx';
import type { PreviousState, SpiderStatsState } from './useSpiderStats.ts';
import WikidataPage from './WikidataPage.tsx';

interface SpiderViewsProps {
  view: Exclude<View, { kind: 'map' }>;
  state: SpiderStatsState;
  conflatedUrl: string | undefined;
  onZoomTo: (bbox: Bbox) => void;
}

// One comparison per pair of files, kept while both are.
const comparisons = new WeakMap<SpiderStatsFile, WeakMap<SpiderStatsFile, Comparison | null>>();

function comparisonOf(file: SpiderStatsFile, previous: PreviousState): Comparison | null {
  if (previous.status !== 'ready') return null;
  let byPrevious = comparisons.get(file);
  if (!byPrevious) comparisons.set(file, (byPrevious = new WeakMap()));
  if (!byPrevious.has(previous.file)) byPrevious.set(previous.file, compare(file, previous.file));
  return byPrevious.get(previous.file) ?? null;
}

export default function SpiderViews({ view, state, conflatedUrl, onZoomTo }: SpiderViewsProps) {
  if (state.status !== 'ready') {
    return (
      <div className="stats">
        <h2 className="detail__title">{view.kind === 'spider' ? view.spider : view.kind === 'wikidata' ? view.qid : 'Spiders'}</h2>
        <StatsStatus state={state} />
      </div>
    );
  }
  const { file, previous } = state;
  const comparison = comparisonOf(file, previous);
  switch (view.kind) {
    case 'spiders':
      return <SpiderList file={file} previous={previous} comparison={comparison} />;
    case 'spider': {
      const stats = file.spiders.find((s) => s.spider === view.spider);
      if (!stats) {
        return (
          <div className="stats">
            <h2 className="detail__title">{view.spider}</h2>
            <p className="stats__note">This build has no spider of that name.</p>
          </div>
        );
      }
      return (
        <SpiderPage
          key={stats.spider}
          stats={stats}
          bins={file.distanceBinsM}
          since={file.previous}
          previousState={previous}
          previous={previousOf(comparison, stats.spider)}
          conflatedUrl={conflatedUrl}
          onZoomTo={onZoomTo}
        />
      );
    }
    case 'wikidata':
      return <WikidataPage file={file} qid={view.qid} />;
  }
}
