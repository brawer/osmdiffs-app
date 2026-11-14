// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

// The panel that holds the current view's content next to the map. It is
// always there, so the map never changes size when something is selected.
//
// From 900 px up it is a column on the left, over the map, which treats
// it as padding (see App.tsx). A tab on its edge collapses it, and the
// map then shows what was underneath without moving.
//
// On narrower screens it is a bottom sheet over the map, with three
// heights: peek, half and full. At rest (nothing selected, no view open)
// it stays at peek, just tall enough for its content. Once something is
// shown it opens to half; tap the handle to step through the heights, or
// drag it.

import { forwardRef, useRef, useState, type PointerEvent, type ReactNode } from 'react';

export type SheetHeight = 'peek' | 'half' | 'full';
const HEIGHTS: SheetHeight[] = ['peek', 'half', 'full'];

// The sheet's height at peek, in pixels. App.tsx keeps the map's centre
// above this much of a phone's screen.
export const PEEK_PX = 176;

// The app bar's height, over the top of the map.
export const APP_BAR_PX = 52;

// A drag shorter than this is a tap.
const TAP_SLOP_PX = 6;

interface SidePanelProps {
  label: string;
  // Back to the resting view; undefined while at rest.
  onClose?: (() => void) | undefined;
  // Wide screens: whether the panel is tucked away, and how to toggle it.
  collapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
}

const SidePanel = forwardRef<HTMLElement, SidePanelProps>(function SidePanel(
  { label, onClose, collapsed, onToggleCollapsed, children },
  ref,
) {
  const resting = onClose === undefined;
  const [height, setHeight] = useState<SheetHeight>(resting ? 'peek' : 'half');
  // The sheet's height in pixels while it is being dragged.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  // Something to show opens the sheet; back at rest, it shrinks again.
  const [wasResting, setWasResting] = useState(resting);
  if (wasResting !== resting) {
    setWasResting(resting);
    setHeight(resting ? 'peek' : 'half');
  }

  const setRefs = (element: HTMLElement | null) => {
    panelRef.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  };

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
    const sizes: Record<SheetHeight, number> = { peek: PEEK_PX, half: parent * 0.5, full: parent - APP_BAR_PX };
    const nearest = HEIGHTS.reduce((a, b) => (Math.abs(sizes[b] - target) < Math.abs(sizes[a] - target) ? b : a));
    if (target < sizes.peek / 2 && onClose) onClose();
    else setHeight(nearest);
  };

  const style =
    dragHeight !== null ? { height: `${Math.max(60, dragHeight)}px`, transition: 'none' } : undefined;

  return (
    <aside
      ref={setRefs}
      className={`side-panel side-panel--${height} ${resting ? 'side-panel--resting' : ''} ${
        collapsed ? 'side-panel--collapsed' : ''
      }`}
      aria-label={label}
      style={style}
    >
      {!resting && (
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
      )}
      {onClose && (
        <button type="button" className="side-panel__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      )}
      <button
        type="button"
        className="side-panel__collapse"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show side panel' : 'Hide side panel'}
        title={collapsed ? 'Show side panel' : 'Hide side panel'}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d={collapsed ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="side-panel__body" inert={collapsed || undefined}>
        {children}
      </div>
    </aside>
  );
});

export default SidePanel;
