# LiGo rules spec (Japanese and Chinese)

Status: **approved by the owner** (unit 1.5, 2026-09-28; all 11 open points accepted as
recommended, logs/decisions.md). Maintained by the go-rules-expert
agent; approved by the project owner. Settled inputs: PLAN §1.2 (sizes, rulesets, end of game),
[ADR 0003](../decisions/0003-superko-in-both-rulesets.md) (situational superko in both rulesets),
[ADR 0012](../decisions/0012-strategygames-for-server-go-rules.md) (strategygames is the server
engine). Where a rule depends on a build-vs-buy memo the owner has not decided yet (1.2 client,
1.3 scoring, 1.4 ratings), it is written against the memo's recommended option and marked with a
"Depends on memo" note.

How to read it: every rule that fixtures can test has an ID in bold, like **R-KO-2**. IDs are
stable: a changed rule keeps its ID, a removed rule's ID is never reused. Sections 9–10 are
guidance for units 1.6–1.9, not rules. Section 12 records the choices the owner approved; the rules
below that came from those choices keep their tag "(open point N)".

Rule texts referred to: the Japanese Rules of Go (Nihon Ki-in and Kansai Ki-in, 1989; "J1989") and
the Chinese Weiqi Rules (Chinese Weiqi Association, 2017; "C2017"). The texts could not be fetched
in this session (the network allows only GitHub, npm and Maven), so article numbers are from memory
and are flagged where cited.

## 1. Scope

- **R-SCOPE-1** Board sizes: 9×9 and 19×19. 13×13 comes later (both engines already support it).
- **R-SCOPE-2** Rulesets: **Japanese** (territory scoring) and **Chinese** (area scoring), chosen
  per game. Everything below applies to both unless a rule says otherwise.
- **R-SCOPE-3** Out of scope: other rulesets (AGA, Korean, Ing, New Zealand, Tromp-Taylor), suicide
  (self-capture) as a legal move, free handicap placement, KataGo-style "encore" phases, and clocks
  (a separate unit; only how the game ends on time appears here).

## 2. Board, stones, coordinates

- **R-BOARD-1** The board is a grid of N×N intersections ("points"). Two points are *adjacent* if
  they are next to each other on a line (not diagonally).
- **R-BOARD-2** A *chain* (group) is a set of same-coloured stones connected through adjacency. A
  chain's *liberties* are the empty points adjacent to any of its stones.
- **R-BOARD-3** A *situation* is the whole-board arrangement of stones **plus which player is to
  move**. Prisoner counts, komi and the clocks are not part of it.
- **R-BOARD-4** Fixtures write points in **SGF coordinates**: two lowercase letters, column first
  then row, counted from the **top-left** corner, `a` to `s` (the letter `i` is used). So on 19×19
  `aa` is the top-left corner and `pd` is the upper-right star point; on 9×9 `ee` is the centre.
  Why SGF and not GTP (`D4`): GTP labels skip the letter I and count rows from the bottom, so the
  same stone has different letters on different board sizes and off-by-one mistakes around I are a
  classic bug; SGF is what game records use, goban sends moves in it (memo 1.2), and strategygames
  converts to it (`Pos.sgf`, `Rank.sgfChar`). Humans see GTP-style labels on the board (A–T without
  I, row 1 at the bottom); this spec gives both, e.g. D4 (`dp`).

## 3. Moves

- **R-MOVE-1** A move is either placing one stone of your colour on an empty point, or passing.
  Players alternate: after any move (stone or pass) it is the opponent's turn.
- **R-MOVE-2** Black moves first, except in a handicap game with 2 or more stones, where the
  handicap stones are already on the board and White moves first (R-HCP-3).
- **R-MOVE-3** Placing a stone on an occupied point is illegal.
- **R-MOVE-4** Captures: after a stone is placed, every **opponent** chain with no liberties is
  removed from the board. The removed stones are the placing player's *prisoners*.
