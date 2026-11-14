// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The panel content for the spider list, a spider page and a Wikidata
// page, once the statistics are there.

import type { View } from '../../lib/route.ts';
import SpiderList from './SpiderList.tsx';
import SpiderPage from './SpiderPage.tsx';
import StatsStatus from './StatsStatus.tsx';
import type { SpiderStatsState } from './useSpiderStats.ts';
import WikidataPage from './WikidataPage.tsx';

interface SpiderViewsProps {
  view: Exclude<View, { kind: 'map' }>;
  state: SpiderStatsState;
  conflatedUrl: string | undefined;
}

export default function SpiderViews({ view, state, conflatedUrl }: SpiderViewsProps) {
  if (state.status !== 'ready') {
    return (
      <div className="stats">
        <h2 className="detail__title">{view.kind === 'spider' ? view.spider : view.kind === 'wikidata' ? view.qid : 'Spiders'}</h2>
        <StatsStatus state={state} />
      </div>
    );
  }
  const { file } = state;
  switch (view.kind) {
    case 'spiders':
      return <SpiderList file={file} />;
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
      return <SpiderPage key={stats.spider} stats={stats} bins={file.distanceBinsM} conflatedUrl={conflatedUrl} />;
    }
    case 'wikidata':
      return <WikidataPage file={file} qid={view.qid} />;
  }
}
