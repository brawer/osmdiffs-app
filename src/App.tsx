// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import type * as maplibregl from 'maplibre-gl';
import type { Position } from 'geojson';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppBar from './components/AppBar.tsx';
import Drawer from './components/Drawer.tsx';
import SidePanel from './components/SidePanel.tsx';
import { conflationOverlay, SOURCE_ID } from './features/conflation/conflationOverlay.ts';
import FeatureDetail from './features/conflation/FeatureDetail.tsx';
import LegendCard from './features/conflation/LegendCard.tsx';
import { openConflatedTiles, useConflatedDetail } from './features/conflation/useConflatedDetail.ts';
import { useInViewCounts } from './features/conflation/useInViewCounts.ts';
import {
  DETAIL_ZOOM,
  MATCHED_LAYER,
  overviewFacts,
  selectionFor,
  type KnownRelation,
  type OverviewFacts,
  type Properties,
} from './lib/data/conflatedTiles.ts';
import { getResource, watchDatapackage, type DataPackage } from './lib/data/datapackage.ts';
import { selectionToString, type Camera, type Route, type Selection } from './lib/route.ts';
import { getRoute, navigate, useRoute } from './lib/useRoute.ts';
import MapView from './map/MapView.tsx';

// Whether reloading the page would lose nothing the URL doesn't keep: no
// open view and no selection, so a reload just redraws the same map with
// the new week's data.
function isSafeToReload(route: Route): boolean {
  return route.view.kind === 'map' && route.selection === undefined;
}

function select(selection: Selection | undefined, { replace = false } = {}) {
  const { selection: _previous, ...rest } = getRoute();
  navigate(selection ? { ...rest, selection } : rest, { replace });
}

// Where a clicked feature is. Below z13 a dot's geometry is snapped to a
// coarse tile grid, so the click itself is closer. At z13 and up, a click
// on an OpenStreetMap shape or a link counts as a click on its row, whose
// AllThePlaces point is found by the shared fid.
function clickedPosition(
  map: maplibregl.Map,
  feature: maplibregl.MapGeoJSONFeature,
  lngLat: maplibregl.LngLat,
): Position {
  if (map.getZoom() < DETAIL_ZOOM) return lngLat.toArray();
  const fid = feature.properties.fid;
  if (feature.properties.part !== 'atp' && typeof fid === 'number' && feature.sourceLayer) {
    const [atp] = map.querySourceFeatures(SOURCE_ID, {
      sourceLayer: feature.sourceLayer,
      filter: ['all', ['==', ['get', 'fid'], fid], ['==', ['get', 'part'], 'atp']],
    });
    if (atp?.geometry.type === 'Point') return atp.geometry.coordinates;
  }
  return feature.geometry.type === 'Point' ? feature.geometry.coordinates : lngLat.toArray();
}

interface Clicked {
  key: string;
  facts: OverviewFacts;
  position: Position;
}

