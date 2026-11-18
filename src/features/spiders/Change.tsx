// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// How a number changed since the previous file: "+120" or "−3 pts",
// tinted when it fell.

import { changeText } from '../../components/charts/format.ts';

interface ChangeProps {
  delta: number | null;
  unit?: string;
  // Whether a rise is the bad direction, as for errors.
  riseIsBad?: boolean;
  // Hides a zero change, as in the spider list, where it is noise.
  hideZero?: boolean;
  // Whether a fall is tinted: by default any, but the spider list
  // tints only the falls that raise the dropped flag.
  alarm?: boolean;
  title?: string;
}

export function Change({ delta, unit, riseIsBad = false, hideZero = false, alarm = true, title }: ChangeProps) {
  if (delta === null || (hideZero && delta === 0)) return null;
  const bad = alarm && (riseIsBad ? delta > 0 : delta < 0);
  return (
    <span className={`change${bad ? ' change--bad' : ''}`} title={title}>
      {changeText(delta, unit)}
    </span>
  );
}

// Marks a spider that the previous file didn't have.
export function NewChip({ since }: { since: string | null }) {
  return (
    <span className="new-chip" title={since ? `Not in the file from ${since}` : 'Not in the previous file'}>
      new
    </span>
  );
}
