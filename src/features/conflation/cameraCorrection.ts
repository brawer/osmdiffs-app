// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Positions copied from Google Maps place URLs (brawer/osmdiffs#973): the
// `@lat,lon` of such a URL is the map's camera center, about 0.0022° of
// longitude west of the place. For a selected place that this affects,
// the map draws a line between where AllThePlaces put it and where the
// place is, or likely is.

import type { Position } from 'geojson';
import type { ConflatedRecord } from '../../lib/data/conflatedTiles.ts';
import type { SpiderStats } from '../../lib/data/spiderStats.ts';
import { hasGoogleCameraCoords } from '../../lib/flags.ts';

export interface CameraCorrection {
  // `moved`: the pipeline matched the place at the corrected position,
  // where the map draws it. `guessed`: a place of a flagged spider that
  // matched nothing, drawn where AllThePlaces put it; it may be east by
  // the spider's median offset, or it may be right where it is.
  kind: 'moved' | 'guessed';
  // Where AllThePlaces put the place, as [lng, lat].
  published: Position;
  // Where the place is, or likely is.
  corrected: Position;
  // How far east, in degrees of longitude.
  shiftDeg: number;
}

// `stats` is the spider's row of spider-stats.parquet, if loaded; only
// a guess for an unmatched place needs it.
export function cameraCorrection(
  record: ConflatedRecord | undefined,
  stats: SpiderStats | undefined,
): CameraCorrection | undefined {
  const at = record?.atpPosition;
  if (!record || !at) return undefined;
  const [lng, lat] = at as [number, number];
  if (record.positionShiftDeg !== undefined) {
    const shiftDeg = record.positionShiftDeg;
    return { kind: 'moved', published: [lng - shiftDeg, lat], corrected: [lng, lat], shiftDeg };
  }
  const offset = stats?.googleCameraCoordsOffsetDeg ?? null;
  if (record.relation === 'missing_in_osm' && stats && offset !== null && hasGoogleCameraCoords(stats)) {
    // The offset is ATP minus OSM, so the place lies the other way.
    const shiftDeg = -offset;
    return { kind: 'guessed', published: [lng, lat], corrected: [lng + shiftDeg, lat], shiftDeg };
  }
  return undefined;
}
