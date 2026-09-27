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
- Starting `dockerd` from a script: detach it fully (`setsid nohup … </dev/null &`), or it holds the script's stdout open and the caller hangs after the script ends (2026-09-26, unit 0.3).
- Containers in cloud sessions can't use the egress proxy (its certificate isn't trusted inside them), so anything that downloads inside a container (sbt, pnpm, apt) fails there. That's why `dev/ligo` uses native mode in the cloud (ADR 0010) (2026-09-26, unit 0.3).
- `setsid` forks when the caller leads a process group, so `$!` is not the new session's pid. Have the child write `$$` to the pid file instead (2026-09-26, unit 0.3).
- Upstream lila tooling assumes `lila/` is its own git repo (e.g. `ui/build` runs `git rev-parse HEAD`). In containers, mount the monorepo's `.git` read-only and set `GIT_DIR` (2026-09-26, unit 0.3).
- There's no official Scala LSP plugin; Metals needs a custom `.lsp.json` plugin (2026-09-25, planning).
- Claude Code reloads `.claude/settings.json` while a session runs: hooks and deny rules apply as soon as the file is written, including to the session writing it (2026-09-26, unit 0.4).
- Hook input has `agent_type` (and `agent_id`) only when a subagent makes the call; the main thread has none. Checked in the CLI's own schema (v2.1.283) (2026-09-26, unit 0.4).
- Permission precedence is deny > ask > allow: an `ask` rule overrides a narrower `allow`, so `ask: git push *` would prompt on every unit-branch push (2026-09-26, unit 0.4).
- Playwright MCP wants its own browser build; in cloud sessions point it at `/opt/pw-browsers/chromium` (`dev/mcp-playwright.sh`) (2026-09-26, unit 0.4).
- A shell comment that starts with the word "shellcheck" is read as a shellcheck directive (2026-09-26, unit 0.4).

## Entries (newest first)
### 2026-09-27 · working agreement · Claude merges its own PRs (ADR 0011)
- Did: owner asked to let Claude merge without his approval. ADR 0011; CLAUDE.md, PLAN §1.1/§7,
  CLAUDE_SETUP §1/§3/§5/§6/§13/§14 and /ship (new step 10) updated. settings.json: `gh pr merge`
  and `mcp__github__merge_pull_request` moved from deny to allow; auto-merge stays denied.
  guard-bash now lets a PR merge through only as a squash-merge (blocks `--admin`, `--auto`,
  `--merge`, `--rebase`) and also guards the MCP merge tool (`merge_method` must be `squash`).
- Worked: `bats .claude/hooks/tests`: 47 passed (2 new tests). The settings change reloaded live:
  the MCP merge tool appeared in this session as soon as the deny rule was removed.
- Didn't work / dead ends: the reviewer found the first guard compared whole words, so
  `--admin=true`, `--auto=true`, `--merge=true` slipped through. Fixed: flags are now unpacked
  as `gh` reads them (`--flag=value`, bundled `-sm`), with tests. It also found PLAN §6 still had
  the owner checking "Needs your verification" before merging; now after the merge (Claude's
  default, put to the owner).
- Lessons: none new.
- Decisions: ADR 0011 (owner's request; the merge conditions are Claude's default, stated in the
  PR). Branch protection on `main` must not require an approving review.
- Needs owner verification: when adding "Require a pull request before merging" to the `main`
  ruleset, leave "Required approvals" at 0.

### 2026-09-26 · unit 0.4 · Claude config: CLAUDE.md, rules, settings, hooks, agents, skills, MCP, plugins
- Did:
  - `CLAUDE.md` (root, 60 lines, imports STATUS) plus `lila/`, `lila/ui/`, `lila-ws/` CLAUDE.md
    files. `lila/CLAUDE.md` says LiGo's rules win over `lila/AGENTS.md` (which Claude Code no
    longer auto-loads once a CLAUDE.md exists).
  - 8 path-scoped rules in `.claude/rules/` (scala, typescript, styles, tests, mongo, i18n,
    security, dependencies).
  - `.claude/settings.json`: permissions (allow / ask on dependency manifests, fixtures, rules
    spec, CI, licences, the hooks themselves / deny force-push, merge, secrets), hooks, status
    line, the `ligo-local` marketplace. `.claude/settings.local.json.example`.
  - 8 hooks in `.claude/hooks/` (session-start, guard-bash, guard-paths, format,
    conformance-related-tests, stop-gate, notify, statusline); the two guards' logic is Python in
    `hooks/lib/`. 45 bats tests in `hooks/tests/`. guard-bash ignores here-document bodies (file contents, not commands); guard-paths protects log entries that are on main, so a unit can still fix its own new entry.
  - 8 agents, 16 skills (6 user-only workflow skills, 6 shared, 4 knowledge). /verify has a real
    gate runner, `.claude/skills/verify/verify.sh`, that picks gates from the changed paths.
  - `.mcp.json`: Playwright (via `dev/mcp-playwright.sh`, pinned 0.0.82), MongoDB read-only
    (pinned 3.0.4, telemetry off), context7 (HTTP).
  - `tools/claude-plugins/`: local marketplace with `ligo-metals` (Metals `.lsp.json`).
  - `dev/ligo db` (Mongo + Redis only; the SessionStart hook runs it); doctor checks python3,
    bats, shellcheck; cloud-setup installs bats + shellcheck; STATUS gets a "Current unit" section.
