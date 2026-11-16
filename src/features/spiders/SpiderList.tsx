// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The spider list (/spiders): every spider with its size, match rate and
// flags, flagged ones first. Search, filter and sort stay for the session.

import { Fragment, useEffect, useMemo, useState } from 'react';
import { fmt } from '../../components/charts/format.ts';
import Link from '../../components/Link.tsx';
import { toSpider } from '../../components/linkTo.ts';
import type { SpiderStatsFile } from '../../lib/data/spiderStats.ts';
import { FLAGS } from '../../lib/flags.ts';
import { FlagChips } from './FlagChips.tsx';
import { allCountries, filterRows, sortRows, spiderRow, type Filter, type SortKey } from './spiderTable.ts';

// Rows drawn at first; a planet run has a few thousand spiders.
const PAGE = 100;

let remembered: { filter: Filter; sort: SortKey; reverse: boolean } = {
  filter: { search: '', flag: '', country: '' },
  sort: 'default',
  reverse: false,
};

// Lets a long spider name such as "stacked_example" wrap after its
// underscores rather than anywhere.
const breakable = (name: string) =>
  name.split(/(?<=_)/).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ));

const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`);

export default function SpiderList({ file }: { file: SpiderStatsFile }) {
  const [filter, setFilter] = useState(remembered.filter);
  const [sort, setSort] = useState(remembered.sort);
  const [reverse, setReverse] = useState(remembered.reverse);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => {
    remembered = { filter, sort, reverse };
  }, [filter, sort, reverse]);

  const rows = useMemo(() => file.spiders.map((s) => spiderRow(s, file.distanceBinsM)), [file]);
  const countries = useMemo(() => allCountries(rows), [rows]);
  const shown = useMemo(() => sortRows(filterRows(rows, filter), sort, reverse), [rows, filter, sort, reverse]);
  const flagged = rows.filter((r) => r.problems > 0).length;

  const update = (change: Partial<Filter>) => {
    setFilter({ ...filter, ...change });
    setLimit(PAGE);
  };
  const header = (key: SortKey, label: string, className = '') => {
    const active = sort === key;
    return (
      <th className={className} aria-sort={active ? (reverse ? 'descending' : 'ascending') : 'none'}>
        <button
          type="button"
          className={`spider-table__sort ${active ? 'spider-table__sort--active' : ''}`}
          onClick={() => {
            if (active) setReverse(!reverse);
            else {
              setSort(key);
              setReverse(false);
            }
          }}
        >
          {label}
          {active && <span aria-hidden="true">{reverse ? ' ↑' : ' ↓'}</span>}
        </button>
      </th>
    );
  };

  return (
    <div className="stats">
      <h2 className="detail__title">Spiders</h2>
      <p className="stats__lede">
        {fmt(rows.length)} AllThePlaces spiders, {fmt(flagged)} with flags. Flagged spiders come first, larger ones
        higher.
      </p>

      <div className="spider-filters">
        <input
          type="search"
          className="spider-filters__search"
          placeholder="Search spiders"
          aria-label="Search spiders"
          value={filter.search}
          onChange={(e) => update({ search: e.target.value })}
        />
        <select aria-label="Filter by flag" value={filter.flag} onChange={(e) => update({ flag: e.target.value })}>
          <option value="">All flags</option>
          {FLAGS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by country" value={filter.country} onChange={(e) => update({ country: e.target.value })}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <table className="spider-table">
        <thead>
          <tr>
            {header('spider', 'Spider')}
            {header('features', 'Features', 'num')}
            {header('matchRate', 'Matched', 'num')}
            {header('flags', 'Flags')}
          </tr>
        </thead>
        <tbody>
          {shown.slice(0, limit).map((r) => (
            <tr key={r.stats.spider}>
              <td className="spider-table__name">
                <Link to={toSpider(r.stats.spider)}>{breakable(r.stats.spider)}</Link>
              </td>
              <td className="num">{fmt(r.features)}</td>
              <td className="num">{percent(r.matchRate)}</td>
              <td>
                <FlagChips flags={r.flags} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="stats__note">No spider matches.</p>}
      {shown.length > limit && (
        <button type="button" className="stats__more" onClick={() => setLimit(limit + PAGE)}>
          Show more ({fmt(shown.length - limit)} left)
        </button>
      )}
    </div>
  );
}
