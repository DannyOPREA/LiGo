# Status

_Updated at the end of every session (`/status`). Newest information wins._

## Current unit
- none (every unit in docs/PLAN.md §5, 0.1–9.10, has merged; the last, 6.9, as PR #138 on
  2026-10-04). Under your "work until I tell you to stop" delegation nothing new starts until you
  pick what comes after the POC (PLAN §5, "After the POC").
- One piece of 9.7 is left: deleting the chess board and piece pictures nothing uses any more. It
  waits on you (below).
- Logs: each phase's log in logs/README.md; the handoff write-up is docs/handoff/README.md.

## Now
- The POC is built. What it does, what it reuses and what is left: docs/handoff/README.md.
- Each phase has a demo that runs in CI (the `e2e` workflow, on PRs labelled `e2e` and nightly) and
  a checklist for your own hands in docs/demos/ (below).
- PR-by-unit record of everything that merged: the "Phase progress" table at the end of this file.

## Next
- Your checks and demos (the "Waiting on owner" list below), in any order.
- Then your call on what comes after the POC (PLAN §5): hand it to OGS (docs/handoff/for-ogs.md;
  contacting OGS is yours), keep improving it as a demo, or pick up later features (PLAN §1.3).

## Waiting on owner
None of these block anything; they are the checks only your hands can do.
- **Chess pictures (9.7):** pick one of the three options in the "Plan Phase 9 units" thread: add a
  `git rm` permission rule yourself, run the `git rm` yourself, or leave the ~6 MB of unused files.
- **Phase demos on your box:** docs/demos/phase-2.md to phase-9.md. Phase 4 includes Sabaki and the
  KataGo GPU benchmark; phase 6 ends with the lobby player test (docs/research/lobby-test/, needs
  real players); phase 9 is your Go-club checklist (the phone install, the offline page).
- **A live game:** two browsers, stones including a capture, two passes, accept the count. Report in
  the "Build unit 3.18 round UI" thread.
- **KataGo on your GPU (4.6):** `dev/ligo katago install opencl` (should say verified),
  `dev/ligo katago smoke`, `dev/ligo katago bench`, `LIGO_MODE=native dev/ligo scoring bench --gate 97`
  (needs host Node 24, pnpm, and `pnpm install --frozen-lockfile` once in `lila/`).
- **The handoff package:** read docs/handoff/README.md and say if anything is wrong or missing. The
  demo videos are the `ligo-demo-video` artifact of an `e2e` run (Actions tab).
- **GitHub settings:** add `rules`, `scoring` and `puzzles` to the `main` ruleset's required checks
  (https://github.com/DannyOPREA/LiGo/settings/rules); optionally turn on private vulnerability
  reporting (https://github.com/DannyOPREA/LiGo/settings/security_analysis).
- **Cloud environment:** paste `dev/cloud-setup.sh` into the Setup script (Project settings); allow
  `media.katagotraining.org` and `mcp.context7.com` on the network allowlist.
- **Unit 0.4:** confirm the choices the spec left open (listed in PR #4).
- **Each PR's "Needs your verification" list** (PRs #65–#139 have the most).
- Optional: delete the leftover `wip-*` branches on GitHub (cloud sessions can't delete branches).

## Blockers
- None.

## Known caveats
- `lila/AGENTS.md` (lichess's contributor guide) stays in the tree. Claude Code no longer loads it
  on its own now that CLAUDE.md files exist, and `lila/CLAUDE.md` says LiGo's rules win where it
  disagrees; `guard-bash.sh` blocks non-frozen `pnpm install`, cloud `sbt clean` and `bin/deploy`.
- Upstream non-free/NC assets were removed in unit 3.1 (COPYING.md §1.1). Unit 3.8 rebranded the
  English text of the kept pages; other languages, and strings of removed features, still say
  Lichess until the translations are tidied up.
- LiGo has never run in public: a public site first needs the legal steps in PLAN §8.
- Cloud sessions can't download strategygames (the proxy answers 403), so the lila compile, lila
  tests and go-rules gates of `/verify` run in CI only there.

## Phase progress
Every unit, with its merged PR(s). All merged by 2026-10-04.

| Phase | Units and PRs | Demo |
|---|---|---|
| 0. Claude setup + baseline | 0.1–0.3 #1–#3 · 0.4 #4 · 0.5 #6 · 0.6 #7 · 0.7 #8 (also ADR 0011 #5) | 0.7's dry run |
| 1. Build-vs-buy + rules integration | 1.1 #9 · 1.2 #10 · 1.3 #11 · 1.4 #12 · 1.5 #13 · 1.6 #14 · 1.7 #15 · 1.8 #17 · 1.9 #21 | nightly differential test |
| 2. Board integration | 2.1 #19 · 2.2 #23 · 2.3 #25 · 2.4 #27 | docs/demos/phase-2.md |
| 3. Fork & de-chess | 3.1 #24 · 3.2 #28 · 3.3 #33 · 3.4 #38 · 3.5 #46 · 3.6 #56 · 3.7 #65 · 3.8 #67 · 3.9 #22 · 3.10 #66 · 3.11 #68 · 3.12 #72 · 3.13 #73 · 3.14 #75 · 3.15 #77 · 3.16 #80 · 3.17 #97, #105, #103, #107, #98, #119 · 3.18 #74 · 3.19 #79, #88, #114 · 3.20 #123 | docs/demos/phase-3.md |
| 4. Go-native game | 4.1 #29 · 4.2 #30 · 4.3 #31 · 4.4 #32 · 4.5 #34 · 4.6 #35, #50 · 4.7 #87, #111 · 4.8 #101 · 4.9 #104 · 4.10 #113 · 4.11 #99 · 4.12 #122 | docs/demos/phase-4.md |
| 5. Accounts & ratings | 5.1 #37 · 5.2 #39 · 5.3 #76 · 5.4 #70, #85 · 5.5 #90, #120 · 5.6 #93 · 5.7 #109, #115 · 5.8 #132 | docs/demos/phase-5.md |
| 6. The lobby | 6.1 #41 · 6.2 #43 · 6.3 #45 · 6.4 #78, #112 · 6.5 #108 · 6.6 #118 · 6.7 #82, #131 · 6.8 #127 · 6.9 #138 · 6.10 #134 | docs/demos/phase-6.md (ends with your player test) |
| 7. Correspondence, SGF, analysis | 7.1 #44 · 7.2 #48 · 7.3 #54 · 7.4 #91, #96, #110 · 7.5 #125 · 7.6 #117 · 7.7 #124, #136 · 7.8 #135 | docs/demos/phase-7.md |
| 8. Tsumego | 8.1 #49 · 8.2 #53 · 8.3 #59 · 8.4 #62 (240 puzzles) · 8.5 #64 · 8.6 #89 · 8.7 #95 · 8.8 #106, #126 | docs/demos/phase-8.md |
| 9. PWA, polish & handoff | 9.1 #57 · 9.2 #58 · 9.3 #60 · 9.4 #61 · 9.5 #63 · 9.6 #69 · 9.7 #84, #92, #100, #102, #121, #128, #129, #130 (chess pictures wait on you) · 9.8 #71 · 9.9 #133, #137 · 9.10 #139 | docs/demos/phase-9.md (Go-club checklist) |
