// SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
// SPDX-License-Identifier: MIT

interface AppBarProps {
  onMenuClick: () => void;
}

export default function AppBar({ onMenuClick }: AppBarProps) {
  return (
    <header className="app-bar">
      <span className="app-bar__brand">
        <a
          href="https://brawer.ch/"
          target="_blank"
          rel="noreferrer"
          className="app-bar__logo"
          aria-label="Sascha Brawer's home page"
        >
          🌼
        </a>
        <span className="app-bar__title">
          <span className="app-bar__title-osm">OSM</span>
          <span className="app-bar__title-diffs">Diffs</span>
        </span>
      </span>
      <button
        type="button"
        className="app-bar__menu-button"
        onClick={onMenuClick}
        aria-label="Open menu"
        aria-haspopup="true"
      >
        ☰
      </button>
    </header>
  );
}