- Worked:
  - `bats .claude/hooks/tests`: 45 passed. `/verify` (6 gates) passed; a deliberately broken JSON
    file made it fail and record `fail`.
  - Live in this session, once settings.json existed: guard-bash blocked `rm -rf` outside the repo,
    guard-paths blocked a main-thread write to `docs/rules/`, and the deny rule removed the
    GitHub MCP merge tools.
  - SessionStart in the cloud: planned and ran `dev/ligo deps` then `dev/ligo db` in the
    background; Mongo and Redis came up and lila's indexes were created.
  - Playwright MCP navigated a page with the cloud Chromium; the Mongo MCP listed the 86 lila
    collections and exposes no write tools with `--readOnly`.
  - `claude plugin validate tools/claude-plugins` passed.
- Didn't work / dead ends: Playwright MCP's default browser (`chrome`, then
  `chrome-for-testing`) isn't installed in cloud sessions, hence the wrapper script.
  The JSON Schema for settings.json couldn't be fetched here (schemastore), so settings were
  checked by the live reload instead.
- Lessons: promoted (settings reload, agent_type, permission precedence, Playwright browser,
  shellcheck comments).
- Decisions: "Continue." (owner) taken as approval of unit 0.4, the next unit in the build order.
  Choices the spec left open are listed in the PR for the owner to confirm.
- Verified by Claude: the above. Not verified: the Metals plugin (no Metals here), notify.sh on a
  desktop, the Stop hook and status line as drawn by the Claude Code UI, and the new agents and
  skills as invoked by a fresh session (they load at session start). The skills were written
  following skill-creator's authoring guide but not run through its eval loop.
- Needs owner verification: open a new Claude Code session on your box and check it starts
  oriented (unit, questions, logs) and the status line shows; `/plugin` lists `ligo-local`.
- Follow-ups: unit 0.6 runs the hook tests in `meta.yml`; nested CLAUDE.md files for `libs/`,
  `services/scoring` and `tools/puzzles` come with their units; `libs/conformance/fast-check.sh`
  comes with the first rules unit.

### 2026-09-26 · unit 0.3 · Owner's baseline run on the Linux box (docker mode)
- Did: the owner ran `dev/ligo up` then `dev/ligo e2e` on his Fedora box, in docker mode, from a
  path containing a space (`~/VScode Projects/LiGo`).
- Worked: after one fix (below), `up` completed, lila booted (log ends with Mongo connections and
  "Done tagging 0 puzzles"), `e2e` passed and the lichess home page showed on http://localhost:8080.
- Didn't work / dead ends: the first `up` failed in the ui container: `ui/build` runs
  `git rev-parse HEAD`, and `lila/` has no `.git` of its own in the monorepo. Fixed by mounting the
  repo's `.git` read-only with `GIT_DIR` set (commit 3e12835). `up` also now treats the UI as
  built only once `public/compiled/manifest.json` exists, so a half-finished build is redone.
- Lessons: promoted (upstream tools that assume lila is its own git repo).
- Decisions: none.
- Verified by Claude: the fix's git lookup from outside the repo and `dev/tests/run.sh` (16 passed);
  the container itself was verified by the owner. Needs owner verification: pasting
  `dev/cloud-setup.sh` into the cloud environment's Setup script.
- Follow-ups: none new.

### 2026-09-26 · unit 0.3 · dev/ tooling: ligo, doctor, cloud setup, trimmed lila-docker
- Did:
  - `dev/lila-docker/`: trimmed copy of lichess-org/lila-docker @ cbba92c7 (compose, Dockerfiles,
    configs), pointed at our lila/ and lila-ws/, lila-ws built from source, named Mongo volumes;
    changes listed in its README. Plus `compose.native.yml` (Mongo + Redis only).
  - `dev/ligo`: up/down/status/logs/compile/test/e2e/deps/verify-mirror/doctor, in docker mode
    (default on your machine) or native mode (default in cloud sessions). ADR 0010.
  - `dev/cloud-setup.sh`: Node 24.20.0 (SHASUMS256 checked) + pnpm 12.3.4, sbt 2.0.9 (sha256
    checked), ADR 0008's repositories/mirror files and resolver override, Mongo/Redis image pulls,
    then `dev/ligo deps` if the repo is present and time allows.
  - `dev/ligo deps` automates ADR 0008 steps 2–3: the Maven Central SHA-1 cross-check (remembered
    in `.ligo/mirror-verified.txt`, rerun after every sbt command in the cloud) and the ab-stub
    tarball install, with the lockfile restored even if interrupted.
  - `dev/doctor.sh`, `dev/tests/run.sh` (16 fast checks incl. shellcheck), README "Run it",
    COPYING (dev/lila-docker is AGPL-3.0), UPSTREAM, STATUS, CLAUDE_SETUP §12.1/§14.
