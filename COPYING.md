# Copying LiGo

LiGo combines code under two licences, plus third-party code under its own licences.
See [ADR 0006](docs/decisions/0006-mit-for-own-code.md) and
[ADR 0007](docs/decisions/0007-licensing-corrections-after-import.md) for why.

## 1. lila-derived code — AGPL-3.0

- `lila/` is a fork of [lichess-org/lila](https://github.com/lichess-org/lila), copyright (c) the lila
  authors, licensed under the GNU Affero General Public License version 3 **or (at your option) any
  later version**, as upstream states in `lila/COPYING.md`, **except the files that file lists as
  exceptions, which keep their own licences**. The free ones include fonts (OFL, Apache-2.0), flags
  and several piece sets (MIT, GPLv2+, CC BY/BY-SA, CC0, MPL-2.0); the non-free/NC ones were removed in unit 3.1 (§1.1).
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

### 1.1 Upstream non-free assets: removed in unit 3.1

Until unit 3.1 (Phase 3) the imported snapshot carried every asset lichess keeps in git, including
some that are **not free software**. Unit 3.1 audited `lila/public/` by directory, not by upstream's
table rows ([ADR 0007](docs/decisions/0007-licensing-corrections-after-import.md)), and deleted:

- **Upstream "Exceptions (non-free)"** (`lila/COPYING.md`): the lichess logo and favicons
  (`public/logo`, `public/favicon.ico`, `public/apple-touch-icon.png`); the piece sets alpha, chess7,
  companion, leipzig, reillycraig, riohacha, shahi-ivory-brown, totoy, papercut and
  `public/images/staunton/piece/Staunton`; "the other sounds in public/sound" (the standard,
  instrument, other, robot and woodland sets and the Silence files); "the other artwork in
  public/images".
- **Upstream non-commercial entries** (CC BY-NC-SA): the piece sets horsey, california, caliente,
  maestro, fresca, cardinal, icpieces, gioco, tatiana, staunty, dubrovny, anarcandy, disguised,
  cooke, monarchy, minimal-warmth, xkcd; `public/images/emoji/horsey.webp`; the lisp sound set.
- **Found by LiGo's audit**: the lichess logo inlined in code (the header, the loading spinner,
  the lobby watermark) and its glyph in the icon font (`public/font/lichess.{sfd,ttf,woff2}`,
  U+E07A); all of lichess's own flairs (`lila/bin/flair/custom.txt`: lichess and lishogi art,
  blob smileys, holiday items, software logos) except `symbols.neovim-mark` and
  `symbols.helix-logo`, which upstream's table licenses; lichess images under `public/images/`;
  the whole of `public/lifat/` (including the Unsplash-licensed background montages); the
  ChessPursuit mini-game in `public/vendor/` (no licence stated); and the piece sets governor and
  kosal, which upstream's licence table doesn't list at all.

What stays in `lila/public/` is free under upstream's own table (fonts, flags, the free piece sets,
the futuristic, nes, piano and sfx sound sets, `public/images/board`, `puzzle-themes`,
the `staunton` boards, `trophy`, the neovim and helix flairs), the Noto emoji flairs
(Google, Apache-2.0; `lila/bin/flair` generates them from emojipedia's Google set), or LiGo's own
(below). A few directories upstream's table doesn't name stay under upstream's default AGPL grant:
`public/cursors`, `public/data`, `public/video` and `public/javascripts`; most go with their chess
modules in units 3.2–3.7 (unit 3.4 deleted `images/learn`, including `learn/pieces`, and the
racer-car and storm fonts). `lila/COPYING.md` is
upstream's file and still names the deleted sets; LiGo leaves it unchanged. Removing the files
doesn't erase them from git history, which only ever contains upstream's own publicly distributed
copies.

**LiGo's own artwork** (MIT, like the rest of LiGo's own work): the LiGo logo and icons
(`lila/public/logo/ligo*.svg`, `ligo*.png`, `public/favicon.ico`, `public/apple-touch-icon.png`),
the small UI images in `lila/public/images/ligo/`, and their generator `lila/bin/gen/ligo-logo.mjs`.

**LiGo's own Go rating maths** (MIT, like the rest of LiGo's own work, ADR 0013):
`lila/modules/rating/src/main/GoRating.scala` and its test and test data
(`lila/modules/rating/src/test/GoRatingTest.scala`, `src/test/resources/goRatingCases.{json,py}`),
which port OGS's goratings (MIT, notice in `lila/modules/rating/NOTICE-goratings.md`; §3).

### 1.2 npm packages removed with Phase 3 features

Unit 3.2 removed the `ui/tournament`, `ui/swiss` and `ui/simul` workspace packages and the npm
packages only they used: `date-fns` 2.30.0 (MIT), its dependency `@babel/runtime` 7.29.7 (MIT),
`dragscroll` 0.0.8 (MIT) and `@types/dragscroll` 0.0.3 (MIT). No package was added.

Unit 3.3 removed the `ui/fide` workspace package (FIDE player pages) along with the study, relay
and title-verification code inside `ui/analyse` and `ui/bits`. `ui/fide`'s own npm dependencies
(`chart.js`, `chartjs-adapter-dayjs-4`, `dayjs`) stay in the lockfile because `ui/chart`,
`ui/insight` and `ui/opening` still use them; no third-party npm package was actually dropped, only
the `ui/fide` workspace entry itself. No package was added.

