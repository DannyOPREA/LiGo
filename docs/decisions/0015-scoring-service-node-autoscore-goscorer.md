# 0015. Scoring as a Node service: KataGo + goban autoscore + goscorer
- Status: Accepted
- Date: 2026-09-28
- Decided by: Claude, under the owner's 2026-09-28 delegation ("Don't ask for my approval for
  anything, just work until I tell you to stop"). Claude's own recommendation; the owner can revisit
  it with a superseding ADR.

## Context
After two passes LiGo proposes dead stones and a score, players accept, toggle or resume, and every
toggle is recounted under Japanese or Chinese rules (PLAN §3.1, §3.6, §4.2). Unit 1.3 spiked OGS's
pipeline in plain Node ([the build-vs-buy memo](../build-vs-buy/scoring.md)): `goban-engine`'s
`autoscore` on OGS's 31 autoscore test games reproduces all 31 on OGS's stored ownership maps and
gets 29/31 on maps from our own KataGo (b6, b10 and a full-size b20 network); KataGo's own GTP dead
list gets 21–22/31; goscorer (bundled in `goban-engine`) counts both rulesets, seki included.
strategygames (ADR 0012) only counts area, so it cannot score Japanese games.

## Decision
Option A of the memo: `services/scoring` is a small Node (TypeScript) process between Redis and
KataGo.
- It asks KataGo's analysis engine for two ownership maps (black to move, white to move), runs
  `goban-engine`'s `autoscore` for the dead stones and needs-sealing points, and counts with
  goscorer through `GobanEngine.computeScore()`.
- It is the only score authority: it computes both the proposal and every recount after a toggle,
  and lila stores what it returns. strategygames' own dead-stone phase and area count are not used
  for results. Players' browsers never submit a score.
- `goban-engine` is pinned to an exact npm version (8.3.226 at the time of the spike) in the
  service's own `package.json` and lockfile; COPYING.md gets its Apache-2.0 notice plus the MIT
  notices of goscorer and eventemitter3, which its bundle includes without their notices.
- The proposal shown to players is stored, never silently recomputed (KataGo's multi-threaded
  search is not deterministic); recounts use goscorer only.
- The service is built in Phase 4. That phase decides the lila ⇄ service message (the plan's
  `moves`/`komi`/`handicap` versus OGS's board-plus-komi-7.5; prisoners come from lila), the
  no-KataGo fallback in Node, and checks the full-size network's licence before pinning one.

## Consequences
- The same code OGS runs, with OGS's 31-game test set as a first regression test, and little of our
  own beyond glue.
- A third process (after lila and lila-ws) for `dev/ligo`, the docker setup and CI to start and
  supervise.
- goban's npm releases lag its repository; upgrades mean bumping the pin and re-running the test set.
- Accuracy on real games is measured by the Phase 4 benchmark (≥ 97%) with the b18 network on the
  owner's GPU; the cloud's small networks only give a floor (29/31).

## Alternatives considered
KataGo's own dead list (B), a Scala port of autoscore and goscorer inside lila (C, runner-up), no AI
(D, kept as the fallback), GNU Go (E), strategygames' area count (F). See the memo.
