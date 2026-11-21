// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The detail panel's content for a selected place: what the map already
// knows right away, then the full record once the detail tiles are in.

import { Fragment, type CSSProperties, type ReactNode } from 'react';
import Link from '../../components/Link.tsx';
import { toView } from '../../components/linkTo.ts';
import {
  distanceMeters,
  hasAllOsmTags,
  type ConflatedRecord,
  type OverviewFacts,
} from '../../lib/data/conflatedTiles.ts';
import type { Selection } from '../../lib/route.ts';
import type { CameraCorrection } from './cameraCorrection.ts';
import { compareTags, type TagAgreement } from './compareTags.ts';
import { relationLabel, relationToken } from './relations.ts';
import type { DetailState } from './useConflatedDetail.ts';
import type { OsmElementState } from './useOsmElement.ts';

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

// For a deletion candidate flagged by its brand, network or operator:
// which of the three, the value it was flagged by, and if by Wikidata ID,
// that ID. The pipeline doesn't say which key it went by, so this takes
// the first that the feature has.
const BRAND_KEYS = ['brand', 'operator', 'network'] as const;

function flaggedBrand(
  tags: Record<string, string>,
  rule: string,
): { key: string; label: string; qid?: string } | undefined {
  for (const key of BRAND_KEYS) {
    if (rule === 'wikidata') {
      const qid = tags[`${key}:wikidata`];
      if (qid && /^Q[1-9][0-9]*$/.test(qid)) return { key, label: tags[key] ?? qid, qid };
    } else if (tags[key]) {
      return { key, label: tags[key] };
    }
  }
  return undefined;
}

// Why a deletion candidate was flagged, in words.
interface RuleFactsProps {
  record: ConflatedRecord | undefined;
  osmTags: Record<string, string> | undefined;
  rule: string;
}

function RuleFacts({ record, osmTags, rule }: RuleFactsProps) {
  const brand = osmTags && (rule === 'wikidata' || rule === 'name') ? flaggedBrand(osmTags, rule) : undefined;
  let why: ReactNode;
  switch (rule) {
    case 'wikidata':
    case 'name': {
      const by = rule === 'wikidata' ? 'Wikidata ID' : 'name';
      why = brand ? (
        <>
          AllThePlaces has the {brand.key}{' '}
          {brand.qid ? <Link to={toView({ kind: 'wikidata', qid: brand.qid })}>{brand.label}</Link> : <b>{brand.label}</b>}{' '}
          (by {by}) for this kind of place in this country, but none of its places matched this one.
        </>
      ) : (
        <>
          AllThePlaces has its brand, network or operator (by {by}) for this kind of place in this country, but none of
          its places matched this one.
        </>
      );
      break;
    }
    case 'swiss_transit_id':
      why = 'A Swiss public transport stop whose ID the national register of stops doesn’t know.';
      break;
    case 'swiss_transit_stop':
      why = 'A Swiss public transport stop without IDs, far from any stop in the national register.';
      break;
    default:
      why = rule.replaceAll('_', ' ');
  }
  return (
    <>
      <dt>Flagged</dt>
      <dd>{why}</dd>
      {record?.localShare !== undefined && (
        <>
          <dt>Nearby</dt>
          <dd>
            AllThePlaces matched {Math.round(record.localShare * 100)}% of the OpenStreetMap places of this{' '}
            {brand?.key ?? 'brand'}.
          </dd>
        </>
      )}
    </>
  );
}

function RelationChip({ relation }: { relation: string }) {
  return (
    <span className="relation-chip">
      <span
        className={`relation-chip__swatch ${relation === 'deletion_candidate' ? 'swatch--ring' : ''}`}
        style={{ '--swatch': relationToken(relation) } as CSSProperties}
        aria-hidden="true"
      />
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
  osmTags: Record<string, string> | undefined;
  correction: CameraCorrection | undefined;
  facts: OverviewFacts | undefined;
  selection: Selection;
}

function Facts({ record, osmTags, facts, selection, correction }: FactsProps) {
  const spider = record?.spider ?? facts?.spider ?? (selection.kind === 'atp' ? selection.spider : undefined);
  const osm = record?.osm ?? facts?.osm ?? (selection.kind === 'osm' ? selection : undefined);
  const relation = record?.relation ?? facts?.relation;
  const rule = record?.rule ?? facts?.rule;
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
      {relation === 'deletion_candidate' && rule && <RuleFacts record={record} osmTags={osmTags} rule={rule} />}
      {correction && <CorrectedPosition correction={correction} />}
    </dl>
  );
}

