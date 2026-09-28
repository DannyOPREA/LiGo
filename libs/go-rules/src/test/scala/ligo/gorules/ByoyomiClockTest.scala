package ligo.gorules

// The byo-yomi clock (unit 4.2): main time, periods kept or used up, out of time, stopping for the
// scoring phase, lag compensation, handicap games and storage. A fake wall clock drives time.
// Licence: MIT (LiGo's own code, ADR 0006).
class ByoyomiClockTest extends munit.FunSuite:

  private class Wall:
    var ms = 1_000_000L
    def seconds(s: Double): Unit = ms += (s * 1000).toLong
    val now: () => Long = () => ms

  private val main60 = ByoyomiConfig(mainSeconds = 60, periods = 3, periodSeconds = 30)

  private def clock(config: ByoyomiConfig = main60, first: Color = Color.Black)(using w: Wall) =
    ByoyomiClock(config, first, w.now).fold(fail(_), identity)

  // One move by the player to move after thinking `s` seconds.
  extension (c: ByoyomiClock)
    private def after(s: Double)(using w: Wall): ByoyomiClock =
      w.seconds(s)
      c.move()

  // Black and White alternate; White always moves instantly, so only Black's time moves.
  private def blackThinks(c: ByoyomiClock, s: Double)(using Wall): ByoyomiClock =
    c.after(s).after(0)

  test("rejects settings without periods or with an empty period"):
    given Wall = Wall()
    assert(ByoyomiClock(ByoyomiConfig(60, 0, 30), Color.Black).isLeft)
    assert(ByoyomiClock(ByoyomiConfig(60, 3, 0), Color.Black).isLeft)
    assert(ByoyomiClock(ByoyomiConfig(-1, 3, 30), Color.Black).isLeft)
    assert(ByoyomiClock(ByoyomiConfig(0, 3, 4), Color.Black).isLeft, "periods under 5 s without main time")
    assert(ByoyomiClock(ByoyomiConfig(0, 3, 5), Color.Black).isRight)
    assert(ByoyomiClock(ByoyomiConfig(60, 3, 1), Color.Black).isRight)

  test("a new clock is stopped, Black's side current, with full main time and every period"):
    given Wall = Wall()
    val c = clock()
    assert(!c.isRunning)
    assertEquals(c.toMove, Color.Black)
    assertEquals(c.reading(Color.Black), ByoyomiReading(6000, 3, inByoyomi = false))
    assertEquals(c.reading(Color.White), ByoyomiReading(6000, 3, inByoyomi = false))

  test("in a handicap game White's clock is current first (R-HCP-3)"):
    given w: Wall = Wall()
    val c = clock(first = Color.White).start
    assertEquals(c.toMove, Color.White)
    w.seconds(10)
    assertEquals(c.reading(Color.White).centis, 5000)
    assertEquals(c.reading(Color.Black).centis, 6000)

  test("main time runs down and is charged only to the player who moved"):
    given w: Wall = Wall()
    val c = clock().start.after(10)
    assertEquals(c.toMove, Color.White)
    assertEquals(c.reading(Color.Black), ByoyomiReading(5000, 3, inByoyomi = false))
    assertEquals(c.reading(Color.White), ByoyomiReading(6000, 3, inByoyomi = false))

  test("the reading of the running clock counts down between moves"):
    given w: Wall = Wall()
    val c = clock().start
    w.seconds(20)
    assertEquals(c.reading(Color.Black), ByoyomiReading(4000, 3, inByoyomi = false))
    w.seconds(50) // 70 s in: main time gone, 10 s into the first period
    assertEquals(c.reading(Color.Black), ByoyomiReading(2000, 3, inByoyomi = true))
    w.seconds(25) // 95 s: the first period ran out, 5 s into the second
    assertEquals(c.reading(Color.Black), ByoyomiReading(2500, 2, inByoyomi = true))

  test("a move made within a period keeps it, and the period starts full again"):
    given w: Wall = Wall()
    val c0 = blackThinks(clock().start, 70) // main time 60 s, then 10 s of the first period
    assertEquals(c0.reading(Color.Black), ByoyomiReading(3000, 3, inByoyomi = true))
    val c1 = blackThinks(c0, 29)
    assertEquals(c1.reading(Color.Black), ByoyomiReading(3000, 3, inByoyomi = true))

  test("a period that runs out is used up, and the next starts full after the move"):
    // 3 periods of 30 s: a move 15 s into the second period uses one up; 2 are left (60 s).
    given w: Wall = Wall()
    val c0 = blackThinks(clock().start, 70)
    val c1 = blackThinks(c0, 45) // the first period runs out after 30 s, the move comes 15 s into the second
    assertEquals(c1.reading(Color.Black), ByoyomiReading(3000, 2, inByoyomi = true))
    val c2 = blackThinks(c1, 35) // the second period runs out: into the last one
    assertEquals(c2.reading(Color.Black), ByoyomiReading(3000, 1, inByoyomi = true))
    assert(!c2.outOfTime(Color.Black))
    assert(!blackThinks(c1, 65).isRunning, "65 s is more than the 60 s the two periods hold")

  test("the last period running out is out of time"):
    given w: Wall = Wall()
    val c = blackThinks(clock().start, 70) // in byo-yomi, 3 periods left
    w.seconds(89)
    assert(!c.outOfTime(Color.Black))
    w.seconds(1)
    assert(c.outOfTime(Color.Black))
    assertEquals(c.reading(Color.Black), ByoyomiReading(0, 0, inByoyomi = true))
    assert(!c.outOfTime(Color.White))

  test("with main time, running out means main time and every period"):
    given w: Wall = Wall()
    val c = clock().start
    w.seconds(149)
    assert(!c.outOfTime(Color.Black))
    w.seconds(1)
    assert(c.outOfTime(Color.Black))

  test("a move after the last period ran out stops the clock instead of switching on"):
    given w: Wall = Wall()
    val c = clock().start.after(151)
    assert(!c.isRunning)

  test("no main time: the game starts in byo-yomi with every period"):
    given w: Wall = Wall()
    val c = clock(ByoyomiConfig(0, 5, 10)).start
    assertEquals(c.reading(Color.Black), ByoyomiReading(1000, 5, inByoyomi = true))
    val c1 = blackThinks(c, 9)
    assertEquals(c1.reading(Color.Black), ByoyomiReading(1000, 5, inByoyomi = true))
    val c2 = blackThinks(c1, 15)
    assertEquals(c2.reading(Color.Black), ByoyomiReading(1000, 4, inByoyomi = true))
    w.seconds(40)
    assert(c2.outOfTime(Color.Black))

  test("stopping for the scoring phase keeps both players' time and periods, and resuming goes on"):
    given w: Wall = Wall()
    val playing = clock().start.after(70).after(20) // Black in byo-yomi, White used 20 s; Black to move
    w.seconds(5)
    val stopped = playing.stop // Black is charged the 5 s
    assert(!stopped.isRunning)
    val before = (stopped.reading(Color.Black), stopped.reading(Color.White))
    assertEquals(before._1, ByoyomiReading(2500, 3, inByoyomi = true))
    assertEquals(before._2, ByoyomiReading(4000, 3, inByoyomi = false))
    w.seconds(600) // a long scoring phase costs nobody anything
    assertEquals((stopped.reading(Color.Black), stopped.reading(Color.White)), before)
    assert(!stopped.outOfTime(Color.Black))
    val resumed = stopped.start
    w.seconds(10)
    assertEquals(resumed.reading(Color.Black), ByoyomiReading(1500, 3, inByoyomi = true))

  test("reported lag is compensated up to strategygames' quota"):
    given w: Wall = Wall()
    val c = clock().start
    w.seconds(10)
    val compensated = c.move(clientLagCentis = Some(50))
    assertEquals(compensated.reading(Color.Black).centis, 5050)
    w.seconds(0)
    val c2 = clock().start
    w.seconds(10)
    val huge = c2.move(clientLagCentis = Some(10_000)) // far above the quota: only the quota is granted
    val granted = huge.reading(Color.Black).centis - 5000
    assert(granted > 0 && granted < 1000, s"granted $granted cs of 10,000 reported")

  test("give more time adds to main time, and is refused for nothing or less"):
    given w: Wall = Wall()
    val c = clock().giveTime(Color.White, 1500).fold(fail(_), identity)
    assertEquals(c.reading(Color.White).centis, 7500)
    assert(clock().giveTime(Color.White, 0).isLeft)
    assert(clock().giveTime(Color.White, -100).isLeft)

  test("time given in byo-yomi is kept across moves until used"):
    given w: Wall = Wall()
    val inByo = blackThinks(clock().start, 70)
    val topped = inByo.giveTime(Color.Black, 6000).fold(fail(_), identity)
    assertEquals(topped.reading(Color.Black), ByoyomiReading(9000, 3, inByoyomi = true))
    val after = blackThinks(topped, 1)
    assertEquals(after.reading(Color.Black), ByoyomiReading(8900, 3, inByoyomi = true))

  test("main time running out exactly on a move goes into byo-yomi with every period"):
    given w: Wall = Wall()
    val c = blackThinks(clock().start, 60)
    assertEquals(c.reading(Color.Black), ByoyomiReading(3000, 3, inByoyomi = true))

  test("a move on a stopped clock charges nothing"):
    given w: Wall = Wall()
    val c = clock()
    w.seconds(30)
    assertEquals(c.move().reading(Color.Black).centis, 6000)

  test("a game-ending move stops the clock and still switches the side"):
    given w: Wall = Wall()
    val c = clock().start.after(0).after(10) // Black to move
    val ended = c.move(gameActive = false)
    assert(!ended.isRunning)
    assertEquals(ended.toMove, Color.White)

  test("out of time with grace allows for the player's lag"):
    given w: Wall = Wall()
    val c = clock().start
    w.seconds(150.5)
    assert(c.outOfTime(Color.Black))
    assert(!c.outOfTime(Color.Black, withGrace = true))
    w.seconds(5)
    assert(c.outOfTime(Color.Black, withGrace = true))

  test("clocks without main time and White-first clocks restore to the same readings"):
    given w: Wall = Wall()
    val noMain = blackThinks(clock(ByoyomiConfig(0, 3, 10)).start, 12)
    val back = ByoyomiClock.restore(noMain.state, w.now).fold(fail(_), identity)
    for color <- Color.values do assertEquals(back.reading(color), noMain.reading(color))
    val whiteFirst = clock(first = Color.White).start.after(5)
    val back2 = ByoyomiClock.restore(whiteFirst.state, w.now).fold(fail(_), identity)
    assertEquals(back2.toMove, Color.Black)
    for color <- Color.values do assertEquals(back2.reading(color), whiteFirst.reading(color))

  test("a stored clock rebuilds to the same readings, running or stopped"):
    given w: Wall = Wall()
    val c = clock().start.after(100).after(30) // Black in byo-yomi, White 30 s used, Black to move
    w.seconds(7)
    val running = ByoyomiClock.restore(c.state, w.now).fold(fail(_), identity)
    for color <- Color.values do assertEquals(running.reading(color), c.reading(color))
    assert(running.isRunning)
    assertEquals(running.toMove, Color.Black)
    val stopped = c.stop
    val back = ByoyomiClock.restore(stopped.state, w.now).fold(fail(_), identity)
    for color <- Color.values do assertEquals(back.reading(color), stopped.reading(color))
    assert(!back.isRunning)
    assertEquals(back.config, main60)