- **R-MOVE-5** Suicide is illegal in both rulesets: if, after the captures of R-MOVE-4, the chain
  containing the new stone has no liberties, the move is illegal. This covers single-stone and
  multi-stone suicide. Order matters: captures are removed first, so a move that captures is never
  suicide (this is how ko and snapback work).
- **R-MOVE-6** A stone placement is also illegal if it breaks superko (R-KO-1).
- **R-MOVE-7** Passing is always legal while the game is in play, including as the first move.
- **R-MOVE-8** An illegal move is refused and nothing changes; the same player is still to move.

## 4. Ko and superko

- **R-KO-1** Situational superko (ADR 0003): a stone placement is illegal if the situation it
  creates (board after captures, with the opponent to move) is identical to **any** earlier
  situation of the same game.
- **R-KO-2** The history R-KO-1 compares against is every situation since the game started, with no
  limit on how far back:
  - the starting situation: the empty board with Black to move, or the handicap setup with White
    to move (R-HCP-3);
  - the situation after every stone placement;
  - the situation after every **pass** (same stones, other player to move) (open point 1);
  - including play before a scoring phase and after play resumes from one (R-SP-6).
- **R-KO-3** A pass is never illegal, even if the situation after it has occurred before. Only
  stone placements are checked.
- **R-KO-4** Simple ko is a special case of R-KO-1 (retaking at once recreates the situation before
  the capture), so there is no separate ko rule. For display and for the fixtures' `koPoint`
  field, the *ko point* is defined as: after a move that captured exactly one stone, where the
  capturing stone is a chain of one stone with exactly one liberty, the point of the captured stone.
  It is cleared by the next move of either kind, including a pass. It only marks the most common
  superko case; R-KO-1 decides legality.
- **R-KO-5** A pass does **not** lift a superko ban. Example: Black takes a ko, White passes, Black
  passes, play resumes and White retakes at once: the board is the one from before Black's capture
  with Black to move, which occurred, so the retake is illegal (under simple ko it would be legal).
- **R-KO-6** Repetition never ends or voids a game. There is no "no result", no triple-repetition
  draw, and no special ruling for triple ko, eternal life, or sending-two-returning-one: superko
  makes the repeating move illegal and the game goes on.
- **R-KO-7** Marking stones dead in the scoring phase does not create situations and does not
  change the board play resumes from.
- **R-KO-8** Takebacks (undo, casual games only, PLAN §3.8): an accepted takeback removes the
  undone situations from the superko history, as if those moves had never been played. There is no
  takeback during the scoring phase.

## 5. Handicap

- **R-HCP-1** A game has a handicap of 0 (even), 1, or 2–9 stones, on both board sizes. How many
  stones a rated game gets, and any lower cap on 9×9, is a lobby rule (PLAN §3.7, Phase 5–6), not a
  rules question.
- **R-HCP-2** A handicap of 1 means **no stone is placed**: Black simply moves first and komi is
  0.5 (R-KOMI-2) (open point 8).
- **R-HCP-3** For 2–9 stones, Black's stones are placed on fixed star points before the game (table
  below) and White makes the first move. This applies to **both** rulesets; there is no free
  placement (open point 2).
- **R-HCP-4** Fixed placements, identical in strategygames and goban-engine for 2–9 (checked, §9):

| Stones | 19×19 | 9×9 |
|---|---|---|
| 2 | Q16 `pd`, D4 `dp` | G7 `gc`, C3 `cg` |
| 3 | 2 + Q4 `pp` | 2 + G3 `gg` |
| 4 | 3 + D16 `dd` | 3 + C7 `cc` |
| 5 | 4 + K10 `jj` | 4 + E5 `ee` |
| 6 | 4 + D10 `dj`, Q10 `pj` | 4 + C5 `ce`, G5 `ge` |
| 7 | 6 + K10 `jj` | 6 + E5 `ee` |
| 8 | 6 + K16 `jd`, K4 `jp` | 6 + E7 `ec`, E3 `eg` |
| 9 | 8 + K10 `jj` | 8 + E5 `ee` |

- **R-HCP-5** Handicap stones are ordinary stones: they can be captured, count as Black's stones
  in area scoring, and are part of the starting situation (R-KO-2).