export default function App() {
  const route = useRoute();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [datapackage, setDatapackage] = useState<DataPackage | null>(null);
  const [newVersion, setNewVersion] = useState(false);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<KnownRelation>>(new Set());
  const [clicked, setClicked] = useState<Clicked | null>(null);

  useEffect(
    () =>
      watchDatapackage(setDatapackage, () => {
        if (isSafeToReload(getRoute())) {
          window.location.reload();
        } else {
          setNewVersion(true);
        }
      }),
    [],
  );

  const tilesUrl = datapackage ? getResource(datapackage, 'conflated-tiles')?.url : undefined;
  const tiles = useMemo(() => (tilesUrl ? openConflatedTiles(tilesUrl) : null), [tilesUrl]);

  const selection = route.selection;
  const selectionKey = selection ? selectionToString(selection) : '';
  const click = clicked && clicked.key === selectionKey ? clicked : null;
  const onExact = useCallback(
    (exact: Selection) => {
      // The click that led here still describes the same place.
      setClicked((c) => (c && c.key === selectionKey ? { ...c, key: selectionToString(exact) } : c));
      select(exact, { replace: true });
    },
    [selectionKey],
  );
  const detail = useConflatedDetail(tiles, map, selection, click?.position, onExact);
  const counts = useInViewCounts(map);

  const firstRecord = detail.status === 'ready' ? detail.records[0] : undefined;

  const selectedPosition: Position | undefined =
    firstRecord?.atpPosition ??
    click?.position ??
    (selection?.kind === 'atp' ? [selection.lng, selection.lat] : undefined);
  const [selLng, selLat] = selectedPosition ?? [];

  const panelOpen = selection !== undefined;

  // Keep the selected place in sight: opening the panel narrows the map
  // (or, on a phone, covers its lower half), which can push the place out
  // of view; so can following a shared link.
  useEffect(() => {
    if (!map || selLng === undefined || selLat === undefined) return;
    // After the map has resized for the panel.
    const timer = setTimeout(() => {
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const sheet = window.innerWidth < 900 ? h * 0.5 : 0;
      const at = map.project([selLng, selLat]);
      if (at.x < 40 || at.x > w - 40 || at.y < 52 + 40 || at.y > h - sheet - 40) {
        map.easeTo({ center: [selLng, selLat], offset: [0, (52 - sheet) / 2] });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [map, selLng, selLat, panelOpen]);

  const overlay = useMemo(
    () =>
      tiles
        ? conflationOverlay({
            sourceUrl: tiles.sourceUrl,
            hidden,
            selection: getRoute().selection,
            selectedPosition: selLng !== undefined && selLat !== undefined ? [selLng, selLat] : undefined,
          })
        : null,
    // The selection is compared by value, through its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiles, hidden, selectionKey, selLng, selLat],
  );

  const onCameraChange = useCallback((camera: Camera) => {
    navigate({ ...getRoute(), camera }, { replace: true });
  }, []);

  const onMapClick = useCallback(
    (feature: maplibregl.MapGeoJSONFeature | undefined, lngLat: maplibregl.LngLat) => {
      if (!feature || !map) {
        select(undefined);
        return;
      }
      const facts = overviewFacts(feature.properties as Properties);
      // A matched row's AllThePlaces point, at z13 and up, doesn't carry
      // the OpenStreetMap ID; its sibling features with the same fid do.
      const fid = feature.properties.fid;
      if (facts.relation === 'same' && !facts.osm && typeof fid === 'number') {
        const [sibling] = map.querySourceFeatures(SOURCE_ID, {
          sourceLayer: MATCHED_LAYER,
          filter: ['all', ['==', ['get', 'fid'], fid], ['has', 'osm:id']],
        });
        const osm = sibling && overviewFacts(sibling.properties as Properties).osm;
        if (osm) facts.osm = osm;
      }
      const position = clickedPosition(map, feature, lngLat);
      const next = selectionFor(facts, position);
      setClicked({ key: selectionToString(next), facts, position });
      select(next);
    },
    [map],
  );

  const toggleRelation = useCallback((relation: KnownRelation) => {
    setHidden((previous) => {
      const next = new Set(previous);
      if (!next.delete(relation)) next.add(relation);
      return next;
    });
  }, []);

  // Escape closes the drawer, or else the panel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drawerOpen) setDrawerOpen(false);
      else if (getRoute().selection) select(undefined);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className={`app ${panelOpen ? 'app--panel-open' : ''}`}>
      <div className="app__map">
        <MapView
          initialCamera={route.camera}
          onCameraChange={onCameraChange}
          overlay={overlay}
          onClick={onMapClick}
          onMapReady={setMap}
        />
        {tiles && <LegendCard counts={counts} hidden={hidden} onToggle={toggleRelation} />}
      </div>

      {selection && (
        <SidePanel label="Place details" onClose={() => select(undefined)}>
          <FeatureDetail selection={selection} facts={click?.facts} detail={detail} />
        </SidePanel>
      )}

      <AppBar onMenuClick={() => setDrawerOpen(true)} />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} buildVersion={datapackage?.version} />

      {newVersion && (
        <button type="button" className="update-banner" onClick={() => window.location.reload()}>
          New data available — tap to reload
        </button>
      )}
    </div>
  );
}
