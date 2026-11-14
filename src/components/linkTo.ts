// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// Route builders for <Link to={...}>.

import type { Route } from '../lib/route.ts';

// Route builders for the common destinations. Each keeps the camera and
// drops the selection, since a new view starts with nothing selected.
export const toView =
  (view: Route['view']) =>
  (current: Route): Route =>
    current.camera ? { view, camera: current.camera } : { view };

// To a spider's page, without the camera, so that the map moves to show
// the spider's features.
export const toSpider =
  (spider: string) =>
  (): Route => ({ view: { kind: 'spider', spider } });
