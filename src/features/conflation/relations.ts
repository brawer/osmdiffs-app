// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// How each match.relation is named and coloured in the interface. The
// colours are the theme's --rel-* tokens, the same ones the map paints.

import { isKnownRelation, type KnownRelation } from '../../lib/data/conflatedTiles.ts';

export const RELATION_LABELS: Record<KnownRelation, string> = {
  same: 'In OpenStreetMap',
  missing_in_osm: 'Missing in OpenStreetMap',
  located_in: 'Inside another place',
  deletion_candidate: 'May be gone',
};

export const RELATION_TOKENS: Record<KnownRelation | 'other', string> = {
  same: 'var(--rel-same)',
  missing_in_osm: 'var(--rel-missing)',
  located_in: 'var(--rel-located-in)',
  deletion_candidate: 'var(--rel-deletion)',
  other: 'var(--rel-other)',
};

export function relationLabel(relation: string): string {
  return isKnownRelation(relation) ? RELATION_LABELS[relation] : relation.replaceAll('_', ' ');
}

export function relationToken(relation: string): string {
  return RELATION_TOKENS[isKnownRelation(relation) ? relation : 'other'];
}
