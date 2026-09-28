# 0014. OGS goban from npm for the client-side rules, SGF and board
- Status: Accepted
- Date: 2026-09-28
- Decided by: Claude (own recommendation), under the owner's 2026-09-28 delegation ("Don't ask for
  my approval for anything, just work until I tell you to stop"). The owner can revisit it; option B
  below is the planned switch.

## Context
The browser needs Go rules (legal moves, captures, ko), SGF reading and a board that lila's
snabbdom views can use (PLAN §3.1 rows "Client-side rules + SGF" and "Board rendering"). Unit 1.2
spiked OGS's `goban` (Apache-2.0); the evidence and options are in
[the build-vs-buy memo](../build-vs-buy/client-board-and-rules.md). Its board ran inside a snabbdom
view on desktop and phone with tap-to-preview and confirm, its engine passed 203/203 of its own
tests, and ADR 0003's situational superko is available per game. The server (strategygames,
ADR 0012) stays the referee.

## Decision
Use the npm package `goban` (option A), not a vendored copy (option B):
- Pin an exact version (`8.3.226` at the time of the spike) in lila's pnpm workspace where
  `libs/board` is built; Node code (1.8's conformance harness, 1.3's scoring service) uses
  `goban-engine` at the same version.
- `libs/board` is the only code that touches goban. It subclasses the SVG renderer (overriding
  `sendMove`) and translates lila-ws messages to and from goban's move events.
- Every game passes its settings explicitly: `allow_superko: false`, `superko_algorithm: "ssk"`,
  komi, and the server's handicap stones as `initial_state` with `handicap: 0`.
- SGF import reads `SZ`, `KM` and `PL` itself; SGF download is produced by the server.
- COPYING.md carries goban's Apache-2.0 text and the MIT notice of goscorer (bundled inside goban,
  whose minified builds drop it) when the dependency lands.
- The board is lazy-loaded on game pages (about 100 KB gzipped).

The dependency itself is added by the first unit that needs it (1.8 or Phase 2's `libs/board`),
through the usual manifest permission prompt.

## Consequences
- Least code owned, and LiGo's board is the same one OGS uses, which helps the handoff.
- Upstream fixes arrive only when OGS publishes an npm release, which it does by hand and
  irregularly (the last was February 2026).
- The adapter relies on goban's protected `sendMove` and OGS's message names; a new release can
  break them. Pinning and adapter tests contain that.
- goban's superko check only looks back 30 moves. The conformance fixtures mark longer cycles as
  server-only, and we can offer OGS a patch making the limit configurable.
- Switch to option B (vendor the source into `libs/board`) if we need an unreleased fix, if the
  bundle size hurts on phones, or if a release breaks the adapter's entry points. The adapter
  boundary keeps lila's views out of that change.

## Alternatives considered
Vendor goban's source (B, runner-up), goban pinned to a git commit, Sabaki's go-board + sgf +
Shudan (C), building our own (D). See the memo.

## Amendment (2026-09-28, unit 1.8)
Two details of the decision above changed when the dependency landed; both are Claude's calls under
the owner's 2026-09-28 delegation (logs/decisions.md):
- `libs/board` is, for now, its own small pnpm package (`libs/board/package.json`, pinned
  `goban-engine@8.3.226`), not part of lila's pnpm workspace. It holds only the engine settings and
  their tests; the Phase 2 board unit decides how it joins lila's workspace and adds `goban`.
- Games pass `handicap: N` (not `handicap: 0`) together with the server's stones as
  `initial_state`, White to move and `free_handicap_placement: false`. goban places no stones of
  its own when `initial_state` is given, and its score count reads `handicap` for the Chinese
  compensation (docs/rules/spec.md §9, which the owner approved, supersedes the memo here).
