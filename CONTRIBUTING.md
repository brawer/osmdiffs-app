<!--
SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
SPDX-License-Identifier: MIT
-->

# Contributing 👋

Thanks for looking! This is a small, focused app and contributions of every
size are welcome — a typo fix, a clearer doc sentence, a bug report, or a new
feature. No contribution is too small. 🙂

## Getting set up 🛠️

```sh
npm ci
npm run dev
```

The dev server serves `/data/*` from a local copy of the pipeline's published
files — a `data/` folder at the repo root, gitignored. Fetch it yourself,
e.g.:

```sh
mkdir -p data
curl -s https://osmdiffs.brawer.ch/data/datapackage.json -o data/datapackage.json
jq -r '.resources[].path' data/datapackage.json | while read -r f; do
  curl -s -o "data/$f" "https://osmdiffs.brawer.ch/data/$f"
done
```

The full planet's `conflated.parquet` (~400 MB) and `conflated.pmtiles`
(~4 GB) are large; the app never reads the Parquet, so you can skip it. See
[`docs/outputs/`](https://github.com/brawer/osmdiffs/tree/main/docs/outputs)
in the main project for what each file holds.

```sh
npm run build      # -> dist/
npm run lint
npm run typecheck
npm test
```

CI requires all four to be clean.

## Commit and PR style 📝

We use [Conventional Commits](https://www.conventionalcommits.org) for pull
request titles (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `build:`,
`chore:`, `ci:`), and CI checks the PR title. PRs are squash-merged, so the
title becomes the commit message on `main`.

Please keep changes focused, and credit any sources you adapt code or data
from.

## Reporting issues and asking questions 🤝

Open an issue on GitHub. For anything sensitive, or to report a Code of
Conduct concern, email Sascha (sascha@brawer.ch). By contributing you agree
that your work is licensed under the [MIT License](LICENSE), and to abide by
our [Code of Conduct](CODE_OF_CONDUCT.md).
