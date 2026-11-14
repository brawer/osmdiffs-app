// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useState } from 'react';
import AppBar from './components/AppBar.tsx';
import Drawer from './components/Drawer.tsx';
import MapView from './map/MapView.tsx';
import { watchDatapackage, type DataPackage } from './lib/data/datapackage.ts';
import type { Camera, Route } from './lib/route.ts';
import { getRoute, navigate, useRoute } from './lib/useRoute.ts';

// Whether reloading the page would lose nothing the URL doesn't keep: no
// open view and no selection, so a reload just redraws the same map with
// the new week's data.
function isSafeToReload(route: Route): boolean {
  return route.view.kind === 'map' && route.selection === undefined;
}

export default function App() {
  const route = useRoute();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [datapackage, setDatapackage] = useState<DataPackage | null>(null);
  const [newVersion, setNewVersion] = useState(false);

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

  const onCameraChange = useCallback((camera: Camera) => {
    navigate({ ...getRoute(), camera }, { replace: true });
  }, []);

  // Escape closes the drawer.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <MapView initialCamera={route.camera} onCameraChange={onCameraChange} />

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
