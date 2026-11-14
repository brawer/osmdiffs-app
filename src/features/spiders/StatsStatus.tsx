// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import type { SpiderStatsState } from './useSpiderStats.ts';

// What to show while the statistics aren't there, or null once they are.
export default function StatsStatus({ state }: { state: SpiderStatsState }) {
  switch (state.status) {
    case 'ready':
      return null;
    case 'waiting':
    case 'loading':
      return <p className="stats__note">Loading spider statistics…</p>;
    case 'unavailable':
      return (
        <p className="stats__note">
          Spider statistics are not available for this build. They come with the weekly runs from mid-November 2026
          on.
        </p>
      );
    case 'error':
      return <p className="stats__note">Couldn’t load the spider statistics ({state.message}).</p>;
  }
}
