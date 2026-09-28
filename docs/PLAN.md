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
  AGPL-3.0). Non-commercial and unclear licences are rejected.
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
| Tsumego trainer | **lila puzzle module + UI** | — | Go puzzle format |
| Tsumego content | Existing licensed collections and generators, found by `reuse-scout` | Positions KataGo generates from game records with verified licences; our own transcriptions of public-domain classics | `tools/puzzles` import scripts |
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
| Tsumego content sources | Phase 8 memo |
| Offering the work to OGS, running a public demo, or neither | POC complete |

---

## 11. Immediate next steps

1. **You:** read this plan and `CLAUDE_SETUP.md` and comment, especially on the proposed defaults
   (§3.3 superko, §3.7 rank curve, §4 presets) and the working agreement (§7).
2. **Claude, after your approval:** Phase 0, in the order given in `CLAUDE_SETUP.md` §14. Each step is
   a unit you approve, ending with the dry-run unit.
3. **You, in parallel:** create the claude.ai cloud environment, install Claude Code on your Linux box,
   and enable Remote Control.
