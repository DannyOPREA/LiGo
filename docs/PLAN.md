# LiGo — Project Plan

> A lichess-grade Go (Baduk/Weiqi) server for Western players, built as a hard fork of
> [lichess-org/lila](https://github.com/lichess-org/lila) — the way lishogi.org did for shogi.
>
> Status: **Proposed** · Written 2026-09-25 after a requirements interview with the owner.
> Companion document: [`CLAUDE_SETUP.md`](CLAUDE_SETUP.md) (Phase 0: the Claude Code setup,
> built before any feature work).

---

## 0. Summary

- **Problem.** There's no great Western Go server. OGS is the best available, but its interface
  is weak — above all, **finding a game is confusing** (the lobby).
- **Bet.** Lichess's interface — fast, minimal, one click to play — applied to Go, with Go-native
  concepts (ranks, handicap, komi, byo-yomi, a scoring phase) treated as first-class rather than
  bolted on.
- **Goal for the next 12–18 months:** a **proof of concept (POC)** that runs locally and shows a
  lichess-style Go server is viable and nicer than OGS, especially its lobby.
- **How.** Fork *current* lila (Scala 3.8 / sbt 2 / Pekko / MongoDB / Redis + TypeScript/snabbdom UI).
  Port the Go pieces that already exist under permissive licences: PlayStrategy's Go rules (MIT),
  lishogi's byo-yomi clock design (MIT), OGS's KataGo autoscore approach (Apache-2.0), and
  lightvector's `goscorer` (MIT).
- **Who builds it.** You direct and review for under 5 hours a week; Claude writes most of the code.
  Because you're new to Scala, correctness is enforced by **automated gates** (conformance tests,
  CI, an independent reviewer agent, play-test screenshots) rather than by line-by-line review.
- **Order of work.** Phase 0 Claude setup → rules libraries → board component → fork and remove chess →
  playable Go games → accounts and ratings → **the lobby** → correspondence, SGF and analysis board →
  tsumego → PWA polish → POC demo.

---

## 1. Requirements record

Everything below was decided in the requirements interview. Changing any of it needs an ADR in
`docs/decisions/`.

### 1.1 Product and context

| Topic | Decision | Consequence for the plan |
|---|---|---|
| Core pain | OGS's **game-finding**, specifically a **confusing lobby** | The lobby is the headline feature of the POC and gets its own design phase and user test (§4) |
| Ambition | **Proof of concept** | Scope stays narrow. Production concerns (scale, anti-cheat, moderation) are designed for but not built |
| Hosting | **Local-only for now** | No public infrastructure, domain or UK compliance work until the POC is demo-ready (§8) |
| Funding | Self-funded, decide later | No payments or entitlements. Everything stays open source (AGPL-3.0) |
| Name | **LiGo** (kept despite the LIGO observatory name clash) | Brand strings sit behind one config/i18n layer anyway |
| Team | **Solo, Claude-heavy, new to Scala**, **< 5 h/week** | Heavy automation, PR-sized increments, plain-English PR walkthroughs, a weekly rhythm (§7) |
| Tooling | Claude **Max 5x**, both **Claude Code web and local CLI**. Local box: **Linux, 32 GB+, AMD CPU + AMD GPU** | Remote Control on your box is the main mode; cloud sessions run parallel work. KataGo runs on its OpenCL backend (§5.7) |
| Autonomy | **Claude opens PRs, gates must pass, you merge** | Enforced by branch protection, deny rules and hooks |
| Claude in CI | **No** (reviews run locally inside sessions) | CI is plain GitHub Actions; review is the `reviewer` subagent plus built-in `/code-review` |
| Upstream | **Hard fork + monthly cherry-pick review** | An `upstream-scout` agent and an `/upstream-port` skill handle it (see CLAUDE_SETUP.md) |
| Plan location | Repo markdown | This file, `CLAUDE_SETUP.md`, and later `STATUS.md` and ADRs |

