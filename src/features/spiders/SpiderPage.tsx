// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// One spider (/spiders/<spider>): its flags, what became of its
// features, how far its matches lie, how its tags agree, and its brands.
// The map beside it shows only this spider's features.

import { Fragment, type ReactNode } from 'react';
import { BarList, Compass, Histogram, StackedBar, type Bar } from '../../components/charts/charts.tsx';
import { fmt } from '../../components/charts/format.ts';
import { DeletionCandidates } from './DeletionCandidates.tsx';
import Link from '../../components/Link.tsx';
import { toView } from '../../components/linkTo.ts';
import type { Bbox } from '../../lib/data/bbox.ts';
import type { BrandCount, SpiderStats } from '../../lib/data/spiderStats.ts';
import { cameraCounts, describeOffset, flagsFor, hasGoogleCameraCoords, shiftedBrands } from '../../lib/flags.ts';
import { FlagList } from './FlagChips.tsx';

interface SpiderPageProps {
  stats: SpiderStats;
  bins: number[];
  // conflated.parquet's URL, for the DuckDB snippet.
  conflatedUrl: string | undefined;
  // Moves the map to a brand's features in one country.
  onZoomTo: (bbox: Bbox) => void;
}

const SAME = 'var(--rel-same)';
const LOCATED_IN = 'var(--rel-located-in)';
const MISSING = 'var(--rel-missing)';
const OTHER = 'var(--rel-other)';

function funnel(s: SpiderStats): Bar[] {
  const bars: Bar[] = [{ label: 'In the dump', value: s.dumpFeatures ?? 0, color: OTHER }];
  const dropped: [string, number | null, string][] = [
    ['License not for OSM', s.notForOsm, 'Left out: the license doesn’t allow OpenStreetMap'],
    ['No usable geometry', s.invalid, 'Left out: no usable geometry, or no spider name'],
    ['No matcher', s.noMatcher, 'Kept, but no matcher handles this kind of feature'],
  ];
  for (const [label, value, title] of dropped) {
    if (value) bars.push({ label, value, color: OTHER, depth: 1, title });
  }
  bars.push(
    { label: 'Conflated', value: s.rows, color: OTHER, depth: 1 },
    { label: 'Same', value: s.same, color: SAME, depth: 2 },
    { label: 'Located in', value: s.locatedIn, color: LOCATED_IN, depth: 2 },
    { label: 'Missing in OSM', value: s.missingInOsm, color: MISSING, depth: 2 },
  );
  if (s.missingInOsm > 0) {
    bars.push(
      {
        label: 'No candidate',
        value: s.missingNoCandidate,
        color: MISSING,
        depth: 3,
        title: 'OpenStreetMap has no feature of the same kind within the distance the matcher looks',
      },
      {
        label: 'Rejected',
        value: s.missingRejected,
        color: MISSING,
        depth: 3,
        title: 'There are such features, but no evidence that any is the same',
      },
      {
        label: 'Taken by sibling',
        value: s.missingTaken,
        color: MISSING,
        depth: 3,
        title: 'Another feature of the same spider took the candidates first',
      },
    );
  }
  return bars;
}

function brandLabel(b: BrandCount): string {
  return b.name ?? b.wikidataId ?? 'No Wikidata ID';
}

function offsetText(east: number | null, north: number | null): string {
  return east === null || north === null ? '–' : describeOffset(east, north);
}

function sourceSearchUrl(spider: string): string {
  // Spiders live in subfolders such as spiders/infrastructure/, so search
  // for the file rather than build its path.
  const q = `repo:alltheplaces/alltheplaces path:locations/spiders filename:${spider}.py`;
  return `https://github.com/search?type=code&q=${encodeURIComponent(q)}`;
}

