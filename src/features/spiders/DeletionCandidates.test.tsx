// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BrandCount } from '../../lib/data/spiderStats.ts';
import { DeletionCandidates } from './DeletionCandidates.tsx';

function render(deletionCandidates: number | null, deletionCandidatesByName: number | null): string {
  const brand = { deletionCandidates, deletionCandidatesByName } as BrandCount;
  return renderToStaticMarkup(<DeletionCandidates brand={brand} />);
}

describe('DeletionCandidates', () => {
  it('shows both counts, the split on hover', () => {
    expect(render(3, 5)).toBe(
      '<span title="3 by Wikidata ID, 5 by name">3<span class="deletion-candidates__by-name"> +5</span></span>',
    );
  });

  it('leaves out no candidates by name', () => {
    expect(render(3, 0)).toBe('<span title="3 by Wikidata ID, 0 by name">3</span>');
    expect(render(3, null)).toBe('<span title="3 by Wikidata ID">3</span>');
  });

  it('shows candidates by name for a brand without an ID', () => {
    expect(render(null, 5)).toBe('<span class="deletion-candidates__by-name" title="5 by name">5</span>');
  });

  it('shows a dash only when both are null', () => {
    expect(render(null, null)).toBe('–');
    expect(render(0, null)).toBe('<span title="0 by Wikidata ID">0</span>');
  });
});
