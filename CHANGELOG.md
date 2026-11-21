# Changelog

## [1.6.0](https://github.com/brawer/osmdiffs-app/compare/v1.5.0...v1.6.0) (2026-11-21)


### 🆕 Features

* fetch OpenStreetMap tags from the OSM API in the detail panel ([#47](https://github.com/brawer/osmdiffs-app/issues/47)) ([0f96507](https://github.com/brawer/osmdiffs-app/commit/0f965074ff8383547c0e82a395b03fe75363364c))
* show the no_geometry, bad_geometry and no_kind counts from spider-stats ([#43](https://github.com/brawer/osmdiffs-app/issues/43)) ([52a3faa](https://github.com/brawer/osmdiffs-app/commit/52a3faa8c492159803bc8b14e693ac2d6aea09a0))

## [1.5.0](https://github.com/brawer/osmdiffs-app/compare/v1.4.0...v1.5.0) (2026-11-19)


### 🆕 Features

* draw a spider's cells on its page where the overview is thinned ([#41](https://github.com/brawer/osmdiffs-app/issues/41)) ([c38bf01](https://github.com/brawer/osmdiffs-app/commit/c38bf016234536ae29cbff9ac1b5bb0fa3cf6531))
* show deletion candidates matched by name ([#35](https://github.com/brawer/osmdiffs-app/issues/35)) ([029755d](https://github.com/brawer/osmdiffs-app/commit/029755d88becb1b6d7cf80cf7c8e01c87737812a))
* show how each spider changed since the previous spider-stats file ([#39](https://github.com/brawer/osmdiffs-app/issues/39)) ([a4ffab3](https://github.com/brawer/osmdiffs-app/commit/a4ffab3d81da756f5049e55e1e775d12b5b32fea))
* show how opening hours differ, and value quality per key ([#38](https://github.com/brawer/osmdiffs-app/issues/38)) ([9cdd7fa](https://github.com/brawer/osmdiffs-app/commit/9cdd7fa16e13fdebb6f769ebd28f3fb1610f687b))

## [1.4.0](https://github.com/brawer/osmdiffs-app/compare/v1.3.0...v1.4.0) (2026-11-16)


### 🆕 Features

* flag spiders whose positions were copied from Google Maps ([#27](https://github.com/brawer/osmdiffs-app/issues/27)) ([ad6bf32](https://github.com/brawer/osmdiffs-app/commit/ad6bf32b6b8b696b2e53f3fa5993bafb0ff0e907))
* flag stacking within a kind, and skip chains open around the clock ([#31](https://github.com/brawer/osmdiffs-app/issues/31)) ([62a6cdf](https://github.com/brawer/osmdiffs-app/commit/62a6cdf8b86d01a08147e5ecd190dd3f975192ec))
* retune the spider flags on the first planet run ([#25](https://github.com/brawer/osmdiffs-app/issues/25)) ([fc0c6de](https://github.com/brawer/osmdiffs-app/commit/fc0c6de716f12787327b9fb216c4ac1693305470))
* show deletion candidates on the conflation map ([#32](https://github.com/brawer/osmdiffs-app/issues/32)) ([9059401](https://github.com/brawer/osmdiffs-app/commit/90594016c9663db878d75a398612cfa61136c5d5))

## [1.3.0](https://github.com/brawer/osmdiffs-app/compare/v1.2.0...v1.3.0) (2026-11-15)


### 🆕 Features

* fade the rest of the map while a place is selected ([a07e050](https://github.com/brawer/osmdiffs-app/commit/a07e050bb54a221ffb0d5bc859009410ce9b2a81))
* keep the side panel always open, with the legend at rest ([d74a60f](https://github.com/brawer/osmdiffs-app/commit/d74a60fe590e5998aed1a543ac76fdca6b410666))


### 🐞 Fixes

* find OpenStreetMap selections that thinned z13 tiles lost ([03d9f18](https://github.com/brawer/osmdiffs-app/commit/03d9f1801fd5a898360508ce3311f474ec9f39c8))
* open a shared link at the linked branch, not another one of the chain ([1ced741](https://github.com/brawer/osmdiffs-app/commit/1ced74112272d70ce5095242f5988f2f094ab4a7)), closes [#18](https://github.com/brawer/osmdiffs-app/issues/18)

## [1.2.0](https://github.com/brawer/osmdiffs-app/compare/v1.1.0...v1.2.0) (2026-11-14)


### 🆕 Features

* spider dashboard ([6d85a78](https://github.com/brawer/osmdiffs-app/commit/6d85a78ef0f1e3d5742f4ad8703adf40d8018cd9)), closes [#2](https://github.com/brawer/osmdiffs-app/issues/2)

## [1.1.0](https://github.com/brawer/osmdiffs-app/compare/v1.0.0...v1.1.0) (2026-11-14)


### 🆕 Features

* show the conflation map, with details for a clicked place ([36f89a6](https://github.com/brawer/osmdiffs-app/commit/36f89a63ef5d56bbf7f4ce4fd43a77e22114d12c)), closes [#1](https://github.com/brawer/osmdiffs-app/issues/1)

## 1.0.0 (2026-11-14)


### 🆕 Features

* add the basic OSMDiffs app ([#3](https://github.com/brawer/osmdiffs-app/issues/3)) ([67e6ba1](https://github.com/brawer/osmdiffs-app/commit/67e6ba1dfd017855a31ef019ecd55c26d4d453bf))
* set water labels in Karla Italic, add Karla latin-ext ([e3c2129](https://github.com/brawer/osmdiffs-app/commit/e3c2129126bbe835248619712f87c983989badfe))


### 🐞 Fixes

* pre-seed CHANGELOG.md with an SPDX header ([1f3c6f1](https://github.com/brawer/osmdiffs-app/commit/1f3c6f14f470b110e22591a5ac4b46c6d2bf6fca))

<!--
SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
SPDX-License-Identifier: MIT
-->

## Changelog

All notable changes to this app are recorded here, maintained by
[release-please](https://github.com/googleapis/release-please) from the
Conventional Commit history. Versioning follows
[Semantic Versioning](https://semver.org) — see
[RELEASING.md](RELEASING.md#choosing-the-version-number).