### 1.2 Game

| Topic | Decision |
|---|---|
| Board sizes | **19×19 and 9×9** (the engine takes any N×N, so adding 13×13 later is cheap) |
| Rulesets | **Japanese** (territory) **and Chinese** (area), chosen per game |
| End of game | Two consecutive passes → **scoring phase: KataGo proposes dead stones and the score; both players confirm, adjust, or resume play** |
| Clocks | **Japanese byo-yomi** and **Fischer**, plus correspondence (days per move) |
| Ratings | **Glicko-2, displayed as kyu/dan**, **one overall pool** across sizes and speeds |
| Handicap | **Auto-handicap in quick-pair, and rated** (the rating maths adjusts for handicap) |
| New players | **Self-declared starting rank** at signup, with high rating uncertainty |
| Guests | **Anonymous casual games allowed**; an account is required for rated games |

### 1.3 POC scope

**In:** live play · lobby and quick pairing · direct challenges · scoring phase · correspondence ·
SGF import/export and an analysis board (no engine) · tsumego trainer · accounts, ratings and
profiles · guest play · responsive web + installable PWA · English only, with i18n kept ready.

**Out (later phases, in rough priority order):** public hosting · KataGo post-game review ·
play-vs-AI bots and a bot API · tournaments (arena → Swiss/McMahon) · studies/shared reviews · social
layer (chat, DMs, forum, teams) · 13×13 · more rulesets (AGA, Korean, NZ, Ing) and clocks (Canadian,
absolute) · other languages · native mobile app.

---

## 2. Product principles

1. **One click to play.** Every choice has a sensible default; advanced options sit one click away,
   never in the way.
2. **Go-native, not chess with stones.** Ranks, handicap, komi, byo-yomi and scoring are core
   concepts in the data model and the UI.
3. **Mobile-first board.** On touch devices a tap shows a ghost stone, and a second tap (or a confirm
   button) places it; this can be turned off. The board fills the screen width.
4. **Lichess speed and calm.** Minimal chrome, fast pages, no clutter. It should feel like lichess,
   not like OGS with a new skin.
5. **Honest scoring.** The AI *proposes* and people *decide*, with anti-stalling timeouts and a
   one-tap "resume play".

---

## 3. Architecture

### 3.1 Starting point and reuse

**Fork base: current upstream `lila` and `lila-ws`**, pinned to SHAs taken *after* lichess's June 2026
sbt 2 / liplay migration and recorded in `docs/UPSTREAM.md`. We rejected the alternatives:

- **lishogi** is frozen on Scala 2.13 / Akka / Play 2.9.
- **PlayStrategy** has Go, but sits on a May-2021 lila with Akka / Play 2.8 and about 20 other games
  behind generic abstractions. It also draws the Go board by bending the chess board component, and
  its Scala 3 port is still causing regressions.

What we reuse (all licences compatible with AGPL-3.0):

| Source | Licence | What we take |
|---|---|---|
| lichess `lila`, `lila-ws` | AGPL-3.0 | The whole app and websocket server: accounts, security, lobby/pool, round, correspondence, analysis board, puzzle trainer, i18n, UI shell |
| `scalachess` (rating module) | MIT | Glicko-2 implementation |
| PlayStrategy `strategygames` (Go package, pure Scala since Aug 2026) | MIT | Seed for `scalago`: capture logic, situational superko, handicap placements, dead-stone agreement flow. Their bug history (early game end on repetition, infinite games, dead-stone expiry) becomes test cases |
| `scalashogi` `Clock.scala` | MIT | Byo-yomi clock design (`periods`, `spentPeriods`, `periodsInUse`) |
| OGS `goban` (`autoscore.ts`) | Apache-2.0 | The autoscore algorithm (two KataGo ownership maps; remove stones above 0.7, flag points below 0.3 as needing sealing). Also a reference for rules and time-system edge cases |
| lightvector `goscorer` | MIT | Territory and area scoring with seki detection once dead stones are marked |
| KataGo v1.18.x | MIT (code); network licence to verify | Scoring now; review and human-like bots later (`b18c384nbt-humanv0`) |
| Sabaki `Shudan` | MIT | Reference for board rendering |

