package ligo.gorules

// The scoring phase's marks and acceptances (unit 4.3, ADR 0020 §3), closing play at the move cap, and
// results (R-RES-1 to R-RES-3).
// Licence: MIT (LiGo's own code, ADR 0006).
class ScoringTest extends munit.FunSuite:

  private def p(sgf: String) = Point.fromSgf(sgf).get

  private def play(tokens: String*): GoGame =
    val start =
      GoGame.start(Setup(BoardSize.Nine, Ruleset.Japanese, 6.5)).fold(e => fail(e.message), identity)
    tokens.foldLeft(start)((g, t) =>
      Fixtures.applyToken(g, t).fold(r => fail(s"$t refused: ${r.key}"), identity)
    )

  // Black: a two-stone chain at aa-ba; White: a single stone at ee and a two-stone chain at gg-gh.
  private val ended = play("aa", "ee", "ba", "gg", "pass", "gh", "pass", "pass")

  extension [A](e: Either[ScoringRefusal, A])
    private def ok: A = e.fold(r => fail(s"refused: ${r.key}"), identity)

  private def opened(dead: String*): Scoring = Scoring.open(ended, 1, dead.map(p).toSet, request = 1).ok

  private def v(request: Int, phase: Int = 1) = CountVersion(phase, request)

  test("chainAt gives the whole chain, or nothing on an empty point"):
    assertEquals(ended.chainAt(p("aa")), Set(p("aa"), p("ba")))
    assertEquals(ended.chainAt(p("gh")), Set(p("gg"), p("gh")))
    assertEquals(ended.chainAt(p("cc")), Set.empty)

  test("a proposal opens only in the scoring phase and only with whole chains of real stones"):
    assertEquals(Scoring.open(play("aa"), 1, Set.empty, 1), Left(ScoringRefusal.NotInScoring))
    assertEquals(Scoring.open(ended, 1, Set(p("cc")), 1), Left(ScoringRefusal.NoStone))
    assertEquals(Scoring.open(ended, 1, Set(p("gg")), 1), Left(ScoringRefusal.PartialChain))
    val s = opened("gg", "gh", "ee")
    assertEquals(s.dead, Set(p("gg"), p("gh"), p("ee")))
    assertEquals(s.version, v(1))
    assert(!s.pending)
    assert(!s.agreed)

  test("a toggle flips the whole chain, clears both acceptances and asks for a recount (R-SP-3)"):
    val s0 = opened().accept(Color.Black, v(1)).ok
    assertEquals(s0.accepted, Set(Color.Black))
    val s1 = s0.toggle(p("gh"), v(1)).ok
    assertEquals(s1.dead, Set(p("gg"), p("gh")))
    assertEquals(s1.accepted, Set.empty)
    assert(s1.pending)
    assertEquals(s1.requested, 2)
    val s2 = s1.counted(2, s1.dead).ok
    assert(!s2.pending)
    assertEquals(s2.version, v(2))
    val s3 = s2.toggle(p("gg"), v(2)).ok // back to alive
    assertEquals(s3.dead, Set.empty)

  test("nothing can be toggled or accepted while a recount is pending"):
    val s = opened().toggle(p("ee"), v(1)).ok
    assertEquals(s.toggle(p("aa"), v(1)), Left(ScoringRefusal.CountPending))
    assertEquals(s.accept(Color.White, v(1)), Left(ScoringRefusal.CountPending))
    assert(!s.canFinish)

  test("a toggle or accept made on an older count is refused, so nobody accepts a count they haven't seen"):
    val s = opened().toggle(p("ee"), v(1)).ok.counted(2, Set(p("ee"))).ok
    assertEquals(s.accept(Color.White, v(1)), Left(ScoringRefusal.StaleCount))
    assertEquals(s.toggle(p("ee"), v(1)), Left(ScoringRefusal.StaleCount))
    assert(s.accept(Color.White, v(2)).isRight)

  test("a stored scoring comes back as it was: marks, pending recount and acceptances"):
    val s = opened("ee").toggle(p("gg"), v(1)).ok
    val back = Scoring.restore(ended, 1, s.dead, shown = 1, requested = 2, accepted = Set.empty).ok
    assertEquals(back, s)
    val accepted = Scoring.restore(ended, 2, Set(p("ee")), 3, 3, Set(Color.White)).ok
    assertEquals((accepted.version, accepted.pending, accepted.accepted), (v(3, 2), false, Set(Color.White)))
    assertEquals(Scoring.restore(ended, 1, Set(p("gg")), 1, 1, Set.empty), Left(ScoringRefusal.PartialChain))
    assertEquals(Scoring.restore(ended, 1, Set.empty, 2, 1, Set.empty), Left(ScoringRefusal.NotLatest))
    assertEquals(
      Scoring.restore(play("aa"), 1, Set.empty, 1, 1, Set.empty),
      Left(ScoringRefusal.NotInScoring)
    )

  test("only the latest request's count is taken"):
    val s = opened().toggle(p("ee"), v(1)).ok
    assertEquals(s.counted(1, s.dead), Left(ScoringRefusal.NotLatest))
    assertEquals(s.counted(3, s.dead), Left(ScoringRefusal.NotLatest))
    assertEquals(s.counted(2, Set.empty), Left(ScoringRefusal.WrongMarks))
    val done = s.counted(2, s.dead).ok
    assertEquals(done.counted(2, s.dead), Left(ScoringRefusal.NotLatest), "nothing pending any more")

  test("a toggle on an empty or off-board point is refused"):
    assertEquals(opened().toggle(p("cc"), v(1)), Left(ScoringRefusal.NoStone))
    assertEquals(opened().toggle(Point(12, 0), v(1)), Left(ScoringRefusal.NoStone))

  test("toggling one dead chain back leaves the other dead chains dead"):
    val s = opened("gg", "gh", "ee").toggle(p("gg"), v(1)).ok
    assertEquals(s.dead, Set(p("ee")))

  test("a count version from an earlier scoring phase is stale in the next one"):
    val later = Scoring.open(ended, 2, Set.empty, request = 1).ok
    assertEquals(later.accept(Color.Black, v(1, phase = 1)), Left(ScoringRefusal.StaleCount))
    assertEquals(later.toggle(p("ee"), v(1, phase = 1)), Left(ScoringRefusal.StaleCount))
    assert(later.accept(Color.Black, v(1, phase = 2)).isRight)

  test("both players accepting the same count is agreement (R-SP-4)"):
    val s = opened("ee").accept(Color.Black, v(1)).ok.accept(Color.White, v(1)).ok
    assert(s.agreed)
    assert(s.canFinish)

  test("closing play at the move cap opens the scoring phase for good"):
    val g = play("aa", "ee")
    val closed = g.closePlay
    assertEquals(closed.phase, Phase.Scoring)
    assert(closed.playClosed)
    assertEquals(closed.resume, Left(Refusal.PlayClosed))
    assertEquals(closed.pass, Left(Refusal.InScoring))
    assertEquals(closed.play(p("cc")), Left(Refusal.InScoring))
    assertEquals(closed.undo, Left(Refusal.InScoring))
    assertEquals(closed.closePlay.resume, Left(Refusal.PlayClosed))
    assert(Scoring.open(closed, 1, Set.empty, 1).isRight)
    assert(!g.playClosed)

  test("closing play when the cap ply was the second pass refuses resuming too (R-END-6)"):
    assertEquals(ended.resume.map(_.phase), Right(Phase.Play))
    assertEquals(ended.closePlay.resume, Left(Refusal.PlayClosed))

  test("results: the higher total wins by the difference, equal totals are jigo (R-RES-1, R-RES-3)"):
    assertEquals(GameResult.fromTotals(BigDecimal(44), BigDecimal("41.5")).sgf, "B+2.5")
    assertEquals(GameResult.fromTotals(BigDecimal("44.50"), BigDecimal(34)).sgf, "B+10.5")
    assertEquals(GameResult.fromTotals(BigDecimal(50), BigDecimal(40)).sgf, "B+10")
    assertEquals(GameResult.fromTotals(BigDecimal(40), BigDecimal("40.5")).sgf, "W+0.5")
    assertEquals(GameResult.fromTotals(BigDecimal(50), BigDecimal(43)).sgf, "B+7")
    val jigo = GameResult.fromTotals(BigDecimal(40), BigDecimal("40.0"))
    assertEquals(jigo.sgf, "0")
    assertEquals(jigo.winningColor, None)

  test("results in SGF form for resignation, time, forfeit and no result (R-RES-2)"):
    assertEquals(GameResult.Resigned(Color.White).sgf, "W+R")
    assertEquals(GameResult.OutOfTime(Color.Black).sgf, "B+T")
    assertEquals(GameResult.Forfeit(Color.White).sgf, "W+F")
    assertEquals(GameResult.NoResult.sgf, "Void")
    assertEquals(GameResult.NoResult.winningColor, None)
