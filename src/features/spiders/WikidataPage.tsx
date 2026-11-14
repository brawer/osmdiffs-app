// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// One brand, operator or network (/wikidata/<Q-id>): which spiders cover
// it in which countries, next to what OpenStreetMap has.

import Link from '../../components/Link.tsx';
import { toSpider, toView } from '../../components/linkTo.ts';
import { fmt } from '../../components/charts/format.ts';
import type { BrandCount, SpiderStatsFile } from '../../lib/data/spiderStats.ts';
import { coverageOf } from './spiderTable.ts';

const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

export default function WikidataPage({ file, qid }: { file: SpiderStatsFile; qid: string }) {
  const rows = coverageOf(file, qid);
  const name = rows.find((r) => r.brand.name)?.brand.name ?? qid;
  const total = (pick: (b: BrandCount) => number | null) => rows.reduce((n, r) => n + (pick(r.brand) ?? 0), 0);

  return (
    <div className="stats detail">
      <Link to={toView({ kind: 'spiders' })} className="stats__back">
        ← All spiders
      </Link>
      <h2 className="detail__title">{name}</h2>
      <p className="stats__lede">
        <a href={`https://www.wikidata.org/wiki/${qid}`} target="_blank" rel="noreferrer">
          {qid}
        </a>{' '}
        on Wikidata.{' '}
        {rows.length === 0
          ? 'No spider has features with this ID.'
          : `${fmt(total((b) => b.atpFeatures))} AllThePlaces features from ${plural(new Set(rows.map((r) => r.spider)).size, 'spider')} in ${plural(new Set(rows.map((r) => r.brand.country)).size, 'country', 'countries')}.`}
      </p>
      {rows.length > 0 && (
        <table className="stats-table">
          <thead>
            <tr>
              <th>Country</th>
              <th>Spider</th>
              <th className="num">ATP</th>
              <th className="num">OSM</th>
              <th className="num">Matched</th>
              <th className="num">Missing</th>
              <th className="num" title="Deletion candidates">
                Del.
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ spider, brand: b }, i) => (
              <tr key={i} className={b.osmFeatures !== null && b.osmFeatures > 2 * b.atpFeatures ? 'stats-table__row--flagged' : undefined}>
                <td>{b.country ?? '–'}</td>
                <td>
                  <Link to={toSpider(spider)}>{spider}</Link>
                </td>
                <td className="num">{fmt(b.atpFeatures)}</td>
                <td className="num">{b.osmFeatures === null ? '–' : fmt(b.osmFeatures)}</td>
                <td className="num">{fmt(b.same + b.locatedIn)}</td>
                <td className="num">{fmt(b.missingInOsm)}</td>
                <td className="num">{b.deletionCandidates === null ? '–' : fmt(b.deletionCandidates)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > 0 && (
        <p className="stats__note">
          OSM counts features with this ID in the country, of the same kinds as the spider’s. Highlighted rows have more
          than twice as many in OpenStreetMap as in AllThePlaces.
        </p>
      )}
    </div>
  );
}
