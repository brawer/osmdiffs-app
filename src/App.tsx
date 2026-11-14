// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import type * as maplibregl from 'maplibre-gl';
import type { Position } from 'geojson';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppBar from './components/AppBar.tsx';
import Drawer from './components/Drawer.tsx';
import SidePanel, { APP_BAR_PX, PEEK_PX } from './components/SidePanel.tsx';
import { conflationOverlay, SOURCE_ID } from './features/conflation/conflationOverlay.ts';
import FeatureDetail from './features/conflation/FeatureDetail.tsx';
import LegendCard from './features/conflation/LegendCard.tsx';
import { openConflatedTiles, useConflatedDetail } from './features/conflation/useConflatedDetail.ts';
import { useInViewCounts } from './features/conflation/useInViewCounts.ts';
import SpiderViews from './features/spiders/SpiderViews.tsx';
import { useSpiderStats } from './features/spiders/useSpiderStats.ts';
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
import { useWideScreen } from './lib/useWideScreen.ts';
import MapView from './map/MapView.tsx';
import { setPaddingInPlace, type Padding } from './map/padding.ts';

// The side panel's width on wide screens; keep in sync with --panel-width
// in app.css.
const PANEL_WIDTH_PX = 400;

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

// Back to the plain map, where the camera is now.
function closeView() {
  const { camera } = getRoute();
  navigate(camera ? { view: { kind: 'map' }, camera } : { view: { kind: 'map' } });
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

// Where the page was opened: a shared link to a spider page with a camera
// keeps that camera instead of moving to the spider's features.
const initialRoute = getRoute();

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
  const wide = useWideScreen();
  const [collapsedWide, setCollapsed] = useState(false);
  // Only a column can be tucked away; a bottom sheet always peeks.
  const collapsed = wide && collapsedWide;

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
  const selRelation = firstRecord?.relation ?? click?.facts.relation;
  const selFids = detail.status === 'ready' ? detail.records.flatMap((r) => (r.fid === undefined ? [] : [r.fid])) : [];
  const selFidsKey = selFids.join(',');
  const selImportance = click?.facts.importance;

  const view = route.view;
  const spider = view.kind === 'spider' ? view.spider : undefined;
  const stats = useSpiderStats(datapackage, view.kind !== 'map');
  const conflatedUrl = datapackage ? getResource(datapackage, 'conflated')?.url : undefined;

  // At rest, the panel shows the legend; otherwise a place or a view.
  const resting = selection === undefined && view.kind === 'map';
  const shownKey = selection
    ? `place:${selectionKey}`
    : view.kind === 'spider'
      ? `spider:${view.spider}`
      : view.kind === 'wikidata'
        ? `wikidata:${view.qid}`
        : view.kind;

  // Showing something new brings back a tucked-away panel.
  const [lastShown, setLastShown] = useState(shownKey);
  if (lastShown !== shownKey) {
    setLastShown(shownKey);
    if (shownKey !== 'map') setCollapsed(false);
  }

  // The map lies under the panel, and treats it as padding. A new map
  // takes it as is, so the camera from the URL is the centre of what is
  // visible; later changes leave the map where it is on screen.
  const padLeft = wide && !collapsed ? PANEL_WIDTH_PX : 0;
  const padBottom = wide ? 0 : PEEK_PX;
  const paddedMap = useRef<maplibregl.Map | null>(null);
  useEffect(() => {
    if (!map) return;
    const padding: Padding = { top: 0, right: 0, bottom: padBottom, left: padLeft };
    if (paddedMap.current === map) {
      setPaddingInPlace(map, padding);
    } else {
      paddedMap.current = map;
      map.setPadding(padding);
    }
  }, [map, padLeft, padBottom]);

  // On a spider page, show the spider's features: fit the map to where
  // the overview tiles have them.
  const fittedSpider = useRef(
    initialRoute.view.kind === 'spider' && initialRoute.camera ? initialRoute.view.spider : undefined,
  );
  useEffect(() => {
    if (!spider) fittedSpider.current = undefined;
    if (!map || !tiles || !spider || fittedSpider.current === spider) return;
    fittedSpider.current = spider;
    let live = true;
    tiles.spiderExtent(spider).then(
      (extent) => {
        if (!live || !extent) return;
        const [w, s, e, n] = extent;
        // Beyond the map's own padding: on a phone, the sheet is open at
        // half height on a spider page.
        const sheet = wide ? 0 : map.getContainer().clientHeight * 0.5 - PEEK_PX;
        map.fitBounds(
          [
            [w, s],
            [e, n],
          ],
          {
            maxZoom: 14,
            padding: { top: APP_BAR_PX + 40, bottom: Math.max(40, sheet + 20), left: 40, right: 40 },
          },
        );
      },
      () => {},
    );
    return () => {
      live = false;
      // Under StrictMode's double run, or a quick move to another spider,
      // fit again next time.
      if (fittedSpider.current === spider) fittedSpider.current = undefined;
    };
  }, [map, tiles, spider, wide]);

  // Keep the selected place in sight. Following a shared link can put it
  // anywhere; on a phone, the opening sheet covers the lower half of the
  // map; and a panel shown again covers the left side. Otherwise the map
  // stays where it is.
  useEffect(() => {
    if (!map || selLng === undefined || selLat === undefined) return;
    // After the sheet has opened, and the padding has caught up.
    const timer = setTimeout(() => {
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const { left = 0, right = 0, bottom = 0 } = map.getPadding();
      // How much of the map the sheet covers, beyond the padding.
      const sheet = wide ? 0 : resting ? PEEK_PX : h * 0.5;
      const at = map.project([selLng, selLat]);
      if (at.x < left + 40 || at.x > w - right - 40 || at.y < APP_BAR_PX + 40 || at.y > h - Math.max(sheet, bottom) - 40) {
        map.easeTo({ center: [selLng, selLat], offset: [0, (APP_BAR_PX - Math.max(0, sheet - bottom)) / 2] });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [map, selLng, selLat, resting, wide, collapsed]);

  const overlay = useMemo(
    () =>
      tiles
        ? conflationOverlay({
            sourceUrl: tiles.sourceUrl,
            hidden,
            selection: getRoute().selection,
            selectedPosition: selLng !== undefined && selLat !== undefined ? [selLng, selLat] : undefined,
            selectedRelation: selRelation,
            selectedFids: selFids,
            selectedImportance: selImportance,
            spider,
          })
        : null,
    // The selection and its fids are compared by value, through keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiles, hidden, selectionKey, selLng, selLat, selRelation, selFidsKey, selImportance, spider],
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
      else if (getRoute().view.kind !== 'map') closeView();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className={`app ${collapsed ? 'app--panel-collapsed' : ''}`}>
      <div className="app__map">
        <MapView
          initialCamera={route.camera}
          onCameraChange={onCameraChange}
          overlay={overlay}
          onClick={onMapClick}
          onMapReady={setMap}
        />
      </div>

      <SidePanel
        label={selection ? 'Place details' : view.kind === 'map' ? 'Legend' : 'Spider statistics'}
        onClose={selection ? () => select(undefined) : view.kind === 'map' ? undefined : closeView}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
      >
        {selection ? (
          <FeatureDetail selection={selection} facts={click?.facts} detail={detail} />
        ) : view.kind === 'map' ? (
          <LegendCard counts={tiles ? counts : undefined} hidden={hidden} onToggle={toggleRelation} />
        ) : (
          <SpiderViews view={view} state={stats} conflatedUrl={conflatedUrl} />
        )}
      </SidePanel>

      <AppBar onMenuClick={() => setDrawerOpen(true)} />
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        buildVersion={datapackage?.version}
        view={view}
      />

      {newVersion && (
        <button type="button" className="update-banner" onClick={() => window.location.reload()}>
          New data available — tap to reload
        </button>
      )}
    </div>
  );
}
