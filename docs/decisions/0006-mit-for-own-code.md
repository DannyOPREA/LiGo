# 0006. MIT for LiGo's own code
- Status: Superseded by 0007
- Date: 2026-09-26
- Decided by: owner, on Claude's recommendation

## Context
lila and lila-ws are AGPL-3.0-or-later, so the fork must be too. The project may later be given to
the OGS developers, who would find permissively licensed parts easier to adopt.

## Decision
Code **not** derived from lila (`libs/`, `services/`, `tools/`, `dev/`, `.claude/`, `.github/`,
`docs/`, `logs/`) is MIT-licensed (`LICENSE-MIT`). lila-derived code (`lila/`, `lila-ws/`) stays
AGPL-3.0-or-later (`LICENSE`). `COPYING.md` explains the split.

## Consequences
- Individual MIT components (adapters, fixtures, docs) can be reused by OGS or anyone else.
- The running LiGo server as a whole is distributed under AGPL-3.0.
- Code copied from lila into an MIT directory stays AGPL and must carry a header saying so;
  the reviewer checks for this.

## Alternatives considered
AGPL everywhere (simplest, least portable); Apache-2.0 for own code (adds a patent grant and NOTICE
handling, more paperwork than MIT for no clear benefit here).