// The Google Maps camera center probes, where the spider has any hits,
// so that one can see why a dense spider wasn't flagged: city trees can
// have as many features in the control window as in the probed one.
function CameraProbes({ s }: { s: SpiderStats }) {
  const counts = cameraCounts(s);
  if (!counts || counts.hits === 0) return null;
  return (
    <>
      <p className="stats__note">
        Each feature with a brand, operator or network ID was checked for an OpenStreetMap feature with the same ID
        nearby. A Google Maps camera center lies about 0.0022° of longitude west of its place, so a spider with such
        positions has many more features with one to the east than to the west.
      </p>
      <table className="stats-table">
        <thead>
          <tr>
            <th>OpenStreetMap feature of the brand</th>
            <th className="num">Features</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Within 30 m</td>
            <td className="num">{fmt(counts.exact)}</td>
          </tr>
          <tr>
            <td title="Less than 0.0003° north or south">0.0018–0.0030° east, and not within 30 m</td>
            <td className="num">{fmt(counts.hits)}</td>
          </tr>
          <tr>
            <td title="Less than 0.0003° north or south">0.0018–0.0030° west, for comparison</td>
            <td className="num">{fmt(counts.control)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stats__section">
      <h3 className="stats__heading">{title}</h3>
      {children}
    </section>
  );
}

// A country cell that moves the map there, where the file has a box.
function Country({ brand, onZoomTo }: { brand: BrandCount; onZoomTo: (bbox: Bbox) => void }) {
  const { country, bbox } = brand;
  if (!bbox) return <>{country ?? '–'}</>;
  return (
    <button
      type="button"
      className="stats__zoom"
      title={`Show on the map${country ? ` in ${country}` : ''}`}
      onClick={() => onZoomTo(bbox)}
    >
      {country ?? '–'}
    </button>
  );
}

export default function SpiderPage({ stats: s, bins, conflatedUrl, onZoomTo }: SpiderPageProps) {
  const flags = flagsFor(s, bins);
  const shifted = new Set(shiftedBrands(s));
  const withOffset = s.brands.filter((b) => b.offsetEastM !== null && b.offsetNorthM !== null);
  const brands = [...s.brands].sort((a, b) => b.atpFeatures - a.atpFeatures);
  const attributes = Object.entries(s.datasetAttributes ?? {}).filter(([k]) => k !== '@spider');
  const duckdb = conflatedUrl
    ? `SELECT *\nFROM '${conflatedUrl}'\nWHERE atp.fetched.spider = '${s.spider}';`
    : undefined;

  return (
    <div className="stats detail">
      <Link to={toView({ kind: 'spiders' })} className="stats__back">
        ← All spiders
      </Link>
      <h2 className="detail__title">{s.spider}</h2>
      <p className="stats__lede">
        {fmt(s.rows)} conflated features: {fmt(s.same)} matched, {fmt(s.locatedIn)} located in another,{' '}
        {fmt(s.missingInOsm)} missing in OpenStreetMap.
      </p>

      <Section title="Flags">
        <FlagList flags={flags} />
      </Section>

      <Section title="What became of its features">
        <BarList bars={funnel(s)} />
        <p className="stats__note">
          AllThePlaces says the spider wrote {s.atpFeatures === null ? 'an unknown number of' : fmt(s.atpFeatures)}{' '}
          features and logged {s.atpErrors === null ? 'an unknown number of' : fmt(s.atpErrors)} errors.
          {s.inChina ? ` ${fmt(s.inChina)} are in mainland China, in the ${s.datum?.toUpperCase() ?? 'unknown'} datum.` : ''}
        </p>
      </Section>

      <Section title="Distances">
        <div className="stats__pair">
          <Histogram title="Matches" counts={s.distanceM} bounds={bins} color={SAME} />
          <Histogram title="Nearest rejected" counts={s.rejectedDistanceM} bounds={bins} color={MISSING} />
        </div>
        <p className="stats__note">
          In meters. {s.chanceSampled > 0 && (
            <>
              Of {fmt(s.chanceSampled)} features moved 2 km away, {fmt(s.chanceMatched)} still matched.
            </>
          )}
        </p>
      </Section>

      <Section title="Offset from OpenStreetMap">
        <div className="stats__offset">
          <Compass east={s.offsetEastM ?? 0} north={s.offsetNorthM ?? 0} />
          <p>
            {s.offsetEastM === null || s.offsetNorthM === null
              ? 'No matches to measure.'
              : `Matches lie a median ${describeOffset(s.offsetEastM, s.offsetNorthM)} of their OpenStreetMap feature.`}
          </p>
        </div>
        {hasGoogleCameraCoords(s) && (
          <p className="stats__note">
            Its positions look copied from Google Maps, so conflation also tried each feature moved east to where the
            place would be. {fmt(s.sameGoogleCameraCoords)} of {fmt(s.same)} matches were found there, and are measured
            from the corrected position: the compass and the distances above show the spider after the correction, not
            as published.
          </p>
        )}
        <CameraProbes s={s} />
        {withOffset.length > 1 && (
          <table className="stats-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>Brand</th>
                <th className="num">Matches</th>
                <th>Median offset</th>
              </tr>
            </thead>
            <tbody>
              {withOffset.map((b, i) => (
                <tr key={i} className={shifted.has(b) ? 'stats-table__row--flagged' : undefined}>
                  <td>
                    <Country brand={b} onZoomTo={onZoomTo} />
                  </td>
                  <td>{brandLabel(b)}</td>
                  <td className="num">{fmt(b.same)}</td>
                  <td>{offsetText(b.offsetEastM, b.offsetNorthM)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {s.tags.length > 0 && (
        <Section title="Tags of matched features">
          <ul className="tag-bars">
            {s.tags.map((t) => (
              <li key={t.tag} className="tag-bars__row">
                <span className="tag-bars__tag">{t.tag}</span>
                <StackedBar
                  total={t.atp}
                  segments={[
                    { label: 'Agrees', value: t.agreeing, color: SAME },
                    { label: 'Differs', value: t.differing, color: LOCATED_IN },
                    { label: 'Missing in OSM', value: t.missingInOsm, color: OTHER },
                  ]}
                />
                <span className="tag-bars__value">{t.atp > 0 ? `${Math.round((100 * t.agreeing) / t.atp)}%` : '–'}</span>
              </li>
            ))}
          </ul>
          <p className="stats__legend">
            <span className="stats__swatch" style={{ background: SAME }} /> agrees
            <span className="stats__swatch" style={{ background: LOCATED_IN }} /> differs
            <span className="stats__swatch" style={{ background: OTHER }} /> missing in OSM
          </p>
        </Section>
      )}

      {s.rules.length > 0 && (
        <Section title="Matching rules">
          <BarList bars={[...s.rules].sort((a, b) => b.rows - a.rows).map((r) => ({ label: r.rule, value: r.rows, color: SAME }))} />
        </Section>
      )}

      {brands.length > 0 && (
        <Section title="Brands">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Country</th>
                <th className="num">ATP</th>
                <th className="num">OSM</th>
                <th className="num">Matched</th>
                <th className="num" title="Deletion candidates: by Wikidata ID, then + those by name">Del.</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b, i) => (
                <tr key={i}>
                  <td>
                    {b.wikidataId ? (
                      <Link to={toView({ kind: 'wikidata', qid: b.wikidataId })}>{brandLabel(b)}</Link>
                    ) : (
                      brandLabel(b)
                    )}
                  </td>
                  <td>
                    <Country brand={b} onZoomTo={onZoomTo} />
                  </td>
                  <td className="num">{fmt(b.atpFeatures)}</td>
                  <td className="num">{b.osmFeatures === null ? '–' : fmt(b.osmFeatures)}</td>
                  <td className="num">{fmt(b.same + b.locatedIn)}</td>
                  <td className="num">
                    <DeletionCandidates brand={b} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="stats__note">
            Del. counts the deletion candidates with the brand’s Wikidata ID, then, after a plus, those without any ID
            whose brand, operator or network name the spider’s features also have: weaker evidence, and of any kind of
            feature.
          </p>
        </Section>
      )}

      {attributes.length > 0 && (
        <Section title="Dataset attributes">
          <dl className="detail__facts">
            {attributes.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Links">
        <ul className="stats__links">
          <li>
            <a href={sourceSearchUrl(s.spider)} target="_blank" rel="noreferrer">
              Spider source in alltheplaces/alltheplaces
            </a>
          </li>
        </ul>
        {duckdb && (
          <>
            <p className="stats__note">Its rows in conflated.parquet, with DuckDB:</p>
            <pre className="stats__code">{duckdb}</pre>
          </>
        )}
      </Section>
    </div>
  );
}
