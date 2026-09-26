# Copying LiGo

LiGo combines code under two licences, plus third-party code under its own licences.
See [ADR 0006](docs/decisions/0006-mit-for-own-code.md) and
[ADR 0007](docs/decisions/0007-licensing-corrections-after-import.md) for why.

## 1. lila-derived code — AGPL-3.0

- `lila/` is a fork of [lichess-org/lila](https://github.com/lichess-org/lila), copyright (c) the lila
  authors, licensed under the GNU Affero General Public License version 3 **or (at your option) any
  later version**, as upstream states in `lila/COPYING.md`.
- `lila-ws/` is a fork of [lichess-org/lila-ws](https://github.com/lichess-org/lila-ws), copyright
  (c) its authors, which upstream ships under **AGPL-3.0** (`lila-ws/LICENSE`) with no "or later"
  statement. We can't widen that grant.
- LiGo's own modifications to either directory are offered under AGPL-3.0-or-later.

See [`LICENSE`](LICENSE) for the licence text. Every change LiGo makes to upstream files is listed in
[`docs/UPSTREAM.md`](docs/UPSTREAM.md) (AGPL §5(a) modification notices).

### 1.1 Upstream assets kept temporarily (not covered by LiGo's licences)

The imported snapshot still contains every asset lichess ships, exactly as upstream publishes it.
Some of these are **not free software** and are not licensed by us at all. They remain under their
own terms, as listed in `lila/COPYING.md`:

- **"Exceptions (non-free)"**: the lichess logo and favicons ("only use to refer to lichess.org"),
  piece sets that are "personal non commercial use", "freeware", no-derivatives or of unknown
  licence (alpha, chess7, companion, leipzig, reillycraig, riohacha, Staunton 3D, shahi-ivory-brown),
  and "the other sounds in public/sound" and "the other artwork in public/images".
- **Non-commercial "free" exceptions**: every set listed there as CC BY-NC-SA 4.0 (e.g. horsey,
  california, caliente, maestro, fresca, cardinal, icpieces, gioco, tatiana, staunty).

They are kept only because the snapshot is an unmodified import. LiGo doesn't use them for Go, and
they are removed in the **first unit of Phase 3** ([ADR 0007](docs/decisions/0007-licensing-corrections-after-import.md)).
Removing them won't erase them from git history, which only ever contains upstream's own publicly
distributed copies.

## 2. LiGo's own code — MIT

Everything **not** derived from lila is MIT-licensed ([`LICENSE-MIT`](LICENSE-MIT)) unless a file
says otherwise. That covers:

- `libs/` (e.g. the rules adapter, the board adapter, conformance fixtures)
- `services/`, `tools/`, `dev/`
- `.claude/`, `.github/`, `docs/`, `logs/`, and top-level project files other than `LICENSE`

**Exception, screenshots:** screenshots of lila or LiGo (e.g. `docs/research/baseline/`) depict
AGPL-3.0 software and may show lichess's logo, which isn't free and appears only to refer to lichess.
Screenshots are **not** MIT-licensed; they fall under the licences of what they depict.

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