- Worked (all in a fresh cloud session, native mode):
  - `dev/cloud-setup.sh`: 32 s from nothing (no repo step); 47 s rerun with a warm repo.
  - `dev/ligo deps`: pnpm installs with the ab-stub workaround (sha512 matched the lockfile), sbt
    update for lila and lila-ws through the mirror; cross-check 846/846 matched Maven Central.
  - `dev/ligo up` cold: 5 min 13 s (UI build, both compiles, Mongo indexes); lila compile shows
    the baseline's 17 `[warn]` lines. Warm restart: 52 s.
  - `dev/ligo e2e`: home page 200 ("lichess.dev • Free Online Chess"), lobby websocket 101.
    After `down` it fails as it should.
  - `dev/ligo test ws`: 9 passed. `dev/ligo test ui`: 237 passed. `dev/tests/run.sh`: 16 passed.
  - Docker mode, partly: both compose files validate; Mongo replica set (primary + secondary),
    Redis, Caddy (serving lila-docker's 502 page) and the index scripts ran with the docker-mode
    compose file.
- Didn't work / dead ends:
  - Docker mode's lila, lila-ws and ui containers can't be tested in the cloud: containers don't
    trust the egress proxy's certificate (TLS failures), so sbt/pnpm/apt can't download there.
    The owner's Linux-box run is docker mode's real test.
  - First `dev/ligo down` left lila and lila-ws running: `setsid` had forked, so the recorded pid
    was a zombie. Fixed (the child writes its own pid) and retested: nothing left after `down`.
  - The first setup run hung after finishing, because the dockerd it started held stdout. Fixed.
- Lessons: promoted (dockerd detach, containers vs proxy, setsid pid).
- Decisions: owner's "Continue work on the project" taken as approval of unit 0.3. Trimmed copy
  vs clone-on-demand for lila-docker: owner chose the trimmed copy (ADR 0010, Accepted). KataGo moved from the setup script to
  unit 0.5 (its download hosts aren't allowed yet).
- Verified by Claude: the above, with real output. Not verified: `dev/ligo test lila` (not
  run; lila's test suite is long), docker mode end to end, the setup script from the
  environment's own Setup script box.
- Needs owner verification: on your Linux box, `dev/ligo doctor`, `dev/ligo up`, then
  `dev/ligo e2e` and a look at http://localhost:8080; paste `dev/cloud-setup.sh` into the cloud
  environment's Setup script.
- Follow-ups: unit 0.4 adds a SessionStart hook running `dev/ligo deps`; unit 0.5 adds KataGo
  and the environment's env vars; LiGo needs its own DB seed later (lila-db-seed is chess data).

### 2026-09-26 · unit 0.2 · Cloud build environment for lila
- Did: installed sbt 2.0.9 (official tarball), Node 24.20.0 (nodejs.org, SHASUMS256 verified) + pnpm via corepack; configured `~/.sbt/repositories` (Google Central mirror + jitpack + lila-maven ×2 + central.sonatype.com snapshots + sbt plugin releases) and `~/.config/coursier/mirror.properties`; ran the ab-stub tarball workaround; ran the verification workflow.
- Worked: everything built and ran (details in upstream-fork.md); mirror cross-check 918/918.
- Didn't work / dead ends: coursier's native `cs` ignores the proxy truststore; its JVM launcher broke on skipped (429) jars; `pnpm store add` doesn't satisfy GitHub-hosted deps (they're keyed by URL, not integrity); a verifier agent's `git lfs install` in the real repo (cleaned up: 4 hooks, the `[lfs]` config section, `.git/lfs`).
- Lessons: promoted to the Lessons section (GitHub proxy, mirror cross-check, sbt 2 server, agent cwd reset).
- Decisions: ADR 0008 (owner approved, after first use).
- Verified by Claude: tool versions and checksums; the repo's `.git/hooks` and config restored and a push dry-run works. Claude's own LFS before/after test (cloning from the repo path) recreated an empty `.git/lfs`, which was removed again. Needs owner verification: none, since these are cloud-only environment steps.
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