Unit 3.4 removed the `ui/storm`, `ui/racer`, `ui/coordinateTrainer`, `ui/learn` and `ui/opening`
workspace packages, and with them the only users of `@fnando/sparkline` 0.3.10 (MIT) and
`@types/fnando__sparkline` 0.3.7 (MIT). The other npm packages they used stay because kept packages
still use them. No package was added.

Unit 3.5 removed the chess engines and bots: the `ui/botDev`, `ui/botPlay`, `ui/insight` and
`ui/tutor` workspace packages, `ui/lib`'s engine code, and the engine packages only they used:
`@lichess-org/stockfish-web` 0.5.0 (AGPL-3.0-or-later), `@lichess-org/zerofish` 0.0.40
(AGPL-3.0-or-later), `stockfish.js` 10.0.2, `stockfish.wasm` 0.10.0, `stockfish-mv.wasm` 0.6.1 and
`stockfish-nnue.wasm` 1.0.0-1946a675.smolnet (all GPL-3.0), `fast-diff` 1.3.0 (Apache-2.0) and
`json-stringify-pretty-compact` 4.0.0 (MIT). pnpm also dropped the packages only they pulled in:
`@types/emscripten` 1.41.5 (MIT), `@types/node` 22.19.20 (MIT), `@types/web` 0.0.223 (Apache-2.0),
`prettier` 3.5.3 (MIT), `typescript` 5.9.3 (Apache-2.0) and `undici-types` 6.21.0 (MIT); the
workspace keeps its own pinned TypeScript and Node types. No package was added.

Unit 3.6 removed the forums, blogs, teams, inbox and classes: the `ui/msg` and `ui/team` workspace
packages and the forum, blog and class bundles in `ui/bits`, and with them the only users of
`@textcomplete/core` 0.1.13, `@textcomplete/textarea` 0.1.13, `@textcomplete/utils` 0.1.13,
`textarea-caret` 3.1.0 and `undate` 0.3.0 (all MIT). No package was added.

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
| OGS goban `8.3.226` (the board: its SVG renderer and its own copy of the engine; a dependency, not copied, ADR 0014, unit 2.1). Only its plain board and stones are used; its image themes are not (their pictures are unchecked) | `libs/board/package.json` | Apache-2.0 | Copyright Online-Go.com; licence text and notices in `libs/board/NOTICE.md`; ships no NOTICE file |
| goscorer (lightvector), bundled inside goban-engine and goban | `libs/board` (inside goban-engine and goban) | MIT | goban's build drops its notice, so `libs/board/NOTICE.md` carries it |
| eventemitter3 `5.0.4`, goban-engine's and goban's only dependency | `libs/board` (transitive) | MIT | Notice in `libs/board/NOTICE.md` |
| No third-party code: the playground page (unit 2.2) depends only on workspace packages, `@ligo/board` (above) and lila's own `lib` | `lila/ui/playground/package.json`, `lila/pnpm-lock.yaml` | — | LiGo's own page inside `lila/`, so AGPL-3.0-or-later like other changes there (§1) |
| OGS goban-engine `8.3.226` again, this time as the scoring service's own dependency (ADR 0016, unit 4.4): its `autoscore` and `GobanEngine.computeScore()` (goscorer) | `services/scoring/package.json` | Apache-2.0 | Copyright Online-Go.com; notices in `services/scoring/NOTICE.md`; ships no NOTICE file |
| goscorer and eventemitter3, bundled inside that second copy of goban-engine | `services/scoring` (inside goban-engine) | MIT | Notices in `services/scoring/NOTICE.md` |
| OGS's own autoscore test games (31 finished games with KataGo's stored analysis), vendored unchanged as `services/scoring`'s regression set (unit 4.4) | `services/scoring/test/autoscore_test_files/` | Apache-2.0 | `services/scoring/LICENSE-Apache-2.0.txt`; notice in `services/scoring/test/autoscore_test_files/NOTICE.md`; goban ships no NOTICE file |
| ioredis `6.0.0` (the scoring service's Redis client, unit 4.5, logs/decisions.md), and its own runtime dependencies (`@ioredis/commands`, `debug`, `ms`, `supports-color`, `redis-errors`, `standard-as-callback`: MIT; `denque`, `cluster-key-slot`: Apache-2.0) | `services/scoring/package.json` (transitive deps not listed there) | MIT / Apache-2.0 | Notices in `services/scoring/NOTICE.md`; `services/scoring/LICENSE-Apache-2.0.txt` |
| OGS goratings @ `6cab309`: the rank curve and handicap maths ported to Scala (ADR 0013, unit 5.2), and test values it computed | `lila/modules/rating/src/main/GoRating.scala`, `lila/modules/rating/src/test/resources/goRatingCases.json` | MIT | Copyright (c) 2020 online-go.com; notice in `lila/modules/rating/NOTICE-goratings.md`. The port is LiGo's own code (MIT, §2), not derived from lila |
| _others added by each unit that introduces one_ | | | |

Apache-2.0 components (e.g. OGS `goban`) must also have their NOTICE text reproduced here if they
ship one.

joda-time (`META-INF/NOTICE.txt` in `joda-time-2.10.10.jar`):

```text
This product includes software developed by
Joda.org (https://www.joda.org/).
```