// Where the OpenStreetMap side of the panel comes from: the object as it
// is now, from the OpenStreetMap API, or else, while that is pending or
// if it fails, the tags an older archive has, as of the pipeline run. An
// archive from brawer/osmdiffs#1026 on may keep only a name and what kind
// of place it is, too few to compare: then only the AllThePlaces side is
// shown, rather than nearly every key as missing in OpenStreetMap.
interface OsmSide {
  // Undefined if there are none to show.
  tags: Record<string, string> | undefined;
  note?: string;
}

function osmSide(record: ConflatedRecord, osm: OsmElementState): OsmSide {
  const archived = Object.keys(record.osmTags).length > 0 && hasAllOsmTags(record) ? record.osmTags : undefined;
  const candidate = record.relation === 'deletion_candidate';
  switch (osm.status) {
    case 'found': {
      const then = record.osmVersion;
      if (then !== undefined && osm.version > then) {
        const edited = `Someone edited this on OpenStreetMap after this run (version ${then} then, ${osm.version} now)`;
        return {
          tags: osm.tags,
          note: candidate ? `${edited}.` : `${edited}, so some differences may already be fixed.`,
        };
      }
      return { tags: osm.tags };
    }
    case 'deleted':
      return { tags: archived, note: 'Someone deleted this from OpenStreetMap after this run.' };
    case 'loading':
      return { tags: archived, note: 'Loading the tags from OpenStreetMap…' };
    case 'error':
      return {
        tags: archived,
        note: archived
          ? 'Couldn’t load the current tags from OpenStreetMap, so these are from this run.'
          : 'Couldn’t load the tags from OpenStreetMap. Try again later.',
      };
    case 'idle':
      return { tags: archived };
  }
}

function TagTable({ record, osmTags }: { record: ConflatedRecord; osmTags: Record<string, string> | undefined }) {
  // A located_in row's OpenStreetMap tags are the host's, not this
  // place's: comparing them would be misleading. A deletion candidate
  // has nothing to compare with, only its OpenStreetMap tags. Without
  // OpenStreetMap tags to compare with, a matched row shows only its
  // AllThePlaces side, rather than every key as missing in OpenStreetMap.
  const compare = record.relation === 'same' && osmTags !== undefined;
  const osmOnly = record.relation === 'deletion_candidate';
  const rows = osmOnly ? compareTags({}, osmTags ?? {}) : compareTags(record.atpTags, compare ? osmTags : {});
  if (rows.length === 0) return null;
  return (
    <table className="detail__tags">
      <thead>
        <tr>
          <th scope="col">Key</th>
          <th scope="col">{osmOnly ? 'OpenStreetMap' : 'AllThePlaces'}</th>
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
            <td>{osmOnly ? row.osm : row.atp}</td>
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
  // The selected OpenStreetMap object as it is now.
  osm?: OsmElementState;
}

export default function FeatureDetail({
  selection,
  facts,
  detail,
  correction,
  osm = { status: 'idle' },
}: FeatureDetailProps) {
  const records = detail.status === 'ready' ? detail.records : [];
  const first = records[0];
  const relation = first?.relation ?? facts?.relation;
  // Only a matched row's or a deletion candidate's OpenStreetMap object
  // is the selection, and so the one fetched.
  const side = first && (relation === 'same' || relation === 'deletion_candidate') ? osmSide(first, osm) : undefined;
  return (
    <article className="detail">
      <h2 className="detail__title">{title(first, selection)}</h2>
      {relation && <RelationChip relation={relation} />}
      <Facts
        record={first}
        osmTags={side ? side.tags : first?.osmTags}
        facts={facts}
        selection={selection}
        correction={correction}
      />
      {detail.status === 'loading' && <p className="detail__status">Loading details…</p>}
      {detail.status === 'unavailable' && <p className="detail__status">Details unavailable here.</p>}
      {detail.status === 'error' && <p className="detail__status">Couldn’t load the details. Try again later.</p>}
      {records.length > 1 && (
        <p className="detail__status">
          {records.length} AllThePlaces places are matched to this OpenStreetMap object. Showing the first.
        </p>
      )}
      {relation === 'deletion_candidate' && osm.status !== 'deleted' && (
        <p className="detail__status">
          Nobody has checked this yet. The place may well still be there, and only its match in AllThePlaces missed.
        </p>
      )}
      {side?.note && <p className="detail__status">{side.note}</p>}
      {first && <TagTable record={first} osmTags={side ? side.tags : undefined} />}
    </article>
  );
}
