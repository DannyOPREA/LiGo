# 0008. Dependency sources in cloud sessions
- Status: Accepted
- Date: 2026-09-26
- Decided by: owner, on Claude's recommendation

## Context
Building lila in Claude Code cloud sessions hit three environment problems (unit 0.2):
- Maven Central (`repo1.maven.org`, `repo.maven.apache.org`) randomly answers HTTP 429 to the
  session's shared egress (~1 in 6 requests).
- lila declares `oss.sonatype.org` snapshots, which is blocked by policy and has been dead since
  Sonatype shut OSSRH down (2025-06-30).
- The session's GitHub proxy refuses `codeload.github.com` tarball downloads for repos not attached
  to the session, and lila's UI depends on the GitHub-hosted npm stub `lichess-org/ab-stub`.

These workarounds were first used during unit 0.2 to unblock the build, before the owner had approved
them. The owner reviewed and approved them afterwards, together with the verification results below.

## Decision
In **cloud sessions only** (your own machine uses the normal sources):
1. Resolve Maven Central through **Google's Maven Central mirror**
   (`https://maven-central.storage-download.googleapis.com/maven2/`) via `~/.sbt/repositories` with
   `-Dsbt.override.build.repos=true` and `~/.config/coursier/mirror.properties`. The repositories file
   lists every other resolver lila and lila-ws declare, except the dead `oss.sonatype.org`.
2. **Cross-check every artifact fetched from the mirror against the SHA-1 Maven Central publishes**
   (coursier only checks same-origin SHA-1s, which catches corruption but not substitution).
   On 2026-09-26 all 918 artifacts matched.
3. For `ab-stub`: shallow-clone the pinned commit through the git proxy, build the tarball with
   `git archive --format=tar.gz --prefix=ab-stub-<sha>/ <sha>` (its sha512 equals the lockfile
   integrity), temporarily point only that lockfile `tarball:` URL at the local file for
   `pnpm install --frozen-lockfile`, then restore the lockfile.

Unit 0.3 codifies all three in `dev/cloud-setup.sh` / the SessionStart hook.

## Consequences
- Builds are reproducible in the cloud without editing any upstream file.
- The mirror is a trust dependency, bounded by the origin-checksum cross-check.
- pnpm's `node_modules/.pnpm/lock.yaml` records the local tarball path; harmless, but fresh
  sessions must repeat step 3 (automated in 0.3).

## Alternatives considered
Retry loops against Maven Central (coursier's JVM launcher broke on skipped jars); vendoring the
ab-stub tarball into the repo (adds a binary to the repo for a cloud-only problem).
