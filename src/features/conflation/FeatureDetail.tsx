// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The detail panel's content for a selected place: what the map already
// knows right away, then the full record once the detail tiles are in.

import { Fragment, type ReactNode } from 'react';
import { distanceMeters, type ConflatedRecord, type OverviewFacts } from '../../lib/data/conflatedTiles.ts';
import type { Selection } from '../../lib/route.ts';
import type { CameraCorrection } from './cameraCorrection.ts';
import { compareTags, type TagAgreement } from './compareTags.ts';
import { relationLabel, relationToken } from './relations.ts';
import type { DetailState } from './useConflatedDetail.ts';

const AGREEMENT_MARKS: Record<TagAgreement, { mark: string; label: string }> = {
  same: { mark: '=', label: 'Same in both' },
  differ: { mark: '≠', label: 'Differs' },
  'atp-only': { mark: '', label: 'Only in AllThePlaces' },
  'osm-only': { mark: '', label: 'Only in OpenStreetMap' },
};

function osmUrl(osm: { type: string; id: number }): string {
  return `https://www.openstreetmap.org/${osm.type}/${osm.id}`;
}

function spiderUrl(spider: string): string {
  return `https://github.com/alltheplaces/alltheplaces/blob/master/locations/spiders/${encodeURIComponent(spider)}.py`;
}

function spotUrl(position: number[]): string {
  return `https://www.openstreetmap.org/#map=19/${position[1]!.toFixed(6)}/${position[0]!.toFixed(6)}`;
}

function formatMeters(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

// Lets a long key such as "operator:wikidata" wrap after its colons
// rather than mid-word.
function breakableKey(key: string): ReactNode {
  const parts = key.split(':');
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          :<wbr />
        </>
      )}
    </Fragment>
  ));
}

function title(record: ConflatedRecord | undefined, selection: Selection): string {
  const t = { ...record?.osmTags, ...record?.atpTags };
  return t.name ?? t.brand ?? t.operator ?? (selection.kind === 'osm' ? `${selection.type} ${selection.id}` : selection.spider);
}

function RelationChip({ relation }: { relation: string }) {
  return (
    <span className="relation-chip">
      <span className="relation-chip__swatch" style={{ background: relationToken(relation) }} aria-hidden="true" />
      {relationLabel(relation)}
    </span>
  );
}

// A place whose position looks copied from a Google Maps URL, the map's
// camera center west of the place. The map draws a line between the two.
function CorrectedPosition({ correction }: { correction: CameraCorrection }) {
  const { kind, published, corrected, shiftDeg } = correction;
  const amount = `${Math.abs(shiftDeg).toFixed(4)}° (${formatMeters(distanceMeters(published, corrected))})`;
  const direction = shiftDeg < 0 ? 'west' : 'east';
  return (
    <>
      <dt>Position</dt>
      {kind === 'moved' ? (
        <dd>
          Moved {amount} {direction} from where AllThePlaces put it, which looks like a Google Maps camera center.{' '}
          <a href={spotUrl(published)} target="_blank" rel="noreferrer">
            Open the original spot on OpenStreetMap
          </a>
        </dd>
      ) : (
        <dd>
          Its spider’s positions often look copied from Google Maps. If this one is too, the place is {amount}{' '}
          {direction} of where AllThePlaces put it.{' '}
          <a href={spotUrl(corrected)} target="_blank" rel="noreferrer">
            Open that spot on OpenStreetMap
          </a>
        </dd>
      )}
    </>
  );
}

interface FactsProps {
  record: ConflatedRecord | undefined;
  correction: CameraCorrection | undefined;
  facts: OverviewFacts | undefined;
  selection: Selection;
}

function Facts({ record, facts, selection, correction }: FactsProps) {
  const spider = record?.spider ?? facts?.spider ?? (selection.kind === 'atp' ? selection.spider : undefined);
  const osm = record?.osm ?? facts?.osm ?? (selection.kind === 'osm' ? selection : undefined);
  const relation = record?.relation ?? facts?.relation;
  const position = record?.atpPosition;
  return (
    <dl className="detail__facts">
      {spider && (
        <>
          <dt>Spider</dt>
          <dd>
            <a href={spiderUrl(spider)} target="_blank" rel="noreferrer">
              {spider}
            </a>
          </dd>
        </>
      )}
      {osm && (
        <>
          <dt>{relation === 'located_in' ? 'Inside' : 'OpenStreetMap'}</dt>
          <dd>
            <a href={osmUrl(osm)} target="_blank" rel="noreferrer">
              {relation === 'located_in' && record?.osmTags.name ? record.osmTags.name : `${osm.type}/${osm.id}`}
            </a>
          </dd>
        </>
      )}
      {record && relation === 'same' && (
        <>
          <dt>Distance</dt>
          <dd>{record.offsetMeters !== undefined ? formatMeters(record.offsetMeters) : 'under 5 m'}</dd>
        </>
      )}
      {position && relation !== 'same' && (
        <>
          <dt>Location</dt>
          <dd>
            <a href={spotUrl(position)} target="_blank" rel="noreferrer">
              Open this spot on OpenStreetMap
            </a>
          </dd>
        </>
      )}
      {correction && <CorrectedPosition correction={correction} />}
    </dl>
  );
}

function TagTable({ record }: { record: ConflatedRecord }) {
  // A located_in row's OpenStreetMap tags are the host's, not this
  // place's: comparing them would be misleading.
  const compare = record.relation === 'same';
  const rows = compareTags(record.atpTags, compare ? record.osmTags : {});
  if (rows.length === 0) return null;
  return (
    <table className="detail__tags">
      <thead>
        <tr>
          <th scope="col">Key</th>
          <th scope="col">AllThePlaces</th>
          {compare && (
            <>
              <th scope="col" className="detail__mark">
                <span className="visually-hidden">Agreement</span>
              </th>
              <th scope="col">OpenStreetMap</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className={`detail__tag detail__tag--${row.agreement}`}>
            <th scope="row">{breakableKey(row.key)}</th>
            <td>{row.atp}</td>
            {compare && (
              <>
                <td className="detail__mark" title={AGREEMENT_MARKS[row.agreement].label}>
                  {AGREEMENT_MARKS[row.agreement].mark}
                  <span className="visually-hidden">{AGREEMENT_MARKS[row.agreement].label}</span>
                </td>
                <td>{row.osm}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface FeatureDetailProps {
  selection: Selection;
  // What the clicked feature said, if the selection came from a click.
  facts: OverviewFacts | undefined;
  detail: DetailState;
  // For a place whose position looks copied from Google Maps.
  correction?: CameraCorrection | undefined;
}

export default function FeatureDetail({ selection, facts, detail, correction }: FeatureDetailProps) {
  const records = detail.status === 'ready' ? detail.records : [];
  const first = records[0];
  const relation = first?.relation ?? facts?.relation;
  return (
    <article className="detail">
      <h2 className="detail__title">{title(first, selection)}</h2>
      {relation && <RelationChip relation={relation} />}
      <Facts record={first} facts={facts} selection={selection} correction={correction} />
      {detail.status === 'loading' && <p className="detail__status">Loading details…</p>}
      {detail.status === 'unavailable' && <p className="detail__status">Details unavailable here.</p>}
      {detail.status === 'error' && <p className="detail__status">Couldn’t load the details. Try again later.</p>}
      {records.length > 1 && (
        <p className="detail__status">
          {records.length} AllThePlaces places are matched to this OpenStreetMap object. Showing the first.
        </p>
      )}
      {first && <TagTable record={first} />}
    </article>
  );
}
