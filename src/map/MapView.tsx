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
import { basemapStyle, currentBasemapColors } from './basemapStyle.ts';

let workerUrlSet = false;
function ensureWorkerUrl() {
  if (!workerUrlSet) {
    maplibregl.setWorkerUrl(maplibreWorkerUrl);
    workerUrlSet = true;
  }
}

// How long the camera must stay put before it's written to the URL.
const CAMERA_SYNC_DELAY_MS = 300;

interface MapViewProps {
  // Where the map starts. Later changes are ignored: the map owns its
  // camera once it exists, and reports moves through onCameraChange.
  initialCamera: Camera | undefined;
  onCameraChange: (camera: Camera) => void;
}

export default function MapView({ initialCamera, onCameraChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCameraRef = useRef(initialCamera);
  const onCameraChangeRef = useRef(onCameraChange);
  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
  }, [onCameraChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    ensureWorkerUrl();
    const camera = initialCameraRef.current ?? DEFAULT_CAMERA;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(currentBasemapColors()),
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
      maxZoom: 19,
      // Attribution lives in the drawer instead, as in osmviews-app.
      attributionControl: false,
    });
    if (import.meta.env.DEV) (window as unknown as { __debugMap: maplibregl.Map }).__debugMap = map;

    let timer: ReturnType<typeof setTimeout> | undefined;
    map.on('moveend', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { lat, lng } = map.getCenter();
        onCameraChangeRef.current({ zoom: map.getZoom(), lat, lng });
      }, CAMERA_SYNC_DELAY_MS);
    });

    // Repaint the basemap when the system switches between light and dark.
    // setStyle diffs against the current style, so only paint changes.
    const stopWatchingScheme = onColorSchemeChange(() => map.setStyle(basemapStyle(currentBasemapColors())));

    return () => {
      clearTimeout(timer);
      stopWatchingScheme();
      map.remove();
    };
  }, []);

  return <div ref={containerRef} className="map" />;
}
