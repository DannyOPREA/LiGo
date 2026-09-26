# Glossary

Short definitions for the Go terms and lila terms used across LiGo. Kept brief on purpose.

## Go
- **Atari**: a group with one liberty left.
- **Area scoring (Chinese)**: score = your stones on the board + empty points you surround + komi.
- **Byo-yomi (Japanese)**: after main time, N periods of X seconds. A move within a period keeps
  that period; overrunning uses it up; losing the last period loses on time.
- **Dame**: neutral empty points belonging to nobody.
- **Dead stones**: stones that can't avoid capture; removed at the end and counted as prisoners
  (territory scoring) or as the opponent's area.
- **Fischer clock**: base time plus an increment added after each move.
- **Handicap**: stones the weaker player places before the game starts; 0.5 komi in handicap games.
- **Ko**: a capture that could be recaptured immediately to repeat the position.
- **Komi**: points given to White to compensate for Black moving first (typically 6.5 Japanese,
  7.5 Chinese).
- **Kyu / dan**: ranks. Kyu counts down (30k → 1k); dan counts up (1d → 9d). One rank ≈ one stone.
- **Liberty**: an empty point adjacent to a group.
- **Seki**: mutual life; neither side can capture, and (Japanese rules) no territory is counted.
- **Superko (situational)**: a move may not recreate an earlier whole-board position with the same
  player to move ([ADR 0003](decisions/0003-superko-in-both-rulesets.md)).
- **Territory scoring (Japanese)**: score = empty points you surround + prisoners + komi.
- **Tsumego**: life-and-death problems (puzzles).

## lila / project
- **lila**: lichess's main server (Scala 3). **lila-ws**: its websocket server.
- **Env**: each lila module's wiring object (constructs and connects the module's services).
- **Fu / Funit**: lila's aliases for `Future[A]` / `Future[Unit]`.
- **Perf / PerfType**: lichess's rating categories; LiGo collapses them into one `go` perf.
- **Pool**: lila's quick-pairing queue (the lobby's one-click tiles).
- **snabbdom**: the virtual-DOM library lila's UI uses.
- **Unit (of work)**: one owner-approved issue delivered as one PR.
- **Fixture (conformance)**: a JSON rules test case replayed by both rules engines.
- **ADR**: architecture decision record (`docs/decisions/`).
