# Copying LiGo

LiGo combines code under two licences, plus third-party code under its own licences.
See [ADR 0006](docs/decisions/0006-mit-for-own-code.md) and
[ADR 0007](docs/decisions/0007-licensing-corrections-after-import.md) for why.

## 1. lila-derived code — AGPL-3.0

- `lila/` is a fork of [lichess-org/lila](https://github.com/lichess-org/lila), copyright (c) the lila
  authors, licensed under the GNU Affero General Public License version 3 **or (at your option) any
  later version**, as upstream states in `lila/COPYING.md`, **except the files that file lists as
  exceptions, which keep their own licences**. The free ones include fonts (OFL, Apache-2.0), flags
  and several piece sets (MIT, GPLv2+, CC BY/BY-SA, CC0, MPL-2.0); the non-free/NC ones are in §1.1.
- `lila-ws/` is a fork of [lichess-org/lila-ws](https://github.com/lichess-org/lila-ws), copyright
  (c) its authors, which upstream ships under **AGPL-3.0** (`lila-ws/LICENSE`) with no "or later"
  statement. We can't widen that grant.
- `dev/lila-docker/` is a trimmed copy of [lichess-org/lila-docker](https://github.com/lichess-org/lila-docker),
  copyright (c) its authors, which upstream ships under **AGPL-3.0** (its `LICENSE`, the same text
  as ours) with no "or later" statement. `compose.native.yml` in that folder is LiGo's own addition
  and MIT. Its changes are listed in `dev/lila-docker/README.md`
  ([ADR 0010](docs/decisions/0010-dev-tooling-on-lila-docker.md)).
- LiGo's own modifications to these directories are offered under AGPL-3.0-or-later.

See [`LICENSE`](LICENSE) for the licence text. Every change LiGo makes to upstream files is listed in
[`docs/UPSTREAM.md`](docs/UPSTREAM.md) (AGPL §5(a) modification notices).

### 1.1 Upstream assets kept temporarily (not covered by LiGo's licences)

The imported snapshot still contains every asset lichess keeps in git (its Git LFS objects were
never imported; see `docs/UPSTREAM.md`), exactly as upstream publishes it. Some of these are **not
free software** and are not licensed by us at all. They remain under their own terms:

- **Upstream "Exceptions (non-free)"** (`lila/COPYING.md`):
  - the lichess logo and favicons (`public/logo`, `public/favicon.ico`,
    `public/apple-touch-icon.png`: "only use to refer to lichess.org");
  - piece sets that are "personal non commercial use", "freeware", no-derivatives or of blank/unknown
    licence: alpha, chess7, companion, leipzig, reillycraig, riohacha,
    `public/images/staunton/piece/Staunton`, shahi-ivory-brown;
  - totoy and papercut, which upstream marks CC BY 4.0 but files as non-free;
  - "the other sounds in public/sound" (this includes the default sound set) and "the other artwork
    in public/images".
- **Upstream non-commercial entries** (CC BY-NC-SA, any version): piece sets horsey, california,
  caliente, maestro, fresca, cardinal, icpieces, gioco, tatiana, staunty, dubrovny, anarcandy,
  disguised, cooke, monarchy, minimal-warmth, xkcd (2.5); `public/images/emoji/horsey.webp`; and the
  lisp sound set (`public/sound/lisp`; upstream's table says `public/sounds/lisp`).
- **Not in upstream's tables, found by LiGo's audit:**
  - the lichess logo inlined in code (`modules/web/src/main/ui/bits.scala`,
    `modules/web/src/main/ui/layout.scala`, `ui/lobby/css/app/_app.scss`);
  - lichess-branded art such as `public/flair/img/activity.lichess*.webp` and lichess images under
    `public/images/`;
  - the Unsplash-licensed background montages `public/lifat/background/montage{Dark,Light}{2,4}.webp`
    (see the Licensing section of `lila/public/lifat/README.md`; the Unsplash licence is not free).

They are kept only because the snapshot is an unmodified import. LiGo doesn't use them for Go, and
they are removed in the **first unit of Phase 3**, which audits by directory rather than trusting
upstream's table rows ([ADR 0007](docs/decisions/0007-licensing-corrections-after-import.md)).
Removing them won't erase them from git history, which only ever contains upstream's own publicly
distributed copies.

## 2. LiGo's own code — MIT

Everything **not** derived from lila is MIT-licensed ([`LICENSE-MIT`](LICENSE-MIT)) unless a file
says otherwise. That covers:

- `libs/` (e.g. the rules adapter, the board adapter, conformance fixtures)
- `services/`, `tools/`, `dev/` (except `dev/lila-docker/`, above)
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
| Assets imported with lila (fonts, flags, piece sets, sounds, images) | `lila/public/` | various | Per `lila/COPYING.md` and COPYING §1.1 |
| Rules test positions adapted from strategygames' and KataGo's tests | `libs/conformance/fixtures/strategygames.json`, `katago.json` | MIT | Notices in `libs/conformance/NOTICE.md` |
| Rules test positions adapted from OGS goban's tests | `libs/conformance/fixtures/goban.json` | Apache-2.0 | `libs/conformance/LICENSE-Apache-2.0.txt`; goban ships no NOTICE file |
| PlayStrategy strategygames `10.2.1-s3-ps14` (Go rules; a dependency, not copied), with its other games' engines excluded (ADR 0012) | `libs/go-rules/build.sbt` | MIT | Notice in `libs/go-rules/NOTICE.md`; jar SHA-256 pinned in `docs/UPSTREAM.md` |
| joda-time `2.10.10` and scala-parser-combinators `2.4.0`, brought in by strategygames (dependencies, not copied) | `libs/go-rules/build.sbt` (transitive) | Apache-2.0 | joda-time's NOTICE is below and in `libs/go-rules/NOTICE.md`; scala-parser-combinators ships none |
| OGS goban-engine `8.3.226` (the client's Go rules; a dependency, not copied, ADR 0014) | `libs/board/package.json` | Apache-2.0 | Copyright Online-Go.com; licence text and notices in `libs/board/NOTICE.md`; ships no NOTICE file |
| goscorer (lightvector), bundled inside goban-engine | `libs/board` (inside goban-engine) | MIT | goban's build drops its notice, so `libs/board/NOTICE.md` carries it |
| eventemitter3 `5.0.4`, goban-engine's only dependency | `libs/board` (transitive) | MIT | Notice in `libs/board/NOTICE.md` |
| _others added by each unit that introduces one_ | | | |

Apache-2.0 components (e.g. OGS `goban`) must also have their NOTICE text reproduced here if they
ship one.

joda-time (`META-INF/NOTICE.txt` in `joda-time-2.10.10.jar`):

```text
This product includes software developed by
Joda.org (https://www.joda.org/).
```
