// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The floating legend: what each colour means and how many such places
// are in view. Each row also switches its places on or off, so that, say,
// missing places stand out once the matched ones are hidden.

import { KNOWN_RELATIONS, type KnownRelation } from '../../lib/data/conflatedTiles.ts';
import { RELATION_LABELS, RELATION_TOKENS } from './relations.ts';

interface LegendCardProps {
  counts: Record<string, number>;
  hidden: ReadonlySet<KnownRelation>;
  onToggle: (relation: KnownRelation) => void;
}

const numberFormat = new Intl.NumberFormat();

export default function LegendCard({ counts, hidden, onToggle }: LegendCardProps) {
  const other = Object.entries(counts)
    .filter(([r]) => !(KNOWN_RELATIONS as readonly string[]).includes(r))
    .reduce((sum, [, n]) => sum + n, 0);
  return (
    <section className="legend-card" aria-label="Legend">
      <h2 className="legend-card__title">AllThePlaces places, in view</h2>
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
                  className="legend-card__swatch"
                  style={{ background: RELATION_TOKENS[relation] }}
                  aria-hidden="true"
                />
                <span className="legend-card__label">{RELATION_LABELS[relation]}</span>
                <span className="legend-card__count">{shown ? numberFormat.format(counts[relation] ?? 0) : 'hidden'}</span>
              </button>
            </li>
          );
        })}
        {other > 0 && (
          <li>
            <span className="legend-card__row legend-card__row--static">
              <span className="legend-card__swatch" style={{ background: RELATION_TOKENS.other }} aria-hidden="true" />
              <span className="legend-card__label">Other</span>
              <span className="legend-card__count">{numberFormat.format(other)}</span>
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
