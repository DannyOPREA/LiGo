# Logs

A record of all work: what was done, what worked, what didn't. The logs are split by area, so an
agent only reads what's relevant to its task. Rules are in [`docs/CLAUDE_SETUP.md` §9](../docs/CLAUDE_SETUP.md).

## How to read (agents and humans)
- Read **only** the logs for your area (map below).
- In each, read the **Lessons** section and the latest ~5 entries. Don't read whole logs or unrelated
  logs. Search `archive/` with Grep only when you need something specific.

## How to write
- Every unit appends one entry to its area's log at the end of the unit (`/log`). Failures and dead
  ends are logged as carefully as successes.
- Entries are **append-only**; corrections are new entries. Only the Lessons section is edited.
- Lessons stay ≤ 30 lines: promote durable lessons, merge duplicates, drop superseded ones.
- When a file passes ~400 lines, move its oldest entries to `archive/<area>-<year>-Q<n>.md`.
- Every question put to the owner, and the answer, gets a one-line entry in `decisions.md`.

## Path → log map

| Paths / topic | Log |
|---|---|
| `.claude/`, `CLAUDE.md`, `.mcp.json`, `dev/`, `.github/`, environments, CI, repo meta files | [tooling.md](tooling.md) |
| Importing/removing lila & lila-ws modules, upstream ports, `docs/UPSTREAM.md` | [upstream-fork.md](upstream-fork.md) |
| `libs/go-rules/`, `libs/conformance/`, `docs/rules/`, SGF, differential tests | [rules-engine.md](rules-engine.md) |
| `libs/board/`, board rendering, touch/confirm, themes, sounds | [board-ui.md](board-ui.md) |
| `lila/ui/` except board & lobby: round page, analysis board, profiles, PWA, accessibility | [frontend.md](frontend.md) |
| `lila/modules/` and `lila-ws/` except the areas below; Mongo | [backend.md](backend.md) |
| Clocks: byo-yomi, Fischer, correspondence, lag compensation | [clocks.md](clocks.md) |
| Scoring phase, `services/scoring/`, KataGo, autoscore accuracy | [scoring.md](scoring.md) |
| Glicko-2, rank curve, self-declared rank, handicap maths | [ratings.md](ratings.md) |
| Lobby, pools, challenges, the player test | [lobby.md](lobby.md) |
| `tools/puzzles/`, puzzle sourcing/provenance, trainer | [tsumego.md](tsumego.md) |
| Questions to the owner and answers (one line each) | [decisions.md](decisions.md) |
| Cross-cutting items that fit nowhere else | [general.md](general.md) |

When work starts in a new area (e.g. bots), create a new file and add it here rather than filling
`general.md`.

## Entry template

```markdown
### YYYY-MM-DD · <unit id / PR> · <title>
- Did:
- Worked:
- Didn't work / dead ends:
- Lessons: (promote durable ones to the Lessons section)
- Decisions: (asked owner about X → Y; ADR links)
- Verified by Claude: … · Needs owner verification: …
- Follow-ups:
```
