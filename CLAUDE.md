# LiGo: lichess-style Go server (non-commercial proof of concept)

Hard fork of lichess-org/lila (+ lila-ws) for the board game Go. Not a business, not competing with
OGS; the work may be donated to OGS.
Owner: solo product owner, new to Scala, < 5 h/week. Explain Scala/FP choices in plain English in PRs.
Now / next / blockers: @docs/STATUS.md
Plan: `docs/PLAN.md` · Setup: `docs/CLAUDE_SETUP.md` · Glossary: `docs/glossary.md` · Logs: `logs/README.md`
ADRs: `docs/decisions/` · Upstream pins: `docs/UPSTREAM.md`

## Working agreement (non-negotiable)
- Work only on units the owner approved (via /next). Deliver each unit as one PR via /ship.
- Consult the owner on EVERY major decision (list: docs/PLAN.md §7): build-vs-buy, any dependency
  change, architecture/schema/protocol, Go rules or rating maths, UX direction, licensing,
  deviating from the plan, removals beyond plan, anything irreversible or outward-facing, security.
- If unsure, STOP and ask (use /ask). Never guess, never paper over. Keep doing only work that
  doesn't depend on the answer.
- Autonomy never lowers rigour: test and review everything you can; run /verify; paste real
  output; never say "should work". List what you could NOT verify under "Needs your verification".
- Never push to main or force-push. Claude squash-merges its own unit PR once /verify passes
  (and CI, once it exists), the reviewer has no blocking findings, no review thread is open and no
  question to the owner is pending on it; then it tells the owner (ADR 0011).

## Reuse before build
Ladder: use as-is → configure → wrap → vendor minimally → port → custom (glue only).
Before writing any non-trivial component, run /build-vs-buy and wait for the owner's approval.
Prefer lila's existing features, OGS goban, strategygames, KataGo, goscorer (see PLAN §3.1).
The same goes for tooling: built-in skills (/code-review, /security-review, /simplify) before ours.

## Logging
Every unit appends an entry to the matching logs/<area>.md (map in logs/README.md) via /log:
what was done, what worked, what didn't, lessons, decisions. Read only the Lessons section
+ latest ~5 entries of the logs relevant to your task. Never whole logs, never unrelated logs.
Entries are append-only (a hook enforces it); only the Lessons section is edited.
Every question to the owner and its answer gets one line in logs/decisions.md.

## Repo map
- `lila/` lichess server (Scala 3, Play) + `lila/ui/` (TypeScript, snabbdom, SCSS). Upstream copy,
  edited in place. See lila/CLAUDE.md.
- `lila-ws/` websocket server (Scala, Netty), talks to lila via Redis. See lila-ws/CLAUDE.md.
- `dev/` the only way to build, run and test (`dev/ligo`), plus `doctor.sh` and `cloud-setup.sh`.
- `.claude/` agents, skills, hooks, rules. `docs/`, `logs/` as above.
- `libs/conformance/` the Go rules test cases (JSON) BOTH engines and the scoring service replay.
  See libs/conformance/CLAUDE.md.
- `libs/go-rules/` the server's Go rules: adapter over strategygames (ADR 0012), replays the
  fixtures. See libs/go-rules/CLAUDE.md.
- `libs/board/` the browser's Go board and rules: OGS goban's board (`mountBoard`) and goban-engine
  with LiGo's settings (ADR 0014), in lila's pnpm workspace; replays the fixtures, checks parity
  with the server, tests the board in Chromium. See libs/board/CLAUDE.md.
- `services/scoring/` the scoring service core: KataGo's analysis engine, goban-engine's autoscore
  and goscorer (ADR 0016, ADR 0020, unit 4.4), in lila's pnpm workspace; replays the scoring
  fixtures too. No Redis worker yet (unit 4.5). See services/scoring/CLAUDE.md.
- `tools/puzzles/` the tsumego generator and pipeline: catalogue positions solved exactly over
  goban-engine, checked by KataGo, written as goban's puzzle JSON (ADR 0025, unit 8.3), in lila's
  pnpm workspace. See tools/puzzles/CLAUDE.md.
- `lila/` and `lila-ws/` are plain folders of this repo, not git repos of their own.

## Commands
`dev/ligo up | down | status | logs [lila|ws|db] | compile [lila|ws|ui|rules|all] | test [lila|ws|ui|pages|rules|board|scoring|puzzles|all]`
`dev/ligo e2e | deps | doctor | mode | katago [install|smoke|bench] | scoring bench | puzzles [build|check|gate|sgf|import]`. Docker mode on the owner's
machine, native mode in cloud sessions (ADR 0010). Fresh cloud container: `dev/cloud-setup.sh` then `dev/ligo deps`.
Tooling self-tests: `dev/tests/run.sh`, `bats .claude/hooks/tests`. CI: `.github/workflows/` (lila, ui,
meta, rules, scoring, puzzles); its checks live in `dev/ci/`.
Never `sbt clean` in the cloud, never non-frozen `pnpm install`, never `lila/bin/deploy`.

## Environment gotchas
- The owner's clone path contains a space (`~/VScode Projects/LiGo`): quote every path in scripts.
- The owner's box is Fedora with SELinux: bind mounts may need `:z`.
- In Bash calls from agents, use absolute paths; never run tools that install git hooks or global
  state (e.g. `git lfs install`).

## Domain in one breath
Moves: intersection or pass. Two passes → scoring phase (KataGo proposes dead stones; both players
accept, adjust or resume). Rulesets: Japanese, Chinese. Clocks: byo-yomi, Fischer, correspondence.
Ratings: Glicko-2 shown as kyu/dan, one pool; rated auto-handicap. Fixtures + docs/rules define truth.
