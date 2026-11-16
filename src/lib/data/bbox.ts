// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The bounding boxes in spider-stats.parquet. Apart from spiderStats.ts,
// so that the map can use them without loading the Parquet reader.

// A box around the features, in degrees, trimmed of a few outliers.
// When xmin > xmax, it crosses the antimeridian.
export interface Bbox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

// The box as MapLibre bounds, [[west, south], [east, north]]. One that
// crosses the antimeridian gets an east beyond 180°, which fitBounds
// takes as going east across it.
export function bboxBounds(b: Bbox): [[number, number], [number, number]] {
  return [
    [b.xmin, b.ymin],
    [b.xmin > b.xmax ? b.xmax + 360 : b.xmax, b.ymax],
  ];
}
