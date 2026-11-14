// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// How a feature puts its data on the map. MapView owns the one MapLibre
// map; a feature hands it an Overlay (sources and layers drawn above the
// basemap) instead of calling MapLibre itself. MapView merges the overlay
// into a single style and lets MapLibre diff it against the current one,
// so a changed filter or colour scheme costs a few setFilter or
// setPaintProperty calls, not a reload. A future editor adds its own
// drawing layers the same way.

import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { MapColors } from './mapColors.ts';

export interface Overlay {
  sources: Record<string, SourceSpecification>;
  // Layers, bottom to top, painted with the current colours.
  layers: (colors: MapColors) => LayerSpecification[];
  // The layers whose features can be clicked.
  interactiveLayerIds: string[];
}
