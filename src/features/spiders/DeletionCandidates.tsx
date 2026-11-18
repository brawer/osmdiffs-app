// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { fmt } from '../../components/charts/format.ts';
import type { BrandCount } from '../../lib/data/spiderStats.ts';

// What the "Del." cell says on hover: "3 by Wikidata ID, 5 by name".
function deletionCandidatesTitle(b: BrandCount): string | undefined {
  const parts = [];
  if (b.deletionCandidates !== null) parts.push(`${fmt(b.deletionCandidates)} by Wikidata ID`);
  if (b.deletionCandidatesByName !== null) parts.push(`${fmt(b.deletionCandidatesByName)} by name`);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

// The "Del." cell of a brand row: candidates by Wikidata ID, then those
// by name, which are weaker evidence, set apart in a softer color. A
// row without an ID only has the latter.
export function DeletionCandidates({ brand: b }: { brand: BrandCount }) {
  const byId = b.deletionCandidates;
  const byName = b.deletionCandidatesByName;
  if (byId === null && byName === null) return <>–</>;
  const title = deletionCandidatesTitle(b);
  if (byId === null) {
    return (
      <span className="deletion-candidates__by-name" title={title}>
        {fmt(byName ?? 0)}
      </span>
    );
  }
  return (
    <span title={title}>
      {fmt(byId)}
      {byName !== null && byName > 0 && <span className="deletion-candidates__by-name"> +{fmt(byName)}</span>}
    </span>
  );
}
