---
name: round-ui-review-patterns
description: Reviewing ui/round on libs/board (unit 3.18) — in-flight move state, flag race, scratch ctrl probes, plan-order deps
metadata:
  type: feedback
---

Checks that paid off reviewing unit 3.18 (round page on goban, 2026-09-30):
- libs/board's `awaiting` state (move reported, not yet played back) is lost on remount. A page that
  remounts to look back (jump) must track its own "move in flight" or the player can send a second
  move after back/forward. Also `set({movable:'none'})` is a no-op while awaiting: the unsent stone stays drawn.
- lila's chess `endWithData` used chessground's local turnColor to detect "my move didn't reach the
  server before I flagged"; ported to `d.game.player` it never fires (server data only flips on echo).
- Probe ctrl behaviour without touching the repo: copy tests/ctrl.test.ts harness to the scratchpad,
  import src with absolute `.ts` paths, run `node --test --test-force-exit` with ui/.test's
  `--loader ./.test/resolve.mts --import ./.test/setup.mts --conditions=source` from lila/ui.
  Don't `pkill -f <name>` — it kills your own shell (exit 144).
- PLAN §5 "Needs" column: a unit landing before its listed deps (3.18 before 3.13/3.14) is a plan
  deviation; check logs/decisions.md records it, not just the area log's follow-ups.

**Why:** fake-board unit tests and a stand-in-server e2e both pass while these real-board paths break.
**How to apply:** any unit wiring libs/board into a server-driven page (round, analysis, puzzles).
Related: [[goban-engine-wrapper-review-patterns]], [[lila-edit-review-patterns]].
