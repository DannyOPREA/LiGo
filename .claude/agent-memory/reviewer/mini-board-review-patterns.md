---
name: mini-board-review-patterns
description: Reviewing Go mini boards (unit 3.19 slice): ownerPreview is a public API, client ply counting from lila-ws fen messages, DOM-testable miniBoard.ts
metadata:
  type: feedback
---

Checks that paid off reviewing 3.19's mini-board slice (2026-10-03):
- `JsonView.ownerPreview` is not just the lobby's JSON: also `/api/account/playing`, `Account.scala`,
  `Auth.scala`, `MobileApi` ongoingGames and the board API `EventStream` gameStart. Any field change
  there is an outward-facing API change; check the ADR amendment names those, not only "the lobby".
- Clocks inferred client-side from counting lila-ws `fen` messages undercount when >1 move lands
  between page render and `startWatching` (lila-ws re-sends only the latest stored position). lila's
  move event carries `ply`; lila-ws drops it.
- lila's ui test runner has a DOM: a scratch `.test.ts` importing `lib/src/view/miniBoard.ts` by absolute
  path runs under `node ui/test <abs path>` from lila/. Clock widgets keep the process alive: end with
  `process.exit(0)` and log via `fs.writeSync(2, ...)`. So "only checked on a scratch page" is a test gap.
- Grep `socket.in.fen` consumers (boot.ts, analyse socket.ts, lobby.ts) and its pubsub type.

**Why:** the unit's own tests covered only the pure SVG maths.
**How to apply:** 3.19 part 2, 5.5, 6.7, anything touching mini games or ownerPreview.
Related: [[round-ui-review-patterns]], [[core-type-migration-review-patterns]].
