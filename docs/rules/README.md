# LiGo rules spec

**[spec.md](spec.md)** is the authoritative definition of the Go rules LiGo plays: Japanese
(territory) and Chinese (area) rules on 9×9 and 19×19, with situational superko in both
([ADR 0003](../decisions/0003-superko-in-both-rulesets.md)). Both rules engines (strategygames on
the server, goban-engine in the browser) and the conformance fixtures in `libs/conformance/`
answer to it.

Status: **approved by the owner** (unit 1.5, 2026-09-28). Its section 12 records the choices the
owner approved; each is written into the rules.

## What is in it
1. Scope · 2. Board, coordinates (fixtures use SGF letters) · 3. Moves · 4. Ko and superko ·
5. Handicap · 6. Komi · 7. End of play and the scoring phase · 8. Scoring and results ·
9. Engine mapping (guidance for the adapters) · 10. Bug classes the fixtures must cover ·
11. Intentional departures from the official rule texts · 12. Choices approved by the owner.

## How fixtures cite it
Every testable rule has a stable ID such as `R-KO-2` or `R-SCORE-J2`. Each fixture lists the IDs
it checks (the field is defined by the fixture format, unit 1.6) and records its own source. IDs
are never renumbered or reused: a changed rule keeps its ID, a removed rule's ID is retired.

## How to change it
- Only the `go-rules-expert` agent edits this folder and the fixtures, and the owner approves each
  change: a rules change is a major decision (PLAN §7).
- A change that affects behaviour updates the matching fixtures in the same PR, and gets a line in
  `logs/decisions.md` (and an ADR if it reverses a decided point).
- If an engine and the spec disagree, the spec wins until the owner decides otherwise; fixtures
  are never edited to make an implementation pass.
