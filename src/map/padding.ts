// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The side panel sits over the map rather than beside it, so the map
// never changes size. Instead the map treats the panel as padding: its
// centre, the camera in the URL, fitBounds and easeTo all refer to the
// part of the map that is not covered.

import type * as maplibregl from 'maplibre-gl';

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// The point on screen that a map with this padding calls its centre.
export function paddedCenter(width: number, height: number, padding: Padding): [number, number] {
  return [
    padding.left + (width - padding.left - padding.right) / 2,
    padding.top + (height - padding.top - padding.bottom) / 2,
  ];
}

// Changes the map's padding without moving what is drawn: the place
// that will sit at the new padded centre becomes the centre. (Setting
// the padding alone would keep the old centre, and so pan the map.)
export function setPaddingInPlace(map: maplibregl.Map, padding: Padding): void {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const center = map.unproject(paddedCenter(w, h, padding));
  map.jumpTo({ center, padding });
}
