# LiGo — Project Plan

> A **non-commercial proof of concept**: a lichess-style Go (Baduk/Weiqi) server, built as a hard fork
> of [lichess-org/lila](https://github.com/lichess-org/lila) the way lishogi.org did for shogi.
> It is not a business and not a competitor to OGS. If it works well, the code, designs and lessons
> may be **given to the OGS developers for free** to help improve OGS.
>
> Status: **Approved** 2026-09-26 (with the proposed defaults: ADRs 0003–0005; MIT for LiGo's own code:
> ADR 0006) · Written 2026-09-25 after a requirements interview with the owner, revised the same day to
> add the reuse-first principle, the logging requirement, the project's intent and the working agreement.
> Companion document: [`CLAUDE_SETUP.md`](CLAUDE_SETUP.md), covering Phase 0: the Claude Code setup,
> built before any feature work.

---

## 0. Summary

- **Problem.** There's no great Western Go server. OGS is the best available, but its interface is
  weak. Above all, **finding a game is confusing**.
- **Purpose.** Show, in working code, how much better Go matchmaking and play can feel with a
  lichess-style interface: fast, minimal, one click to play. Ranks, handicap, komi, byo-yomi and
  scoring are treated as core concepts. What we learn and build should be easy to hand to OGS.
- **Not the purpose.** Profit, a user base, or competing with OGS.
- **Reuse before build.** Existing software is used wherever it fits, and custom code is limited to
  glue. The main pieces:
  - lichess's `lila` and `lila-ws` as the application;
  - PlayStrategy's Go rules for the server;
  - **OGS's own `goban` library** for the board, the client-side rules and autoscore. This also makes
    a later handoff to OGS natural;
  - KataGo, plus lightvector's `goscorer`, for scoring;
  - lichess's Glicko-2 for ratings.
- **Working agreement.**
  - Claude does most of the work, with wide latitude.
  - You approve every unit of work before it starts and review it when it's done.
  - You're consulted on every major decision.
  - Claude stops and asks whenever it's unsure.
  - Autonomy never lowers the testing bar: Claude verifies everything it can, and hands you what it
    can't verify (§7).
- **Everything is logged.** What was done, what worked and what didn't goes into `logs/`, split by
  area so an agent only reads what's relevant ([`CLAUDE_SETUP.md` §9](CLAUDE_SETUP.md)).
- **Order of work:**
  1. Phase 0: Claude setup.
  2. Build-vs-buy checks and rules integration.
  3. Board integration.
  4. Fork lila and remove chess.
  5. Playable Go games.
  6. Accounts and ratings.
  7. The lobby.
  8. Correspondence, SGF and the analysis board.
  9. Tsumego.
  10. PWA polish.
  11. POC demo and a handoff package.

---

## 1. Requirements record

These came out of the requirements interview. Changing any of them needs your approval and an ADR in
`docs/decisions/`.

### 1.1 Intent, context and ways of working

| Topic | Decision | Consequence for the plan |
|---|---|---|
| Intent | **Non-commercial proof of concept**; not competing with OGS; may be **donated to OGS** | Prefer OGS-compatible technology and licences (§8); build a handoff package into the final phase; no growth, monetisation or marketing work |
| Core pain | OGS's **game-finding**, specifically a **confusing lobby** | The lobby is the showcase of the POC, with its own phase and a player test (§4) |
| Hosting | **Local-only for now** | No public infrastructure or UK compliance work unless you later decide to run a public demo (§8) |
| Funding | Self-funded | No payments or entitlements. Open source: AGPL-3.0 for lila-derived code, MIT for our own ([ADR 0007](decisions/0007-licensing-corrections-after-import.md)) |
| Name | **LiGo** | Brand strings sit behind one config/i18n layer |
| Team | **Solo, Claude-heavy, new to Scala**, **< 5 h/week** | Heavy automation, unit-sized work, plain-English PR walkthroughs (§7) |
| Tooling | Claude **Max 5x**; **Claude Code web + local CLI**; local box **Linux, 32 GB+, AMD CPU + AMD GPU** | Remote Control on your box is the main mode, with cloud sessions for parallel work; KataGo runs on OpenCL |
| **Reuse first** | **Pre-built software over custom software, whenever possible**, for you and for every Claude agent | A build-vs-buy check with your approval before any component is built (§2.2); the `reuse-scout` agent; the reviewer flags any reinvented wheel |
| **Logging** | Everything that happens is logged in markdown under `logs/`, **split by area** | One log file per workstream, each with a short curated "Lessons" section so agents read only what's relevant (`CLAUDE_SETUP.md` §9) |
| **Working agreement** | Claude has wide latitude; you stay in the loop **unit by unit**; you're consulted on **all major decisions**; Claude **stops and asks when unsure**; autonomy never lowers review and testing rigour | Encoded in `CLAUDE.md`, the `/next` and `/ship` checkpoints, permission prompts for dependency changes, and the PR template (§7) |
| Merging | Claude opens PRs and squash-merges them once the checks pass, then tells you ([ADR 0011](decisions/0011-claude-merges-its-own-prs.md)) | Branch protection, a guard hook (squash only, never a push to `main`) |
| Claude in CI | No | CI is plain GitHub Actions; reviews happen inside sessions |
| Upstream | Hard fork + monthly cherry-pick review | `upstream-scout` agent + `/upstream-port` skill |

### 1.2 Game

| Topic | Decision |
|---|---|
| Board sizes | **19×19 and 9×9** (13×13 later) |
| Rulesets | **Japanese** (territory) and **Chinese** (area), chosen per game |
| End of game | Two passes → **KataGo proposes dead stones and the score; both players confirm, adjust, or resume play** |
| Clocks | **Japanese byo-yomi** and **Fischer**, plus correspondence |
| Ratings | **Glicko-2 displayed as kyu/dan**, **one overall pool** |
| Handicap | **Auto-handicap in quick-pair, and rated** |
| New players | **Self-declared starting rank** |
| Guests | Anonymous casual games allowed; rated games need an account |

### 1.3 POC scope

**In:** live play · lobby and quick pairing · direct challenges · scoring phase · correspondence ·
SGF import/export and an analysis board (no engine) · tsumego trainer · accounts, ratings and
profiles · guest play · responsive web + installable PWA · English only, with i18n kept ready.

**Out (possible later phases, your call):** KataGo post-game review · bots and a bot API ·
tournaments · studies/reviews · social layer · 13×13 · more rulesets and clocks · other languages ·
native app · public hosting.

---

## 2. Principles

### 2.1 Product

1. **One click to play.** Every choice has a sensible default; advanced options sit one click away.
2. **Go-native, not chess with stones.** Ranks, handicap, komi, byo-yomi and scoring are core concepts.
3. **Mobile-first board.** Tap to preview a stone, tap again (or confirm) to place it; this can be
   turned off.
4. **Lichess speed and calm.** Minimal chrome, fast pages, no clutter.
5. **Honest scoring.** The AI proposes, people decide, and anti-stalling timeouts keep games moving.

### 2.2 Engineering: reuse before build

This applies to you and to every Claude agent. For any capability, go down this ladder and stop at the
first rung that works:

1. **Use existing software as-is** (a dependency, a service, or an existing lila feature).
2. **Configure or extend it** through its supported extension points.
3. **Wrap it** with a thin adapter (e.g. to fit lila's snabbdom UI).
4. **Vendor or fork it minimally**: copy it in, change as little as possible, and record where it came
   from so fixes can be pulled in later.
5. **Port it**, when the logic exists in another language and there's no way to call it.
6. **Build it custom**, only as glue or when nothing suitable exists.

Rules:
- **Any custom build beyond small glue needs a build-vs-buy memo.** The `reuse-scout` agent produces
  it (candidates, licence, maintenance status, fit, recommendation), and you approve it before work
  starts. The decision is recorded as an ADR.
- **Adding, removing or swapping a dependency is a major decision**, so you're consulted. Claude Code
  enforces this with a permission prompt on dependency manifests.
- **Only licences compatible with AGPL-3.0 are acceptable** (MIT, BSD, Apache-2.0, LGPL, GPL-3.0,
  AGPL-3.0, and MPL-2.0 since ADR 0026 §4). Non-commercial and unclear licences are rejected.
- **The reviewer agent checks every PR for reinvented wheels.**

---

## 3. Architecture

### 3.1 Components: what we reuse, and the thin glue we write

**Fork base: current upstream `lila` and `lila-ws`**, pinned to SHAs after lichess's June 2026
sbt 2 / liplay migration and recorded in `docs/UPSTREAM.md`. We rejected lishogi (frozen on Scala
2.13/Akka) and PlayStrategy's lila fork (a 2021 base, about 20 other games, and a chess board bent into
a Go board). We still reuse PlayStrategy's Go *rules library*.

Every "first choice" below is **proposed**. Phase 1 checks each one with a small spike and a
build-vs-buy memo, and **you approve the result** before integration starts.

| Capability | First choice (reuse) | Fallbacks | Glue we write |
|---|---|---|---|
| App server, accounts, security, lobby/pool, round, correspondence, analysis board, puzzle trainer, i18n, UI shell | **lila** (AGPL-3.0), hard fork | — | Go-specific adaptations inside lila |
| Websocket server | **lila-ws** (AGPL-3.0), hard fork | — | Go message payloads |
| Dev environment | **lila-docker** (lichess's official dev setup) | Plain docker compose | Monorepo paths, KataGo service |
| Server-side Go rules (legality, captures, superko, handicap placement, byo-yomi clock) | **PlayStrategy `strategygames`** (MIT, pure Scala since Aug 2026), used **as a dependency** if its Go package can be consumed without pulling in the other games | Vendor only its Go package into `libs/go-rules` with minimal changes; then scalashogi's clock (MIT) for byo-yomi | Adapter from strategygames types to lila's game model |
| Client-side rules + SGF (analysis board, move hints, puzzles) | **OGS `goban` engine** (`goban-engine`, Apache-2.0; supports JP/CN rules, SGF, time systems) | `@sabaki/go-board` + `@sabaki/sgf` (MIT) | — |
| Board rendering | **OGS `goban` renderer** (SVG), wrapped for snabbdom | Sabaki `Shudan` (MIT, Preact) | `libs/board`: a thin adapter exposing a chessground-like API to lila's UI |
| Dead-stone proposal | **KataGo analysis engine** (MIT) + **`goban`'s autoscore** (the dual ownership-map method) | goban's heuristic estimator when no KataGo is available | `services/scoring`: a small Node process that connects Redis ⇄ KataGo ⇄ goban-engine |
| Score counting given dead stones (territory/area, seki) | **`goscorer`** (MIT; already bundled in goban), running in `services/scoring` | Port goscorer to Scala only if calling the service turns out to be unworkable | — |
| Ratings | **scalachess Glicko-2** (MIT) | — | OGS's published rank curve and handicap adjustment (a few formulas from `goratings`) |
| Tsumego trainer | **lila puzzle module + UI**, adapted: OGS goban's own puzzle mode replaces chessground and the move checker ([ADR 0025](decisions/0025-phase-8-puzzle-format-trainer.md)) | — | Go puzzle format (goban's `PuzzleConfig`) |
| Tsumego content | **Decided ([ADR 0024](decisions/0024-tsumego-content-generated-plus-classics.md)):** no existing collection has a usable licence, so LiGo generates its own life-and-death puzzles (exact search over goban-engine, KataGo as a second opinion), plus a small tail it transcribes from *Gokyō Shumyō* | Our own transcriptions of more public-domain classics | `tools/puzzles` generator and import scripts |
| PWA | lila's existing manifest and service worker | — | Install prompt and touch settings |
| CI | lila's existing GitHub workflows | — | Monorepo paths, rules parity job |
| Load testing (Phase 6+) | An existing tool (e.g. k6 or Artillery) | — | A game-script scenario |

**Handoff bonus:** OGS's frontend already uses `goban`. A lila-style UI built on the same board library
means our UX work is directly portable to OGS.

**Avoid:** jgoboard (CC BY-NC); lichess's logo and CC BY-NC-SA assets; the GoGoD and Go4Go game
collections; tsumego from modern books; OGS's joseki data (unless OGS permits it).

### 3.2 Repository layout (monorepo)

```
LiGo/
  lila/                 hard fork of lichess-org/lila (app server + ui/)
  lila-ws/              hard fork of lichess-org/lila-ws
  libs/
    go-rules/           adapter to strategygames' Go package (or a minimal vendored copy of it)
    board/              thin snabbdom adapter around OGS goban (renderer + client engine)
    conformance/        shared rules fixtures, run against BOTH server and client engines
  services/scoring/     Node glue: KataGo analysis engine + goban autoscore + goscorer
  tools/puzzles/        tsumego import/generation scripts
  dev/                  lila-docker-based environment, `ligo` CLI, doctor, cloud setup script
  logs/                 work logs, one file per area (CLAUDE_SETUP.md §9)
  docs/                 PLAN, CLAUDE_SETUP, STATUS, UPSTREAM, rules spec, ADRs, build-vs-buy memos, research
  .claude/ .mcp.json CLAUDE.md
```

**Why a monorepo:** one PR can touch rules, server and UI together, with one CI and one set of Claude
instructions. That's the simplest setup for a solo developer.

**Languages:** Scala (lila) and TypeScript (UI and scoring service) only, both inherited from reused
software.

**How the pieces connect:**
- `lila ⇄ Redis ⇄ lila-ws ⇄ browser`.
- `lila ⇄ Redis ⇄ services/scoring ⇄ KataGo`.
- **MongoDB 7** and **Redis** are required; Elasticsearch is not needed for the POC.

### 3.3 Two rules engines, one truth: `libs/conformance`

The server (strategygames) and the client (goban-engine) are different codebases, so the plan needs a
way to catch them disagreeing:

- **Shared JSON fixtures** (`size, rules, komi, setup, moves, expect{legal, board, captures, koPoint,
  deadStones → score}`) are replayed by both engines in CI.
- **Fixtures come first from existing test suites** (goban's, strategygames', KataGo's rules tests)
  before we write any new ones. New cases cover PlayStrategy's known bug classes (early game end on
  repetition, infinite games, dead-stone expiry) and the classic traps (seki, bent-four, snapback,
  triple ko, sending-two-returning-one, suicide, handicap compensation).
- A **nightly differential test** plays random games and compares the server engine with KataGo on
  legality, captures and final area score.
- **The rules spec** in `docs/rules/` is written by the `go-rules-expert` agent and **approved by
  you**.
  - **Decided ([ADR 0003](decisions/0003-superko-in-both-rulesets.md)):** situational superko in both
    rulesets, so games can't loop forever.
  - **Proposed division of scoring work:** the final score is computed by goscorer in
    `services/scoring`, so we never re-implement Japanese territory counting in Scala.

### 3.4 `lila` fork — keep, adapt, remove

- **Keep and adapt:**
  - Play and matchmaking: `game`, `round`, `lobby`, `pool`, `setup`, `challenge`, `playban`.
  - Accounts and prefs: `user`, `security`, `pref`, `rating`, `history`.
  - Boards and puzzles: `analyse` (board only), `importer` (SGF), `puzzle` (becomes tsumego).
  - Shared infrastructure: `socket`, `i18n`, `site` and the core modules.
- **Keep dormant:** `report`, `mod`, `shutup`, kid mode, personal-data export and account closure.
  They're reused as-is if a public demo ever happens.
- **Remove:** tournament, swiss, simul, study, relay, fishnet, evalCache, opening/explorer, insight,
  tutor, coach, streamer, forum, ublog, team, msg, video, practice, learn, storm, racer, streak,
  bot/botPlay, and the chess-only UI packages.
- **Order: "quarantine, then replace"**, where every step compiles and is its own unit:
  1. Cut routes and `Env` wiring for the removed modules.
  2. Delete those modules.
  3. Add the `go-rules` adapter alongside scalachess.
  4. Migrate the core types: Game, Board, Move, Variant → (BoardSize, Ruleset), PerfType → a single
     `go` perf, Clock.
  5. Stop using scalachess's chess rules and formats; it stays as a library for its game-neutral
     types (colours, clocks, time units) and Glicko-2 ([ADR 0019](decisions/0019-go-core-types-schema-protocol.md)).
  6. Swap the chess board for `libs/board`.

### 3.5 `lila-ws` fork

- Round messages carry Go moves (point | pass) and byo-yomi clock state.
- New scoring-phase messages: `scoreProposal`, `toggleGroup`, `accept`, `resume`.
- Lobby and pool messages carry rank, handicap preference and live pool counts.

### 3.6 `services/scoring`

- **Protocol:**
  1. lila queues `{gameId, size, rules, komi, handicap, moves}` in Redis.
  2. The service asks KataGo's analysis engine for ownership maps, once with black to move and once
     with white.
  3. goban's autoscore picks the dead stones and goscorer counts the score.
  4. The service publishes `{deadStones, territory, score}` back through Redis.
- **Also the score authority:** when players change the dead stones, the service recounts with
  goscorer, and lila stores the result.
- **Hardware:** KataGo uses **OpenCL on your AMD GPU** locally, and the **Eigen CPU** backend (small
  network, few visits) in the cloud and CI.
- **No stuck games:** without KataGo, the proposal falls back to goban's estimator plus manual marking.
- **Portable:** the queue boundary means a remote GPU worker (fishnet-style) could be added later
  without redesign.

### 3.7 Ratings, ranks and handicap

- **One overall pool:** Glicko-2 from scalachess, covering both sizes and every speed.
- **Rating → rank ([ADR 0004](decisions/0004-ogs-rank-curve.md)):** adopt OGS's published curve
  (`rank = ln(rating/525) × 23.15`, verify against `goratings`), so ranks match what OGS players know
  and a later handoff is easier. A rank shows "?" while rating deviation is high.
- **Self-declared start:** the chosen rank maps to a starting rating through the inverse curve, with
  high deviation.
- **Handicap:** the weaker player's effective rating is shifted by the handicap's stone value, which
  depends on board size and ruleset (OGS's approach). Auto-handicap stones = rank difference, capped;
  komi comes from the rules spec.
- **Guests:** casual games only.

### 3.8 Game flows

1. **Play:** moves go over websocket and the server validates them. Clocks, pass, resign, abort, and
   undo requests (casual only by default).
2. **Scoring phase:**
   - After two passes, the board shows the KataGo proposal (dead stones, territory, live score).
   - Either player can toggle groups; each change resets both acceptances.
   - When both accept, the result is final. **Resume play** is always available.
   - The phase has its own timeout (e.g. 3 min live, 1 day correspondence); when it expires, the
     current proposal is accepted automatically. Leaving counts as abandonment.
3. **Correspondence:** lila's days-per-move infrastructure and in-site notifications.
4. **SGF:** download any game as SGF; import SGF into the analysis board (goban-engine's SGF support).
5. **Analysis board:** moves, variations, load/save SGF; the engine hook stays stubbed for later.
6. **Tsumego:** lila's puzzle trainer with its own Glicko-2 rating, themes, refutation trees, and a
   provenance record for each puzzle.

---

## 4. The lobby — the showcase

**The problem you named:** OGS's lobby is confusing — hard to read and hard to filter, and you can't
see at a glance which games suit you. **We start from lila's lobby and pool UI as-is** and change
only what Go needs.

- **The landing view is a quick-pair grid.** Each tile is one click and shows live counts. Initial
  presets ([ADR 0005](decisions/0005-initial-lobby-presets.md)), to be tuned in the player test:

  | 9×9 | 19×19 | Correspondence |
  |---|---|---|
  | 1 min + 5×10 s | 5 min + 5×10 s | 1 day/move |
  | 3 min + 3×20 s | 10 min + 5×30 s | 3 days/move |
  | 3+2 Fischer | 20 min + 5×30 s | |
  | | 10+10 Fischer | |

- **One persistent chip row:** `Rated / Casual` · `Handicap OK / Even only`.
- **Custom game** is a single pre-filled modal, with advanced options collapsed.
- **Open challenges** is a readable table (player + rank · board · time · rules · even/handicap ·
  rated). Games that suit you come first; incompatible ones are greyed out. Filter chips replace a
  settings form; phones get cards.
- **While waiting:** show the pool size, a visibly widening rank range, the elapsed time, and a Cancel
  button.
- **Direct challenge** from any profile.

**How we'll know it improves on OGS's lobby:**
- One click from landing page to a game.
- Under 10 s to the first move once there are players.
- A think-aloud test where at least 3 Western Go players do the same tasks on both, written up in
  `docs/research/` so it's useful to OGS whatever happens to LiGo.

---

## 5. Roadmap

Each phase ends with a **demo you can click**. A phase is made of **units**: one issue becomes one PR,
and you approve each unit before it starts (§7). Sizes are counted in units, because your review time
is the scarce resource.

| Phase | Deliverable | Demo / acceptance | Units |
|---|---|---|---|
| **0. Claude setup + baseline** | Everything in [`CLAUDE_SETUP.md`](CLAUDE_SETUP.md), including `logs/`; unmodified lila builds and runs locally and in the cloud; CI green | A dry-run unit (rebrand to LiGo) goes through `/next` → `/ship` → merge, logged, in < 15 min of your time | 8–12 |
| **1. Build-vs-buy + rules integration** | A build-vs-buy memo for each §3.1 component (**you approve each**); the rules spec (**you approve**); conformance fixtures (existing suites first); `go-rules` adapter over strategygames; goban-engine in a test harness; parity CI; nightly KataGo differential test | Both engines pass every fixture; 1,000 random differential games agree with KataGo; SGF round-trips | 6–10 |
| **2. Board integration** | `libs/board` adapter around the goban renderer, playground page, touch-confirm setting | You play both colours in the playground on your phone and desktop; visual snapshots pass | 3–5 |
| **3. Fork & de-chess** | **First unit: strip upstream non-free/NC assets, inline lichess logos and branded art, with free replacements where needed, e.g. a default sound set (ADR 0007).** Then: removed modules gone, go-rules swapped in, core types migrated, round UI uses `libs/board`, lila-ws adapted | Two browsers play a casual 9×9 Fischer game to resignation | 15–25 |
| **4. Go-native game** | Byo-yomi, komi, rules choice, pass, **scoring phase + `services/scoring`**, timeouts, results, SGF export | A 19×19 Japanese byo-yomi game ends with an accepted AI proposal; a disputed game resumes; the SGF opens in Sabaki; autoscore agrees ≥ 97% on a benchmark of finished games | 6–10 |
| **5. Accounts & ratings** | Signup with self-declared rank, kyu/dan display, provisional "?", handicap-adjusted rating, profile + rank graph, guest casual play | 5k and 1d accounts play a rated handicap game and both ranks move sensibly | 5–8 |
| **6. The lobby** | Quick-pair grid, pools with auto-handicap, custom game, open challenges, direct challenge, waiting UX, mobile layout | One click to a game; the player test is done and its findings are addressed | 6–10 |
| **7. Correspondence, SGF, analysis** | Correspondence games, analysis board with variations, SGF import/export | Import a pro-game SGF, explore and export it; finish a correspondence game | 4–7 |
| **8. Tsumego** | Content sourcing (build-vs-buy + licence check, **you approve**), import pipeline, trainer, puzzle rating | ≥ 200 puzzles with recorded provenance, playable on a phone | 5–8 |
| **9. PWA, polish & handoff** | Installable PWA, sounds, themes, accessibility basics, performance budget, credits page; a **handoff package** (write-up, demo video, lobby research, logs digest, how to run it) | A demo to a Go club and, if you choose, to the OGS developers | 4–6 |

**Phase 1 units** (broken down 2026-09-27 when Phase 1 started; the order puts the decisions first so
you can answer them while building continues):

| Unit | What |
|---|---|
| 1.1 | Build-vs-buy memo for the server-side Go rules and byo-yomi clock, with a strategygames spike ([memo](build-vs-buy/server-go-rules.md)) |
| 1.2 | Build-vs-buy memo for the client engine and board (OGS `goban` / `goban-engine`), with a spike |
| 1.3 | Build-vs-buy memo for scoring (KataGo analysis engine + goban autoscore + goscorer), with a spike ([memo](build-vs-buy/scoring.md)) |
| 1.4 | Build-vs-buy memo for ratings (scalachess Glicko-2 + the `goratings` formulas) ([memo](build-vs-buy/ratings.md)) |
| 1.5 | The rules spec in `docs/rules/` (`go-rules-expert`), for your approval |
| 1.6 | `libs/conformance`: fixture format and fixtures imported from existing suites |
| 1.7 | `libs/go-rules` adapter over the chosen server engine, passing the fixtures and an SGF round-trip, with a `rules` CI job |
| 1.8 | `goban-engine` test harness passing the same fixtures, SGF round-trip, parity CI |
| 1.9 | Nightly differential test: 1,000 random games checked against KataGo |

Other §3.1 rows: dev env (ADR 0010) and CI (unit 0.6) were settled in Phase 0; PWA and the tsumego
trainer (both lila's own, used as-is) get their check when their phases start (9 and 8); tsumego
content sourcing stays in Phase 8 and load testing in Phase 6+, as the table above says.

**Phase 2 units** (broken down 2026-09-28 when Phase 1's decisions were done; every unit builds on
`libs/board` from unit 1.8, and the board follows ADR 0014 and its unit 1.8 amendment):

| Unit | What | Needs |
|---|---|---|
| 2.1 | `libs/board` joins lila's pnpm workspace and gains the board: goban's SVG renderer (npm `goban`, pinned to the same version as `goban-engine`), wrapped for snabbdom behind a small chessground-like API (mount with size, komi, handicap stones and moves; set position; move and pass events; destroy). Board sized from its container, lazy-loaded, plain-colour stones and board only (goban's image themes wait for a licence check), adapter tests, COPYING/NOTICE kept in step | 1.8 |
| 2.2 | Playground page in lila (a new route and a small `ui/` page bundle): a local game where you play both colours on 9×9, 13×13 or 19×19, with komi, ruleset and handicap choices, pass, undo, new game and prisoner counts; legality from `libs/board`'s engine settings; desktop and phone layouts. No server game, no clock, nothing stored | 2.1 |
| 2.3 | Touch-confirm setting: tap shows a preview stone and a second tap (or a confirm button) plays it (as built: goban's second tap takes the preview back, so a confirm button plays it; logs/decisions.md), using goban's own preview-and-submit. One board preference on lila's existing preferences page and `pref` module ("Confirm moves: never / on touch screens / always", default on touch screens), passed to the board by the adapter; the playground honours it | 2.1 (server half can start earlier) |
| 2.4 | Visual snapshots and the Phase 2 demo: Playwright screenshot tests of the playground (desktop 1280×800 and phone 390×844; empty 9×9 and 19×19, a capture, a preview stone) with committed baselines, run in CI; a scripted two-colour game through the playground; the demo checklist for you | 2.2, 2.3 |

What stays out of Phase 2: server games and lila-ws messages (Phase 3), clocks and the scoring phase
(Phase 4), board themes beyond the plain one and sounds (Phase 9), SGF import into the playground
(Phase 7's analysis board).

**Phase 3 units** (broken down 2026-09-28 while Phase 2 was being built; which lila modules and `ui/`
packages stay, stay dormant or go is [ADR 0018](decisions/0018-phase-3-module-map.md). Every unit
leaves lila and lila-ws compiling with their tests passing, and the kept pages serving without new
5xx errors. From 3.13 until 3.18 the server plays Go but the browser still has the chess round UI,
so games can't be played in a browser in between):

| Unit | What | Needs |
|---|---|---|
| 3.1 | Strip upstream non-free/NC assets, auditing by directory (COPYING.md §1.1, ADR 0007): non-free and NC piece sets, sounds, the lichess logo and favicons (including the inline copies), lichess-branded art, the Unsplash montages, and the lifat LFS pointer files of chess-only assets. Free replacements where something still needs one: a LiGo logo and favicons, a free default sound set (reuse first; the choice is made in the unit), a check that the default piece set is free while chess pages remain. COPYING.md and UPSTREAM.md updated | — |
| 3.2 | Remove tournaments and events: `tournament`, `swiss`, `simul`, `gathering`, `event`, with their routes, controllers, views, `ui/` packages and lila-ws actors | — |
| 3.3 | Remove studies and broadcasts: `study`, `relay`, `practice`, `studySearch`, `fide`, `title`, with their `ui/` packages (`fide`, the study parts of `analyse`) and lila-ws actors | 3.2 |
| 3.4 | Remove chess training and openings: `storm`, `racer`, `coordinate`, `learn`, `opening`, `explorer`, `evalCache`, puzzle streak, with their `ui/` packages (`storm`, `racer`, `coordinateTrainer`, `learn`, `opening`) and lila-ws actors | 3.3 |
| 3.5 | Remove engines and bots: `fishnet`, `irwin`, `evaluation`, `insight`, `tutor`, `jsBot`, `bot`, with `ui/` `botDev`, `botPlay`, `insight`, `tutor`, `ui/lib`'s engine code (`ceval`, `bot`) and its Stockfish/zerofish npm packages (COPYING.md updated). `mod` loses its engine assessment (`AssessApi`) and gets direct build dependencies on `game` and `analyse`, which it only reached through `evaluation` | 3.4 |
| 3.6 | Remove community features: `forum`, `forumSearch`, `ublog`, `team`, `teamSearch`, `msg`, `clas`, with their `ui/` packages (`msg`, `team`) and lila-ws actors | 3.5 |
| 3.7 | Remove the extras and search: `streamer`, `coach`, `video`, `feed`, `plan`, `recap`, `tv`, `search`, `gameSearch`, with `ui/` `recap` and `editor` and lila-ws actors | 3.6 |
| 3.8 | Rebrand leftovers from unit 0.7: "Lichess" in English strings, the lobby's lichess texts, footer and social links, the FAQ, email footers | 3.7 |
| 3.9 | Design ADR: Go core types, Mongo game schema and the round protocol. How lila's Game, Board, Move, Variant, PerfType and Clock map onto `libs/go-rules` (board size + ruleset instead of variant, one `go` perf, point-or-pass moves and how they're stored in BSON, Fischer on lila's clock now, byo-yomi in Phase 4), the lila-ws round messages, and the migration order (side by side, so each step compiles). It also decides what happens to scalachess: `scalachess-rating` (Glicko-2, ADR 0013) depends on scalachess core, and kept modules use its game-neutral types (`Color`, `ByColor`, `Centis`, `IntRating`, `PlayerTitle`), so the choice is between keeping scalachess as a library for those while dropping its chess rules and formats, vendoring them, or a shim | — |
| 3.10 | Wire `libs/go-rules` into lila's sbt build (strategygames stays pinned and checksum-checked; its PlayStrategy Maven resolver reaches lila's build, the cloud's `~/.sbt/repositories` (ADR 0008) and CI), with a smoke test from lila | 3.9 |
| 3.11 | Core types: `lila.core`'s game types and `rating`'s perf types move to Go (board size, ruleset, one `go` perf), as 3.9's migration order says | 3.7, 3.10 |
| 3.12 | `game` module: the Game model, BSON with Go moves, game lists and exports that don't need SGF (SGF export is Phase 4) | 3.11 |
| 3.13 | `round` module: moves and passes validated by `libs/go-rules`, captures, resign, abort, undo requests (casual), Fischer clock, no draw offers | 3.12 |
| 3.14 | lila-ws: Go round payloads (point or pass, clock), live mini-board updates (`Fens.scala`), lobby payloads without chess variants, its own chess-rules use removed | 3.13, 3.15 |
| 3.15 | Game creation: `setup`, `lobby`, `pool`, `challenge` with board size, ruleset, komi and casual/rated fields (casual only until Phase 5) | 3.12 |
| 3.16 | Every other kept module and `lila/app/` compiles on Go types: `analyse`, `tree`, `puzzle`, `activity`, `perfStat`, `history`, `mod`, `user`, `api`, `web`, `common`, `ui`, `chat`, `socket`, `mailer`, `playban`, `notify`, `relation` and the controllers and views; the analysis and puzzle pages show a placeholder until Phases 7 and 8 | 3.13, 3.15 |
| 3.17 | No lila code uses chess rules or formats any more: FEN, PGN (including PGN import; SGF import is Phase 7), UCI, openings and variants gone, and scalachess kept or replaced as 3.9 decided, with COPYING.md updated | 3.14, 3.16 |
| 3.18 | Round UI: `ui/round` shows `libs/board` instead of chessground, sends points and passes, shows prisoners and the Fischer clock, honours touch-confirm; the chess-only input packages it imports (`voice`, `keyboardMove`, `dgt`) go with it | 2.1, 2.3, 3.14 |
| 3.19 | Lobby, setup and game-list UI: Go options (size, ruleset, komi) in the create-game and challenge forms, Go mini boards, chessground and the remaining chess UI packages removed | 2.1, 3.15, 3.17 |
| 3.20 | Phase 3 demo: a Playwright test where two browsers play a casual 9×9 Fischer game to resignation (desktop and phone viewports, E2E on labelled PRs and nightly), plus the demo checklist for you | 2.4, 3.18, 3.19 |

What stays out of Phase 3: byo-yomi, komi choices beyond the spec's defaults, the scoring phase and
SGF export (Phase 4), ratings and ranks (Phase 5), the lobby redesign (Phase 6), the analysis board
and SGF import (Phase 7), tsumego (Phase 8).

**Phase 4 units** (broken down 2026-09-28 while Phases 2 and 3 were being built; the scoring
service is [ADR 0016](decisions/0016-scoring-service-node-autoscore-goscorer.md), the game model and
clocks follow [ADR 0019](decisions/0019-go-core-types-schema-protocol.md), and the rules are spec §7–8.
Units 4.1–4.6 need nothing from Phases 2 and 3, so they run now; 4.7–4.12 wait for the Phase 3 round,
game creation and round UI. Twelve units, above the table's 6–10, because the scoring service and
the go-rules halves are split from their lila halves so they can be built early):

| Unit | What | Needs |
|---|---|---|
| 4.1 | Design ADR for Phase 4 ([ADR 0020](decisions/0020-scoring-phase-protocol-and-byoyomi-shape.md)): the lila ⇄ `services/scoring` messages over Redis (what lila sends: size, ruleset, komi, handicap, final board and the prisoners from go-rules, per ADR 0016's open point; what comes back: dead stones, points that need sealing, territory, score; recounts after a toggle), where the proposal and each recount are stored on the game, the server's scoring-phase state machine (toggles, acceptances, resume and its R-SP-9 limit, timeout values live and correspondence, whether game clocks run during it), the "scored" status and result encoding (ADR 0019 §7), the 1,000-ply cap, the no-KataGo fallback, the lila-ws scoring messages (PLAN §3.5), and the byo-yomi clock's shape in lila (ADR 0019 §5: its interface, storage key and clock payload) | — |
| 4.2 | Byo-yomi clock in `libs/go-rules`: strategygames' byo-yomi clock (ADR 0012) wrapped behind go-rules' own clock type (main time, periods × period time; a move inside a period keeps it, a period that runs out is used up, the last one running out loses on time), with lag compensation as lila needs it and tests for every period transition | 4.1 |
| 4.3 | Scoring phase in `libs/go-rules`: dead marks on the position after the two passes, toggling a whole chain, any change resetting both acceptances, accept, timeout accepting the current proposal, resume dropping the marks (resume and its limit already exist), a check that a proposal names whole chains; the result from the service's count (R-SCORE-4, R-RES-1–3, jigo, `B+3.5`); the SGF writer gains `RE`, players, date, rules and time settings; opening the phase at the 1,000-ply cap; the spec gains ADR 0020's two additions (no resume after the cap, no result when no count can be made) via `go-rules-expert` | 4.1 |
| 4.4 | `services/scoring` core: a Node/TypeScript package with `goban-engine` pinned to `libs/board`'s version, a client for one long-running KataGo analysis engine (two ownership queries per position), autoscore and `computeScore`, the no-KataGo fallback, OGS's 31 autoscore games as a regression test, `dev/ligo test scoring`, a `scoring` CI job on KataGo's test network, COPYING.md notices (goban-engine, goscorer, eventemitter3) | 4.1 |
| 4.5 | `services/scoring` on Redis: the worker speaking 4.1's protocol, recounts, KataGo crashes and restarts (a game never stays without a proposal), `dev/ligo up/down/status/logs` starting and supervising it in native and docker modes, a Redis round-trip test | 4.4 |
| 4.6 | Autoscore benchmark and the full-size network: a set of finished games with agreed results and a checked licence, `dev/ligo scoring bench`, the licence check of katagotraining.org's networks, a pinned b18 network for your box (the cloud keeps the test network); the ≥ 97% gate is measured on your GPU | 4.4 |
| 4.7 | Clocks in lila: the clock interface with Fischer (`chess.Clock`) and byo-yomi (4.2) behind it, byo-yomi storage, the round stepping it with lag compensation, lila-ws clock payloads, out of time in overtime | 3.13, 3.14, 4.2 |
| 4.8 | Scoring phase in lila: two passes open it and ask the service, the proposal and recounts stored, toggles, accept, resume, timeout, results and the "scored" status written, lila-ws scoring messages; play closed again after replaying a game that reached the move cap; replaces ADR 0019's "two passes end the game with no winner" | 3.13, 3.14, 4.3, 4.5 |
| 4.9 | Game creation: byo-yomi time controls, ruleset and komi choice, handicap for casual games in the setup and challenge forms (what 3.15 and 3.19 don't already offer) | 3.15, 3.19, 4.7 |
| 4.10 | Round UI: the byo-yomi clock with its periods, the scoring-phase board on `libs/board` (dead marks, territory, live score, tap a chain to toggle, Accept and Resume buttons, the timeout countdown), the result line | 3.18, 4.7, 4.8 |
| 4.11 | SGF export: download from the game page and the API, with result, players and time settings from 4.3's writer | 3.12, 4.3, 4.8 |
| 4.12 | Phase 4 demo: a Playwright test where two browsers play a 19×19 Japanese byo-yomi game that ends with an accepted proposal, and a disputed game that resumes and then ends; the exported SGF read back by goban-engine; the demo checklist for you (opening the SGF in Sabaki, the benchmark on your GPU) | 3.20, 4.6, 4.9, 4.10, 4.11 |

What stays out of Phase 4: rating changes and auto-handicap (Phases 5 and 6), correspondence
notifications and SGF import (Phase 7), a remote GPU scoring worker (after the POC; the Redis
boundary keeps it possible).

**Phase 5 units** (broken down 2026-09-29 while Phases 3 and 4 were being built; the rating maths is
[ADR 0013](decisions/0013-lila-glicko2-with-ogs-settings.md) and its
[memo](build-vs-buy/ratings.md), the rank curve [ADR 0004](decisions/0004-ogs-rank-curve.md), and the
single `go` perf comes from unit 3.11 ([ADR 0019](decisions/0019-go-core-types-schema-protocol.md)).
Units 5.1–5.2 need nothing from Phases 3 and 4, so they run now; 5.3–5.8 wait for the Phase 3 game,
round, game creation and UI units. As in Phase 4, the rating maths is split from its lila call sites
so it can be built early):

| Unit | What | Needs |
|---|---|---|
| 5.1 | Design ADR for Phase 5 ([ADR 0021](decisions/0021-phase-5-ratings-signup-display-handicap.md)): the one overall pool (the `go` perf is the only rated perf; what happens to lila's per-speed perfs, `RatingRegulator` factors, leaderboards and rating graphs; correspondence in the same pool); the self-declared starting rank (which ranks signup offers, mapped through the inverse curve or OGS's four hints; starting deviation; whether it can be changed before the first rated game; what an account that never chose starts at); rank display (bounds such as OGS's 25k–9d, "?" on lila's deviation 110 per ADR 0013, where the rating number still shows, whether the browser gets labels from the server or computes them); rated handicap (which games may be rated with handicap, the stone count for a rank gap and its cap per board size, which ADR 0013 left to Phase 5 and Phase 6's pools reuse, komi for handicap games from the spec); guests (casual only, and what they see instead of rated options) | — |
| 5.2 | Rating maths in `lila/modules/rating`, per ADR 0013: a `GoRating` object (called `GoRank` in ADR 0021) with OGS's rank curve and its inverse, kyu/dan labels within 5.1's bounds, goratings' handicap rank difference and each player's effective opponent rating, 5.1's stone-count rule and the rank table the browser uses for rank ranges; a Go calculator with OGS's Glicko-2 settings (tau 0.5, starting volatility 0.06, volatility ceiling 0.15) beside lila's own; tests replaying the memo's spike numbers (the five Glicko-2 updates, the handicap rows, the 4-stone game, the rank labels) and a shared JSON table of rank cases for any browser-side label; goratings' MIT notice in COPYING.md. New code only: nothing calls it yet, and no lila constant that chess games use changes | 5.1 |
| 5.3 | Rated games move ratings with handicap: `PerfsUpdater` rates Go games in the one `go` perf with 5.2's calculator and Glicko-2 step 6, calling it once per player against the opponent's handicap-shifted rating; rating changes stored on the game as today; results from resignation, time and (once 4.8 lands) the scoring phase; tests for an even game, a handicap game and the memo's 4-stone case end to end | 3.11, 3.13, 5.2 |
| 5.4 | Signup with a self-declared rank: the signup form asks for your Go rank as 5.1 decided and starts the `go` perf from it; an account can change it on its account page until its first rated game starts (ADR 0021); desktop and phone screenshots. Built in two parts: the signup question and starting rating once 3.11 landed (it needs only the `go` perf), the account page and screenshots after 3.16 | 3.11, 3.16, 5.2 |
| 5.5 | Kyu/dan wherever a rating shows: players in the round and game lists, user links and mini-profiles, the one Go leaderboard, the lobby's player lists, and the JSON API with the rank beside the rating; "?" while provisional | 3.16, 3.18, 3.19, 5.2 |
| 5.6 | Profile: the header shows the rank, the rating graph plots the one Go rating with kyu/dan on its axis, the perf stats page covers the `go` perf, activity shows rank changes | 3.16, 5.3, 5.5 |
| 5.7 | Rated and guest game creation: the rated option in the setup and challenge forms for signed-in players only (guests create and join casual games, with a sign-up hint), handicap allowed in rated challenges with 5.1's stone count as the default, rating ranges shown as rank ranges; server checks that a guest can't create or join a rated game | 3.15, 3.19, 4.9, 5.2 |
| 5.8 | Phase 5 demo: a Playwright test where a 5k and a 1d sign up with those ranks and play a rated 19×19 handicap game to resignation, and both ratings move as 5.2's maths predicts; a guest plays a casual game and can't choose rated; the demo checklist for you | 3.20, 5.3, 5.4, 5.5, 5.6, 5.7 |

What stays out of Phase 5: pools with auto-handicap, rank ranges while waiting and the open-challenges
table (Phase 6), the tsumego rating (Phase 8), OGS's "?" threshold of 160 (ADR 0013 keeps lila's 110),
and rating changes against bots (LiGo has none).

**Phase 6 units** (broken down 2026-09-29 while Phases 3–5 were being built; the lobby follows §4,
the presets [ADR 0005](decisions/0005-initial-lobby-presets.md), the stone count for a rank gap
[ADR 0021](decisions/0021-phase-5-ratings-signup-display-handicap.md) §4 and 5.2's `GoRating`. lila's
lobby already has most of the pieces (the quick-pairing grid over `pool`, the hooks and seeks tables,
the create-game and challenge modals, a challenge button on profiles), so each unit adapts one of
them rather than building a new one. Units 6.1–6.3 need nothing from Phases 3–5 beyond what has
merged, so they run now; 6.4–6.10 wait for Phase 3's game creation and lobby UI, Phase 4's clocks and
Phase 5's rated games):

| Unit | What | Needs |
|---|---|---|
| 6.1 | Design ADR for Phase 6 ([ADR 0022](decisions/0022-phase-6-lobby-pools-handicap-challenges.md)): the pool list from ADR 0005 (how a byo-yomi or Fischer pool is keyed and shown, one pool per board size and time control, correspondence presets as seeks rather than pools); what the chip row means in pairing (lila's pools are always rated and a guest's tile click becomes a casual hook: whether casual pools exist, and whether "Handicap OK / Even only" splits a pool or is a member flag that only pairs compatible members); auto-handicap at pairing (ADR 0021's stone function, colours, komi, when a gap is too big for the cap, how the pairing score treats a gap that handicap covers); the widening rank range while waiting (lila's miss bonus, shown as ranks with 5.2's rank table); what makes an open challenge "suit you" and what greys one out, and whether the server or the browser decides; which lila lobby parts stay, change or go (tabs, the "playing" and "carousel" views, play-with-computer, the filter form); whether guests and signed-in players can meet (ADR 0021 §5 left it to the player test: the default until then); the player test's method; the load-testing tool (PLAN §3.1's "Phase 6+" row) | — |
| 6.2 | Pairing with auto-handicap in `lila/modules/pool`, as new code beside lila's `MatchMaking` (nothing calls it yet, as 5.2 did): a Go pairing score over 5.2's `GoRating` that knows each member's chip choices, the stone count and colours for a couple, the rank-range widening as a function of missed waves; tests for even pairs, handicap pairs, capped gaps, incompatible chips and range conflicts | 6.1, 5.2 |
| 6.3 | The player-test kit in `docs/research/lobby-test/`: the think-aloud protocol for OGS and LiGo (the same tasks on both, in an order that alternates between participants), the task list from §4's goals (one click to a game, find a game that suits you, create a custom game, challenge a named player), the consent note, a notes and timing template, how findings become units. You recruit and run it (≥ 3 Western Go players) once 6.10's demo works | 6.1 |
| 6.4 | Pools in lila: `PoolList` from 6.1's presets (Fischer and byo-yomi, 9×9 and 19×19), pool members carrying the chip choices, `MatchMaking` using 6.2's score, `GameStarter` creating handicap games with 6.2's stones and colours and rating them as 5.3 does, guests as 6.1 decided; tests from lila's pool suite adapted. Built in two parts: the first (after 3.15) gives pools a board size, the Go perf, 5 s waves, 6.2's score for even pairs and ADR 0022 §6's hook checks; the second brings ADR 0022's pool list with byo-yomi (4.7), the Handicap OK chip and handicap games (4.9) and rated pools (5.3, 5.7) | 3.15, 4.7, 5.3, 6.2 (second part also 4.9, 5.7) |
| 6.5 | Open challenges and correspondence presets on the server: hooks and seeks carry size, ruleset, time control, handicap and rated (as 3.15 and 4.9 add them), the correspondence presets become one-click seeks, the lobby's JSON gains the fields the table and the "suits you" rule need (rank label from 5.5, and whatever 6.1 puts on the server) | 3.15, 4.9, 5.5, 6.1 |
| 6.6 | The landing view: the quick-pair grid (ADR 0005's tiles in three columns, each one click, with how many are waiting), the one persistent chip row (remembered per player), and waiting on a tile (pool size, the rank range widening, elapsed time, Cancel); desktop and phone layouts with screenshot tests | 3.19, 6.4 |
| 6.7 | The open-challenges table: player + rank · board · time · rules · even/handicap · rated columns, games that suit you first and incompatible ones greyed, filter chips in place of lila's filter form, cards on phones; screenshot tests. Built in two parts: the first (after 3.19) is the table with the Live / Correspondence chip, the board / speed / rated filter chips, cards on phones, the rating-vs-time chart and the filter form gone, and the one function that decides which rows are joinable (with today's rules), with screenshots of the table in the PR; the second brings the rank label (5.5), greying and "suits you" ordering from the server's new fields (6.5) and 6.6's chip row, the handicap column and the even/handicap filter chip (4.9), and the screenshot tests (with 6.6's page tests) | 3.19, 6.5 (second part also 4.9, 5.5) |
| 6.8 | Custom game and direct challenge: the create-game and challenge forms become one pre-filled modal (the last settings or a preset, advanced options collapsed: komi, handicap, ruleset, rating range as ranks), opened from the grid, from the open-challenges tab and from any player's profile or mini-profile, with 5.7's suggested stones for a named opponent | 3.19, 4.9, 5.7 |
| 6.9 | Load test: the tool 6.1 chose, a scenario where many pairs join pools and play short games to the end over lila's API and websockets, `dev/ligo loadtest` in the cloud at a small size, the numbers recorded; run by hand, not in CI | 3.20, 6.1, 6.4 |
| 6.10 | Phase 6 demo: a Playwright test from the landing page to a first move in one click (and the time it takes, against §4's 10 s), a rated handicap pool game between a 5k and a 1d, an open challenge accepted from the table, a custom game and a profile challenge, at desktop and phone sizes; the demo checklist for you, then the player test (6.3) and a unit for each of its findings (preset changes supersede ADR 0005) | 3.20, 6.6, 6.7, 6.8 |

What stays out of Phase 6: 13×13 pools (no server games on 13×13 yet, ADR 0021 §4), tournaments and
arenas (removed in 3.2), bots to play while waiting (LiGo has none), correspondence notifications
(Phase 7), and lobby chat (lila's lobby has none).

**Phase 7 units** (broken down 2026-09-29 while Phases 3–6 were being built; the flows are §3.8
items 3–5, the browser's SGF and board are [ADR 0014](decisions/0014-ogs-goban-for-client-rules-and-board.md),
the stored game and its correspondence clock [ADR 0019](decisions/0019-go-core-types-schema-protocol.md),
the scoring phase's 1-day correspondence timeout [ADR 0020](decisions/0020-scoring-phase-protocol-and-byoyomi-shape.md),
and the kept `analyse`, `tree`, `notify` and `push` modules [ADR 0018](decisions/0018-phase-3-module-map.md).
lila already has each piece (the analysis board and its move tree, `/paste` import, the days-per-move
clock, `CorresAlarm` reminders, notifications and web push), so the lila units adapt them. As in
Phases 4–6, the library halves are split from their lila halves so they can be built early: units
7.1–7.3 need nothing from Phases 3–6 beyond what has merged, so they run now; 7.4–7.8 wait for
Phase 3's game, round, analysis and UI units and Phase 4's scoring and SGF export. Eight units, above
the table's 4–7, for that split):

| Unit | What | Needs |
|---|---|---|
| 7.1 | Design ADR for Phase 7 ([ADR 0023](decisions/0023-phase-7-analysis-sgf-correspondence.md)): the analysis board (adapt lila's `ui/analyse` and its move tree with `libs/board` in place of chessground, or a page on goban's own move tree; what a tree node holds for Go; board sizes, including 13×13 since nothing is stored; setup stones and whether ADR 0018's Go position editor is a mode of it; the engine hook stubbed); SGF import (where parsing happens: the browser with goban-engine, the server, or both; the server-side reader's build-vs-buy check; what an imported game is in Mongo, 3.12's model with an "import" source, and which sizes, rulesets, handicaps and broken files it accepts; variations and comments kept or dropped when stored); SGF export from the analysis board with variations and comments, beside 4.11's game export; correspondence (the days-per-move choices and ADR 0005's presets, timeouts and Titivate, which notifications "your turn", "game over" and `CorresAlarm`'s low-time reminder send in `notify` and web push, whether lila's forecasts (conditional moves) survive, how a player finds the games where it is their turn) | — |
| 7.2 | The analysis tree in `libs/board`: SGF read into lila's tree and written back from it with `@sabaki/sgf` (ADR 0023: setup stones, handicap, `PL`, passes, comments, glyphs, marks and variations), each move replayed through goban-engine's checked play, the shared root-property table in `libs/conformance/`, COPYING.md for the new dependency; tests on an SGF corpus (unit 1.8's 227 server games, the quirks in the `sgf` skill: lower-case properties, missing `SZ`, `tt` passes, escaped brackets, broken files rejected with a message) and a parse → write → parse round-trip. New code only: no page uses it yet | 7.1 |
| 7.3 | The server's SGF reader in `libs/go-rules`, as 7.1's build-vs-buy check decides: an FF[4] game read into a `GoGame` through the rules (main line, setup and handicap stones, komi, ruleset, players, result), illegal or unsupported files rejected with a reason, round-trip tests with `Sgf.write` and the conformance fixtures | 7.1 |
| 7.4 | The analysis board page: lila's `/analysis` on `libs/board` with 7.2's tree (move list with variations and comments, keyboard and button navigation, new position on 9×9, 13×13 or 19×19, setup stones, load SGF by paste or file, download SGF), desktop and phone layouts with screenshot tests; replaces 3.16's placeholder | 3.16, 3.18, 7.2 |
| 7.5 | SGF import and game analysis: `/paste` and `/api/import` take SGF (9×9 and 19×19) through 7.3's reader and store the game as 7.1 decided; any finished game, live or imported, opens in the analysis board from its game page (`/<gameId>/analysis`) with its SGF download from 4.11; PGN import's leftovers gone | 3.12, 3.17, 4.11, 7.3, 7.4 |
| 7.6 | Correspondence on the server: Go games on lila's days-per-move clock (the choices in the setup and challenge forms and 6.5's presets, where 3.15 and 4.9 don't already offer them), timeouts, the scoring phase's 1-day timeout in correspondence games, `CorresAlarm` reminders, "your turn" and "game over" notifications in `notify` and web push, and forecasts as 7.1 decided | 3.13, 3.15, 4.8, 7.1 |
| 7.7 | Correspondence UI: the round page's days clock, the scoring phase's countdown in days, the list of games where it is your turn (lila's "playing" list and the round's next-game button), the notification entries; desktop and phone screenshot tests | 3.18, 4.10, 7.6 |
| 7.8 | Phase 7 demo: a Playwright test that imports a public-domain pro game from SGF, explores it, adds a variation and exports it (the file read back by goban-engine), and two players who finish a correspondence game (a move each, notifications seen, two passes and an accepted proposal); the demo checklist for you | 3.20, 4.12, 7.5, 7.7 |

What stays out of Phase 7: an engine in the analysis board and KataGo post-game review (after the POC,
§1.3), studies and shared analysis (removed in 3.3), game search (removed in 3.7), new email notifications (lila's opt-in daily "your turn" email stays as it is, [ADR 0023](decisions/0023-phase-7-analysis-sgf-correspondence.md)), and correspondence tournaments.

**Phase 8 units** (broken down 2026-09-29 while Phases 3–7 were being built; the trainer is §3.8
item 6 and §3.1's "Tsumego trainer" and "Tsumego content" rows, provenance and the no-modern-books rule
are §8, the kept `puzzle` module and `ui/puzzle` package are [ADR 0018](decisions/0018-phase-3-module-map.md),
and the puzzle perf stays apart from the `go` perf ([ADR 0021](decisions/0021-phase-5-ratings-signup-display-handicap.md)).
lila's puzzle trainer is built for one forced chess line (`Puzzle.line`, a list of UCI moves), while a
tsumego has several right answers and refutations, so the puzzle becomes a small solution tree. As in
Phases 4–7, the content and library halves are split from their lila halves so they can be built
early: units 8.1–8.5 need nothing from Phase 3, so they run now; 8.6–8.8
wait for Phase 3's core types, kept modules and round UI):

| Unit | What | Needs |
|---|---|---|
| 8.1 | Build-vs-buy memo for tsumego content, with a licence check of each source (`reuse-scout`, [memo](build-vs-buy/tsumego-content.md), **you approve**; decided as ADR 0024): existing collections and their licences (OGS puzzles, goproblems.com, tsumego-hero, sanderland/tsumego's data as distinct from its MIT code, Wikimedia and Sensei's Library), our own transcriptions of public-domain classics from original editions (e.g. *Xuanxuan Qijing* 1349, *Guanzi Pu* 1660, *Igo Hatsuyōron* 1713, *Gokyō Shumyō* 1812), and positions KataGo generates from game records whose licence is checked; which sources reach ≥ 200 puzzles on 9×9 to 19×19, what provenance each puzzle records, and the UK/EU database-right point in logs/tsumego.md | — |
| 8.2 | Design ADR for Phase 8 ([ADR 0025](decisions/0025-phase-8-puzzle-format-trainer.md), with the [generator memo](build-vs-buy/tsumego-generator.md)): the puzzle format (board size, a partial board or a corner of 19×19, setup stones, who plays, the solution tree with right answers and refutations, which move the opponent answers with, when a puzzle counts as solved, comments), shared between `tools/puzzles`, the browser and the server as a JSON schema in `tools/puzzles/`; the Mongo puzzle document replacing `Puzzle.fen` and `Puzzle.line` (provenance fields, themes as Go themes: life and death, tesuji, ko, capture race, endgame; a starting rating from the source's difficulty); which parts of lila's trainer stay (the rated trainer, daily puzzle, themes, dashboard, history, replay, votes and reports) and which go (lila's chess themes, the openings page, the puzzle-from-game link when there is no game); the puzzle rating (lila's puzzle Glicko-2 as is, shown as kyu/dan or as a number); guests (lila's anonymous puzzles); how puzzles reach Mongo (a script over the JSON, run by `dev/ligo`); a reuse check for the generator's code (existing tsumego solvers and generators, KaTrain's MIT tsumego frame for KataGo) and a feasibility spike (done for speed only; the gate with its 20 s budget moved to 8.3, ADR 0025 §2) | 8.1 |
| 8.3 | The pipeline and generator in `tools/puzzles` (a package in lila's pnpm workspace, as `services/scoring` is), per [ADR 0024](decisions/0024-tsumego-content-generated-plus-classics.md): the eye-shape catalogue and position generator, an exhaustive local solver over goban-engine's checked play that builds the solution tree, KataGo as a second opinion (KaTrain's MIT tsumego frame ported, `services/scoring`'s client with a public `analyse`), a reader for hand-transcribed SGF (`libs/board`'s SGF reader from 7.2) for the classics tail, the wall-safety check, positions with a ko dropped (ADR 0025 §2), the feasibility gate (each position settled within 20 s, at least 250 catalogue positions passing, else the ADR 0025 §2 fallback), every puzzle checked (illegal moves, suicide, no right answer: rejected with a reason) and written as 8.2's JSON (goban's puzzle format) with provenance, `dev/ligo puzzles build` and `dev/ligo test puzzles`, a `tools/puzzles` gate in verify.sh, a CI job (KataGo's test network, as the `scoring` job has); tests on hand-made positions whose answers are known and on every broken case | 8.2 (7.2 for the classics reader) |
| 8.4 | The first puzzle set: at least 200 generated life-and-death puzzles (no ko, ADR 0025 §2) across 8.2's difficulty bands, made with a KataGo network whose licence is settled (ADR 0024 §7), committed with their provenance (MIT), a hand review of a sample, then the *Gokyō Shumyō* tail once its scan is reachable and its rights line recorded (not blocking); COPYING.md and a sources list for Phase 9's credits page | 8.3 |
| 8.5 | Puzzles on `libs/board`: `mountPuzzle` (beside `mountBoard`, logs/decisions.md 2026-09-30) wraps goban's own puzzle mode (ADR 0025: the puzzle's setup, tree and `bounds`, the opponent's reply played automatically, right and wrong reported through goban's `puzzle-correct-answer` and `puzzle-wrong-answer` events), touch-confirm honoured; Chromium tests replaying a right and a wrong line of every puzzle in 8.4's set. New code only: no page uses it yet | 8.2, 8.4 |
| 8.6 | Puzzles on the server: `lila/modules/puzzle` on 8.2's document (the model, BSON, JSON view, selection by rating and theme, the daily puzzle, rounds, the puzzle Glicko-2 for players and puzzles, votes and reports), the loader that puts 8.4's set in Mongo (`dev/ligo puzzles load`, and in `dev/ligo up`'s seed), the `puzzle2_path` build ported from lichess's outside script into a daily job (ADR 0025 §3), chess puzzle code and the routes ADR 0025 §3 removes gone; tests from lila's puzzle suite adapted | 3.11, 3.16, 8.2, 8.4 |
| 8.7 | The trainer page: `ui/puzzle` on 8.5's puzzle board (the board, right and wrong feedback, the refutation, next puzzle, the rating change, themes, the dashboard and history pages, the source line under each puzzle, "view the solution" through 7.2's tree), touch-confirm honoured, desktop and phone layouts with screenshot tests; replaces 3.16's placeholder | 3.16, 3.18, 7.2, 8.5, 8.6 |
| 8.8 | Phase 8 demo: a Playwright test at phone size that solves one puzzle and fails another, with the rating moving, and checks that all ≥ 200 puzzles load and show their source; the demo checklist for you | 3.20, 8.7 |

What stays out of Phase 8: puzzle streak, storm and racer (removed in 3.4), puzzles generated from
LiGo's own games (after the POC), user-submitted puzzles, puzzles in the analysis board, the credits
page itself (Phase 9, from 8.4's sources list), and problems from modern books (§8).

**Phase 9 units** (broken down 2026-09-29 while Phases 3–8 were being built; the PWA row is §3.1's
"lila's existing manifest and service worker", the credits page and the handoff are §8, and the
kept `serviceWorker`, `site`, `dasher` and `pref` pieces are [ADR 0018](decisions/0018-phase-3-module-map.md).
lila already has most of it (a web app manifest, a service worker for web push, sound sets and a
sound preference, site and board themes, a non-visual mode for blind players), so the lila units
adapt them. As in Phases 4–8, the board-library halves are split from their lila halves so they can
be built early on the playground page (2.2): units 9.1–9.5 need nothing unmerged, so they run now;
9.6–9.10 wait for Phase 3's rebrand, round UI and demo and for Phases 4–8's pages. Ten units, above
the table's 4–6, for that split):

| Unit | What | Needs |
|---|---|---|
| 9.1 | Design ADR for Phase 9 ([ADR 0026](decisions/0026-phase-9-pwa-polish-handoff.md)): the PWA (lila's manifest with LiGo's name, description, colours and icons and without lichess's app-store entries; what the service worker adds to lila's web push, e.g. an offline page, not offline play; the install prompt; touch settings); sounds (which Go events sound: stone, capture, pass, illegal move, byo-yomi countdown, game start and end, the scoring phase; where the files come from, reuse first with each licence checked; whether lila's kept sets and sound preference stay); themes (lila's site themes; which board and stone themes, after a licence check of goban's pictures; where the choice is stored); accessibility basics (the target and how it is checked, keyboard play on the board, moves read out as coordinates, lila's chess-only non-visual mode `nvui` adapted or dropped, contrast, reduced motion); the performance budget (which numbers, their limits, where CI checks them); the credits page; the handoff package's contents and where it lives | — |
| 9.2 | Sounds: the Go sound set 9.1 chose, in `lila/public/sound` with each file's source and licence in COPYING.md; `libs/board` reports sound events (stone, capture with the number taken, pass, illegal move) and the playground plays them through lila's sound module, honouring the sound preference; tests | 9.1 |
| 9.3 | Board themes in `libs/board`: the board and stone themes 9.1 chose (goban's own once their pictures' licence is recorded, or LiGo-made ones), a theme option on `mountBoard`, a theme picker on the playground, screenshot tests for each theme at desktop and phone sizes; COPYING.md for any picture | 9.1 |
| 9.4 | Board accessibility in `libs/board`: keyboard play (a cursor moved over the intersections with the arrow keys, Enter to place, a key to pass, touch-confirm honoured), the last move and captures announced as coordinates in a live region, a visible focus ring, stone and board contrast; the playground passes an automated accessibility check at desktop and phone sizes and a keyboard-only game test | 9.1 |
| 9.5 | Performance budget: a check in `dev/ci` for 9.1's budgets over what exists now (the board's gzipped JS, the playground page's JS and CSS, the board's mount time with Chromium's CPU throttled to a phone's), run in the `ui` CI job and by `dev/ligo`; each later page adds its own line when it lands | 9.1 |
| 9.6 | The PWA: LiGo's manifest, the service worker's additions, the install prompt and the touch settings as 9.1 decided; checked in Chromium at phone size (installable per the DevTools protocol, the offline page shown with the network cut, push still subscribing) | 3.8, 9.1 |
| 9.7 | Themes, sounds and accessibility on lila's pages: lila's sound and board preferences (in `pref` and the dasher menu) offer 9.2's sounds and 9.3's themes, and the round, analysis and puzzle pages use them, with byo-yomi's countdown sounds; `nvui` as 9.1 decided; the leftover chess sound sets and board themes removed (COPYING.md updated); the accessibility check and screenshot tests on those pages at desktop and phone sizes | 3.18, 7.4, 8.7, 9.2, 9.3, 9.4 |
| 9.8 | The credits page: `/credits`, a lila page like `/source`, crediting lichess, lishogi, PlayStrategy, OGS's goban, KataGo, goscorer and every asset and puzzle source (COPYING.md, 9.2, 9.3 and 8.4's sources list), linked from the footer and `/source`; a screenshot test | 3.8, 8.4, 9.2, 9.3 |
| 9.9 | The handoff package in `docs/handoff/`, as 9.1 decided: a write-up (what LiGo is, what it reuses, what it built, what is left), how to run it from a fresh clone, a digest of the logs' Lessons, the lobby research (6.3's kit and the player test's findings), the parts most portable to OGS (§8), and a demo video recorded by Playwright (a full game with scoring, a puzzle, an SGF import) | 3.20, 4.12, 5.8, 6.10, 7.8, 8.8 |
| 9.10 | Phase 9 demo: 9.5's budget and 9.4's accessibility check over every page, the PWA installed on a phone, and the checklist for your Go-club demo (what to show, in which order, what to do if something breaks) | 9.5, 9.6, 9.7, 9.8, 9.9 |

What stays out of Phase 9: offline play, app-store apps, languages other than English (i18n stays
ready, §1.3), a public demo (the legal steps in §8 come first and are yours), and contacting OGS
(yours, §8).

**Total: roughly 60–100 units.** At 2–3 reviewed units a week, the POC is realistically **7–13 months**
away. Phase 3 is the long pole. These are rough estimates, re-made at the end of each phase in
`STATUS.md`.

**After the POC (all your decisions):** hand it to OGS; keep improving it as a demo; or pick up the
later features in §1.3.

---

## 6. Quality strategy

**Autonomy never lowers the bar.** Every unit is tested and reviewed by Claude as thoroughly as
possible. What Claude can't verify goes to you, explicitly listed in the PR (§7).

| Layer | What | Gate |
|---|---|---|
| Rules | Conformance fixtures, property tests (stones conserved, no zero-liberty groups after legal moves, superko invariants, SGF round-trip), nightly KataGo differential test | CI required (the nightly differential runs on a schedule and on rules PRs, not as a required PR check: unit 1.9); only `go-rules-expert` may edit fixtures (hook-enforced) |
| Scoring | Benchmark of finished positions with agreed results | ≥ 97% agreement before Phase 4 closes |
| Clocks | Deterministic-time tests (byo-yomi periods, resets, lag compensation, timeouts inside byo-yomi) | CI required |
| Server | Module tests; Mongo/Redis integration tests | CI required |
| UI | Unit tests; board visual snapshots; Playwright two-player E2E on desktop and phone viewports | CI (E2E on labelled PRs + nightly) |
| Review | `reviewer` subagent on every unit (including a reuse check and a log check); `/security-review` on auth, session and websocket changes; `/code-review` as a second opinion on large units | Blocking findings fixed before the PR opens |
| Human check | The PR's "Needs your verification" list (UX feel, real-device touch, Go judgement calls, anything Claude couldn't run) plus a ≤ 5-minute test | You, after Claude merges; a problem gets a fix or a revert PR (ADR 0011) |

---

## 7. Working agreement

**Claude's latitude.** Within an approved unit, Claude chooses the implementation, writes the tests,
runs the tools, fixes what it finds, and opens the PR — without asking permission for routine steps.

**You're in the loop at the unit level:**
1. **Before a unit starts,** `/next` presents it for your approval: goal, acceptance criteria, test
   plan, reuse plan (what existing software it uses), and the decisions it expects to need.
   Nothing starts without your OK.
2. **During a unit,** Claude stops and asks you (not guesses) when it hits a major decision or is
   unsure.
3. **After a unit,** the PR shows:
   - what was done and why;
   - a plain-English walkthrough;
   - what Claude verified, with real output;
   - **what needs your verification**;
   - decisions made or needed;
   - the log entry.

   Claude squash-merges it once the checks pass and tells you (ADR 0011). You can still ask for a
   follow-up or a revert.

**Major decisions: always consult you:**
- Build-vs-buy choices; adding, removing or swapping any dependency.
- Architecture, data model / Mongo schema, websocket protocol.
- Go rules interpretations; rating, rank and handicap maths.
- UX flows and visual direction.
- Licensing and content provenance.
- Deviating from this plan, or changing scope or order.
- Removing functionality beyond what the plan lists.
- Anything irreversible or outward-facing (publishing, contacting anyone including OGS, other repos).
- Security-sensitive choices.

**"Unsure" means stop and ask.** Examples:
- The requirement is ambiguous.
- Two reasonable approaches have different trade-offs.
- A fix would require changing a test or fixture.
- The rules interpretation is uncertain.
- Tests can't show whether behaviour is right.
- Something surprising happened.
- Claude is about to rely on a fact it hasn't verified.

When Claude stops, it sends you a notification. While waiting for your answer, it only does work that
doesn't depend on it.

**Rigour is not traded for speed.** Claude runs every relevant gate itself, never reports "should work",
and never hides a failing or skipped check. When its own verification can't settle a question (how the
board feels on your phone, whether a scoring proposal is sensible Go, performance on your hardware),
it says so and hands that check to you.

**Weekly rhythm (< 5 h):**
- **Session A (~1 h):** `/status`; approve 2–3 units via `/next`; start `/ship` on them (Remote
  Control for full-stack work, cloud sessions for self-contained work).
- **Between sessions:** answer Claude's questions when notified.
- **Session B (~1–2 h):** review each PR's walkthrough, screenshots and "needs your verification"
  list; run the 5-minute test; ask for follow-ups or reverts where needed.
- **Monthly (~30 min):** the upstream-scout report, plus a skim of each log's Lessons section, then
  adjust the plan.

---

## 8. Licensing, handoff and legal

- **Licence ([ADR 0007](decisions/0007-licensing-corrections-after-import.md)):**
  - `lila/` is AGPL-3.0-or-later (except upstream's listed asset exceptions); `lila-ws/` is AGPL-3.0
    as upstream ships it; LiGo's own changes to both are AGPL-3.0-or-later, listed in
    `docs/UPSTREAM.md`.
  - `COPYING.md` lists third-party code (Apache-2.0 NOTICE for goban, MIT notices for strategygames,
    scalashogi, scalachess and goscorer) and the non-free upstream assets kept until the first
    Phase 3 unit strips them.
- **Handing the work to OGS:**
  - The OGS frontend is AGPL-3.0 and `goban` is Apache-2.0, so AGPL-licensed LiGo code is
    licence-compatible with OGS's frontend. Anything OGS adopts from the lila-derived server would
    need to stay AGPL.
  - The most portable parts are:
    - UX designs and player research;
    - the `libs/board` adapter;
    - rules fixtures;
    - the logs and lessons;
    - improvements upstreamed to `goban`.
  - **Decided ([ADR 0006](decisions/0006-mit-for-own-code.md)):** LiGo's own code that isn't derived
    from lila (the adapters, fixtures, docs) is MIT-licensed, to make donation easier. See
    [`COPYING.md`](../COPYING.md).
  - **Contacting OGS is your call and yours to make**; Claude never does it.
- **Brand:** remove lichess's logo and lichess-only / CC BY-NC-SA assets; credit lichess, lishogi,
  PlayStrategy, OGS and KataGo on a credits page.
- **KataGo networks:** confirm the network licence before any public use.
- **Tsumego provenance:** every puzzle records its source; no problems from modern books.
- **UK Online Safety Act and GDPR:** not triggered while LiGo runs locally. If you ever run a *public*
  demo, you'd first need:
  - an illegal-content risk assessment and a children's-access assessment;
  - ICO registration and a privacy notice;
  - lila's kid mode and report/mod modules re-enabled.

---

## 9. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| lila is huge and you can't review Scala in depth | High | Gates (§6), unit-sized work, plain-English walkthroughs, `/explain`, a reviewer that learns, and the per-area logs |
| Reused components don't fit lila's architecture (e.g. goban renderer vs snabbdom, strategygames' generic abstractions) | Medium | A Phase 1 spike for each component before committing; a fallback ladder (§2.2); your approval per memo |
| Removing chess (Phase 3) drags on | High | Quarantine-then-replace order; each unit compiles; a small demo target |
| Your time dips | Medium | Independent phases; `STATUS.md` + logs make restarts cheap; Claude only queues units you've approved |
| Too many questions slow progress | Medium | Questions are batched per unit where possible; Claude keeps working on anything that doesn't depend on the answer; the major-decision list keeps routine choices off your plate |
| Cloud VM (16 GB) can't compile lila | Medium | Per-module compiles in the cloud; full-stack work via Remote Control on your 32 GB box |
| KataGo on AMD OpenCL is flaky | Low–Med | CPU fallback; the goban estimator fallback |
| Autoscore mistakes | Medium | Players confirm or toggle; resume play; accuracy benchmark gate |
| Logs grow until nobody reads them | Medium | One file per area, a curated Lessons section on top, archiving (`CLAUDE_SETUP.md` §9) |
| Missing upstream security fixes | Medium | Monthly `upstream-scout` report |
| Licence contamination | Low | The reuse-scout licence check, a CI licence check, provenance records |

---

## 10. Decisions deferred (and what triggers them)

| Decision | Trigger |
|---|---|
| Each component's build-vs-buy choice (§3.1) | Phase 1 memos |
| Rules spec details (superko already decided, ADR 0003) | Phase 1 |
| 9×9 stone value (rank curve decided, ADR 0004) | Decided: 6 ranks per stone (ADR 0013) |
| Changes to the initial lobby presets (ADR 0005) | Phase 6 player test |
| Tsumego content sources | Decided: generated by LiGo, plus a classics tail (ADR 0024, unit 8.1) |
| Offering the work to OGS, running a public demo, or neither | POC complete |

---

## 11. Immediate next steps

1. **You:** read this plan and `CLAUDE_SETUP.md` and comment, especially on the proposed defaults
   (§3.3 superko, §3.7 rank curve, §4 presets) and the working agreement (§7).
2. **Claude, after your approval:** Phase 0, in the order given in `CLAUDE_SETUP.md` §14. Each step is
   a unit you approve, ending with the dry-run unit.
3. **You, in parallel:** create the claude.ai cloud environment, install Claude Code on your Linux box,
   and enable Remote Control.
