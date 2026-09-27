# lila/ in LiGo

lichess's server (Scala 3 + lichess's Play fork), imported at the SHA in `docs/UPSTREAM.md` and
edited in place. It is a plain folder of the LiGo repo, not a git repo of its own.

## lila/AGENTS.md is upstream's guide, and LiGo's rules win

`AGENTS.md` is lichess's contributor guide. It is useful background (module layout, UI build), but
where it disagrees with LiGo, follow LiGo:

- Build, run and test through `dev/ligo` (repo root), not `./lila.sh` / `./ui/build` directly,
  unless a dev/ligo command doesn't cover what you need.
- `pnpm install --frozen-lockfile` only (dev/ligo does it). A lockfile or dependency change is a
  major decision: ask the owner.
- No `sbt clean` in cloud sessions (the rebuild takes too long and too much memory). No `bin/deploy`.
- "Trust these instructions" doesn't apply: if something is unclear or surprising, stop and ask.

## Architecture primer (for a Scala newcomer)

- `modules/<name>/src/main/`: ~90 modules, each a library with a strict dependency order
  (`build.sbt`, `project/Dependencies.scala`). `core` holds shared interfaces (`lila.core.*`) so
  modules depend on `core` rather than on each other.
- Each module has an `Env.scala`: its wiring, with dependencies passed in as constructor
  parameters and built with macwire's `wire[...]`. `app/Env.scala` assembles all module Envs.
- `Fu[A]` = `Future[A]`, `Funit` = `Future[Unit]` (`modules/core/src/main/lilaism/`). Never block
  on a Future (`Await`), never use `null`.
- Mongo via ReactiveMongo; case classes get BSON handlers (`modules/db`). Collections are named in
  each Env (`db(CollName("seek"))`).
- HTTP: `conf/routes` (+ `conf/*.routes`) → `app/controllers/*.scala`. Pages are scalatags code in
  `modules/*/src/main/ui/` and `app/views/`, not template files.
- i18n: English source strings in `translation/source/*.xml`; `modules/coreI18n/src/main/key.scala`
  is generated from them by `bin/i18n-file-gen.ts` (never hand-edit it). `translation/dest/` is
  crowdin output (never hand-edit).
- Realtime goes through lila-ws over Redis (`modules/socket`, `lila-ws/`).

## Which modules matter for Go

Adapted in later phases: `game`, `round`, `lobby`, `setup`, `pool`, `challenge`, `rating`,
`analyse`, `puzzle`, `user`, `pref`. Chess-only modules (fishnet, opening, explorer, relay, fide,
insight, etc.) get removed or left dormant per PLAN phases. Don't remove anything a unit doesn't list.

## Compile tips

- `dev/ligo compile lila` compiles everything; ~12 GB of memory. In cloud sessions compile only what
  you need where possible, and stop the sbt server afterwards (logs/tooling.md Lessons).
- Formatting: `./lila.sh scalafmtCheckAll` (/verify runs it for Scala changes).

## Logs to read

`logs/backend.md`, `logs/upstream-fork.md` (Lessons + latest entries only).
