# Status

_Updated at the end of every session (`/status`). Newest information wins._

## Current unit
- Phase 3 (under the owner's "work until I tell you to stop" delegation): units 3.1–3.20 in
  docs/PLAN.md §5, module map ADR 0018, design ADR 0019 (unit 3.9). 3.1 (PR #24), 3.2 (PR #28), 3.3 (PR #33), 3.4 (PR #38),
  3.5 (PR #46), 3.6 (PR #56), 3.7 (PR #65), 3.8 (PR #67), 3.10 (PR #66), 3.11 (PR #68), 3.12 (PR #72),
  3.13 (PR #73), 3.14 (PR #75), 3.15 (PR #77), 3.16 (PR #80) and 3.18 (PR #74) merged; 3.19's mini-board slice (Go mini boards in game lists, TV, the lobby and profiles) in review. The owner OK'd the bulk deletions of 3.1–3.7 on 2026-09-28. Logs: logs/upstream-fork.md. 3.18–3.20
  no longer wait on Phase 2 (merged 2026-09-29).

- Phase 4 (under the owner's "work until I tell you to stop" delegation): units 4.1–4.12 in
  docs/PLAN.md §5. 4.1–4.11 merged (4.7 PR #87, 4.8 PR #101, 4.9 PR #104, 4.10 PR #113, 4.11
  PR #99); 4.12 (the demo: a scripted two-game play-through in CI, and your checklist
  docs/demos/phase-4.md) in review.
  Logs: logs/scoring.md, logs/clocks.md.

- Phase 5 (under the owner's "work until I tell you to stop" delegation): units 5.1–5.8 in
  docs/PLAN.md §5. 5.1 (ADR 0021, PR #37), 5.2 (rating maths, PR #39), 5.4's signup half (PR #70)
  and 5.3 (rated Go games move ratings with handicap, PR #76) merged; 5.4's account page (PR #85) merged;
  5.5 part 1 (PR #90), 5.6 (the profile in Go ranks, PR #93), 5.7 (rated games: server PR #109, setup windows PR #115) and 5.5 part 2 (the one Go leaderboard, PR #120) merged; 5.8 (the Phase 5 demo: `lila/tests/e2e-demo/phase5-demo.spec.ts` and your checklist docs/demos/phase-5.md) in review. Log: logs/ratings.md.

- Phase 6 (under the owner's "work until I tell you to stop" delegation): units 6.1–6.10 in
  docs/PLAN.md §5. 6.1 (ADR 0022, PR #41) and 6.2 (auto-handicap pairing in `lila/modules/pool`,
  PR #43) and 6.3 (the player-test kit, run by you after 6.10, PR #45) merged. 6.4's first part
  (pools play Go: board size, Go perf, 5 s waves, the Go pairing score, even games) in review; its
  second part waits for 4.7, 4.9, 5.3 and 5.7. 6.5–6.10 wait for 3.19, 3.20, 4.9, 5.5 and 5.7.
  Log: logs/lobby.md.

- Phase 7 (under the owner's "work until I tell you to stop" delegation): units 7.1–7.8 in
  docs/PLAN.md §5. 7.1 (design ADR), 7.2 (the analysis tree in `libs/board`) and 7.3 (the server's
  SGF reader in `libs/go-rules`) run now; 7.4–7.8 wait for Phase 3 units 3.12–3.20 and Phase 4 units
  4.8–4.12. Logs: logs/frontend.md, logs/rules-engine.md, logs/clocks.md.

- Phase 8 (under the owner's "work until I tell you to stop" delegation): units 8.1–8.8 in
  docs/PLAN.md §5. 8.1 (ADR 0024: puzzles LiGo generates and checks itself, plus a small classics tail, PR #49)
  and 8.2 (design ADR 0025: goban's own puzzle format and puzzle mode, PR #53) merged; 8.3 (the `tools/puzzles`
  generator and pipeline, PR #59) and 8.4 (the first 240 puzzles, PR #62) merged; 8.5 (goban's puzzle mode in
  `libs/board`, PR #64) merged; 8.6 (puzzles on the server, `dev/ligo puzzles load`, PR #89) merged;
  8.7 (the trainer page, PR #95) merged; 8.8 part one (the demo on the built page, docs/demos/phase-8.md, PR #106) merged; part two (the same walk on the real stack) in review. Log: logs/tsumego.md.

- Phase 9 (under the owner's "work until I tell you to stop" delegation): units 9.1–9.10 in
  docs/PLAN.md §5. 9.1 (ADR 0026, PR #57), 9.2 (sounds, PR #58), 9.3 (board themes, PR #60) and
  9.4 (keyboard and screen-reader play, PR #61), 9.5 (the performance budget check, PR #63) and
  9.6 (the installable app, PR #69) merged; 9.8 (the credits page) in review. 9.7,
  9.9 and 9.10 are parked: they wait for Phase 3 units 3.18 and 3.20 and for Phases 4–8's pages. Logs: logs/frontend.md,
  logs/board-ui.md.

## Now
- **Phase 0 — Claude Code setup + baseline.**
  - Units 0.1–0.3 merged (PRs #1–#3; #1 as a merge commit, #2–#3 squashed). `dev/ligo` runs the stack: docker mode on your
    machine (ADR 0010), native mode in cloud sessions. Baseline verified on your Linux box.
  - Unit 0.4 (Claude config): merged (PR #4, merge commit). Root and nested CLAUDE.md files, 8 path rules,
    `.claude/settings.json` (permissions + hooks), 8 hooks with 45 bats tests, 8 agents,
    16 skills, `.mcp.json` (Playwright, read-only Mongo, context7), a local plugin marketplace
    with a Metals LSP plugin. See `logs/tooling.md`.
  - Working agreement: Claude now squash-merges its own PRs once the checks pass (ADR 0011).
  - Unit 0.5 (environments): merged (PR #6). `dev/ligo katago install | smoke | bench` installs
    KataGo v1.18.1 (checksum-pinned), a network, and records a benchmark; the cloud setup script
    and the SessionStart hook install the CPU build; `dev/ligo doctor` checks KataGo, OpenCL and
    the benchmark. Cloud sessions use KataGo's small test network until katagotraining.org is
    allowed. The OpenCL benchmark on your box is still to run (below).
  - Unit 0.6 (CI): merged (PR #7). GitHub Actions runs `lila` (lila scalafmt + tests, lila-ws
    tests + check), `ui` (lint, format, build, tests, CodeQL) and `meta` (hook bats tests, dev/ checks,
    shellcheck, log check, COPYING.md-on-manifest-change, npm licences, PR template sections).
    Jobs for untouched areas are skipped. rules/e2e/nightly workflows come with later units.
  - `main` ruleset (you, 2026-09-27): PR required (0 approvals), the 9 CI jobs required. Checked on PR #8.
  - Unit 0.7 (dry run): rebrand lichess to LiGo: site name, page titles, AGPL source links, /source page (PR #8, merged).
- **Phase 1 — build-vs-buy + rules integration** started 2026-09-27; units listed in docs/PLAN.md §5.
  - Unit 1.1: server-side Go rules and byo-yomi clock come from strategygames as a pinned dependency
    with the other games excluded (ADR 0012, PR #9). The dependency lands with the adapter (1.7).
  - Unit 1.3: scoring is a Node service (`services/scoring`, Phase 4) around KataGo, goban's
    autoscore and goscorer (ADR 0016, PR #11). Claude's call under your 2026-09-28 delegation;
    autoscore got 29/31 of OGS's test games with the cloud's networks.
  - Unit 1.4: ratings use lila's own Glicko-2 with OGS's Glicko-2 settings plus goratings' rank
    curve and handicap maths (9×9 stone = 6 ranks) (ADR 0013, PR #12). The glue lands in Phase 5.
  - Unit 1.2: the client-side rules, SGF reading and the board come from OGS `goban` on npm, pinned,
    wrapped by `libs/board` (ADR 0014, PR #10). Claude chose it under your 2026-09-28 delegation;
    revisit any time. The dependency lands with Phase 2's `libs/board` unit (and 1.8's harness).
  - Unit 1.5: the rules spec (docs/rules/spec.md) is approved, all 11 choices as recommended
    (PR #13). It follows the recommended options of memos 1.2–1.4
    ("Depends on memo" notes; 1.2, 1.3 and 1.4 all went as recommended).
  - Unit 1.6 (conformance fixtures): format, checker and 130 cases (strategygames, goban, KataGo,
    LiGo's own) in `libs/conformance/`, checked against the approved spec (PR #14).
  - Unit 1.7 (server rules adapter): `libs/go-rules` over strategygames passes all 115 server
    fixtures under both rulesets, with property and SGF tests, `dev/ligo test rules` and a `rules`
    CI workflow (PR #15). Its two questions (adapter owns resume and its limit; SGF read-back in
    1.8) were decided by Claude under your 2026-09-28 delegation. Merged.
  - Unit 1.8 (client rules harness): `libs/board` sets up goban-engine 8.3.226 with LiGo's rules;
    it passes all 95 client fixtures (5 known gaps), reads back all 227 server SGF games, and agrees
    with the server on 80 seeded random games (16,100 actions). `dev/ligo test rules` and the `rules`
    CI job run both engines and the parity check (PR #17).
  - Unit 1.9 (nightly differential test): random games played by `libs/go-rules` and followed by
    KataGo, compared on legal points, captures and area score. 1,000 games all agree; the
    `nightly-differential` workflow plays 1,000 new ones every night (`dev/ligo differential` runs
    it in a cloud session). This closes Phase 1.
  - Your PR #16 (no more approval prompts, ADR 0015) merged.
- **Phase 2 — board integration** split into four units on 2026-09-28 (docs/PLAN.md §5, "Phase 2
  units"): 2.1 the goban board in `libs/board`, 2.2 a playground page, 2.3 the touch-confirm
  setting, 2.4 visual snapshots and the demo. All build on unit 1.8's `libs/board`.
  - Unit 2.1 (the board): `mountBoard` in `libs/board` wraps goban's SVG board (goban 8.3.226,
    plain theme); libs/board is now in lila's pnpm workspace (ADR 0017); 17 browser tests in the
    `rules` CI job (PR #19, merged).
  - Unit 2.2 (playground): `/playground`, a local game for both colours on lila's page, board
    loaded lazily (PR #23, merged).
  - Unit 2.3 (touch-confirm): a "Confirm moves" preference; the playground shows a Confirm move
    button when it applies (PR #25, merged).
  - Unit 2.4 (snapshots + demo): 16 playground screenshots (board + page) and a scripted game in the `ui` CI job,
    `dev/ligo test pages`, and your demo checklist docs/demos/phase-2.md (PR #27, merged). This closes
    Phase 2.

## Next
- Your Phase 4 demo: docs/demos/phase-4.md (two browsers, Sabaki, the benchmark on your GPU).
- Your Phase 2 demo: docs/demos/phase-2.md.
- Phase 3 units 3.1–3.17 in order (they don't need Phase 2); 3.18–3.20 after Phase 2.
- Phase 0 acceptance items (CLAUDE_SETUP §14) not yet exercised: an /ask round-trip answered from
  your phone, a dependency-manifest edit hitting your permission prompt, and a Remote Control
  session starting oriented. They get exercised as Phase 1 units hit them.

## Waiting on owner
- Confirm the choices the spec left open in unit 0.4 (listed in PR #4).
- Add the `rules` job to the `main` ruleset's required checks (and `puzzles`, unit 8.3).
- Paste `dev/cloud-setup.sh` into the cloud environment's Setup script (Project settings). It now
  also installs bats, shellcheck and KataGo (CPU).
- Cloud network allowlist: add `media.katagotraining.org` (full-size KataGo networks) and
  `mcp.context7.com` (the context7 MCP server).
- On your box (unit 4.6): the b18 checksum is pinned and its licence checked (MIT-style,
  2026-09-29). Run `dev/ligo katago install
  opencl` (should say verified), `dev/ligo katago smoke`, `dev/ligo katago bench`,
  `LIGO_MODE=native dev/ligo scoring bench --gate 97`. The bench runs on the host, so it needs host
  Node 24 and pnpm, and `pnpm install --frozen-lockfile` once in `lila/`.

## Blockers
- None.

## Known caveats
- `lila/AGENTS.md` (lichess's contributor guide) stays in the tree. Claude Code no longer loads it
  on its own now that CLAUDE.md files exist, and `lila/CLAUDE.md` says LiGo's rules win where it
  disagrees; `guard-bash.sh` blocks non-frozen `pnpm install`, cloud `sbt clean` and `bin/deploy`.
- Upstream non-free/NC assets were removed in unit 3.1 (COPYING.md §1.1). Unit 3.8 rebranded the
  English text of the kept pages; other languages, and strings of removed features, still say
  Lichess until the translations are tidied up.

## Phase progress
| Phase | State |
|---|---|
| 0. Claude setup + baseline | done (units 0.1–0.7, PRs #1–#8) |
| 1. Build-vs-buy + rules integration | done (units 1.1–1.9) |
| 2. Board integration | done (units 2.1–2.4, PRs #19, #23, #25, #27) |
| 3. Fork & de-chess | split into units 3.1–3.20 (ADR 0018); 3.1–3.15 merged; 3.19 part 1 in review (you approved the deletions for 3.1–3.7) |
| 4. Go-native game | split into units 4.1–4.12 (PLAN §5); 4.1–4.11 merged, 4.12 (the demo) in review |
| 5. Accounts & ratings | split into units 5.1–5.8 (PLAN §5); 5.1–5.7 merged, 5.8 (the demo, docs/demos/phase-5.md) in review |
| 6. The lobby | split into units 6.1–6.10 (PLAN §5); 6.1–6.3 merged (ADR 0022), 6.4 part one in review, the rest wait for Phases 3–5 |
| 7. Correspondence, SGF, analysis | split into units 7.1–7.8 (PLAN §5); 7.1–7.3 under way, 7.4–7.8 wait for Phases 3–4 |
| 8. Tsumego | split into units 8.1–8.8 (PLAN §5); 8.1–8.7 and 8.8 part one merged, 8.8 part two in review |
| 9. PWA, polish & handoff | split into units 9.1–9.10 (PLAN §5); 9.1–9.6 merged, 9.8 in review; 9.7, 9.9, 9.10 wait for Phases 3–8 |
