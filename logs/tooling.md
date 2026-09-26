# Tooling log

## Lessons (curated, ≤ 30 lines — read this first)
- Claude Code cloud sessions do not install plugins or start LSP servers, ignore `~/.claude/`, and keep no auto-memory across machines: everything that matters must be committed (2026-09-25, planning).
- Cloud VM: 4 vCPU / 16 GB / 30 GB, Ubuntu 24.04, JDK 21, Node 20–22, Docker, Redis; no sbt, MongoDB or Node 24 (2026-09-25, planning).
- `auto` permission mode can't be set from project settings, only from `~/.claude/settings.json` (2026-09-25, planning).
- The cloud network policy blocks some hosts (e.g. www.gnu.org). Fetch licence texts etc. from GitHub (`raw.githubusercontent.com`) instead (2026-09-26, unit 0.1).
- Cloud network policy also blocks jitpack.io, repo.scala-sbt.org, central.sonatype.com and codeload.github.com, all of which lila needs; they must be on the environment allowlist (2026-09-26, unit 0.2).
- Maven Central throttles this environment (random HTTP 429). Use Google's Central mirror (maven-central.storage-download.googleapis.com) via coursier mirror.properties + ~/.sbt/repositories (2026-09-26, unit 0.2).
- The native `cs` launcher ignores JAVA_TOOL_OPTIONS (PKIX failure behind the proxy); use the official sbt tarball from GitHub releases instead (2026-09-26, unit 0.2).
- Even with `codeload.github.com` allowed, the session's GitHub proxy refuses tarballs of repos not attached to the session. Public repos can still be *git-cloned*. For `ab-stub`: clone, `git archive --format=tar.gz --prefix=ab-stub-<sha>/`, and the sha512 equals the lockfile integrity (ADR 0008) (2026-09-26, unit 0.2).
- The Google Central mirror is trustworthy only because we cross-check: all 918 mirror artifacts matched Maven Central's own SHA-1s. coursier alone checks same-origin checksums only (2026-09-26, unit 0.2).
- sbt 2 runs as thin client + background server: after `compile` the server stays up holding ~9 GB. Stop it (`sbt shutdown` or kill) before `run`. Play dev `run` needs stdin kept open (`tail -f /dev/null | ./lila.sh run`) (2026-09-26, unit 0.2).
- Workflow/subagent Bash calls reset cwd to the repo root: one verifier ran `git lfs install` there and planted hooks that would break every push (cleaned up). Future agent prompts must demand absolute paths / `git -C <scratch>` and forbid tools that install hooks or global state (2026-09-26, unit 0.2).
- There's no official Scala LSP plugin; Metals needs a custom `.lsp.json` plugin (2026-09-25, planning).

## Entries (newest first)
### 2026-09-26 · unit 0.2 · Cloud build environment for lila
- Did: installed sbt 2.0.9 (official tarball), Node 24.20.0 (nodejs.org, SHASUMS256 verified) + pnpm via corepack; configured `~/.sbt/repositories` (Google Central mirror + jitpack + lila-maven ×2 + central.sonatype.com snapshots + sbt plugin releases) and `~/.config/coursier/mirror.properties`; ran the ab-stub tarball workaround; ran the verification workflow.
- Worked: everything built and ran (details in upstream-fork.md); mirror cross-check 918/918.
- Didn't work / dead ends: coursier's native `cs` ignores the proxy truststore; its JVM launcher broke on skipped (429) jars; `pnpm store add` doesn't satisfy GitHub-hosted deps (they're keyed by URL, not integrity); a verifier agent's `git lfs install` in the real repo (cleaned up: 4 hooks, the `[lfs]` config section, `.git/lfs`).
- Decisions: ADR 0008 (owner approved).
- Verified by Claude: tool versions and checksums; the repo's `.git/hooks` and config restored and a push dry-run works. Needs owner verification: n/a.
- Follow-ups: unit 0.3 turns all of this into `dev/cloud-setup.sh` + a SessionStart hook.


### 2026-09-26 · unit 0.1 · Repo bootstrap
- Did: LICENSE (AGPL-3.0 text taken from lila's repo), LICENSE-MIT, COPYING.md (AGPL for lila-derived, MIT for our own code), README, .gitignore, docs skeleton (STATUS, UPSTREAM, glossary, ADRs 0001–0006, build-vs-buy/rules/research READMEs), logs/ skeleton with path → log map, PR template, PLAN/CLAUDE_SETUP status updates.
- Worked: everything above; the AGPL text matches lila's LICENSE byte for byte (sha256 0d96a4ff…abcb0).
- Didn't work / dead ends: fetching the AGPL text from www.gnu.org was blocked by the cloud network policy, so we used lila's copy instead.
- Lessons: see the Lessons section (network policy).
- Decisions: owner approved the plan, defaults (ADRs 0003–0005) and MIT for own code (ADR 0006). `main` created at the approved-plan commit; repo to be made public for branch protection (see decisions.md).
- Verified by Claude: files present; markdown links resolve (checked with a script); licence text is identical to lila's. Needs owner verification: that you're happy with the licence split wording in COPYING.md (a legal judgement, not something Claude can settle).
- Follow-ups: owner makes the repo public, sets `main` as default and protects it (decided 2026-09-26: `main` created at d70e004); unit 0.2 (import upstream snapshots).

### 2026-09-25 · planning · Requirements interview and plan
- Did: interviewed the owner over 8 rounds; researched lichess/lishogi/PlayStrategy/OGS/KataGo prior art and current Claude Code features; wrote docs/PLAN.md and docs/CLAUDE_SETUP.md; revised them for reuse-first, per-area logging, non-commercial intent and the working agreement.
- Worked: background research agents in parallel with the interview kept the owner's waiting time low.
- Didn't work / dead ends: the first Claude Code research agent returned several inaccurate details (e.g. permission-rule syntax, plugin.json shape), so each fact was re-checked against the docs before use. Lesson: verify agent-reported tool facts against the primary docs.
- Decisions: see decisions.md (2026-09-25 entries).
- Verified by Claude: Claude Code facts checked against code.claude.com. Needs owner verification: n/a (plan approved 2026-09-26).
