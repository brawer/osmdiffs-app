<!--
SPDX-FileCopyrightText: 2026 Sascha Brawer <sascha@brawer.ch>
SPDX-License-Identifier: MIT
-->

# Security policy

## Supported versions

This app is pre-1.0 and only one version is ever live at
[osmdiffs.brawer.ch](https://osmdiffs.brawer.ch/) — security fixes are shipped
as a new release and deployed immediately; there's no older version to
back-port to.

## Reporting a vulnerability

Please report suspected vulnerabilities privately, **not** as a public issue:

- Preferred: **[open a private report](https://github.com/brawer/osmdiffs-app/security/advisories/new)**
  via GitHub's "Report a vulnerability" (Security tab).
- Or email **sascha@brawer.ch**.

Please include a description of the issue, the affected page/URL, and a
minimal way to reproduce it. You can expect an initial response within about
a week.

## Disclosure

Fixed vulnerabilities are published as GitHub Security Advisories for this
repository. A patched build is deployed via the normal release flow (see
[RELEASING.md](RELEASING.md)) at the same time.

## Scope

This policy covers the frontend app in this repository. The OSMDiffs data
and the pipeline that produces it live in a separate project,
[brawer/osmdiffs](https://github.com/brawer/osmdiffs); the underlying hosting
infrastructure (Bunny CDN/DNS) lives in
[brawer/production](https://github.com/brawer/production).