**Avoid:** jgoboard (CC BY-NC), lichess's logo and CC BY-NC-SA assets, GoGoD/Go4Go game
collections, tsumego from modern books, and OGS joseki data (unless OGS grants permission).

### 3.2 Repository layout (monorepo)

```
LiGo/
  lila/                      hard fork of lichess-org/lila (app server + ui/)
  lila-ws/                   hard fork of lichess-org/lila-ws (websocket server)
  libs/
    scalago/                 Scala 3, MIT: rules, scoring, handicap, SGF, clocks, rank maths
    goops/                   TypeScript: client rules + SGF (the same behaviour as scalago)
    goground/                TypeScript: board UI component (chessground-style API, SVG)
    conformance/             JSON rules fixtures consumed by BOTH engines
  services/katago-worker/    TypeScript/Node: KataGo analysis-engine bridge (scoring proposals)
  tools/puzzles/             TypeScript: tsumego import and generation pipeline
  dev/                       docker-compose, `ligo` CLI, doctor, cloud setup script
  docs/                      PLAN, CLAUDE_SETUP, STATUS, UPSTREAM, rules spec, ADRs, glossary
  .claude/ .mcp.json CLAUDE.md
```

**Why a monorepo:** a single change can touch rules, server and UI in one PR, with one CI run and one
set of Claude instructions. That suits a solo developer; lichess's many repos serve its scale, not
ours.

**Why only two languages (Scala + TypeScript):** the worker and the puzzle pipeline are TypeScript,
so they can reuse `goscorer` (JS) and port `autoscore.ts` directly, and you never have to review a
third language.

**How the pieces connect:**
- `scalago` is an sbt subproject that both lila and lila-ws depend on. It replaces the `scalachess`
  dependency.
- `goops` and `goground` are pnpm workspace packages consumed by `lila/ui`.
- Data flows `lila ⇄ Redis ⇄ lila-ws ⇄ browser` and `lila ⇄ Redis ⇄ katago-worker`.
- **MongoDB 7** and **Redis** are required; Elasticsearch (game search) is left out of the POC.

### 3.3 `libs/scalago` — the authoritative engine

- **Board:** N×N (9 and 19 in the POC), flat arrays + union-find groups/liberties, Zobrist hashing
  for superko.
- **Moves:** `Place(point)` | `Pass`. Resign, timeouts and abort are game events, not moves.
- **Rules:** a `Ruleset` data type (Japanese, Chinese) that fixes ko handling, suicide, scoring
  method, default komi, and how handicap stones are compensated. The exact rules are written down in
  `docs/rules/` by the `go-rules-expert` agent during Phase 1. **Proposed default for you to approve:**
  situational superko in both rulesets, so games can't loop forever (a deliberate simplification of
  traditional Japanese "no result" cycles, recorded as an ADR).
- **Scoring:** given a set of dead stones, compute territory or area score, prisoners, seki and komi.
  Port goscorer's logic so the server's result is authoritative.
- **Handicap:** fixed star-point placements (19×19: 2–9 stones; 9×9: 2–5), komi 0.5 in handicap
  games, handicap compensation per ruleset.
- **SGF (FF[4]):** read/write moves, setup (AB/AW), HA, KM, RU, RE, TM/OT, PB/PW/BR/WR, C,
  variations; tolerant of OGS/KGS/Fox quirks.
- **Clocks:** `GoClock = Fischer(limit, inc) | ByoYomi(main, periods, periodTime)` (extensible to
  Canadian), with lag compensation that works with periods.
- **Rank maths:** Glicko-2 (from scalachess), rating ⇄ rank mapping, and handicap-adjusted expected
  score (§3.9).