## 6. Komi

Komi is added to White's score. All values are multiples of 0.5.

- **R-KOMI-1** Even games (handicap 0): **6.5** under Japanese rules, **7.5** under Chinese rules,
  on both board sizes (open point 4).
- **R-KOMI-2** Handicap games (1–9 stones): komi **0.5** under both rulesets, so a handicap game
  cannot end in jigo (open point 11). The rating maths (memo 1.4) reads this value.
- **R-KOMI-3** Chinese handicap compensation: in a Chinese game with N ≥ 2 handicap stones, White
  also receives **N points**, because under area scoring each handicap stone is otherwise worth a
  point to Black (OGS's Chinese preset does this, and from memory so does C2017; AGA gives
  N − 1) (open point 3). Japanese games give none. A 1-stone handicap places no stone and gives
  no compensation.
- **R-KOMI-4** Rated games always use R-KOMI-1 to R-KOMI-3. Casual custom games may set any komi in
  steps of 0.5, **including negative komi** (points for Black), as long as its absolute value is at
  most the number of points on the board (81 or 361) (open point 5). strategygames handles
  negative komi (sg `variant/Variant.scala:53-54`, `:266-269`). Chinese handicap compensation
  (R-KOMI-3) still applies on top of a custom komi. An integer komi makes jigo possible (R-RES-3).

