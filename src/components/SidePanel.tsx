// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The panel that holds the current view's content next to the map. From
// 900 px up it is a column on the left and the map shrinks beside it
// (see app.css). On narrower screens it is a bottom sheet over the map,
// with three heights: peek, half and full. Tap the handle to step
// through them, or drag it.

import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

export type SheetHeight = 'peek' | 'half' | 'full';
const HEIGHTS: SheetHeight[] = ['peek', 'half', 'full'];

// A drag shorter than this is a tap.
const TAP_SLOP_PX = 6;

interface SidePanelProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

export default function SidePanel({ label, onClose, children }: SidePanelProps) {
  const [height, setHeight] = useState<SheetHeight>('half');
  // The sheet's height in pixels while it is being dragged.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    drag.current = { startY: e.clientY, startHeight: panelRef.current?.offsetHeight ?? 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (start) setDragHeight(start.startHeight + start.startY - e.clientY);
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    drag.current = null;
    setDragHeight(null);
    if (!start) return;
    const moved = start.startY - e.clientY;
    if (Math.abs(moved) < TAP_SLOP_PX) {
      setHeight(HEIGHTS[(HEIGHTS.indexOf(height) + 1) % HEIGHTS.length]!);
      return;
    }
    // Snap to whichever height is nearest where the drag let go.
    const target = start.startHeight + moved;
    const parent = panelRef.current?.parentElement?.clientHeight ?? window.innerHeight;
    const sizes: Record<SheetHeight, number> = { peek: 140, half: parent * 0.5, full: parent - 52 };
    const nearest = HEIGHTS.reduce((a, b) => (Math.abs(sizes[b] - target) < Math.abs(sizes[a] - target) ? b : a));
    if (target < sizes.peek / 2) onClose();
    else setHeight(nearest);
  };

  const style = dragHeight !== null ? { height: `${Math.max(60, dragHeight)}px`, transition: 'none' } : undefined;

  return (
    <aside ref={panelRef} className={`side-panel side-panel--${height}`} aria-label={label} style={style}>
      <button
        type="button"
        className="side-panel__handle"
        aria-label={`Resize panel (now ${height})`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragHeight(null);
        }}
      />
      <button type="button" className="side-panel__close" onClick={onClose} aria-label="Close panel">
        ×
      </button>
      <div className="side-panel__body">{children}</div>
    </aside>
  );
}