### 3.4 `libs/goops` + `libs/conformance`

- `goops` implements the same rules and SGF handling in TypeScript for the client: legal-move hints,
  the analysis board, SGF viewing, and puzzles.
- **Conformance fixtures** are the single source of truth. Each fixture is a JSON case
  (`size, rules, komi, setup, moves, expect{legal, board, captures, koPoint, deadStones → score}`).
  Both engines replay every fixture in CI (the "parity" gate).
- Target: ≥ 150 fixtures by the end of Phase 1, including every PlayStrategy bug class and every
  classic trap (seki, bent-four, snapback, triple ko, sending-two-returning-one, suicide attempts,
  handicap compensation).
- A nightly **differential test** plays random games and compares `scalago` against KataGo's own
  rules implementation (over GTP) on legality, captures and final area score.

### 3.5 `libs/goground` — the board component

A new component, **not** a chessground fork, because chessground is built around square cells and
pieces. It keeps chessground's *API shape* (config → state → events → redraw, plain DOM so snabbdom
hosts it), which makes wiring it into `ui/round` and `ui/analyse` feel native to lila.

- Renders the board as SVG, crisp at any size, with coordinates (A–T, skipping I).
- Placing stones: a ghost stone on hover, and **tap-to-preview + confirm on touch** (a user setting).
- Markers: last move, move numbers, circle/triangle/square/X/labels (SGF), variation hints.
- **Scoring overlay:** territory shading, dead-stone marking, tap a group to toggle it dead/alive.
- Themes: kaya, light wood, flat, dark; stones: slate-and-shell and flat; our own stone sounds (not
  lichess's sound sets).
- Tests: Playwright visual snapshots on desktop and phone viewports; a standalone playground page.

### 3.6 `lila` fork — keep, adapt, remove

- **Keep and adapt (POC core):**
  - Play and matchmaking: `game`, `round`, `lobby`, `pool` (quick pairing), `setup`, `challenge`,
    `playban`.
  - Accounts and prefs: `user`, `security`, `pref`, `rating`, `history`.
  - Boards and puzzles: `analyse` (board only), `importer` (SGF), `puzzle` (becomes tsumego).
  - Shared infrastructure: `socket`, `i18n`, the `site` shell and the core/common modules.
- **Keep dormant (needed before a public launch):** `report`, `mod`, `shutup`, kid mode,
  `PersonalDataExport` and account closure.
- **Remove in the POC:** tournament, swiss, simul, study, relay, fishnet, evalCache, opening/explorer,
  insight, tutor, coach, streamer, forum, ublog, team, msg, video, practice, learn, storm, racer,
  streak, bot/botPlay, and all chess-specific UI packages. Removals are deletions; git history is the
  archive.
- **"Quarantine, then replace" order, where every step compiles and is its own PR:**
  1. Cut routes, UI entry points and `Env` wiring for the modules being removed.
  2. Delete those modules.
  3. Add `scalago` alongside `scalachess`.
  4. Migrate the core types: Game, Board, Move, Variant → (BoardSize, Ruleset), PerfType → a single
     `go` perf, Clock.
  5. Remove the `scalachess` dependency.
  6. Replace the chess UI in `ui/round` and `ui/analyse` with `goground`.

### 3.7 `lila-ws` fork

- Round messages carry Go moves (point | pass) and byo-yomi clock state (main time left, periods left).
- New scoring-phase messages: `scoreProposal`, `toggleGroup`, `accept`, `resume`.
- Lobby and pool messages carry rank, handicap preference and live pool counts.
- Replace the scalachess-based move computation for the analysis board with scalago.

### 3.8 `services/katago-worker` — AI-assisted scoring

- **Protocol:** lila pushes `{gameId, size, rules, komi, handicap, moves}` to a Redis queue. The
  worker runs KataGo's **JSON analysis engine** twice, once with black to move and once with white,
  asking for ownership maps.
- It then runs the ported autoscore logic to pick dead stones, and goscorer to compute the score.
  It publishes `{deadStones, territory, score, confidence}`, which lila forwards to both players.
- **Hardware:** on your box KataGo uses **OpenCL on the AMD GPU** (tuned via `katago benchmark`). In
  cloud sessions and CI it uses the **Eigen CPU** backend with a small network and low visits;
  that's slow but enough for scoring tests.
- **Fallback:** if no worker answers within a timeout, the scoring phase opens with goscorer's
  heuristic proposal and manual marking, so a game can never get stuck.
- **Built to move later:** the queue boundary means that once LiGo is hosted publicly, your home GPU
  can connect *out* to the server as a worker, the way lichess's fishnet volunteers do, with no
  ports opened at home.

### 3.9 Ratings, ranks and handicap

- **One overall Glicko-2 pool** covering both sizes and every speed, using scalachess's implementation.
- **Rating → rank:** a non-linear mapping, not a flat 100 points per rank, because one stone of
  difference means a different rating gap at different strengths. **Proposal:** adopt OGS's published
  curve (`rank = ln(rating/525) × 23.15`, 30k … 9d; verify against `goratings`) so LiGo ranks line up
  with what Western players already know. A rank shows "?" (provisional) while rating deviation is high.
- **Self-declared start:** at signup, choose from "New to Go / ~25k / ~20k / … / ~1d / 3d+". Each
  maps to a starting rating through the inverse curve, with high deviation so it converges quickly.
- **Handicap in ratings (OGS's approach):** the weaker player's *effective* rating is shifted by the
  handicap's stone value, which depends on board size and ruleset; the expected score uses that
  effective rating. Stone values for 9×9 come from `goratings` research in Phase 5.
- **Auto-handicap:** stones = rank difference (capped at 9 on 19×19, lower on 9×9), with komi set
  by the ruleset spec. Players choose "Even only" or "Handicap OK" once, as a preference.
- **Guests** play casual games only and have no rating.
- **Deferred to an ADR once there's data:** whether 9×9 results should count less than 19×19 in the
  overall rating.

### 3.10 Game flows

1. **Play:** moves go over websocket and the server validates them with scalago. Clocks, pass,
   resign, abort (first moves), and undo requests (casual games only by default).
2. **Scoring phase:**
   - After two passes the board shows KataGo's proposal: dead stones marked, territory shaded, a
     live score.
   - Either player can tap groups to toggle them; each change clears both acceptances and is shown
     to the opponent instantly.
   - When both accept, the result is final. **Resume play** returns to the game (under Chinese rules,
     playing it out always settles a dispute).
   - The scoring phase has its **own timeout** (e.g. 3 min live, 1 day correspondence). When it
     expires, the current proposal is accepted automatically. Leaving during scoring counts as
     abandonment, using lila's existing logic.
3. **Correspondence:** lila's days-per-move infrastructure, in-site notifications, and a
   correspondence scoring timeout.
4. **SGF:** any game downloads as SGF; SGF import opens in the analysis board and can be saved as an
   imported game.
5. **Analysis board:** navigate moves and variations, add variations, load/save SGF. The engine hook
   stays stubbed for later KataGo review.
6. **Tsumego:** lila's puzzle trainer adapted to Go. Puzzles have their own Glicko-2 rating,
   themes (life and death, tesuji, capturing race, ko, endgame), answer trees with refutations of
   wrong moves, and a provenance record for each puzzle.

---

## 4. The lobby — the headline feature

**The problem you named:** OGS's lobby is confusing — hard to read and hard to filter, and you can't
see at a glance which games suit you.

**Design:**

- **The landing view is a quick-pair grid.** Each tile is one click and shows live counts
  ("12 playing · 3 waiting"). The *proposed* presets below get tuned in Phase 6 and validated with
  real players:

  | 9×9 | 19×19 | Correspondence |
  |---|---|---|
  | 1 min + 5×10 s | 5 min + 5×10 s | 1 day/move |
  | 3 min + 3×20 s | 10 min + 5×30 s | 3 days/move |
  | 3+2 Fischer | 20 min + 5×30 s | |
  | | 10+10 Fischer | |

- **One persistent chip row above the grid:** `Rated / Casual` · `Handicap OK / Even only`.
  Rules default to Japanese, komi to the ruleset's default; changing them goes through a custom game.
- **Custom game** is a single modal with every field pre-filled; advanced options (rules, komi, fixed
  handicap, byo-yomi details) are collapsed.
- **Open challenges** is a readable table: player + rank · board · time · rules · even/handicap ·
  rated.
  - Games that suit you (within rank range and compatible preferences) are listed first.
  - Incompatible games are greyed out, never hidden without explanation.
  - Filter chips replace a settings form; phones get cards instead of a table.
- **While waiting:** show the pool size, the rank range being searched (which visibly widens over
  time), the elapsed time, and a Cancel button. Never a blank spinner.
- **Direct challenge** from any profile, with the same defaults.

**How we'll know it beats OGS:**
- Clicks from landing page to a game: **1**.
- Time to the first move once there are players: **< 10 s**.
- A think-aloud test with ≥ 3 Western Go players doing the same tasks on OGS and LiGo, recorded in
  `docs/research/`.

---

## 5. Roadmap

Every phase ends with a **demo you can click** and has explicit acceptance criteria. Sizes are in PRs,
because your review time is the scarce resource, not Claude's coding time.

| Phase | Deliverable | Demo / acceptance | Size |
|---|---|---|---|
| **0. Claude setup + baseline** | Everything in [`CLAUDE_SETUP.md`](CLAUDE_SETUP.md); unmodified lila builds and runs locally and in the cloud; CI green | A dry-run PR (rebrand to LiGo) goes through `/next` → `/ship` → merge in < 15 min of your time | 8–12 PRs |
| **1. Rules foundation** | `docs/rules` spec (JP + CN), ≥ 150 fixtures, `scalago` + `goops` (board, ko/superko, scoring given dead stones, handicap, SGF, clocks), parity CI, nightly KataGo differential test | Both engines pass every fixture; 1,000 random differential games agree with KataGo; SGF round-trips losslessly | 10–14 PRs |
| **2. Board component** | `goground` + playground page | You play both colours on the playground on your phone (tap + confirm) and desktop; visual snapshots pass | 5–8 PRs |
| **3. Fork & de-chess** | Modules removed, scalago swapped in, core types migrated, round UI uses goground, lila-ws adapted | Two browsers on localhost play a casual 9×9 Fischer game to resignation; no chess code left in the running paths | 15–25 PRs |
| **4. Go-native game** | Byo-yomi, komi, rules choice, pass, **scoring phase + katago-worker** (OpenCL/CPU), scoring timeouts, results, SGF export | A 19×19 Japanese byo-yomi game ends in an AI-proposed score that both players accept; a disputed game resumes and ends correctly; the SGF opens in Sabaki; autoscore agrees ≥ 97% with human results on a benchmark of finished games | 8–12 PRs |
| **5. Accounts & ratings** | Signup with self-declared rank, Glicko-2 shown as kyu/dan, provisional "?", handicap-adjusted rating, profile + rank graph, game history, guest casual play | Two accounts (5k and 1d) play a rated auto-handicap game and both ranks move sensibly; a guest plays a casual game | 6–9 PRs |
| **6. The lobby** | Quick-pair grid, pools with auto-handicap, custom game modal, open-challenges table, direct challenge, waiting UX, mobile layout | Landing → game in one click; the think-aloud comparison with OGS is done and its findings are fixed | 6–10 PRs |
| **7. Correspondence, SGF, analysis** | Correspondence games + notifications, analysis board with variations, SGF import/export | Import a pro-game SGF, explore and export variations; finish a correspondence game across days | 5–8 PRs |
| **8. Tsumego** | Puzzle sourcing policy, `tools/puzzles` pipeline, trainer UI, puzzle rating | ≥ 200 puzzles with recorded provenance, playable on a phone | 5–8 PRs |
| **9. PWA & POC polish** | Installable PWA, touch settings, sounds, themes, accessibility basics, performance budget, onboarding copy, credits page | A POC demo to a Go club (e.g. via a temporary tunnel), with feedback captured | 4–6 PRs |

**Total: roughly 70–110 PRs.** Reviewing 2–3 PRs a week in under 5 hours, the POC is realistically
**8–14 months** away. Phase 3 is the long pole. The ranges are rough estimates, not commitments; we'll
re-estimate at the end of each phase in `STATUS.md`.

**After the POC, in likely order of value:** public hosting (a small VPS + your home GPU worker) and UK
compliance (§8) → KataGo post-game review → bots at graded strengths (human-imitation network) + a bot
API → tournaments → studies/reviews → social layer with kid mode → 13×13 → more rulesets and clocks →
i18n via Crowdin → native app.

---

## 6. Quality strategy

| Layer | What | Gate |
|---|---|---|
| Rules | Conformance fixtures, property tests (ScalaCheck / fast-check: stones conserved, no zero-liberty groups after a legal move, superko invariants, SGF round-trip), nightly differential test vs KataGo, SGF corpus replay | CI required; fixtures editable only by `go-rules-expert` (hook-enforced) |
| Scoring | A benchmark of finished positions with agreed results; autoscore accuracy tracked over time | ≥ 97% agreement before Phase 4 closes |
| Clocks | Deterministic-time tests: byo-yomi period use, resets, lag compensation, timeouts inside byo-yomi | CI required |
| Server | Module unit tests; Mongo/Redis integration tests via docker compose | CI required |
| UI | vitest units; goground visual snapshots; Playwright two-player E2E on desktop and phone viewports | CI (E2E on labelled PRs + nightly) |
| Review | `reviewer` subagent on every PR; built-in `/security-review` for auth, session and websocket changes; `/code-review` as a second opinion on large PRs | Findings resolved before the PR opens |
| Human check | A plain-English walkthrough and a ≤ 5-minute "how to test" in every PR | You, before merging |
| Performance (Phase 6+) | A scripted load of ~200 concurrent bot games against local lila-ws | A regression budget recorded in `STATUS.md` |

---

## 7. Your weekly rhythm (< 5 h)

- **Session A (~1 h, e.g. at the weekend):**
  - Run `/status` to catch up, then `/next` to approve 2–3 issues.
  - Start `/ship` on each: the heavy full-stack one in Remote Control on your box, the self-contained
    ones in cloud sessions in parallel.
- **While Claude works:** nothing. Notifications reach your phone; answer questions only when asked.
- **Session B (~1–2 h, midweek):** for each PR, read the walkthrough, look at the screenshots, run the
  5-minute test, then merge or leave comments for Claude to address.
- **Monthly (~30 min):** read the `upstream-scout` report, decide which upstream fixes to port, and
  re-check this plan.

---

## 8. Licensing, brand and legal

- **Licence:** AGPL-3.0-or-later for the fork, keeping lichess's copyright notices.
  `COPYING.md` lists third-party code, including Apache-2.0 NOTICE text for anything derived from
  `goban` and MIT notices for strategygames, scalashogi, scalachess and goscorer. Once LiGo is public,
  a footer links to the source, as the AGPL requires.
- **Brand:** remove lichess's logo and lichess-only or CC BY-NC-SA assets. Credit lichess, lishogi,
  PlayStrategy, OGS and KataGo prominently on a credits page.
- **KataGo networks:** confirm the kata1 network licence before public use (the code is MIT).
- **Tsumego provenance:** every puzzle records its source.
  - Allowed: (a) positions generated by KataGo from game records whose licence we've verified
    (candidates: KataGo's published self-play and rating games, and later LiGo's own games);
    (b) our own transcriptions of public-domain classical collections (Gokyo Shumyo, Igo Hatsuyoron,
    Xuanxuan Qijing), made from original or public-domain sources rather than modern datasets,
    because the UK/EU database right can protect those datasets.
  - Never: problems from modern books.
- **UK Online Safety Act and UK GDPR:** not triggered while LiGo runs locally. **Before any public
  launch:**
  - an illegal-content risk assessment and a children's-access assessment;
  - ICO registration, a privacy notice and a subject-access-request process;
  - the Children's Code review;
  - re-enabling lila's kid mode, report, mod and shutup modules, with DMs off by default for minors
    when a social layer arrives. Go has many young players, so this matters.
- **Name:** LiGo shares its name with the LIGO observatory. Pick a distinctive domain and page titles
  ("LiGo — play Go online") when going public.

---

## 9. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| lila is huge and you can't review Scala in depth | High | Gates (§6), small PRs, plain-English walkthroughs, `/explain`, and a reviewer agent that learns recurring mistakes |
| Removing chess (Phase 3) drags on | High | The "quarantine then replace" order: every PR compiles, deletions are split from logic changes, and the demo target is deliberately small (9×9 casual Fischer) |
| Your time dips below 5 h/week | Medium | Phases are independent demos; state lives in `STATUS.md`, so restarting costs minutes; Claude can batch work into fewer, larger-but-mechanical PRs |
| Cloud VM (16 GB) can't compile lila reliably | Medium | Run Mongo with a small cache, compile module subsets, and route full-stack work to Remote Control on your 32 GB box |
| KataGo on the AMD GPU (OpenCL) is flaky | Low–Med | The CPU Eigen fallback always works for scoring; the queue boundary allows a remote worker later |
| Autoscore marks stones wrongly | Medium | Players confirm; toggling is live; resume play; accuracy benchmark as a gate; conservative thresholds (the OGS dual-map method) |
| Scoring-phase griefing or stalling | Medium | A scoring timeout with auto-accept, abandonment rules, and PlayStrategy's bug classes as tests |
| Missing upstream security fixes | Medium | The monthly `upstream-scout` report, with security fixes ported first |
| Licence contamination (tsumego, assets) | Low | The provenance rule, a licence check in CI (`meta.yml`), and a list of assets to avoid |
| Claude usage limits (Max 5x) slow things down | Medium | Sonnet for bulk work, Opus only for judgement; review agent usage after two weeks |

---

## 10. Decisions deferred (and what triggers them)

| Decision | Trigger |
|---|---|
| Japanese ko/cycle handling beyond superko | Phase 1 rules spec (the `go-rules-expert` proposes, you approve) |
| 9×9 stone value, and whether 9×9 counts less in the overall rating | Phase 5, then revisited after ~1,000 rated games |
| Final lobby presets | Phase 6 user test |
| Hosting provider, domain, public launch | POC demo complete |
| Funding model | After the POC |
| Publishing `scalago` / `goground` as standalone packages | After Phase 3 |
| In-browser KataGo (WebGPU/ONNX) for free local analysis | When post-game review is scheduled |

---

## 11. Immediate next steps

1. **You:** read this plan and `CLAUDE_SETUP.md`, and comment on anything you'd change, especially
   the proposed defaults in §3.3 (superko everywhere), §3.9 (OGS rank curve) and §4 (lobby presets).
2. **Claude, once you approve:** implement Phase 0 in the order given in `CLAUDE_SETUP.md` §13,
   ending with the dry-run PR.
3. **You, in parallel:** create the claude.ai cloud environment (the setup script comes from
   `dev/cloud-setup.sh` during Phase 0), install Claude Code on your Linux box, and enable Remote
   Control.
