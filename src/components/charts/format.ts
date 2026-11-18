// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

const numberFormat = new Intl.NumberFormat('en');
export const fmt = (n: number) => numberFormat.format(n);

// A change such as "+1,234", "−560" or "±0"; `unit` follows, as in
// "−12 pts".
export function changeText(delta: number, unit = ''): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${fmt(Math.abs(delta))}${unit ? ` ${unit}` : ''}`;
}

// Labels for bins bounded by `bounds`: "< 1", "1–10", ..., "≥ 1000".
export function binLabels(bounds: number[]): string[] {
  return [
    `< ${bounds[0]}`,
    ...bounds.slice(1).map((b, i) => `${bounds[i]}–${b}`),
    `≥ ${bounds[bounds.length - 1]}`,
  ];
}

const short = (m: number) => (m >= 1000 ? `${m / 1000}k` : String(m));

// Compact axis labels for the same bins: each bin's lower bound, so that
// they fit under narrow bars ("<1", "1", "10", ..., "1k+").
export function binTicks(bounds: number[]): string[] {
  return [`<${short(bounds[0]!)}`, ...bounds.slice(0, -1).map(short), `${short(bounds[bounds.length - 1]!)}+`];
}
