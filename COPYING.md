# Copying LiGo

LiGo combines code under two licences, plus third-party code under its own licences.
See [ADR 0006](docs/decisions/0006-mit-for-own-code.md) for why.

## 1. lila-derived code — AGPL-3.0-or-later

Everything under `lila/` and `lila-ws/` is a fork of
[lichess-org/lila](https://github.com/lichess-org/lila) and
[lichess-org/lila-ws](https://github.com/lichess-org/lila-ws), copyright (c) the lila authors
and the LiGo contributors. It is free software under the terms of the GNU Affero General Public
License, version 3 or (at your option) any later version. See [`LICENSE`](LICENSE).

The upstream `COPYING.md` files inside those directories list upstream exceptions (fonts, images,
sounds). They stay in force for any upstream asset we keep. Lichess's logo and every asset under a
non-commercial licence (e.g. CC BY-NC-SA) are removed, not reused.

## 2. LiGo's own code — MIT

Everything **not** derived from lila is MIT-licensed ([`LICENSE-MIT`](LICENSE-MIT)) unless a file
says otherwise. That covers:

- `libs/` (e.g. the rules adapter, the board adapter, conformance fixtures)
- `services/`, `tools/`, `dev/`
- `.claude/`, `.github/`, `docs/`, `logs/`, and top-level project files other than `LICENSE`

**What this means in practice.** Each of these files can be reused on its own, e.g. by OGS, under
MIT. When they're combined with the AGPL code above and run as the LiGo server, the whole program
is distributed under AGPL-3.0.

**Rule for contributors, human or Claude:** code copied or adapted *from* lila or lila-ws is
AGPL wherever it ends up and must say so in a header. Don't move lila code into MIT directories
without that header.

## 3. Third-party code and assets

Vendored or adapted third-party code keeps its original licence and notice. Every dependency and
vendored component must have an AGPL-3.0-compatible licence (MIT, BSD, Apache-2.0, LGPL, GPL-3.0,
AGPL-3.0). Non-commercial and unclear licences are rejected.

| Component | Where | Licence | Notes |
|---|---|---|---|
| _none yet — added by each unit that introduces one_ | | | |

Apache-2.0 components (e.g. OGS `goban`) must also have their NOTICE text reproduced here if they
ship one.
