# LiGo — Claude Code setup (Phase 0)

> Companion to [`PLAN.md`](PLAN.md). Everything in this document is built and verified
> **before** any Go feature work starts. Facts about Claude Code were checked against
> code.claude.com docs on 2026-09-25; re-verify anything marked *(verify)* while implementing.

---

## 1. Design principles

1. **Everything lives in the repo.** Cloud sessions start from a fresh clone and ignore your
   `~/.claude/` config, auto-memory is machine-local, and cloud sessions **do not install plugins
   or start LSP servers**. So every agent, skill, hook, rule and MCP server that matters is committed
   under `.claude/`, `.mcp.json` and `CLAUDE.md` files. Plugins are strictly local-only extras.
2. **Gates beat trust.** You are new to Scala and have < 5 h/week, so you cannot be the line-by-line
   reviewer. Correctness is enforced by machines, in layers:
   shared rules conformance fixtures → unit/property tests → CI required checks → an independent
   `reviewer` subagent → a Playwright play-test with screenshots attached to every UI PR →
   a plain-English "what changed and how to check it" section you can verify in 5 minutes.
3. **Tests are the spec, and implementers can't edit the spec.** Rules fixtures under
   `libs/conformance/` may only be changed by the `go-rules-expert` agent (enforced by a hook), so an
   implementer can never "fix" a failing rules test by changing the expected answer.
4. **Small context, loaded on demand.** Root `CLAUDE.md` stays under ~150 lines. Detail lives in
   nested `CLAUDE.md` files (loaded when Claude reads files in that directory), path-scoped
   `.claude/rules/`, and skills (loaded only when relevant).
5. **State lives in files, not in heads.** `docs/STATUS.md` (where we are), GitHub Issues (backlog),
   `docs/decisions/` ADRs (why). Any session, cloud or local, can pick up cold in one minute —
   essential when you work in short bursts.
6. **One PR = one reviewable unit.** Aim for ≤ ~400 lines of hand-written change. Mechanical
   deletions (e.g. removing chess modules) go in their own PRs so they can be skimmed.
7. **You merge; Claude never does.** Branch protection on `main`, deny rules and a guard hook make
   this physically impossible to get wrong.

---

## 2. Where Claude runs

