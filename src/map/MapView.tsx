// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { useEffect, useRef } from 'react';
// MapLibre GL 6 dropped its UMD/default-export build; import as a namespace.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre resolves its worker script at runtime relative to its own module
// URL, which only works when that file is served standalone. Our production
// build bundles maplibre-gl's code into one chunk instead, so the `?url`
// import asks Vite to emit the worker as its own hashed asset and
// setWorkerUrl() points the library at it. See vite.config.ts for why the
// emitted file ends in .js rather than .mjs.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { DEFAULT_CAMERA, type Camera } from '../lib/route.ts';
import { onColorSchemeChange } from '../lib/theme.ts';
import { basemapStyle } from './basemapStyle.ts';
import { currentMapColors } from './mapColors.ts';
import type { Overlay } from './overlay.ts';

let workerUrlSet = false;
function ensureWorkerUrl() {
  if (!workerUrlSet) {
    maplibregl.setWorkerUrl(maplibreWorkerUrl);
    workerUrlSet = true;
  }
}

// How long the camera must stay put before it's written to the URL.
const CAMERA_SYNC_DELAY_MS = 300;

// How far from a tap, in pixels, a feature still counts as tapped; a
// fingertip is far less precise than a mouse.
const CLICK_TOLERANCE_PX = 8;

function fullStyle(overlay: Overlay | null): maplibregl.StyleSpecification {
  const colors = currentMapColors();
  const style = basemapStyle(colors.basemap, window.location.origin);
  if (!overlay) return style;
  return {
    ...style,
    sources: { ...style.sources, ...overlay.sources },
    layers: [...style.layers, ...overlay.layers(colors)],
  };
}

// Of the features around a click, the one the user most likely meant:
// the topmost of the points nearest the click, or else the topmost shape.
// Dots overlap, so "nearest" allows a few pixels of slack in favour of
// what is drawn on top.
const NEAREST_SLACK_PX = 3;

function nearestFeature(
  map: maplibregl.Map,
  features: maplibregl.MapGeoJSONFeature[],
  at: maplibregl.Point,
): maplibregl.MapGeoJSONFeature | undefined {
  const points = features.flatMap((feature) => {
    if (feature.geometry.type !== 'Point') return [];
    const [lng, lat] = feature.geometry.coordinates;
    return [{ feature, distance: map.project([lng!, lat!]).dist(at) }];
  });
  if (points.length === 0) return features[0];
  const nearest = Math.min(...points.map((p) => p.distance));
  return points.find((p) => p.distance <= nearest + NEAREST_SLACK_PX)!.feature;
}

interface MapViewProps {
  // Where the map starts. Later changes are ignored: the map owns its
  // camera once it exists, and reports moves through onCameraChange.
  initialCamera: Camera | undefined;
  onCameraChange: (camera: Camera) => void;
  overlay: Overlay | null;
  // A click on the map: the feature that was hit, if any, and where.
  onClick?: (feature: maplibregl.MapGeoJSONFeature | undefined, lngLat: maplibregl.LngLat) => void;
  // Hands out the map once it exists, and null once it's gone.
  onMapReady?: (map: maplibregl.Map | null) => void;
}

export default function MapView({ initialCamera, onCameraChange, overlay, onClick, onMapReady }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initialCameraRef = useRef(initialCamera);
  const overlayRef = useRef(overlay);
  const callbacks = useRef({ onCameraChange, onClick, onMapReady });
  useEffect(() => {
    callbacks.current = { onCameraChange, onClick, onMapReady };
  }, [onCameraChange, onClick, onMapReady]);

  useEffect(() => {
    if (!containerRef.current) return;
    ensureWorkerUrl();
    const camera = initialCameraRef.current ?? DEFAULT_CAMERA;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: fullStyle(overlayRef.current),
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
      maxZoom: 19,
      // Attribution lives in the drawer instead, as in osmviews-app.
      attributionControl: false,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __debugMap: maplibregl.Map }).__debugMap = map;

    let timer: ReturnType<typeof setTimeout> | undefined;
    map.on('moveend', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { lat, lng } = map.getCenter();
        callbacks.current.onCameraChange({ zoom: map.getZoom(), lat, lng });
      }, CAMERA_SYNC_DELAY_MS);
    });

    const around = (point: maplibregl.Point): [maplibregl.PointLike, maplibregl.PointLike] => [
      [point.x - CLICK_TOLERANCE_PX, point.y - CLICK_TOLERANCE_PX],
      [point.x + CLICK_TOLERANCE_PX, point.y + CLICK_TOLERANCE_PX],
    ];
    const hits = (point: maplibregl.Point) => {
      const layers = (overlayRef.current?.interactiveLayerIds ?? []).filter((id) => map.getLayer(id));
      return layers.length > 0 ? map.queryRenderedFeatures(around(point), { layers }) : [];
    };
    map.on('click', (e) => {
      callbacks.current.onClick?.(nearestFeature(map, hits(e.point), e.point), e.lngLat);
    });
    map.on('mousemove', (e) => {
      map.getCanvas().style.cursor = hits(e.point).length > 0 ? 'pointer' : '';
    });

    // The container changes size when the side panel opens or closes, not
    // only with the window, which is all MapLibre watches by itself.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    // Repaint when the system switches between light and dark. setStyle
    // diffs against the current style, so only paint changes.
    const stopWatchingScheme = onColorSchemeChange(() => map.setStyle(fullStyle(overlayRef.current)));

    callbacks.current.onMapReady?.(map);
    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      stopWatchingScheme();
      callbacks.current.onMapReady?.(null);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (overlayRef.current === overlay) return;
    overlayRef.current = overlay;
    mapRef.current?.setStyle(fullStyle(overlay));
  }, [overlay]);

  return <div ref={containerRef} className="map" />;
}
