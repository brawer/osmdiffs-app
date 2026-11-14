// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

import { githubIconDataUri } from '../lib/icons.ts';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  // The data build's version (its release date), once known.
  buildVersion: string | undefined;
}

export default function Drawer({ open, onClose, buildVersion }: DrawerProps) {
  return (
    <>
      <div
        className={`drawer-backdrop ${open ? 'drawer-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <nav className={`drawer ${open ? 'drawer--open' : ''}`} aria-label="Menu" inert={!open}>
        <button type="button" className="drawer__close" onClick={onClose} aria-label="Close menu">
          ×
        </button>

        <section className="drawer__section">
          <h3>About</h3>
          <p>
            OSMDiffs compares the shops, restaurants, transit stops and other places that AllThePlaces collects from
            official websites with OpenStreetMap, to find places that OpenStreetMap is missing or has out of date.
            {buildVersion && <> You’re viewing the build from {buildVersion}.</>}
          </p>
          <a href="https://github.com/brawer/osmdiffs" target="_blank" rel="noreferrer" className="drawer__icon-link">
            <img src={githubIconDataUri()} alt="" width="16" height="16" />
            brawer/osmdiffs
          </a>
          <a
            href="https://github.com/brawer/osmdiffs-app"
            target="_blank"
            rel="noreferrer"
            className="drawer__icon-link"
          >
            <img src={githubIconDataUri()} alt="" width="16" height="16" />
            brawer/osmdiffs-app
          </a>
        </section>

        <section className="drawer__section">
          <h3>Download</h3>
          <p>The weekly output files, what is in them, and how to read them.</p>
          <a href="https://github.com/brawer/osmdiffs/tree/main/docs/outputs" target="_blank" rel="noreferrer">
            Output files &amp; download docs
          </a>
        </section>

        <section className="drawer__section">
          <h3>Data</h3>
          <p>
            Places from{' '}
            <a href="https://alltheplaces.xyz/" target="_blank" rel="noreferrer">
              AllThePlaces
            </a>
            , each under its source’s own licence. Map data ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap contributors
            </a>
            , ODbL.
          </p>
        </section>

        <section className="drawer__section">
          <h3>Author</h3>
          <p className="drawer__author">
            <a href="https://brawer.ch/" target="_blank" rel="noreferrer">
              Sascha Brawer
            </a>
            <span aria-hidden="true"> · </span>
            sascha@brawer.ch
          </p>
        </section>

        <section className="drawer__section">
          <h3>Background map</h3>
          <p>
            <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
              OpenFreeMap
            </a>{' '}
            &middot;{' '}
            <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">
              OpenMapTiles
            </a>{' '}
            &middot; Data from{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>
          </p>
        </section>
      </nav>
    </>
  );
}