| Mode | Use it for | Notes |
|---|---|---|
| **Remote Control on your Linux box** (primary) — `claude --remote-control "LiGo"` inside `tmux` | Full-stack work: lila + lila-ws + Mongo + Redis + KataGo on your AMD GPU, E2E play-tests, anything touching several services | You steer from the Claude mobile app or claude.ai/code, execution stays on your 32 GB machine. Local plugins (TypeScript LSP, Metals) work here. Best fit for "< 5 h/week, both web + local". |
| **Cloud sessions** (claude.ai/code, `claude --cloud`) | Parallel, self-contained tasks: rules engines, `goground`, UI components, docs, tests, puzzle pipeline, targeted lila module compiles | VM = 4 vCPU / 16 GB RAM / 30 GB disk, Ubuntu 24.04, JDK 21, Node 20–22, Docker, Redis preinstalled; **no sbt, no MongoDB, no Node 24 (lila's UI needs it), no plugins/LSP** — the setup script adds what's missing. lila says it needs ~12 GB to build (its `.sbtopts` uses `-Xmx8g`), so a full compile fits only with Mongo's cache capped and nothing else heavy running; prefer per-module compiles here. KataGo runs CPU-only. |
| **Local terminal** | Interactive debugging, manual play-testing in your own browser | Same config as Remote Control. |

---

## 3. What gets created (file tree)

```
CLAUDE.md                          # root: mission, map, commands, workflow, gates (<150 lines)
.mcp.json                          # Playwright, MongoDB (read-only), context7
.claude/
  settings.json                    # permissions, hooks, env, local-marketplace declaration
  settings.local.json.example      # what you copy to settings.local.json on your box
  rules/                           # path-scoped rules (frontmatter `paths:`)
    scala.md  typescript.md  styles.md  tests.md  mongo.md  i18n.md  security.md
  agents/
    go-rules-expert.md  lila-backend.md  lila-frontend.md  test-engineer.md
    reviewer.md  katago-engineer.md  upstream-scout.md
  skills/
    next/  ship/  verify/  play-test/  explain/  status/  adr/  upstream-port/  katago-setup/   # workflows
    lila-backend/  lila-ui/  go-rules/  sgf/                                             # knowledge
  hooks/
    session-start.sh  guard-bash.sh  guard-paths.sh  format.sh
    goops-related-tests.sh  stop-gate.sh  notify.sh  statusline.sh
    tests/                         # bats tests for every hook (hooks are code too)
  agent-memory/                    # committed: reviewer / rules-expert learnings (memory: project)
  state/                           # gitignored: verify stamps, caches
tools/claude-plugins/              # repo-local marketplace for local-only plugins
  .claude-plugin/marketplace.json
  ligo-metals/                     # Scala LSP (Metals) wrapper: .claude-plugin/plugin.json + .lsp.json
dev/
  ligo                             # one CLI for humans and Claude: up/down/compile/test/e2e/doctor
  docker-compose.yml               # mongo, redis (+ optional katago-worker)
  cloud-setup.sh                   # versioned copy of the cloud environment setup script
  doctor.sh                        # checks toolchain, services, KataGo, disk, RAM
docs/
  PLAN.md  CLAUDE_SETUP.md  STATUS.md  UPSTREAM.md  glossary.md
  decisions/0001-*.md …            # ADRs
  rules/                           # the authoritative LiGo rules spec (JP + CN), human-readable
lila/CLAUDE.md  lila/ui/CLAUDE.md  lila-ws/CLAUDE.md
libs/scalago/CLAUDE.md  libs/goops/CLAUDE.md  libs/goground/CLAUDE.md
services/katago-worker/CLAUDE.md  tools/puzzles/CLAUDE.md
.github/
  pull_request_template.md         # What/Why · Plain-English walkthrough · How to test (≤5 min) · Screenshots · Risks
  workflows/                       # §12
```

---

## 4. CLAUDE.md hierarchy

### 4.1 Root `CLAUDE.md` (draft outline, keep < 150 lines)

```markdown
# LiGo — a lichess-style Go server (hard fork of lichess-org/lila)

Owner: solo product owner, new to Scala — explain Scala/FP choices in plain English in PR descriptions.
Current phase and next steps: @docs/STATUS.md
Plan: `docs/PLAN.md` · Claude setup: `docs/CLAUDE_SETUP.md` · Go glossary: `docs/glossary.md`

## Repo map
- lila/            app server (Scala 3, Play, MongoDB) + lila/ui (TypeScript, snabbdom, SCSS)
- lila-ws/         websocket server (Scala 3)
- libs/scalago     authoritative Go rules, SGF, scoring (Scala 3)
- libs/goops       client Go rules + SGF (TypeScript) — must agree with scalago
- libs/goground    board UI library (TypeScript)
- libs/conformance shared rules fixtures (JSON) consumed by BOTH engines
- services/katago-worker  KataGo bridge for dead-stone/score proposals
- tools/puzzles    tsumego import + generation pipeline
- dev/ligo         the ONLY way to build/run/test — prefer it over raw commands

## Commands
./dev/ligo up | down | compile [module] | test [path] | e2e [spec] | doctor

## Non-negotiables
- Never push to main, never force-push, never merge. Work on a branch; open a PR.
- Run /verify before claiming anything works. Paste real output, never "should work".
- Rules behaviour is defined by libs/conformance fixtures + docs/rules. If code and
  fixture disagree, the code is wrong — escalate to the go-rules-expert agent.
- No new chess-isms: board size, rules, komi, handicap and clocks come from the game, never constants.
- Every PR description has: What/Why · Plain-English walkthrough · How to test (≤5 min) · Screenshots (UI) · Risks.
- Update docs/STATUS.md at the end of a session (/status).

## Domain in one breath
Moves are intersections or pass; captures by liberties; ko/superko per ruleset;
game ends on two consecutive passes → scoring phase (KataGo proposes dead stones,
both players accept or resume). Rulesets: Japanese (territory) and Chinese (area).
Clocks: byo-yomi and Fischer. Ratings: Glicko-2 displayed as kyu/dan; one overall pool.
```

### 4.2 Nested `CLAUDE.md` files (loaded on demand)

| File | Contents |
|---|---|
| `lila/CLAUDE.md` | lila architecture primer (modules + `Env` wiring, `Fu`/`Funit`, BSON handlers, routes, scalatags views, i18n keys), which chess modules are removed / quarantined / pending, compile tips (`SBT_OPTS`, compiling one module) |
| `lila/ui/CLAUDE.md` | ui build, package layout, snabbdom patterns, SCSS themes/variables, how `goground` is wired into `ui/round` and `ui/analyse`, websocket client |
| `lila-ws/CLAUDE.md` | message protocol, where round/lobby messages flow, load considerations |
| `libs/scalago/CLAUDE.md`, `libs/goops/CLAUDE.md` | "conformance first" workflow, API shape, performance notes (bitboards/union-find), SGF |
| `libs/goground/CLAUDE.md` | chessground-style API (config/state/events/redraw), rendering model, touch rules |
| `services/katago-worker/CLAUDE.md` | TypeScript/Node worker: KataGo analysis-engine JSON protocol, the ported OGS autoscore + goscorer, OpenCL vs CPU configs, Redis queue protocol, accuracy benchmark |

### 4.3 Path-scoped rules (`.claude/rules/*.md`)

Each file has `paths:` frontmatter so it only loads when Claude touches matching files. Example:

```markdown
---
paths:
  - "**/*.scala"
---
# Scala rules
- Scala 3 syntax consistent with surrounding lila code (indentation-based where lila uses it).
- No `null`, no `var` in domain code, no blocking in request paths; use Fu/Funit like lila.
- New Mongo fields need a BSON handler, a default for old documents, and a note in docs/STATUS.md.
- Explain any non-obvious Scala feature (givens, opaque types, extension methods) in the PR walkthrough.
```

Planned rule files: `scala.md`, `typescript.md` (strict TS, no `any`, snabbdom idioms), `styles.md`
(SCSS variables/themes, mobile-first, touch targets ≥ 44 px), `tests.md` (test naming, fixtures,
no sleeps in E2E), `mongo.md` (indexes, migrations), `i18n.md` (English source strings via i18n keys,
never hard-coded), `security.md` (CSRF, auth checks, rate limits on new endpoints, no secrets in logs).

---

## 5. `.claude/settings.json` (draft)

```json
{
  "permissions": {
    "allow": [
      "Bash(./dev/ligo *)",
      "Bash(sbt *)", "Bash(pnpm *)", "Bash(npx vitest *)", "Bash(npx playwright *)",
      "Bash(docker compose *)", "Bash(scalafmt *)", "Bash(oxfmt *)", "Bash(oxlint *)", "Bash(stylelint *)",
      "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)", "Bash(git show*)",
      "Bash(git switch *)", "Bash(git checkout -b *)", "Bash(git add *)", "Bash(git commit *)",
      "Bash(git push -u origin claude/*)", "Bash(git push -u origin feat/*)",
      "Bash(gh pr create *)", "Bash(gh pr view *)", "Bash(gh issue *)",
      "mcp__playwright", "mcp__mongodb"
    ],
    "ask": [
      "Bash(git push *)", "Bash(docker system prune*)", "Bash(sbt clean*)",
      "Edit(./.github/workflows/**)", "Edit(./LICENSE*)", "Edit(./COPYING*)"
    ],
    "deny": [
      "Bash(git push --force*)", "Bash(git push -f*)", "Bash(git push origin main*)",
      "Bash(gh pr merge*)", "Bash(git reset --hard origin/main*)",
      "Read(./.env)", "Read(./.env.*)", "Read(./**/secrets/**)"
    ]
  },
  "hooks": { "…": "see §6" },
  "statusLine": { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/statusline.sh" },
  "extraKnownMarketplaces": {
    "ligo-local": { "source": { "source": "directory", "path": "./tools/claude-plugins" } }
  }
}
```

Notes:
- Permission prefix rules are convenient but not airtight; the `guard-bash.sh` hook (§6) is the real
  enforcement for dangerous git/Mongo/file operations.
- `auto` permission mode **cannot** be set from project settings. On your Linux box put
  `"permissions": {"defaultMode": "auto"}` in `~/.claude/settings.json` (fall back to
  `acceptEdits` if auto mode isn't available); cloud sessions honour `auto`/`acceptEdits`.
- Plugins are enabled per machine in `.claude/settings.local.json` (see §10), not here, because
  cloud sessions ignore them anyway.
- JVM memory comes from lila's own `.sbtopts` (`-Xmx8g`), not from settings; the cloud setup caps
  MongoDB's cache instead of shrinking the heap.
- The optional status line shows: branch · current phase (from `STATUS.md`) · last `/verify` result ·
  open PR number, so you can see state at a glance on any surface.

---

## 6. Hooks

All hook scripts live in `.claude/hooks/`, are referenced via `"$CLAUDE_PROJECT_DIR"/.claude/hooks/…`,
are idempotent, finish fast, and have bats tests in `.claude/hooks/tests/` run in CI.

| Event (matcher) | Script | What it does | Why |
|---|---|---|---|
| `SessionStart` (`startup\|resume`) | `session-start.sh` | Detects cloud (`$CLAUDE_CODE_REMOTE=true`) vs local. Ensures sbt/scalafmt exist (installs via coursier if the cloud cache is stale), starts Mongo + Redis with `docker compose up -d` (idempotent), runs `pnpm install --frozen-lockfile` only if the lockfile hash changed. Prints the "Now / Next / Blockers" section of `docs/STATUS.md`, current branch and any open PR for it — stdout becomes Claude's context. | Every session, cloud or local, starts ready and oriented in < 1 min of your time. |
| `SessionStart` (`compact`) | `session-start.sh --after-compact` | Re-injects STATUS "Now" + the active task's acceptance criteria. | Long sessions don't lose the plot after compaction. |
| `PreToolUse` (`Bash`) | `guard-bash.sh` | Blocks (exit 2 + reason): force pushes; any push/merge targeting `main`; `git reset --hard` / `git clean -fdx` on `main`; `rm -rf` outside the repo or scratch dirs; dropping any Mongo database except `ligo_test*`; `sbt clean` in cloud sessions (costs ~10 min). | Hard guarantees that don't depend on the model obeying `CLAUDE.md`. |
| `PreToolUse` (`Edit\|Write`) | `guard-paths.sh` | Reads `agent_type` from the hook input. Denies edits to `libs/conformance/fixtures/**` and `docs/rules/**` unless `agent_type == go-rules-expert`; denies edits to ADRs whose status is `Accepted` (supersede instead); denies edits under `lila/public/compiled/**` and other generated output. | Protects the spec from the implementer; keeps history honest. |
| `PostToolUse` (`Edit\|Write`) | `format.sh` | Formats only the touched file with the formatter lila already configures: `scalafmt` (native binary, not sbt) for `.scala`, `oxfmt` + `oxlint` for `.ts`, `stylelint --fix` for `.scss`. Exit 2 with the remaining errors on stderr so Claude sees and fixes them. | Formatting and trivial lint never reach review or CI. |
| `PostToolUse` (`Edit\|Write`, async + `asyncRewake`) | `goops-related-tests.sh` | When a file under `libs/goops/` or `libs/conformance/` changes, runs `vitest related --run` in the background; exit 2 wakes Claude with failures. | Instant rules feedback without blocking edits. |
| `Stop` | `stop-gate.sh` | If code changed since the last successful `/verify` stamp in `.claude/state/`, blocks the stop once with "run /verify (or state why it isn't needed)". Respects `stop_hook_active` to avoid loops. | Stops "done!" claims without evidence. |
| `Notification` | `notify.sh` | Local only: `notify-send` (and Remote Control already pushes to your phone). No-op in cloud. | You don't babysit the terminal. |

`settings.json` hooks block (shape):

```json
"hooks": {
  "SessionStart": [
    { "matcher": "startup|resume", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-start.sh" }] },
    { "matcher": "compact", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-start.sh --after-compact" }] }
  ],
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-bash.sh" }] },
    { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-paths.sh" }] }
  ],
  "PostToolUse": [
    { "matcher": "Edit|Write", "hooks": [
      { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/format.sh" },
      { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/goops-related-tests.sh", "async": true, "asyncRewake": true }
    ]}
  ],
  "Stop": [ { "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/stop-gate.sh" }] } ],
  "Notification": [ { "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/notify.sh" }] } ]
}
```

---

## 7. Subagents (`.claude/agents/`)

Model policy for a Max 5x plan: **Opus** for judgement (rules, review), **Sonnet** for bulk
implementation, **Haiku** for scouting. Adjust after two weeks by looking at usage.

| Agent | Model | Tools | Preloaded skills | Role |
|---|---|---|---|---|
| `go-rules-expert` | opus | Read, Grep, Glob, Edit, Write, Bash | `go-rules`, `sgf` | Owns `docs/rules/` and `libs/conformance/fixtures/` (the only agent allowed to edit them — hook-enforced). Answers any question about ko/superko, seki, scoring (JP/CN), handicap placement, komi, dead-stone edge cases. Designs fixtures before implementation. `memory: project`. |
| `lila-backend` | sonnet | all | `lila-backend`, `verify` | Implements Scala 3 / Play / Mongo / lila-ws changes following lila idioms. Writes the Scala-novice walkthrough for its changes. |
| `lila-frontend` | sonnet | all | `lila-ui`, `verify` | TypeScript/snabbdom/SCSS in `lila/ui` and `libs/goground`; mobile-first; takes screenshots via Playwright MCP. |
| `test-engineer` | sonnet | all | `verify`, `go-rules` | Turns acceptance criteria into failing tests first (munit + ScalaCheck, vitest, Playwright). Never edits fixtures. |
| `reviewer` | opus | Read, Grep, Glob, Bash (read-only intent) | `verify` | Adversarial review of the branch diff against the issue, `docs/rules`, CLAUDE.md rules, security (auth/CSRF/rate limits), websocket hot-path performance, Mongo indexes, missing tests. Re-runs gates itself; outputs blocking vs optional findings. `memory: project` so it learns recurring mistakes. |
| `katago-engineer` | sonnet | all | `katago-setup` | KataGo analysis-engine integration, worker protocol, OpenCL (your AMD GPU) and CPU configs, scoring-accuracy benchmark. |
| `upstream-scout` | haiku | Read, Grep, Glob, Bash, WebFetch | — | Monthly: lists lichess-org/lila and lila-ws commits since the SHAs in `docs/UPSTREAM.md`, classifies them (security fix / bug fix in code we kept / irrelevant chess), drafts a porting issue. Read-only. |

Built-in agents cover the rest: **Explore** for codebase searches, **Plan** for design passes.

**Parallelism.** Cloud sessions are naturally isolated (one VM each). On your box, run parallel work
with `claude --worktree <name>` so sessions never share a checkout. Implementer agents don't need
`isolation: worktree` inside `/ship` because it runs them one after another. Agent teams are
experimental and cost more tokens, so skip them for now and reconsider once Phase 3 is underway.

Example — `.claude/agents/reviewer.md`:

```markdown
---
name: reviewer
description: Adversarial pre-PR reviewer. Use before opening any PR and whenever asked to review a diff.
tools: Read, Grep, Glob, Bash
model: opus
memory: project
skills: [verify]
color: red
---
You review the current branch against origin/main for a product owner who cannot read Scala fluently.
1. Read the linked issue/acceptance criteria and docs/STATUS.md.
2. Run /verify yourself; never trust claims in the conversation.
3. Check: correctness vs docs/rules and conformance fixtures; missing/weak tests; security
   (authz, CSRF, rate limits, input validation); websocket/Mongo performance; migrations;
   leftover chess assumptions; i18n; mobile layout for UI changes.
4. Output: BLOCKING findings (with file:line and a concrete failure scenario), then OPTIONAL ones,
   then a 5-line plain-English summary of what the change does.
Record recurring mistake patterns in your memory directory.
```

---

## 8. Skills (`.claude/skills/`)

### 8.1 Workflow skills

`/next`, `/ship`, `/status`, `/adr` and `/upstream-port` are user-only (`disable-model-invocation: true`),
because they start work or change the plan. `/verify`, `/play-test`, `/explain` and `/katago-setup`
can also be invoked by Claude and preloaded into agents.

| Skill | What it does |
|---|---|
| `/next` | Reads `docs/STATUS.md`, `docs/PLAN.md` roadmap and open issues; proposes the next PR-sized task with acceptance criteria and a test plan; on your OK creates the GitHub issue. |
| `/ship [issue]` | The main loop: branch → `test-engineer` writes failing tests → implementer agent → `/verify` → `reviewer` → fix blocking findings → `/play-test` if UI → open PR with the standard description template. Stops and asks only on genuine product decisions. |
| `/verify` | Picks the gates for the changed paths (rules tests, sbt compile/test for touched modules, ui typecheck/lint/test, hook tests), runs them, writes `.claude/state/last-verify`, prints a pass/fail table with real output. |
| `/play-test [scenario]` | Brings the stack up, runs a scripted Playwright game between two browser contexts (e.g. 9x9 Japanese byo-yomi, pass-pass, accept KataGo score), saves screenshots/video for the PR. |
| `/explain [pr\|path]` | Explains a diff or module to a Scala newcomer: glossary, data flow, where to click to see it working. |
| `/status` | Updates `docs/STATUS.md` (Now / Next / Blockers / Decisions) at the end of a session. |
| `/adr "title"` | Writes a numbered Architecture Decision Record. |
| `/upstream-port <sha>` | Ports one lila/lila-ws commit into the monorepo (`git format-patch` + `git am --directory=lila`), resolves conflicts, records it in `docs/UPSTREAM.md`. |
| `/katago-setup [local\|cloud]` | Builds/configures KataGo: OpenCL + tuning on your AMD GPU locally, Eigen CPU build in the cloud; downloads the chosen network; runs the benchmark. |

### 8.2 Knowledge skills (Claude loads them when relevant; preloaded into agents)

| Skill | Contents |
|---|---|
| `lila-backend` | Recipes: add a route + controller + view; add a Mongo collection with BSON handlers and indexes; add a module and wire its `Env`; add an i18n key; send a websocket message through lila-ws; where game/round/lobby/rating code lives. Grows as we learn. |
| `lila-ui` | ui build commands; snabbdom component patterns; theming; adding a page bundle; how round/analyse talk to `goground`. |
| `go-rules` | Summary of `docs/rules` (JP + CN), fixture JSON format, how to add a conformance case, the differential-testing harness vs KataGo. |
| `sgf` | SGF FF[4] essentials, our import/export dialect, known quirks of OGS/KGS/Fox SGFs. |

Example — `.claude/skills/verify/SKILL.md` frontmatter:

```markdown
---
name: verify
description: Run the quality gates relevant to the current changes and record the result. Use before claiming work is done, before opening a PR, and when asked whether something works.
allowed-tools: Bash(./dev/ligo *) Bash(git diff*) Bash(git status*)
---
1. `git diff --name-only origin/main...` to list changed paths.
2. Map paths → gates (table below) and run each via ./dev/ligo.
3. Print a table: gate | command | PASS/FAIL | key output lines. Never summarise a failure as a pass.
4. On all-pass, write the current HEAD sha + timestamp to .claude/state/last-verify.
```

Author skills with the `skill-creator` skill (available on claude.ai and as an official plugin) and
test that each one triggers when it should (and doesn't when it shouldn't).

---

## 9. MCP servers (`.mcp.json`, committed)

| Server | Why | Config notes |
|---|---|---|
| **Playwright** (`@playwright/mcp`) | Claude drives the real app: plays moves, checks layout on phone viewports, takes screenshots for PRs. Core to the lobby/UI work. | stdio `npx @playwright/mcp@latest --headless --isolated`. In cloud sessions point it at the preinstalled Chromium (`/opt/pw-browsers`) — *(verify flag name during Phase 0)*. |
| **MongoDB** (`mongodb-mcp-server`) | Inspect dev data: game documents, ratings, lobby seeks — without writing ad-hoc scripts. | stdio, **read-only** (`--readOnly`), connection string from env pointing at the local dev DB only. |
| **context7** | Current docs for Play, Scala 3, Playwright, Vite/esbuild, snabbdom. | HTTP `https://mcp.context7.com/mcp`; add the host to the cloud environment allowlist. Optional. |

Not needed: GitHub MCP (cloud sessions have GitHub built in; locally `gh` is simpler), Redis MCP
(low value), Sentry (no production yet — add at public launch), Docker MCP (Bash suffices).

---

## 10. Plugins (local machine only — cloud sessions don't load them)

| Plugin | Source | Why |
|---|---|---|
| `typescript-lsp` | `claude-plugins-official` | Type errors surface immediately after each TS edit; symbol navigation in `lila/ui`. Needs `npm i -g typescript-language-server typescript`. |
| `ligo-metals` | our `tools/claude-plugins` marketplace | There is **no official Scala LSP plugin**, so we ship a 10-line one: `.lsp.json` running `metals` for `.scala`. Experimental: Metals indexing lila needs several GB RAM — enable only on the 32 GB box, disable if it slows things down. |
| `frontend-design` | `claude-plugins-official` | Design-quality guidance for the lobby and board UI work — where LiGo has to beat OGS. |
| `security-guidance` | `claude-plugins-official` | Warns about risky patterns as files are edited (auth, injection, secrets). |
| `skill-creator` | `claude-plugins-official` | For authoring and testing our own skills during Phase 0. |

Enable in `.claude/settings.local.json` on your box:

```json
{
  "enabledPlugins": {
    "typescript-lsp@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true,
    "skill-creator@claude-plugins-official": true,
    "ligo-metals@ligo-local": false
  }
}
```

Deliberately skipped: `code-review` / `pr-review-toolkit` / `feature-dev` (overlap with the built-in
`/code-review` + `/security-review` skills and our own `reviewer` + `/ship`; one review path is easier
to trust than three), `ralph-loop` (unattended loops conflict with the PR-gated workflow).

Built-in skills we use as-is: `/code-review` (second opinion on big PRs), `/security-review`
(anything touching auth, sessions, websockets), `/simplify`, `/fewer-permission-prompts`
(run after the first two weeks to tune the allowlist).

---

## 11. Environments

### 11.1 Cloud environment (claude.ai/code → environment "ligo")

- **Network:** Trusted defaults (npm, Maven Central, Docker Hub, GitHub) **plus**:
  `repo.scala-sbt.org`, `scala.jfrog.io`, `raw.githubusercontent.com` (lichess's `lila-maven`
  artifacts — *verify the exact resolver hosts from lila's `build.sbt` in Phase 0*),
  `github.com` release downloads (KataGo binaries), `media.katagotraining.org` (KataGo networks),
  `mcp.context7.com`.
- **Setup script** (versioned as `dev/cloud-setup.sh`, pasted into the environment; must exit 0 in
  < 5 min; result is snapshotted and reused ~7 days):
  install Node 24 and enable pnpm via corepack (lila pins Node ≥ 24 and pnpm 12); install coursier →
  sbt 2.x + scalafmt; `docker pull mongo:7`; download a KataGo Eigen/AVX2 CPU binary + a small network
  in the background; warm the coursier cache by resolving lila's and lila-ws's dependencies.
- **Env vars:** `LIGO_KATAGO_BACKEND=cpu`, `LIGO_MONGO_CACHE_GB=0.5`. No secrets needed for the POC.

### 11.2 Your Linux box (32 GB, AMD CPU + GPU)

`dev/doctor.sh` verifies: JDK 21, coursier + sbt 2.x, Node 24 + pnpm 12, Docker, `scalafmt`,
`typescript-language-server`, (optional) Metals, KataGo built with **OpenCL** (AMD) and tuned
(`katago benchmark`), disk space. Run Remote Control in a persistent `tmux` session (or a systemd
user unit) so you can pick up from your phone.

---

## 12. CI and repository settings (no Claude in CI, per your choice)

GitHub Actions — all required on PRs to `main`:

| Workflow | Runs |
|---|---|
| `rules.yml` | `scalago` tests + `goops` tests + **conformance parity** (both engines replay every fixture) + ScalaCheck/fast-check property tests |
| `lila.yml` | sbt compile + tests for lila and lila-ws (coursier/sbt caches) |
| `ui.yml` | pnpm install, typecheck, lint, unit tests, production build |
| `e2e.yml` | `docker compose` stack + Playwright smoke game (on PRs labelled `ui`/`game` and nightly) |
| `meta.yml` | hook bats tests, license/SPDX check (AGPL-compatible deps only), no secrets committed |
| `nightly-differential.yml` | Random playouts: scalago vs KataGo's rules engine (GTP) on legality, captures and final score |

Branch protection on `main`: PR required, all checks required, linear history, no force-push, no
bypass. You're the only person with merge rights.

---

## 13. Phase 0 build order and acceptance

1. **Repo bootstrap** — `LICENSE` (AGPL-3.0), `COPYING.md` (third-party notices), `README`,
   `.gitignore`, `docs/` skeleton (`STATUS.md`, `UPSTREAM.md`, `glossary.md`, ADR 0001 "Fork current
   lila"), PR template, branch protection.
2. **Import upstream snapshots** at pinned SHAs (recorded in `docs/UPSTREAM.md`); confirm the
   *unmodified* lila builds and runs locally and in a cloud session (baseline).
3. **`dev/` tooling** — `docker-compose.yml`, `dev/ligo`, `dev/doctor.sh`, `dev/cloud-setup.sh`.
4. **Claude config** — CLAUDE.md files, rules, settings, hooks (+ bats tests), agents, skills, `.mcp.json`,
   local marketplace + plugins.
5. **Environments** — cloud environment created and cached; local box passes `dev/doctor.sh`;
   KataGo OpenCL benchmark recorded.
6. **CI** — workflows green on the baseline.
7. **Dry run** — one real but tiny task end-to-end through `/next` → `/ship` → PR: rebrand the
   site name/logo placeholder from lichess to LiGo in the unmodified fork.

**Phase 0 is done when:** the dry-run PR has green CI, a `reviewer` report, a Playwright screenshot,
a plain-English walkthrough, and you merged it having spent < 15 minutes; a fresh cloud session
and a Remote Control session both start oriented (SessionStart output shows STATUS) and can run
`/verify` successfully; every hook has a passing test showing it blocks what it should.
