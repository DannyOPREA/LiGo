# 0017. libs/board in lila's pnpm workspace; goban's board behind `mountBoard`
- Status: Accepted
- Date: 2026-09-28
- Decided by: Claude (own recommendation), under the owner's 2026-09-28 delegation ("Don't ask for
  my approval for anything, just work until I tell you to stop"). The owner can revisit it.

## Context
ADR 0014 chose npm `goban` for the board and left two things to Phase 2 (its unit 1.8
amendment): how `libs/board`, then its own small pnpm package with its own lockfile, joins lila's
pnpm workspace, and adding `goban` itself. Unit 2.1 wraps goban's SVG board for lila's pages.
lila's UI build (`lila/ui/.build`) bundles workspace packages with esbuild and type-checks them
with lila's TypeScript settings.

## Decision
- `libs/board` becomes a member of lila's pnpm workspace (`'../libs/board'` in
  `lila/pnpm-workspace.yaml`; pnpm accepts a member outside the workspace folder). Its packages
  (goban and goban-engine `8.3.226`, pinned exactly, plus test and lint tools) are pinned in
  `lila/pnpm-lock.yaml`; its own lockfile goes. Tooling and CI install it with lila's root
  (whose oxfmt and oxlint it lints with) by `pnpm install --frozen-lockfile --filter @ligo/board
  --filter lila`, and run its scripts from `lila/` with `--filter`. Docker mode mounts `libs/` into the ui container at `/libs`.
- The board is `mountBoard(el, config)` in `libs/board/src/board.ts` (TypeScript, lila's style),
  a chessground-like API: the page mounts it, the board reports the player's move, and the page
  (or the server) decides with `play` or `cancel`. It subclasses goban's `SVGRenderer`, overriding
  `sendMove`, and feeds moves to goban's own play code through a stand-in socket, as ADR 0014 said.
- Rule settings shared by the engine and the board move to `libs/board/src/rules.mjs`, which
  imports no goban package, so a page bundles goban's engine once.
- goban's plain board and stones only: its default look loads a wood picture from OGS's CDN, and
  its picture themes' licences are unchecked.
- The board's tests run in Chromium (Playwright) in the `rules` CI job.

## Consequences
- One lockfile and one copy of each package for lila and the board; lila's licence check sees
  goban; lila's pages will import `@ligo/board/board` like any workspace package (unit 2.2).
- `pnpm run` inside `libs/board` does not find the workspace (pnpm looks for it in parent folders)
  and would start a lockfile of its own: scripts run from `lila/` with `--filter`
  (libs/board/CLAUDE.md, dev/ligo).
- A change to `lila/pnpm-lock.yaml` now also runs the `rules` CI job.
- Docker mode can't run the board's browser tests (no Chromium in the ui container); CI and native
  mode do. Unit 2.4's screenshot tests need an answer for docker mode anyway.
- The rules job downloads Chromium (`playwright install --with-deps chromium`) on each run.

## Alternatives considered
- Keep `libs/board` a separate package and link it into lila (`link:`): two lockfiles and two
  installs, and goban would resolve from `libs/board/node_modules`, outside lila's licence check.
- Move the board into a `lila/ui/` package: splits the goban wrapper across two folders, against
  ADR 0014's "libs/board is the only code that touches goban".
- Test the board in jsdom: fast, but goban's drawing, sizing and pointer handling need a browser.
