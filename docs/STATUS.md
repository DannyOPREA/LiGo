# Status

_Updated at the end of every session (`/status`). Newest information wins._

## Current unit
- Phase 3 (under the owner's "work until I tell you to stop" delegation): units 3.1–3.20 in
  docs/PLAN.md §5, module map ADR 0018, design ADR 0019 (unit 3.9). 3.1 (PR #24), 3.2 (PR #28), 3.3 (PR #33) and 3.4 (PR #38)
  merged; 3.5 (engines, bots, insights, tutor) in review. The owner OK'd the bulk deletions of 3.1–3.7 on 2026-09-28. Logs: logs/upstream-fork.md. 3.18–3.20
  no longer wait on Phase 2 (merged 2026-09-29).

- Phase 4 (under the owner's "work until I tell you to stop" delegation): units 4.1–4.12 in
  docs/PLAN.md §5. 4.1–4.6 (design ADR, byo-yomi clock and scoring phase in `libs/go-rules`,
  `services/scoring`, the autoscore benchmark) need nothing from Phases 2–3 and run now; 4.7–4.12
  wait for Phase 3 units 3.12–3.20. Logs: logs/scoring.md, logs/clocks.md.

- Phase 5 (under the owner's "work until I tell you to stop" delegation): units 5.1–5.8 in
  docs/PLAN.md §5. 5.1 (design, ADR 0021, merged) and 5.2 (rating maths in `lila/modules/rating`) need nothing
  from Phases 3–4 and run now; 5.3–5.8 wait for Phase 3 units 3.11–3.20 (and 4.9). Log: logs/ratings.md.

- Phase 6 (under the owner's "work until I tell you to stop" delegation): units 6.1–6.10 in
  docs/PLAN.md §5. 6.1 (ADR 0022, PR #41) and 6.2 (auto-handicap pairing in `lila/modules/pool`,
  PR #43) merged; 6.3 (the player-test kit, run by you after 6.10) in review. 6.4–6.10 wait for
  Phase 3 units 3.15–3.20, 4.7, 4.9 and 5.3–5.7.
  Log: logs/lobby.md.

- Phase 7 (under the owner's "work until I tell you to stop" delegation): units 7.1–7.8 in
  docs/PLAN.md §5. 7.1 (design ADR), 7.2 (the analysis tree in `libs/board`) and 7.3 (the server's
  SGF reader in `libs/go-rules`) run now; 7.4–7.8 wait for Phase 3 units 3.12–3.20 and Phase 4 units
  4.8–4.12. Logs: logs/frontend.md, logs/rules-engine.md, logs/clocks.md.

- Phase 8 (under the owner's "work until I tell you to stop" delegation): units 8.1–8.8 in
  docs/PLAN.md §5. 8.1 (ADR 0024: puzzles LiGo generates and checks itself, plus a small classics tail, PR #49)
  merged; 8.2 (design ADR 0025: goban's own puzzle format and puzzle mode) in review; 8.3 (the `tools/puzzles` import
  pipeline), 8.4 (the first ≥ 200 puzzles) and 8.5 (goban's puzzle mode in `libs/board`) run
  now; 8.6–8.8 wait for Phase 3 units 3.11, 3.16, 3.18 and 3.20. Log: logs/tsumego.md.

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
- Your Phase 2 demo: docs/demos/phase-2.md.
- Phase 3 units 3.1–3.17 in order (they don't need Phase 2); 3.18–3.20 after Phase 2.
- Phase 0 acceptance items (CLAUDE_SETUP §14) not yet exercised: an /ask round-trip answered from
  your phone, a dependency-manifest edit hitting your permission prompt, and a Remote Control
  session starting oriented. They get exercised as Phase 1 units hit them.

## Waiting on owner
- Confirm the choices the spec left open in unit 0.4 (listed in PR #4).
- Add the `rules` job to the `main` ruleset's required checks.
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
- Upstream non-free/NC assets were removed in unit 3.1 (COPYING.md §1.1). The manifest text and the
  default background image URL still say lichess until unit 3.8.

## Phase progress
| Phase | State |
|---|---|
| 0. Claude setup + baseline | done (units 0.1–0.7, PRs #1–#8) |
| 1. Build-vs-buy + rules integration | done (units 1.1–1.9) |
| 2. Board integration | done (units 2.1–2.4, PRs #19, #23, #25, #27) |
| 3. Fork & de-chess | split into units 3.1–3.20 (ADR 0018); 3.1–3.4 and 3.9 merged; 3.5 in review (you approved the deletions for 3.1–3.7) |
| 4. Go-native game | split into units 4.1–4.12 (PLAN §5); 4.1–4.6 under way, 4.7–4.12 wait for Phase 3 |
| 5. Accounts & ratings | split into units 5.1–5.8 (PLAN §5); 5.1–5.2 under way, 5.3–5.8 wait for Phases 3–4 |
| 6. The lobby | split into units 6.1–6.10 (PLAN §5); 6.1–6.2 merged (ADR 0022), 6.3 in review, 6.4–6.10 wait for Phases 3–5 |
| 7. Correspondence, SGF, analysis | split into units 7.1–7.8 (PLAN §5); 7.1–7.3 under way, 7.4–7.8 wait for Phases 3–4 |
| 8. Tsumego | split into units 8.1–8.8 (PLAN §5); 8.1–8.5 under way, 8.6–8.8 wait for Phase 3 |
| 9 | not started |
