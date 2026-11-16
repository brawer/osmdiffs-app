// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The side panel's resting content, while nothing is selected: what each
// colour means and how many such places are in view. Each row also
// switches its places on or off, so that, say, missing places stand out
// once the matched ones are hidden, or the places that may be gone can be
// reviewed on their own.

import type { CSSProperties } from 'react';
import { KNOWN_RELATIONS, type KnownRelation } from '../../lib/data/conflatedTiles.ts';
import { RELATION_LABELS, RELATION_TOKENS } from './relations.ts';

interface LegendCardProps {
  // Undefined until the map has data.
  counts: Record<string, number> | undefined;
  hidden: ReadonlySet<KnownRelation>;
  onToggle: (relation: KnownRelation) => void;
}

const numberFormat = new Intl.NumberFormat();

export default function LegendCard({ counts, hidden, onToggle }: LegendCardProps) {
  const other = Object.entries(counts ?? {})
    .filter(([r]) => !(KNOWN_RELATIONS as readonly string[]).includes(r))
    .reduce((sum, [, n]) => sum + n, 0);
  return (
    <section className="legend-card">
      <h2 className="legend-card__title">Places in view</h2>
      <ul className="legend-card__rows">
        {KNOWN_RELATIONS.map((relation) => {
          const shown = !hidden.has(relation);
          return (
            <li key={relation}>
              <button
                type="button"
                className={`legend-card__row ${shown ? '' : 'legend-card__row--hidden'}`}
                aria-pressed={shown}
                onClick={() => onToggle(relation)}
              >
                <span
                  className={`legend-card__swatch ${relation === 'deletion_candidate' ? 'swatch--ring' : ''}`}
                  style={{ '--swatch': RELATION_TOKENS[relation] } as CSSProperties}
                  aria-hidden="true"
                />
                <span className="legend-card__label">{RELATION_LABELS[relation]}</span>
                <span className="legend-card__count">
                  {!shown ? 'hidden' : counts ? numberFormat.format(counts[relation] ?? 0) : '…'}
                </span>
              </button>
            </li>
          );
        })}
        {other > 0 && (
          <li>
            <span className="legend-card__row legend-card__row--static">
              <span
                className="legend-card__swatch"
                style={{ '--swatch': RELATION_TOKENS.other } as CSSProperties}
                aria-hidden="true"
              />
              <span className="legend-card__label">Other</span>
              <span className="legend-card__count">{numberFormat.format(other)}</span>
            </span>
          </li>
        )}
      </ul>
      <p className="legend-card__hint">Select a place on the map to compare it with OpenStreetMap.</p>
    </section>
  );
}
