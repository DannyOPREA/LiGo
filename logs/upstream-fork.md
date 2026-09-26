# Upstream fork log

## Lessons (curated, ≤ 30 lines — read this first)
- lila (Sept 2026): Scala 3.8.4, sbt 2.0.9, JDK 21, Pekko, ReactiveMongo, liplay; UI on Node ≥ 24, pnpm 12, TypeScript 7, esbuild, oxlint/oxfmt, stylelint, snabbdom 3.5.1 (2026-09-25, planning research).
- lila-docker states lila needs ~12 GB RAM to build; `.sbtopts` uses -Xmx8g (2026-09-25, planning research).
- lila gets ~10k commits a year, so staying mergeable isn't feasible; hard fork + monthly review (ADR 0001).
- Import with `git archive` and diff `git ls-files` against upstream afterwards: upstream tracks some files its own .gitignore ignores (2026-09-26, unit 0.2).
- Lishogi forked in July 2020 and is now frozen on Scala 2.13: a warning about how hard forks age (2026-09-25, planning research).

## Entries (newest first)
### 2026-09-26 · unit 0.2 · Import upstream snapshots + baseline build (IN PROGRESS, blocked)
- Did: imported lila @ b3f190be (2026-09-25) and lila-ws @ 24053fc0 (2026-09-22) as squashed snapshots via `git archive` (owner chose squashed over full history). Recorded SHAs in docs/UPSTREAM.md. Installed sbt 2.0.9 (official GitHub release tarball) and Node 24.20.0 (nodejs.org, checksum verified) + pnpm via corepack. Pulled mongo:7.0.28 from Docker Hub.
- Worked: the file lists match upstream exactly (lila 15,994 files, lila-ws 105). Node, pnpm, sbt launcher and the Mongo image all installed.
- Didn't work / dead ends:
  - `lila/public/data/bot/README.md` is tracked upstream despite lila's own `.gitignore` (`/public/data/*`); a plain `git add` skipped it and it had to be force-added. Lesson: after importing, always diff `git ls-files` against upstream.
  - Build blocked by the cloud network policy (403) on four hosts lila needs: `jitpack.io` (liplay sbt plugin, scalalib, scalachess — used by both lila and lila-ws), `repo.scala-sbt.org` (sbt plugin repo), `central.sonatype.com` (snapshot resolver) and `codeload.github.com` (the GitHub-hosted `ab-stub` npm package needed by `pnpm install`). Owner must add them to the environment's allowed domains.
  - Maven Central (`repo1.maven.org`, `repo.maven.apache.org`) randomly returns HTTP 429 to this environment (~1 in 6 requests). coursier's JVM launcher broke on it (a skipped jar left a conflicting classpath). Fix: Google's official Central mirror `maven-central.storage-download.googleapis.com/maven2` (0 × 429 in 30 requests) via `~/.config/coursier/mirror.properties` and `~/.sbt/repositories` + `-Dsbt.override.build.repos=true`. That file must also list lila's own resolvers (lila-maven on raw.githubusercontent.com, jitpack), or the override hides them.
- Lessons: promoted above.
- Decisions: squashed snapshot (owner, 2026-09-26). Waiting: network allowlist (owner action).
- Verified by Claude: file-list parity with upstream; Node checksum; tool versions. Not yet verified: compile, UI build, running server (blocked).
- Follow-ups: once hosts are allowed, run `pnpm install`, `./ui/build`, `sbt compile` (lila, lila-ws), start lila + lila-ws + Mongo + Redis, screenshot the homepage; then the owner repeats it on the Linux box. Bake the mirror config into dev/cloud-setup.sh in unit 0.3.
