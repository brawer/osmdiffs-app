// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { CAUSE_LABELS, type RaisedFlag } from '../../lib/flags.ts';

// Small chips for the spider list; the reason shows on hover.
export function FlagChips({ flags }: { flags: RaisedFlag[] }) {
  return (
    <span className="flag-chips">
      {flags.map(({ flag, reason }) => (
        <span key={flag.id} className={`flag-chip flag-chip--${flag.likelyCause}`} title={reason}>
          {flag.label}
        </span>
      ))}
    </span>
  );
}

// The full list for a spider page: each flag, its likely cause, and why.
export function FlagList({ flags }: { flags: RaisedFlag[] }) {
  if (flags.length === 0) return <p className="stats__note">No flags: nothing here looks off.</p>;
  return (
    <ul className="flag-list">
      {flags.map(({ flag, reason }) => (
        <li key={flag.id} className="flag-list__item">
          <span className={`flag-chip flag-chip--${flag.likelyCause}`}>{flag.label}</span>
          <span className="flag-list__cause">{CAUSE_LABELS[flag.likelyCause]}</span>
          <span className="flag-list__reason">{reason}</span>
        </li>
      ))}
    </ul>
  );
}
