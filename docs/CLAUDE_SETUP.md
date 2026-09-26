# LiGo — Claude Code setup (Phase 0)

> Companion to [`PLAN.md`](PLAN.md). Everything in this document is built and verified **before** any
> Go feature work starts. Each numbered step in §14 is a unit you approve.
> Claude Code facts were checked against code.claude.com docs on 2026-09-25; re-verify anything marked
> *(verify)* while implementing.

---

## 1. Design principles

1. **The working agreement is built into the tooling** ([PLAN §7](PLAN.md#7-working-agreement)):
   - Claude has wide latitude inside an approved unit.
   - You approve every unit before it starts and review it after.
   - You're consulted on every major decision.
   - Claude **stops and asks when unsure**.
   - Autonomy never lowers the testing bar.

   It lives in `CLAUDE.md`, in the checkpoints of `/next` and `/ship`, in permission prompts on
   dependency changes, in the reviewer's checklist and in the PR template, rather than depending on
   Claude remembering it.
2. **Reuse before build** ([PLAN §2.2](PLAN.md#22-engineering-reuse-before-build)).
   - Every agent follows the ladder: use as-is → configure → wrap → vendor minimally → port → build
     custom.
   - A custom build beyond small glue needs a build-vs-buy memo from the `reuse-scout` agent, and your
     approval.
   - The same applies to this setup itself: we use Claude Code's built-in skills and official plugins
     where they fit, and write our own only where nothing exists.
3. **Everything is logged, in the right place.** Every unit adds an entry to the matching `logs/` file:
   what was done, what worked, what didn't. Logs are split by area and headed by a short curated
   "Lessons" section, so an agent reads only what's relevant (§9).
4. **Everything lives in the repo.** Cloud sessions start from a fresh clone, ignore `~/.claude/`,
   keep no auto-memory across machines, and **don't install plugins or start LSP servers**. So every
   agent, skill, hook, rule, MCP server and log is committed. Plugins are local-only extras.
5. **Gates beat trust.** Correctness comes from machines first, then from you for what machines can't
   judge. The layers:
   - conformance fixtures;
   - unit and property tests;
   - CI;
   - the independent `reviewer` agent;
   - Playwright play-tests with screenshots;
   - an explicit "needs your verification" list.
6. **Tests are the spec, and implementers can't edit the spec.** Only the `go-rules-expert` agent may
   change rules fixtures (hook-enforced), and a fixture change is a major decision that needs your
   approval.
7. **Small context, loaded on demand.** The root `CLAUDE.md` stays under ~150 lines. Detail lives in
   nested `CLAUDE.md` files, path-scoped `.claude/rules/`, skills, and the Lessons sections of the logs.
8. **You merge; Claude never does.** Branch protection, deny rules and a guard hook enforce this.

---

## 2. Where Claude runs

| Mode | Use it for | Notes |
|---|---|---|
| **Remote Control on your Linux box** (primary): `claude --remote-control "LiGo"` inside `tmux` | Full-stack work: lila + lila-ws + Mongo + Redis + KataGo on your AMD GPU, E2E play-tests | You steer from the Claude app or claude.ai/code; execution stays on your 32 GB machine; local plugins work. Questions and notifications reach your phone. |
| **Cloud sessions** (claude.ai/code, `claude --cloud`) | Parallel, self-contained units: rules integration, board adapter, UI components, docs, tests, puzzle scripts, per-module lila compiles | VM: 4 vCPU / 16 GB / 30 GB, Ubuntu 24.04, JDK 21, Node 20–22, Docker, Redis. **No sbt, MongoDB, Node 24, plugins or LSP**; the setup script adds what's missing. lila needs ~12 GB to build (`.sbtopts` `-Xmx8g`), so prefer per-module compiles here. KataGo runs on CPU. |
| **Local terminal** | Interactive debugging, manual play-testing | Same config as Remote Control. |

---

## 3. What gets created (file tree)

```
CLAUDE.md                          # root: mission, working agreement, reuse-first, logging, map, commands (<150 lines)
.mcp.json                          # Playwright, MongoDB (read-only), context7
.claude/
  settings.json                    # permissions (incl. "ask" on dependency changes), hooks, status line
  settings.local.json.example      # per-machine: plugins, local overrides
  rules/                           # path-scoped rules (frontmatter `paths:`)
    scala.md  typescript.md  styles.md  tests.md  mongo.md  i18n.md  security.md  dependencies.md
  agents/
    reuse-scout.md  go-rules-expert.md  lila-backend.md  lila-frontend.md
    test-engineer.md  reviewer.md  scoring-engineer.md  upstream-scout.md
  skills/
    next/ ship/ verify/ build-vs-buy/ ask/ log/ play-test/ explain/ status/ adr/ upstream-port/ katago-setup/
    lila-backend/ lila-ui/ go-rules/ sgf/
  hooks/
    session-start.sh  guard-bash.sh  guard-paths.sh  format.sh
    conformance-related-tests.sh  stop-gate.sh  notify.sh  statusline.sh
    tests/                         # bats tests for every hook
  agent-memory/                    # committed: reviewer / rules-expert / reuse-scout learnings
  state/                           # gitignored: verify stamps, session markers
tools/claude-plugins/              # repo-local marketplace for local-only plugins
  .claude-plugin/marketplace.json
  ligo-metals/                     # Scala LSP (Metals): .claude-plugin/plugin.json + .lsp.json
dev/
  ligo                             # one CLI: up/down/compile/test/e2e/doctor (wraps lila-docker)
  cloud-setup.sh                   # versioned copy of the cloud environment setup script
  doctor.sh
logs/                              # §9: one file per area + README index + archive/
docs/
  PLAN.md  CLAUDE_SETUP.md  STATUS.md  UPSTREAM.md  glossary.md
  decisions/                       # ADRs (incl. every approved build-vs-buy choice)
  build-vs-buy/                    # reuse-scout memos
  rules/                           # the approved LiGo rules spec
  research/                        # player tests, benchmarks
lila/CLAUDE.md  lila/ui/CLAUDE.md  lila-ws/CLAUDE.md
libs/go-rules/CLAUDE.md  libs/board/CLAUDE.md  libs/conformance/CLAUDE.md
services/scoring/CLAUDE.md  tools/puzzles/CLAUDE.md
.github/
  pull_request_template.md
  workflows/                       # §13
```

---

## 4. CLAUDE.md hierarchy

### 4.1 Root `CLAUDE.md` (draft, keep < 150 lines)

```markdown
# LiGo — lichess-style Go server (non-commercial proof of concept)

Hard fork of lichess-org/lila. Not a business, not competing with OGS; the work may be donated to OGS.
Owner: solo product owner, new to Scala, < 5 h/week — explain Scala/FP choices in plain English in PRs.
Now / next / blockers: @docs/STATUS.md
Plan: `docs/PLAN.md` · Setup: `docs/CLAUDE_SETUP.md` · Glossary: `docs/glossary.md` · Logs: `logs/README.md`

## Working agreement (non-negotiable)
- Work only on units the owner approved (via /next). Deliver each unit as one PR via /ship.
- Consult the owner on EVERY major decision (list: docs/PLAN.md §7): build-vs-buy, any dependency
  change, architecture/schema/protocol, Go rules or rating maths, UX direction, licensing,
  deviating from the plan, removals beyond plan, anything irreversible or outward-facing, security.
- If unsure, STOP and ask (use the /ask skill). Never guess, never paper over. Keep doing only
  work that doesn't depend on the answer.
- Autonomy never lowers rigour: test and review everything you can; run /verify; paste real
  output; never say "should work". List what you could NOT verify under "Needs your verification".
- Never push to main, force-push, or merge.

## Reuse before build
Ladder: use as-is → configure → wrap → vendor minimally → port → custom (glue only).
Before writing any non-trivial component, run /build-vs-buy and wait for the owner's approval.
Prefer lila's existing features, OGS goban, strategygames, KataGo, goscorer (see PLAN §3.1).

## Logging
Every unit appends an entry to the matching logs/<area>.md (map in logs/README.md) via /log:
what was done, what worked, what didn't, lessons, decisions. Read only the Lessons section
+ latest entries of the logs relevant to your task — never whole logs, never unrelated logs.

## Repo map
lila/ (app + ui/) · lila-ws/ · libs/go-rules (server rules adapter) · libs/board (goban adapter)
libs/conformance (fixtures for BOTH engines) · services/scoring (KataGo + goban autoscore + goscorer)
tools/puzzles · dev/ligo (the only way to build/run/test)

## Commands
./dev/ligo up | down | compile [module] | test [path] | e2e [spec] | doctor

## Domain in one breath
Moves: intersection or pass. Two passes → scoring phase (KataGo proposes dead stones; both players
accept, adjust or resume). Rulesets: Japanese, Chinese. Clocks: byo-yomi, Fischer, correspondence.
Ratings: Glicko-2 shown as kyu/dan, one pool; rated auto-handicap. Fixtures + docs/rules define truth.
```

### 4.2 Nested `CLAUDE.md` files (loaded on demand)

| File | Contents |
|---|---|
| `lila/CLAUDE.md` | lila architecture primer (modules + `Env` wiring, `Fu`/`Funit`, BSON, routes, scalatags, i18n); which modules are removed, dormant or adapted; compile tips; relevant logs: `backend.md`, `upstream-fork.md` |
| `lila/ui/CLAUDE.md` | ui build, packages, snabbdom patterns, SCSS themes, how `libs/board` is wired into round/analyse; relevant logs: `frontend.md`, `lobby.md` |
| `lila-ws/CLAUDE.md` | message protocol, round/lobby/scoring message flow |
| `libs/go-rules/CLAUDE.md` | "we adapt strategygames, we don't rewrite it"; how to pull upstream strategygames fixes; relevant log: `rules-engine.md` |
| `libs/board/CLAUDE.md` | "thin adapter over OGS goban; upstream improvements to goban rather than patching locally"; relevant log: `board-ui.md` |
| `libs/conformance/CLAUDE.md` | fixture format; where each fixture came from (existing suites first); only `go-rules-expert` edits |
| `services/scoring/CLAUDE.md` | KataGo analysis-engine protocol, goban autoscore + goscorer usage, OpenCL/CPU configs, Redis protocol, benchmark; relevant log: `scoring.md` |

### 4.3 Path-scoped rules (`.claude/rules/*.md`, with `paths:` frontmatter)

- `scala.md`: follow surrounding lila idioms; no `null` or blocking; explain non-obvious Scala in the
  PR walkthrough.
- `typescript.md`: strict TS, snabbdom idioms, no reimplementing what goban provides.
- `styles.md`: lila SCSS variables and themes, mobile-first, 44 px touch targets.
- `tests.md`: naming, fixtures, no sleeps in E2E, never weaken an assertion to make a test pass
  (that's an "ask" situation).
- `mongo.md`: indexes; a schema change is a major decision.
- `i18n.md`: English source strings via i18n keys.
- `security.md`: CSRF, auth checks, rate limits, no secrets in logs.
- `dependencies.md` (paths: `**/package.json`, `**/build.sbt`, `**/project/*.scala`,
  `pnpm-workspace.yaml`): a dependency change needs an approved build-vs-buy memo, a licence check
  (AGPL-compatible only), and a `COPYING.md` update.

---

## 5. `.claude/settings.json` (draft)

```json
{
  "permissions": {
    "allow": [
      "Bash(./dev/ligo *)", "Bash(sbt *)", "Bash(pnpm run *)", "Bash(pnpm test*)", "Bash(pnpm install --frozen-lockfile*)",
      "Bash(npx vitest *)", "Bash(npx playwright *)", "Bash(docker compose *)",
      "Bash(scalafmt *)", "Bash(oxfmt *)", "Bash(oxlint *)", "Bash(stylelint *)",
      "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)", "Bash(git show*)",
      "Bash(git switch *)", "Bash(git checkout -b *)", "Bash(git add *)", "Bash(git commit *)",
      "Bash(git push -u origin claude/*)", "Bash(git push -u origin feat/*)",
      "Bash(gh pr create *)", "Bash(gh pr view *)", "Bash(gh issue *)",
      "mcp__playwright", "mcp__mongodb"
    ],
    "ask": [
      "Edit(./**/package.json)", "Edit(./**/build.sbt)", "Edit(./**/project/*.scala)",
      "Edit(./pnpm-workspace.yaml)", "Edit(./**/pnpm-lock.yaml)",
      "Bash(pnpm add *)", "Bash(pnpm remove *)", "Bash(npm install *)", "Bash(cs install *)",
      "Edit(./libs/conformance/fixtures/**)", "Edit(./docs/rules/**)",
      "Edit(./.github/workflows/**)", "Edit(./LICENSE*)", "Edit(./COPYING*)",
      "Bash(git push *)", "Bash(docker system prune*)", "Bash(sbt clean*)"
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
- **The `ask` rules are how the working agreement is enforced.** Dependency manifests, fixtures, the
  rules spec, CI and licence files always prompt you, even in `auto` mode. That puts you in the loop
  for those major decisions. Deny rules block in every mode.
- Permission prefix rules aren't airtight; `guard-bash.sh` and `guard-paths.sh` (§6) are the real
  enforcement.
- `auto` mode can't be set from project settings. On your box put `"defaultMode": "auto"` in
  `~/.claude/settings.json` (or use `acceptEdits`).
- JVM memory comes from lila's `.sbtopts`. The status line shows branch · phase · unit · last
  `/verify` result · pending questions.

---

## 6. Hooks

Scripts live in `.claude/hooks/`, are idempotent and fast, and have bats tests run in CI.

| Event (matcher) | Script | What it does | Why |
|---|---|---|---|
| `SessionStart` (`startup\|resume`) | `session-start.sh` | Detects cloud vs local. Makes sure sbt/scalafmt and Node 24 exist. Starts Mongo + Redis (lila-docker-based, idempotent). Runs `pnpm install --frozen-lockfile` only if the lockfile changed. Prints: STATUS "Now/Next/Blockers", the current unit and its approval, **open questions awaiting you**, and the **names** of the log files relevant to the current unit (not their contents). | Every session starts ready and oriented, without flooding the context. |
| `SessionStart` (`compact`) | `session-start.sh --after-compact` | Re-injects the unit's acceptance criteria, open questions and relevant log names. | Nothing is lost after compaction. |
| `PreToolUse` (`Bash`) | `guard-bash.sh` | Blocks force pushes, any push or merge to `main`, destructive git on `main`, `rm -rf` outside the repo or scratch, dropping Mongo DBs other than `ligo_test*`, `sbt clean` in the cloud. | Hard guarantees. |
| `PreToolUse` (`Edit\|Write`) | `guard-paths.sh` | Reads `agent_type`. Only `go-rules-expert` may touch `libs/conformance/fixtures/**` and `docs/rules/**` (and still triggers your `ask` prompt). Accepted ADRs are immutable. Generated output is never hand-edited. **Log files are append-only below the Lessons section**, so past entries can't be rewritten. | Protects the spec and the history. |
| `PostToolUse` (`Edit\|Write`) | `format.sh` | Formats the touched file with lila's own configured tools (scalafmt, oxfmt/oxlint, stylelint); exit 2 with the remaining errors. | Formatting never reaches review. |
| `PostToolUse` (`Edit\|Write`, async + `asyncRewake`) | `conformance-related-tests.sh` | When rules code, adapters or fixtures change, runs the fast conformance subset in the background and wakes Claude on failure. | Instant rules feedback. |
| `Stop` | `stop-gate.sh` | Blocks the stop once (respecting `stop_hook_active`) if code changed since the last successful `/verify`, **or if code changed and no entry was appended to a `logs/` file this session**. The message: "run /verify and /log, or state why not". | No "done" without evidence and a log entry. |
| `Notification` | `notify.sh` | Local desktop notification (Remote Control already pushes to your phone). | Questions reach you fast. |

---

## 7. Subagents (`.claude/agents/`)

**Every agent's prompt starts with the same four rules:**
1. Reuse before build: check the ladder and ask the main session before writing custom code.
2. If unsure or facing a major decision, **stop and return the question** to the main session with
   options and a recommendation. Never guess.
3. Verify your own work with real commands, and report what you could not verify.
4. Read only the Lessons section and latest entries of the logs named for your area; draft your log
   entry at the end.

Model policy (Max 5x): **Opus** for judgement, **Sonnet** for bulk implementation, **Haiku** for
scouting.

| Agent | Model | Tools | Reads logs | Role |
|---|---|---|---|---|
| `reuse-scout` | sonnet | Read, Grep, Glob, WebSearch, WebFetch, Bash (read-only) | the log of the area in question | For any capability: finds existing software (npm, Maven, GitHub, lila itself, OGS, KataGo ecosystem). Checks licence (AGPL-compatible?), maintenance, size, fit with lila, and handoff value to OGS. Writes `docs/build-vs-buy/<topic>.md` with a recommendation for you to approve. `memory: project`. |
| `go-rules-expert` | opus | Read, Grep, Glob, Edit, Write, Bash | `rules-engine.md`, `scoring.md` | Owns `docs/rules/` and the fixtures (the only agent allowed to edit them); imports fixtures from existing test suites before writing new ones; answers ko/seki/scoring/handicap/komi questions; any rules *interpretation* goes to you. `memory: project`. |
| `lila-backend` | sonnet | all | `backend.md`, `upstream-fork.md`, `clocks.md`, `ratings.md` (as relevant) | Scala 3 / Play / Mongo / lila-ws changes in lila idiom; adapts existing lila modules rather than writing new ones. |
| `lila-frontend` | sonnet | all | `frontend.md`, `board-ui.md`, `lobby.md` | TypeScript/snabbdom/SCSS; wraps goban rather than reimplementing it; takes screenshots via Playwright MCP. |
| `test-engineer` | sonnet | all | the unit's area log | Writes failing tests first from the acceptance criteria; reuses existing test suites and harnesses; never edits fixtures or weakens assertions. |
| `reviewer` | opus | Read, Grep, Glob, Bash | the unit's area log + its own memory | Adversarial review: correctness vs rules spec and fixtures, tests, security, performance, schema, leftover chess, i18n, mobile. **Also checks:** reinvented wheels, undisclosed decisions (anything on the major-decision list made without your approval), an honest "needs your verification" list, and a log entry present. Re-runs gates itself. Output: blocking, then optional, then a plain-English summary. `memory: project`. |
| `scoring-engineer` | sonnet | all | `scoring.md` | KataGo analysis engine, goban autoscore, goscorer, OpenCL/CPU configs, accuracy benchmark. |
| `upstream-scout` | haiku | Read, Grep, Glob, Bash, WebFetch | `upstream-fork.md` | Monthly: new lila/lila-ws/strategygames/goban commits since pinned versions, classified (security / relevant fix / irrelevant); drafts porting units for your approval. |

Built-in **Explore** and **Plan** agents cover searching and design passes.

**Parallelism:** cloud sessions are isolated VMs; locally use `claude --worktree <name>`. Agent teams
(experimental, token-heavy) are skipped for now.

---

## 8. Skills (`.claude/skills/`)

**Reuse first applies here too.** We use the built-in `/code-review`, `/security-review`, `/simplify`
and `/fewer-permission-prompts` skills and the official `skill-creator` rather than writing our own
equivalents. Custom skills exist only for LiGo-specific workflow and knowledge.

### 8.1 Workflow skills

These are user-only (`disable-model-invocation: true`) because they start work or change the plan:
`/next`, `/ship`, `/build-vs-buy`, `/status`, `/adr`, `/upstream-port`.

These can also be invoked by Claude and preloaded into agents: `/verify`, `/ask`, `/log`,
`/play-test`, `/explain`, `/katago-setup`.

| Skill | What it does |
|---|---|
| `/next` | Reads STATUS, the roadmap, open issues and the relevant log Lessons, then **presents the next unit for approval**: goal, acceptance criteria, test plan, **reuse plan**, expected decisions, and which log it writes to. Uses AskUserQuestion; creates the issue only after you approve. |
| `/ship [issue]` | The unit loop, with **hard checkpoints**. (1) Confirms the unit is approved. (2) Runs `/build-vs-buy` if any custom component is involved, and waits. (3) `test-engineer` writes failing tests. (4) The implementer agent builds. (5) `/verify`. (6) `reviewer`; blocking findings get fixed. (7) `/play-test` for UI units. (8) `/log`. (9) Opens a PR using the template. **At any point:** a major decision or uncertainty → `/ask` and pause the dependent work. |
| `/build-vs-buy <capability>` | Runs `reuse-scout`, presents the options with a recommendation, records your choice as an ADR, and logs it. |
| `/ask` | The standard way to stop and ask. Writes the question to `docs/STATUS.md` → "Waiting on owner" (with context, options and a recommendation), asks you via AskUserQuestion, sends a notification, and records your answer in the log and, if it's a major decision, an ADR. |
| `/verify` | Runs the gates for the changed paths, writes `.claude/state/last-verify`, and prints a table with real output; never turns a failure into a pass. |
| `/log [area]` | Appends a structured entry to the right `logs/<area>.md` (the path → area map is in `logs/README.md`); promotes durable lessons into that file's Lessons section; archives when the file gets too long (§9). |
| `/play-test [scenario]` | A scripted two-browser Playwright game; saves screenshots/video to the PR. |
| `/explain [pr\|path]` | Explains a diff or module to a Scala newcomer. |
| `/status` | Updates STATUS (Now / Next / Blockers / Waiting on owner) at session end. |
| `/adr "title"` | Writes a numbered ADR. |
| `/upstream-port <sha>` | Ports an upstream commit (`git format-patch` + `git am --directory=…`) and logs it to `upstream-fork.md`. |
| `/katago-setup [local\|cloud]` | KataGo OpenCL (AMD) or Eigen (CPU) setup, network download, benchmark. |

### 8.2 Knowledge skills (loaded when relevant; preloaded into agents)

| Skill | Contents |
|---|---|
| `lila-backend` | Recipes for adapting lila: routes, Mongo collections + BSON, modules/`Env`, i18n keys, lila-ws messages; "look for an existing lila feature first". |
| `lila-ui` | ui build, snabbdom patterns, theming, page bundles, the `libs/board` integration. |
| `go-rules` | The approved rules spec summary, the fixture format, how to import cases from existing suites. |
| `sgf` | SGF FF[4] essentials and quirks; "use goban-engine / @sabaki/sgf, don't write parsers". |

---

## 9. Logging (`logs/`)

**Goal:** a complete record of what happened, what worked and what didn't, split so that an agent
working on one area reads only that area's history.

### 9.1 Files

| File | Covers | Main readers |
|---|---|---|
| `logs/README.md` | Index, entry template, **path → log map**, archiving rules | everyone (short) |
| `logs/tooling.md` | Claude Code setup, hooks, skills, agents, dev environment, cloud/local environments, CI | all agents when changing tooling |
| `logs/upstream-fork.md` | Forking lila/lila-ws, removing chess modules, upstream ports | `lila-backend`, `upstream-scout` |
| `logs/rules-engine.md` | strategygames integration, goban-engine, conformance fixtures, differential tests, SGF | `go-rules-expert`, `test-engineer` |
| `logs/board-ui.md` | The goban adapter, rendering, touch/confirm, themes, sounds | `lila-frontend` |
| `logs/frontend.md` | Other UI work: round page, analysis board, profiles, PWA, accessibility | `lila-frontend` |
| `logs/backend.md` | lila server modules, Mongo, lila-ws protocol (except the areas below) | `lila-backend` |
| `logs/clocks.md` | Byo-yomi, Fischer, correspondence, lag compensation | `lila-backend`, `test-engineer` |
| `logs/scoring.md` | Scoring phase, `services/scoring`, KataGo, autoscore accuracy | `scoring-engineer`, `go-rules-expert` |
| `logs/ratings.md` | Glicko-2, rank curve, self-declared start, handicap maths | `lila-backend` |
| `logs/lobby.md` | Lobby, pools, challenges, the player test | `lila-frontend`, `lila-backend` |
| `logs/tsumego.md` | Puzzle sourcing, provenance, import scripts, trainer | relevant agents |
| `logs/decisions.md` | A one-line chronological index of every question asked and answer given, linking to ADRs and entries | `/next`, `/status`, you |
| `logs/general.md` | Cross-cutting items that fit nowhere else (kept small; recurring themes get their own file) | as needed |

New areas get a new file (e.g. `bots.md`) when work starts on them, rather than piling into `general.md`.

### 9.2 Structure of each file

```markdown
# Scoring log
## Lessons (curated, ≤ 30 lines — read this first)
- KataGo ownership needs both colours-to-move queries; single query mis-marks dame (2026-11-02, #41)
- ...
## Entries (newest first)
### 2026-11-02 · #41 · Scoring worker: first KataGo round-trip
- Did: …
- Worked: …
- Didn't work / dead ends: …
- Lessons: … (promoted above if durable)
- Decisions: asked owner about X → chose Y (ADR-0007)
- Verified by Claude: … · Needs owner verification: …
- Follow-ups: …
```

### 9.3 Rules that stop logs flooding context

- **Agents read the Lessons section plus the latest ~5 entries of only the logs mapped to their area.**
  They never read whole logs or unrelated logs; the agent prompts and the `/log` skill enforce this.
- **Lessons stays ≤ 30 lines.** `/log` curates it: it merges duplicates and drops lessons that have
  been superseded.
- **Archiving:** when a file passes ~400 lines, its oldest entries move to
  `logs/archive/<area>-<year>-Q<n>.md`. Archives are searched with Grep only when needed.
- **Every entry is written at the end of its unit** (`/ship` step 8), and a failure or dead end is
  logged as carefully as a success. `stop-gate.sh` and the reviewer check that the entry exists;
  `meta.yml` CI fails a PR that changes code without touching `logs/`.
- **Entries are append-only.** Corrections are new entries; only the Lessons section is edited.

---

## 10. MCP servers (`.mcp.json`, committed)

| Server | Why | Config notes |
|---|---|---|
| **Playwright** (`@playwright/mcp`) | Claude plays the real app, checks phone layouts, takes PR screenshots | stdio `npx @playwright/mcp@latest --headless --isolated`; point it at the preinstalled Chromium in cloud sessions *(verify flag)* |
| **MongoDB** (`mongodb-mcp-server`) | Inspect dev data without ad-hoc scripts | stdio, **read-only**, local dev DB only |
| **context7** | Current docs for Play, Scala 3, Playwright, snabbdom, goban | HTTP `https://mcp.context7.com/mcp`; add to the cloud allowlist; optional |

Not needed: a GitHub MCP (built into cloud sessions; `gh` works locally), Redis, Sentry, Docker.

---

## 11. Plugins (local machine only — cloud sessions don't load them)

| Plugin | Source | Why |
|---|---|---|
| `typescript-lsp` | `claude-plugins-official` | Type errors after every TS edit; symbol navigation. Needs `npm i -g typescript-language-server typescript`. |
| `frontend-design` | `claude-plugins-official` | Design guidance for the lobby and board UI. |
| `security-guidance` | `claude-plugins-official` | Warns on risky patterns as files are edited. |
| `skill-creator` | `claude-plugins-official` | Authoring and testing our skills in Phase 0 (reuse rather than hand-rolling skill QA). |
| `ligo-metals` | our `tools/claude-plugins` | There's no official Scala LSP plugin, so this is a minimal `.lsp.json` pointing at Metals, the existing Scala language server. Experimental; enable only on the 32 GB box. |

Enabled in `.claude/settings.local.json` on your box:

```json
{ "enabledPlugins": {
    "typescript-lsp@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true,
    "skill-creator@claude-plugins-official": true,
    "ligo-metals@ligo-local": false } }
```

Deliberately skipped:
- `code-review`, `pr-review-toolkit`, `feature-dev`: they overlap with the built-in `/code-review` and
  `/security-review` plus our `reviewer`; one review path is easier to trust.
- `ralph-loop`: unattended loops conflict with unit-by-unit approval.

---

## 12. Environments

### 12.1 Cloud environment (claude.ai/code → "ligo")

- **Network:** the Trusted defaults, plus (as allowed by the owner in unit 0.2) `jitpack.io`,
  `repo.scala-sbt.org`, `central.sonatype.com` and `codeload.github.com`; `raw.githubusercontent.com`
  (lichess's `lila-maven`), `maven-central.storage-download.googleapis.com` (Google's Central mirror,
  ADR 0008) and `nodejs.org` already work. Later: GitHub release downloads (KataGo),
  `media.katagotraining.org` (KataGo networks), `mcp.context7.com`. Note: the session's GitHub
  proxy still refuses `codeload.github.com` tarballs for repos not attached to the session; see
  ADR 0008 for the ab-stub workaround.
- **Setup script** (versioned as `dev/cloud-setup.sh`; must exit 0 within 5 min; snapshotted for about
  7 days):
  - Node 24 + pnpm (corepack);
  - coursier → sbt 2.x + scalafmt;
  - `docker pull` of the lila-docker service images;
  - a KataGo Eigen CPU binary + small network, downloaded in the background;
  - a warm coursier cache.
- **Env vars:** `LIGO_KATAGO_BACKEND=cpu`, `LIGO_MONGO_CACHE_GB=0.5`. No secrets.

### 12.2 Your Linux box (32 GB, AMD CPU + GPU)

`dev/doctor.sh` checks:
- JDK 21, coursier + sbt 2.x, Node 24 + pnpm 12, Docker, scalafmt, typescript-language-server;
- (optional) Metals;
- KataGo with **OpenCL**, tuned via `katago benchmark`;
- free disk space.

Run Remote Control in `tmux` or as a systemd user unit.

---

## 13. CI and repository settings (no Claude in CI)

Start from **lila's existing GitHub workflows** and adapt them to the monorepo paths (reuse first).
All of these are required on PRs to `main`:

| Workflow | Runs |
|---|---|
| `rules.yml` | Server rules tests + goban-engine harness + **conformance parity** + property tests |
| `lila.yml` | sbt compile + tests for lila and lila-ws |
| `ui.yml` | pnpm install, typecheck, lint, unit tests, build |
| `e2e.yml` | Stack + Playwright smoke game (PRs labelled `ui`/`game`, and nightly) |
| `meta.yml` | Hook bats tests; licence check (AGPL-compatible deps only; `COPYING.md` updated when deps change); **log check** (code changes need a `logs/` change); PR template sections present |
| `nightly-differential.yml` | Random playouts: server rules vs KataGo |

**PR template** (`.github/pull_request_template.md`):
- What & why (links the approved unit)
- Plain-English walkthrough
- Reuse: existing software used, and any custom code with the reason / memo link
- Verified by Claude (commands + results)
- **Needs your verification** (never empty without saying why)
- Decisions made (with your approval) / decisions needed
- Screenshots (UI)
- Log entry link
- Risks

**Branch protection on `main`:** PR required, all checks required, linear history, no force-push,
no bypass; only you merge.

---

## 14. Phase 0 build order and acceptance

Each step is a unit you approve via `/next` once the skill exists. Until then, Claude presents each
step to you for approval by hand.

1. **Repo bootstrap:**
   - `LICENSE` (AGPL-3.0), `COPYING.md`, `README`, `.gitignore`;
   - `docs/` skeleton (STATUS, UPSTREAM, glossary, ADR 0001 "Fork current lila", ADR 0002 "Reuse
     first");
   - **`logs/` skeleton** (README with the path → log map and entry template, one file per area);
   - PR template, branch protection.
2. **Import upstream snapshots** at pinned SHAs; confirm the *unmodified* lila builds and runs in a
   cloud session. Log to `upstream-fork.md`. (Done in unit 0.2. The owner's run on the Linux box
   moved to the end of unit 0.3, so it exercises the real dev tooling.)
3. **`dev/` tooling built on lila-docker:** the `ligo` wrapper, doctor, the cloud setup script
   (codifying ADR 0008's cloud dependency sources). Log to `tooling.md`. Ends with the owner running
   the baseline on the Linux box.
4. **Claude config:** CLAUDE.md files, rules, settings, hooks (+ bats tests), agents, skills (authored
   with `skill-creator`), `.mcp.json`, local marketplace + plugins.
5. **Environments:** the cloud environment is cached; your box passes `dev/doctor.sh`; the KataGo
   OpenCL benchmark is recorded.
6. **CI:** lila's workflows adapted, plus `meta.yml`, all green on the baseline.
7. **Dry run:** a tiny real unit end-to-end (rebrand lichess → LiGo): `/next` approval → `/ship` →
   PR → your merge.

**Phase 0 is done when:**
- The dry-run PR has green CI, a reviewer report, a screenshot, a walkthrough, an honest "needs your
  verification" list, and a `logs/` entry, and you merged it in < 15 minutes of your time.
- At least one `/ask` round-trip has been exercised: Claude paused, you answered from your phone, and
  the answer landed in `logs/decisions.md`.
- A dependency-manifest edit triggered your permission prompt.
- A fresh cloud session and a Remote Control session both start oriented.
- Every hook has a passing test showing it blocks what it should.
