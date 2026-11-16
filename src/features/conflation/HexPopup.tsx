// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// What a click on a hexagon shows: how many places of each relation the
// cell holds that the map doesn't draw one by one yet, and a button that
// zooms into the cell. A small popup at the click, not the side panel:
// a cell is a stop on the way in, not something to select or share.

import * as maplibregl from 'maplibre-gl';
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { KNOWN_RELATIONS, type KnownRelation } from '../../lib/data/conflatedTiles.ts';
import type { ClickedHex } from './hexBounds.ts';
import { RELATION_LABELS, RELATION_TOKENS } from './relations.ts';

interface HexPopupProps {
  map: maplibregl.Map;
  clicked: ClickedHex;
  hidden: ReadonlySet<KnownRelation>;
  onZoomIn: () => void;
  onClose: () => void;
}

const numberFormat = new Intl.NumberFormat();

export default function HexPopup({ map, clicked, hidden, onZoomIn, onClose }: HexPopupProps) {
  const container = useMemo(() => document.createElement('div'), []);
  const [lng, lat] = clicked.lngLat;

  useEffect(() => {
    const popup = new maplibregl.Popup({
      closeOnClick: false,
      maxWidth: '260px',
      className: 'hex-popup',
      focusAfterOpen: false,
    })
      .setLngLat([lng, lat])
      .setDOMContent(container)
      .addTo(map);
    popup.on('close', onClose);
    return () => {
      popup.off('close', onClose);
      popup.remove();
    };
  }, [map, container, lng, lat, onClose]);

  const rows = [
    ...KNOWN_RELATIONS.filter((r) => !hidden.has(r)).map((r) => ({
      key: r,
      label: RELATION_LABELS[r],
      color: RELATION_TOKENS[r],
      n: clicked.hex.counts[r],
    })),
    { key: 'other', label: 'Other', color: RELATION_TOKENS.other, n: clicked.hex.counts.other },
  ].filter((row) => row.n > 0);
  const total = rows.reduce((sum, row) => sum + row.n, 0);

  return createPortal(
    <div className="hex-popup__body">
      <p className="hex-popup__title">
        {numberFormat.format(total)} {total === 1 ? 'place' : 'places'} in this area
      </p>
      <ul className="hex-popup__rows">
        {rows.map((row) => (
          <li key={row.key} className="hex-popup__row">
            <span className="legend-card__swatch" style={{ background: row.color }} aria-hidden="true" />
            <span className="hex-popup__label">{row.label}</span>
            <span className="hex-popup__count">{numberFormat.format(row.n)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="hex-popup__zoom" onClick={onZoomIn}>
        Zoom in
      </button>
    </div>,
    container,
  );
}