> Depends on memo 1.4 (recommended option A): the rating maths reads the game's komi, handicap and
> ruleset (goratings' formula uses a "fair" komi of 6 territory / 7 area internally). That is a
> rating constant, not the komi played; R-KOMI-1 does not change if the owner picks otherwise.

## 7. End of play and the scoring phase

- **R-END-1** Two consecutive passes (necessarily one by each player) end play and start the
  scoring phase. A stone placement between two passes resets the count, and so does resuming play
  (R-SP-6): only passes made since the last stone placement or resumption count.
- **R-END-2** A player may resign at any time, including during the scoring phase. The opponent
  wins (`B+R` / `W+R`).
- **R-END-3** A player whose clock runs out during play loses (`B+T` / `W+T`), whatever the board
  shows. There is no "insufficient material" draw.
- **R-END-4** A player who leaves the game (abandonment, as lila detects it) loses by forfeit
  (`B+F` / `W+F`). This also applies during the scoring phase (PLAN §3.8: leaving counts as
  abandonment): the forfeit applies once lila's abandonment detection fires; until then the
  scoring-phase timeout (R-SP-7) keeps running and may end the game first. A game aborted before it
  really started (lila's abort) has no result (`Void`).
- **R-END-5** There are no draw offers; the only draw is jigo (R-RES-3) (open point 9).
- **R-END-6** Move cap: a game that reaches lila's cap of 1,000 plies (stone placements and passes;
  ADR 0019 §7) ends play and opens the scoring phase at once, without two passes. Resuming is then
  refused, also when the ply reaching the cap is itself the second pass, since no further move is
  allowed (go-rules refusal `play-closed`). The phase ends as R-SP-9 says, or by R-SP-10. This goes
  beyond R-SP-6 and R-SP-9. Decided by Claude under the owner's 2026-09-28 delegation (ADR 0020 §3).

The scoring phase (PLAN §3.8):

- **R-SP-1** During the scoring phase no stones can be played. The board shows a *proposal*: a set
  of stones marked dead, the territory or area that follows, and the score.
- **R-SP-2** The first proposal comes from the scoring service.

  > Depends on memo 1.3 (recommended option A): KataGo's two ownership maps plus goban's autoscore
  > pick the dead stones; without KataGo, goban's estimator plus manual marking.

- **R-SP-3** Either player may toggle stones between dead and alive. A toggle applies to a whole
  chain (the UI may offer to toggle several chains in one click). Every change resets **both**
  players' acceptances.
- **R-SP-4** When both players have accepted the same proposal, the game ends and that proposal is
  scored (§8).
- **R-SP-5** Dead stones are decided by the players' agreement, not by hypothetical play-out as in
  J1989 (Article 7 and its confirmation procedure, from memory). If players disagree, they resume.
- **R-SP-6** Either player may resume play at any time during the scoring phase, without the
  opponent's consent. All dead marks are dropped, the board is as it was after the two passes, the
  superko history continues (R-KO-2), and the player to move is the **opponent of the second
  passer**, i.e. whoever would be to move anyway (open point 6). The pass count restarts at zero
  when play resumes: the next scoring phase needs two passes made after the resumption. How often
  play may resume is limited by R-SP-9.
- **R-SP-7** The scoring phase has its own timeout (PLAN §3.8 gives e.g. 3 minutes live, 1 day
  correspondence; the values belong to the Phase 4 unit). When it expires, the **current
  proposal** is accepted as it stands, including any toggles made so far. Expiry never leaves the
  game without a proposal or without a result. Whether the game clocks pause during the scoring
  phase is decided by the Phase 4 clocks/scoring unit, not here.
- **R-SP-8** Bent four in the corner gets no special rule: it is dead or alive by agreement like
  any other shape; if disputed, players resume and play it out under superko (open point 7).
- **R-SP-9** Limit on resuming: a player may not resume a scoring phase if no stone has been placed
  since the previous resumption (by either player). The phase then ends only by acceptance
  (R-SP-4) or timeout (R-SP-7), or by resignation or forfeit (open point 10). Clocks alone do not
  bound resume → pass → pass cycles: a pass costs nothing in byo-yomi, Fischer adds time on every
  move, and a correspondence clock resets.
- **R-SP-10** No count possible: if the scoring service never produces a proposal within a grace
  period (10 minutes live, 1 day correspondence) after the phase opens, or never produces a pending
  recount within the same grace period after the timeout fires, the game ends with **no result** (`Void`,
  R-RES-2): no winner, and not a draw (R-END-5). This extends R-SP-7's "never without a result" for
  the case where no count can be made; repetition still never voids a game (R-KO-6). Decided by
  Claude under the owner's 2026-09-28 delegation (ADR 0020 §4).

## 8. Scoring and results

Both rulesets start from the same step:

- **R-SCORE-1** Stones marked dead in the accepted proposal are removed and count as captured by
  their opponent. The points they stood on are treated as empty.
- **R-SCORE-2** An empty point is *surrounded* by colour C if the empty region it belongs to (dead
  stones count as empty) borders at least one living C stone and no living stone of the other
  colour.

Japanese (territory):

- **R-SCORE-J1** Score = territory + prisoners. Prisoners are the stones captured during play
  (R-MOVE-4) plus the opponent's stones removed as dead (R-SCORE-1).
- **R-SCORE-J2** Territory = empty points surrounded by one colour, **except**: points belonging to
  a group in seki (its eyes and the shared liberties) count for nobody; dame count for nobody;
  and false-eye points that will have to be filled count for nobody (goscorer's default,
  `score_false_eyes = false`).
- **R-SCORE-J3** Dame do not have to be filled before passing. Players who think a point was
  miscounted because a protecting move is missing resume and play it (goscorer's README states
  some such positions need further play).

Chinese (area):

- **R-SCORE-C1** Score = living stones on the board + empty points surrounded by that colour.
  Prisoners do not count.
- **R-SCORE-C2** Seki: the eyes of a group in seki count for that group's owner; the shared
  liberties count for nobody. Traditional Chinese counting splits shared liberties evenly (not
  verified against the C2017 text); an even split never changes the margin, so the result is the
  same.

Both:

- **R-SCORE-3** The score is counted by **goscorer**, run in `services/scoring`; LiGo never
  re-implements territory or area counting in Scala (PLAN §3.3). strategygames' own area score is
  not used for results. Prisoners taken during play come from the server engine, not from
  replaying the moves in a second engine.

  > Depends on memo 1.3 (recommended option A): goscorer through goban-engine's `computeScore`
  > in a Node service. Under option C (Scala port) the same rules hold; only where they run changes.

- **R-SCORE-4** White's total adds komi (R-KOMI-1/2/4) and, under Chinese rules, handicap
  compensation (R-KOMI-3).
- **R-RES-1** The player with the higher total wins; the margin is the difference.
- **R-RES-2** Results are written in SGF `RE` form: `B+3.5`, `W+0.5`, `B+R`, `W+T`, `B+F`, `Void`.
- **R-RES-3** Equal totals are jigo, a draw, written `0`. It can only happen with an integer komi
  (R-KOMI-4).

## 9. Engine mapping (guidance for units 1.6–1.8, not normative)

Versions read: strategygames commit `7344183` (release `10.2.1-s3-ps14`, the one ADR 0012 pins);
goban-engine 8.3.226 from npm (line numbers are in `src/engine/GobanEngine.ts` as shipped in its
source map; the GitHub `main` at `e61c56e` has the same superko and handicap code); KataGo v1.18.1
`cpp/game/boardhistory.cpp`; goscorer `0ac5f59`. "sg" = `strategygames/src/main/scala/go/`.

| Rule | strategygames (server) | goban-engine (client) | Adapter must |
|---|---|---|---|
| Coordinates (R-BOARD-4) | Files `a`–`s` **including `i`**, rank 1 at the bottom, moves as `S@e5`; `Pos.sgf` converts (sg `Pos.scala:421`, `Rank.scala:12`) | `x,y` from the top-left; moves travel as SGF letters | Convert at the edge; fixtures use SGF |
| Suicide (R-MOVE-5) | Always illegal; captures first, then the new chain's liberties (sg `Chain.scala:23-29`) | `allow_self_capture` defaults to false (`GobanEngine.ts:1747`); error `illegal_self_capture` (`:1289-1301`) | Never enable self-capture |
| Simple ko (R-KO-4) | Ko point after a one-stone capture by a lone stone with one liberty (sg `variant/Variant.scala:233-238`); a pass clears it (sg `Board.scala:79`) | Compares with the position before the opponent's last move (`:1307`) | Nothing |
| Superko (R-KO-1/2) | Situational: 64-bit Zobrist hash of stones + player to move (sg `Hash.scala:54-55`); history starts at the initial or FEN position (sg `Board.scala:112`, `format/Forsyth.scala:54`); a placement is illegal if its hash occurred (sg `variant/Variant.scala:97-111`, `:240-252`, `History.scala:49`). **Positions after passes are not recorded** (`boardAfterPass`, sg `variant/Variant.scala:122-123`) | Presets: Japanese `allow_superko: true, "noresult"`; Chinese `"csk"`, checked as *positional* (`:1369`, `:1775-1813`). Override `allow_superko: false, superko_algorithm: "ssk"`. Looks back only **30** moves (`MAX_SUPERKO_SEARCH`, `:1367-1373`) and **never checks the starting position** (loop ends at move 1). Pass moves are in the history | strategygames: record post-pass situations (open point 1; adapter-side history or upstream patch). goban: set `ssk`; the 30-move window and the missing start position are known gaps (fixtures mark them client-known-gap; offer OGS a patch). The server is the referee |
| Passing and the end (R-END-1) | Two passes let the player to move submit dead stones alone (`canSelectSquares`, sg `Situation.scala:62-63`); a third pass is allowed; **four** passes settle with no dead stones (`passesSettlingTheGame = 4`, sg `variant/Variant.scala:341`); settling restarts the hash history and records no captures (sg `Board.scala:81-83`, `variant/Variant.scala:137-146`) | Passes are moves; never illegal (`:1249`) | lila owns the scoring phase; the agreed set goes in as one `selectSquares`; resuming is an ordinary move. strategygames keeps counting passes across a resume (a 3rd pass is allowed, a 4th settles the game with no dead stones, sg `variant/Variant.scala:125-132`, `:341`), so the adapter must restart the count at resumption (R-SP-6; e.g. by reloading from a FEN with pass count 0, or with adapter-side state) and must never let the 4-pass settlement happen |
| Handicap (R-HCP) | `fenFromSetupConfig(handicap, komi in tenths)` (sg `variant/Variant.scala:51-60`); tables in sg `variant/Go9x9.scala:26-56`, `Go19x19.scala:28-63`. **1 stone places a stone** (9×9 C7, 19×19 D16) and hands White the move; counts up to 25 are accepted | Fixed tables for 2–9 (`:1915-2003`); 1 or >9 means free placement; **Chinese preset switches to free placement** (`:1780`) | Server: build 1-stone games as handicap 0 with komi 0.5 and reject >9. Client: pass `handicap: N`, `free_handicap_placement: false`, the server's stones as `initial_state`, `initial_player: "white"` |
| Komi (R-KOMI) | Default 7.5, but **5.5 on 9×9** (sg `variant/Variant.scala:49`, `variant/Go9x9.scala:24`); FEN stores tenths (sg `format/FEN.scala:59`) | Presets 6.5 JP / 7.5 CN (`:1777`, `:1799`); with a handicap and no `komi` given it cuts komi to its fraction, 0.5 (`:1867`) | Always pass komi explicitly to both |
| Chinese compensation (R-KOMI-3) | None (area score = stones + area, komi to White; sg `variant/Variant.scala:258-270`) | `score_handicap` in the Chinese preset gives White `handicap` points, AGA `handicap − 1` (`:2671-2679`); it reads the `handicap` field | Pass `handicap: N` with `initial_state`, `free_handicap_placement: false`, `initial_player: "white"`, `komi: 0.5`; this supersedes memo 1.2's `handicap: 0` recipe, which loses the compensation. Run on 8.3.226: `chinese handicap 0 ... adj 0 ... W total 0.5`; `chinese handicap 2 ... hcMovesLeft 0 adj 2 komi 0.5 W total 2.5`; `japanese handicap 2 ... adj 0 komi 0.5 W total 0.5`. Compensation is added in **one place only**, the score count (goscorer / `computeScore` in `services/scoring`, memo 1.3), never also in lila |
| Resume (R-SP-6) | Natural alternation: after two passes the player to move just plays | `opponent_plays_first_after_resume: true` in the Japanese preset (`:1804`), but nothing in goban-engine reads it; OGS's (closed) server applies it | lila decides who moves; goban follows the server |
| Chess leftovers (R-KO-6, R-END-3/5) | `repetitionEnabled = false`, `canOfferDraw = false` (sg `variant/Variant.scala:40-42`); `isRepetition = false`, `opponentHasInsufficientMaterial = false` (sg `Situation.scala:50-52`) | n/a | Make sure lila's round module applies none of chess's repetition, draw or material rules |
| Scoring (R-SCORE) | Area only, no seki or dead-stone notion (sg `variant/Variant.scala:258-294`) | `computeScore` → goscorer `areaScoring` / `territoryScoring`; marked-dead stones added to prisoners (`:1540-1623`) | Score only through goscorer (R-SCORE-3) |

KataGo (the 1.9 differential oracle) with situational superko keeps every situation, including
those after passes: it pushes a hash after every move, passes included (`boardhistory.cpp:1066-1067`),
and clears history on a pass only for simple/Spight ko or in the encore (`:876-880`, `:995`).
So KataGo and goban agree with R-KO-2 on passes; strategygames does not.

Hash collisions: strategygames compares 64-bit hashes, not boards; a collision could refuse a
legal move. The chance is far below one in a billion per game; R-KO-1 is defined on exact
situations, and the fixtures test situations, not hashes.

> Depends on memo 1.2 (recommended option A, goban-engine from npm): the client column. Under
> option C (Sabaki) there is no superko at all and the client column would be ours to write.

## 10. Bug classes the fixtures must cover (checklist for unit 1.6)

Import first, write new cases second (PLAN §3.3). Each case lists the rule IDs it checks. goban
test line numbers are from its GitHub `main` (`e61c56e`); the npm package ships no tests.

| Class | Rules | Notes / source to import from |
|---|---|---|
| Captures, multi-chain captures, edge and corner | R-MOVE-4 | strategygames `GoCaptureTest`; goban `GoEngine.test.ts` |
| Suicide, single and multi-stone; capture-not-suicide | R-MOVE-5 | goban "self capture" test (`GoEngine.test.ts:336`); strategygames `GoLegalityTest` |
| Simple ko, ko point, snapback (legal) | R-KO-4, R-MOVE-5 | strategygames `GoSuperkoTest`; goban ko test |
| Superko across a pass (the pass-lifts-no-ban case) | R-KO-2, R-KO-5 | Start from goban's "superko" position (`GoEngine.test.ts:308`) **with a White stone added at C19 (`ca`)**; without it, B A19 is `illegal_self_capture`. Replayed in goban 8.3.226 with `ssk`, White first: `W pass` ok, `B A19` ok, `W B19` ok, `B pass` ok, `W C19` **illegal_board_repetition**. strategygames should allow it (no post-pass hashes): the case that decides open point 1. Also import strategygames `GoSituationalSuperkoTest.scala` |
| Superko back to the starting position | R-KO-2 | Same position with C19 (`ca`) added, Black first: `B A19` ok, `W B19` ok, `B pass` ok, `W C19` recreates the start and goban 8.3.226 **allows** it (start never checked); strategygames and KataGo refuse (from source). Also strategygames `GoSituationalSuperkoTest.scala` |
| Superko beyond 30 moves | R-KO-2 | Client memo 1.2 spike: allowed by goban after 32 extra passes; server-only fixture; strategygames `GoSituationalSuperkoTest.scala` |
| Takeback removes situations from the history | R-KO-8 | New case: undo a ko capture, then the same capture is legal again |
| Triple ko, sending-two-returning-one, eternal life | R-KO-1, R-KO-6 | KataGo `cpp/tests/` rules tests; the goban "superko" position above is a sending-two-returning-one shape |
| Early end on repetition (PlayStrategy bug) | R-KO-6 | A long ko fight must never end the game |
| Infinite games (PlayStrategy bug) | R-KO-1, R-SP-6, R-SP-9 | Superko stops board loops; a second resume with no stone placed since the previous resumption is refused (R-SP-9); passes after a resume restart the count (R-SP-6), and the 4-pass settlement never fires |
| Dead-stone expiry (PlayStrategy bug) | R-SP-7 | Timeout accepts the current proposal, never an empty one or none |
| Seki, both rulesets | R-SCORE-J2, R-SCORE-C2 | goban `test/autoscore_test_files/game_seki_64848549.json` (memo 1.3: Chinese 49/25 vs Japanese 37/18 territory) |
| Bent four in the corner | R-SP-8 | Scored as marked; no automatic ruling |
| Handicap placement 2–9, 1-stone, compensation | R-HCP-*, R-KOMI-2/3 | strategygames `GoHandicapTest`; the table in R-HCP-4 |
| Jigo with integer komi | R-RES-3 | Casual only |

## 11. Intentional departures from the official rule texts

1. **Situational superko in both rulesets** (ADR 0003). J1989 has simple ko and declares long
   cycles "no result" (Article 12, from memory); we have no "no result", and triple ko, eternal
   life and sending-two-returning-one are resolved by superko (R-KO-1, R-KO-6). C2017 forbids
   recreating an earlier board position regardless of who is to move (positional; from memory,
   and goban's Chinese preset reads it that way); ours compares situations, which differs only
   in very rare positions.
2. **A pass does not lift a ko ban** (R-KO-5), unlike simple ko.
3. **Dead stones by agreement, with resumption** (R-SP-5), instead of J1989's hypothetical
   play-out; **no bent-four special rule** (R-SP-8).
4. **Who moves on resumption** (R-SP-6): the natural turn order, where J1989 (Article 9, from
   memory) lets the opponent of the player who asked to resume move first.
5. **Fixed handicap placement under Chinese rules** (R-HCP-3); Chinese practice is free placement.
6. **Scoring-phase timeout accepts the current proposal** (R-SP-7): an online procedure with no
   counterpart in either text.
7. **Counting conventions from goscorer** (R-SCORE-J2, R-SCORE-C2): false-eye points needing a
   fill are not territory; seki shared liberties count for nobody under Chinese rules (margin
   unchanged).
8. **Limit on resuming** (R-SP-9): neither text needs one, because neither has an online
   scoring phase.
9. **Move cap** (R-END-6): a server limit with no counterpart in either text; at 1,000 plies play
   ends without two passes and cannot resume.
10. **No result when no count can be made** (R-SP-10): caused by a failure of the scoring
    service, not by the position; J1989's "no result" for cycles still does not exist (item 1).

## 12. Choices approved by the owner

Each was approved as recommended on 2026-09-28 (the recommendation is written into the rules
above); the alternative is kept for the record.

1. **Do situations after a pass count for superko?** Recommend **yes** (R-KO-2): it is the plain
   reading of ADR 0003 ("a position that existed earlier"), and KataGo and goban do it (goban
   8.3.226 refuses the across-pass case in §10: goban's superko test position plus a White stone
   at C19, `W pass, B A19, W B19, B pass, W C19`). strategygames does not, so unit 1.7 adds it
   in the adapter or sends PlayStrategy a patch.
   Alternative: count only situations after stone placements (strategygames as is); the 1.9
   differential test then needs to allow for rare disagreements with KataGo.
2. **Handicap placement under Chinese rules.** Recommend **fixed star points in both rulesets**
   (R-HCP-3): one code path, same as the server engine. Alternative: free placement under Chinese,
   as OGS's Chinese preset does (and, from memory, C2017); the server would need a new placement
   phase.
3. **Chinese handicap compensation.** Recommend **N points for N stones** (R-KOMI-3), as OGS's
   Chinese preset (and, from memory, C2017). Alternative: AGA's N − 1.
4. **Komi.** Recommend **6.5 Japanese, 7.5 Chinese, on 9×9 and 19×19** (R-KOMI-1). Alternative: a
   different 9×9 value (e.g. 7 area, which allows jigo), or strategygames' 5.5 on 9×9.
5. **Custom komi.** Recommend **casual custom games only, any multiple of 0.5, negative allowed
   down to minus the number of board points**; rated games use the table (R-KOMI-4).
   Alternative: allow custom komi in rated games too (the rating maths already takes komi into
   account, memo 1.4).
6. **Who moves after resuming.** Recommend **the opponent of the second passer** (the natural
   turn order; each side has passed once) (R-SP-6). Alternative: J1989's rule, the opponent of the
   player who asked to resume (goban's Japanese preset flag suggests OGS does this; the server
   would insert a pass, which would also feed strategygames' 4-pass settlement).
7. **Bent four in the corner.** Recommend **no special rule**: agreement, or resume and play it
   out (R-SP-8). Alternative: J1989's "dead as it stands", which needs a detector we would write.
8. **1-stone handicap.** Recommend **no stone, Black first, komi 0.5, no compensation** (R-HCP-2).
   Alternative: komi 0 (jigo possible), or strategygames' default of a placed stone with White to
   move.
9. **Draw offers.** Recommend **none**; jigo is the only draw (R-END-5). Alternative: keep lila's
   draw offer (strategygames sets `canOfferDraw = false`).
10. **Limit on resuming.** Recommend: a player may not resume a scoring phase if no stone was
    placed since the previous resumption; the phase then ends by acceptance or timeout (R-SP-9).
    Alternative: a fixed cap on resumptions per game.
11. **Komi in handicap games.** Recommend **0.5 in both rulesets** (R-KOMI-2), as OGS; no jigo.
    Alternative: 0 (traditional Nihon Ki-in practice; jigo possible). The rating maths (memo 1.4)
    reads this value.

Already decided, so not open: the two rulesets and board sizes (PLAN §1.2), situational superko
(ADR 0003), agreement-based scoring phase with KataGo proposal and resume (PLAN §1.2, §3.8),
counting by goscorer (proposed in PLAN §3.3, settled in the go-rules skill; where it runs
depends on memo 1.3).
