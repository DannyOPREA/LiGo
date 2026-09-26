# 0007. Licensing corrections after the upstream import
- Status: Accepted
- Date: 2026-09-26
- Decided by: owner, on Claude's recommendation (unit 0.2 verification findings)
- Supersedes: 0006 (restates its MIT decision with corrections)

## Context
Unit 0.2 imported lila and lila-ws unmodified, and the repo became public. Independent verification
found three inaccuracies in how ADR 0006 / COPYING.md described licensing:
1. lila-ws is shipped upstream as **AGPL-3.0** with no "or later" statement, whereas lila is
   AGPL-3.0-or-later.
2. COPYING said lichess's logo and non-commercial assets are "removed, not reused". In fact the
   unmodified snapshot contains them, along with other non-free or unclear-licence assets listed in
   `lila/COPYING.md` "Exceptions (non-free)".
3. `docs/` was declared MIT wholesale, yet it now holds screenshots of AGPL software showing the
   lichess logo.

## Decision
- **MIT for LiGo's own code stays** (as in 0006): `libs/`, `services/`, `tools/`, `dev/`, `.claude/`,
  `.github/`, `docs/`, `logs/`. **Exception:** screenshots are not MIT; they fall under the licences
  of what they depict.
- `lila/`: AGPL-3.0-or-later, except upstream's listed asset exceptions, which keep their own
  licences. `lila-ws/`: AGPL-3.0 as shipped. LiGo's own modifications to both:
  AGPL-3.0-or-later. Every modification is listed in `docs/UPSTREAM.md`.
- Upstream non-free and NC assets are **documented as "kept temporarily, not covered by LiGo's
  licences"** in COPYING §1.1, and **stripped in the first unit of Phase 3**.

## Consequences
- COPYING.md is accurate while the snapshot is unmodified.
- Phase 3's first unit becomes "strip non-free/NC upstream assets", auditing by directory rather than
  by upstream's table rows. Its scope includes the inline logo copies, lichess-branded art and the
  Unsplash montages listed in COPYING §1.1. It touches lila's piece and sound set lists, so it's code,
  not only docs. Removing the non-free default sounds needs a free replacement set: a reuse decision
  for the owner in that unit.
- Related follow-ups, needing owner approval where they're major decisions: the rebrand unit (0.7)
  repoints lila's AGPL §13 "source code" links from lichess-org/lila to LiGo's repository; check the
  "Li-" naming question before any public demo.
- Git history keeps upstream's publicly distributed copies; accepted as low risk.

## Alternatives considered
Strip the assets immediately after 0.2 (more work before the dev tooling exists); leave the strip for
whenever Phase 3 reaches those modules (leaves the documented exception open longer).
