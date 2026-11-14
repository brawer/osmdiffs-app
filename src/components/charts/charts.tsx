// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Small charts for the spider pages, drawn as plain SVG and HTML with the
// theme's tokens rather than with a charting library: each is a handful
// of bars, and a library would outweigh the rest of the app.

import type { CSSProperties } from 'react';
import { binLabels, binTicks, fmt } from './format.ts';

// ---- Bar list: one labelled horizontal bar per row ----

export interface Bar {
  label: string;
  value: number;
  // A token such as "var(--rel-same)"; defaults to the accent.
  color?: string;
  // Indents the label, for a part of the row above.
  depth?: number;
  title?: string;
}

export function BarList({ bars, max }: { bars: Bar[]; max?: number }) {
  const top = max ?? Math.max(1, ...bars.map((b) => b.value));
  return (
    <ul className="bar-list">
      {bars.map((b, i) => (
        <li key={`${b.label}-${i}`} className="bar-list__row" title={b.title}>
          <span className="bar-list__label" style={{ paddingLeft: `${(b.depth ?? 0) * 12}px` }}>
            {b.label}
          </span>
          <span className="bar-list__track">
            <span
              className="bar-list__bar"
              style={{ width: `${(100 * b.value) / top}%`, background: b.color ?? 'var(--accent)' }}
            />
          </span>
          <span className="bar-list__value">{fmt(b.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---- Histogram: counts over distance bins ----

interface HistogramProps {
  title: string;
  counts: number[];
  bounds: number[];
  color: string;
}

export function Histogram({ title, counts, bounds, color }: HistogramProps) {
  const labels = binLabels(bounds);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts);
  return (
    <figure className="histogram">
      <figcaption className="histogram__title">
        {title} <span className="histogram__total">{fmt(total)}</span>
      </figcaption>
      <div className="histogram__bars" role="img" aria-label={`${title}: ${labels.map((l, i) => `${l} m: ${counts[i] ?? 0}`).join(', ')}`}>
        {labels.map((label, i) => (
          <div key={label} className="histogram__bin" title={`${label} m: ${fmt(counts[i] ?? 0)}`}>
            <div className="histogram__bar" style={{ height: `${(100 * (counts[i] ?? 0)) / max}%`, background: color }} />
          </div>
        ))}
      </div>
      <div className="histogram__axis" aria-hidden="true">
        {binTicks(bounds).map((tick, i) => (
          <span key={i}>{tick}</span>
        ))}
      </div>
    </figure>
  );
}

// ---- Stacked bar: parts of a whole ----

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function StackedBar({ segments, total }: { segments: Segment[]; total: number }) {
  const whole = Math.max(1, total);
  return (
    <span
      className="stacked-bar"
      role="img"
      aria-label={segments.map((s) => `${s.label}: ${fmt(s.value)}`).join(', ')}
    >
      {segments.map((s) => (
        <span
          key={s.label}
          className="stacked-bar__part"
          title={`${s.label}: ${fmt(s.value)}`}
          style={{ width: `${(100 * s.value) / whole}%`, background: s.color } as CSSProperties}
        />
      ))}
    </span>
  );
}

// ---- Compass: which way, and how far, matches are shifted ----

interface CompassProps {
  east: number;
  north: number;
  // The offset at which the arrow reaches the rim.
  scale?: number;
}

export function Compass({ east, north, scale = 200 }: CompassProps) {
  const r = 40;
  const length = Math.hypot(east, north);
  const k = Math.min(1, length / scale) * (r - 6);
  const dx = length > 0 ? (east / length) * k : 0;
  const dy = length > 0 ? (-north / length) * k : 0;
  return (
    <svg className="compass" viewBox="-50 -50 100 100" width="100" height="100" aria-hidden="true">
      <circle r={r} className="compass__rim" />
      <circle r={r / 2} className="compass__ring" />
      <line x1={-r} y1={0} x2={r} y2={0} className="compass__axis" />
      <line x1={0} y1={-r} x2={0} y2={r} className="compass__axis" />
      <text x={0} y={-r - 2} className="compass__label">
        N
      </text>
      {length > 0 && (
        <>
          <line x1={0} y1={0} x2={dx} y2={dy} className="compass__arrow" />
          <circle cx={dx} cy={dy} r={3} className="compass__tip" />
        </>
      )}
    </svg>
  );
}
