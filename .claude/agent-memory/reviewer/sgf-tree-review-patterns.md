---
name: sgf-tree-review-patterns
description: Review patterns for libs/board's @sabaki/sgf analysis-tree reader/writer (unit 7.2) and later SGF readers (7.3)
metadata:
  type: project
---

Found in unit 7.2 review (2026-09-29):
- Stray `libs/board/pnpm-lock.yaml` + `pnpm-workspace.yaml` (from a pnpm run inside libs/board, outside lila's workspace) left untracked; check `git status` for them on every libs/board / services/scoring dep change.
- Root node B/W/AE are in the "read" list but never used: moves in the root silently vanish. Always probe `(;SZ[9]B[ee];W[cc])` and `AB[ee]AE[ee]`.
- @sabaki/sgf drops all-lowercase property ids (`sz[9]b[ee]` reads as empty 19x19), though it maps `AddBlack`→`AB`. Compare against the server reader's lower-case handling (ADR 0023 §3).
- Quadratic hot spots on 200 KB input: `array.includes` dedupe in AB rectangles (8 s), spread-append merging of moveless nodes (12 s). Time pathological inputs, not just "200 KB of moves".
- Writer lossiness to probe: multiple C joined, N[a][b] from merges, HA[1] dropped, duplicate marks after twin merge.

**Why:** these were the non-obvious gaps; the unit's own tests all passed.
**How to apply:** rerun these probes on 7.3 (Scala reader) and 7.4 (analysis page) reviews. See [[review-patterns-general]].

Found in unit 7.3 review (server reader, 2026-09-29), all via a two-reader probe (node script over
libs/board/src/sgf.mjs + a temporary munit test reading the same JSON list; fast, do it first):
- Scala imports only the main line but the browser's readTree validates every variation: an illegal
  variation is stored by the server yet won't open on the board. Probe `(;SZ[9];B[ee](;W[dd])(;W[ee]))`.
- readTree merges moveless nodes and twin moves, so its main line differs from "first child":
  `(;SZ[9](;C[n])(;B[ee]))`, `(;SZ[9](;B[ee])(;B[ee];W[dd]))`.
- Collection edges differ: text after the record (JS refuses lowercase words anywhere), `()` before or
  after, `((;`, `(B[ee])` without `;`, a value before any name.
- Char classes: Scala isLetter/isWhitespace/isDigit are Unicode, JS regexes ASCII (`Bé[ee]`, U+001C,
  U+00A0, `HA[２]`); JS Number vs Scala BigDecimal for komi precision.
- Value-less properties (`;B;`, `TE`) make readTree throw a TypeError, not SgfError.

Found in unit 4.11 review (lila SGF export, 2026-10-04):
- A new export format must keep lila's anti-cheat move delay: PGN/JSON call `applyDelay(..., flags.keepDelayIf(game.playable))`; a new SGF path writing `go.actions` in full leaks a live game's last moves. Grep every new formatter for applyDelay.
- Map every lila Status that sets a winner (Resign, Outoftime, Timeout, Cheat, NoStart via Finisher) to an RE; NoStart was missed.
- Explicit format on a game that can't produce it (non-Go + format=sgf) returned 200 empty body; bulk path fell back to PGN. Check single vs bulk parity.
- testQuick logs show Total 0; rerun with `sbt --server --batch "<proj>/testOnly <Class>"` in lila/.
