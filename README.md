<!--
SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
SPDX-License-Identifier: MIT
-->

# osmdiffs-app

The map-centric web app at [osmdiffs.brawer.ch](https://osmdiffs.brawer.ch/)
for [OSMDiffs](https://github.com/brawer/osmdiffs), which compares
[AllThePlaces](https://alltheplaces.xyz/) with
[OpenStreetMap](https://www.openstreetmap.org/) to find places that
OpenStreetMap is missing or has out of date.

A static Vite + React + TypeScript + [MapLibre GL](https://maplibre.org/)
app, in the same design language as
[osmviews-app](https://github.com/brawer/osmviews-app). It has no backend:
it reads the pipeline's published files
([`docs/outputs/`](https://github.com/brawer/osmdiffs/tree/main/docs/outputs))
directly in the browser, found through `/data/datapackage.json`, over a
toned-down [OpenFreeMap](https://openfreemap.org/) basemap.

## Development

```sh
npm ci
npm run dev
```

The dev server serves `/data/*` from a local, gitignored `data/` folder with
real Range-request support; see [CONTRIBUTING.md](CONTRIBUTING.md) for how to
fill it.

```sh
npm run build      # -> dist/
npm run lint
npm run typecheck
npm test
```

## Deployment

See [RELEASING.md](RELEASING.md) — deploys are triggered by a tagged release,
not every push to `main`.

## License

MIT — see [LICENSE](LICENSE).
