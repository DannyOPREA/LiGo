# Upstream fork log

## Lessons (curated, ≤ 30 lines — read this first)
- lila (Sept 2026): Scala 3.8.4, sbt 2.0.9, JDK 21, Pekko, ReactiveMongo, liplay; UI on Node ≥ 24, pnpm 12, TypeScript 7, esbuild, oxlint/oxfmt, stylelint, snabbdom 3.5.1 (2026-09-25, planning research).
- lila-docker states lila needs ~12 GB RAM to build; `.sbtopts` uses -Xmx8g (2026-09-25, planning research).
- lila gets ~10k commits a year, so staying mergeable isn't feasible; hard fork + monthly review (ADR 0001).
- The baseline to keep: lila compile has 17 `[warn]` lines and 0 errors; `/storm` returns 500 on an empty DB (upstream behaviour). New warnings or 5xx responses after LiGo changes are ours (2026-09-26, unit 0.2).
- Snapshot imports copy only Git LFS *pointers*; drop inherited `filter=lfs` attributes or clones break for git-lfs users (ADR 0009) (2026-09-26, unit 0.2).
- Claude Code auto-loads `lila/AGENTS.md` (lichess's own agent guide) while LiGo has no CLAUDE.md; it doesn't govern LiGo (2026-09-26, unit 0.2).
- Import with `git archive` and diff `git ls-files` against upstream afterwards: upstream tracks some files its own .gitignore ignores (2026-09-26, unit 0.2).
- Lishogi forked in July 2020 and is now frozen on Scala 2.13: a warning about how hard forks age (2026-09-25, planning research).

## Entries (newest first)
### 2026-09-26 · unit 0.2 · Import upstream snapshots + baseline build — DONE (supersedes the "IN PROGRESS" entry below)
- Did:
  - Owner allowed the four blocked hosts. Built and ran the unmodified lila + lila-ws in a cloud
    session: `pnpm install --frozen-lockfile` (with the ab-stub workaround, ADR 0008) → `./ui/build`
    → `sbt compile` for both → Mongo 7.0.28 (Docker) + Redis → `./lila.sh run` + lila-ws `sbt run`.
  - Took desktop and phone screenshots (`docs/research/baseline/`).
  - Ran a 52-agent verification workflow: 6 independent verifiers, 2–3 skeptics per issue, and a
    completeness critic.
  - Fixed what it found: removed LFS attributes (ADR 0009); corrected COPYING (ADR 0007); recorded
    the cloud dependency sources (ADR 0008).
- Worked:
  - lila compile: 250 s, 87 units / 1,490 sources, 0 errors, 17 `[warn]` lines, all from upstream's
    `-Wunused:all` (10 unused `@nowarn`). Keep these as the baseline for later diffing.
  - lila-ws compile: 63 s, 85 sources, 0 errors (warnings: sbt lintUnused, duplicate `lila-maven`
    resolver name, 1 deprecation).
  - UI build: 22 s (esbuild, sass → 148 CSS files, tsc, i18n, manifest).
  - Running: `GET /` → 200 "lichess.dev • Free Online Chess". The lobby websocket to
    `ws://localhost:9664` opens and receives frames, no console errors, no reconnect banner, and the
    lila ⇄ lila-ws Redis link is up ("LILA BOOT", "LILA VERSIONING READY").
  - About 60 routes probed; only `/storm` returns 500 on an empty DB (upstream behaviour: no puzzles).
  - Import integrity: tree ids identical to upstream (lila `41d7ac5a…`, lila-ws `04bbd626…`),
    15,994 + 105 files, modes and symlinks equal.
  - The builds changed no tracked files; every output is gitignored.
- Didn't work / dead ends:
  - The 94 Git LFS pointer files under `lila/public/lifat` plus inherited `filter=lfs` made clones
    fail wherever git-lfs is installed (exit 128). Fixed by removing the attributes: exit 0 after,
    verified.
  - The imported snapshot contains non-free/NC upstream assets, contradicting COPYING. Fixed by
    documenting them and scheduling the strip as the first Phase 3 unit.
  - `lila/AGENTS.md` (upstream lichess contributor guide) is auto-loaded by Claude Code when reading
    files in `lila/`, because LiGo has no CLAUDE.md yet. Some of it conflicts with LiGo's rules
    ("trust these instructions", non-frozen `pnpm install`, `bin/deploy`). Treat it as upstream
    documentation; LiGo rules win. Unit 0.4's CLAUDE.md files fix it.
  - `main` protection currently blocks deletion and force-push only; "require a pull request"
    isn't enabled yet (owner action).
- Lessons: promoted to the Lessons section.
- Decisions: owner approved ADR 0007 (document + strip early), ADR 0008 (cloud dependency sources),
  ADR 0009 (remove LFS attributes), and moving the Linux-box check to the end of unit 0.3.
- Verified by Claude: all of the above, with real output (compile/UI/run logs, Playwright, tree-id
  comparison, 918/918 mirror artifacts matching Maven Central SHA-1s, the LFS clone before/after
  test).
- Needs owner verification: the baseline on your Linux box (after unit 0.3); a skim of the COPYING.md
  §1.1 wording (licensing is a judgement call).
- Follow-ups:
  - Unit 0.3 codifies ADR 0008 and gives you a one-command local run.
  - The first Phase 3 unit strips non-free assets (by directory, including inline logos, branded
    flair and Unsplash montages) and needs a free default sound set (your decision then).
  - Unit 0.4 adds the CLAUDE.md files, which neutralise `lila/AGENTS.md`.
  - The rebrand unit (0.7) repoints the AGPL §13 source links to LiGo's repo.
  - The "Li-" naming question gets checked before any public demo.
  - A second review pass (44 agents) found only documentation gaps, all fixed before the PR.

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
