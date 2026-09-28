package ligo.gorules.differential

import scala.util.Random

import ligo.gorules.*

// Licence: MIT (LiGo's own code, ADR 0006).

/** What one random game exercised. */
final case class GameStats(
    size: BoardSize,
    handicap: Int,
    actions: Int = 0,
    stones: Int = 0,
    passes: Int = 0,
    undos: Int = 0,
    resumes: Int = 0,
    captured: Int = 0,
    // Empty points the adapter refused, and KataGo too (else the game would have stopped), by reason.
    suicideRefusals: Int = 0,
    koRefusals: Int = 0, // the simple ko point (R-KO-4)
    superkoRefusals: Int = 0, // any other repeated situation (R-KO-1)
    scored: Boolean = false
)

/** Where the adapter and the oracle first disagreed in a game, with the game so far as SGF. */
final case class Disagreement(seed: Long, ply: Int, setup: Setup, what: List[String], sgf: String):
  def summary: String =
    s"seed $seed, ${setup.size.lines}x${setup.size.lines} ${setup.ruleset} komi ${setup.komi} " +
      s"handicap ${setup.handicap}, action $ply: ${what.mkString("; ")}"

/** One seeded random game, played by the adapter and followed by the oracle, compared after every action on
  * the legal points (while in play), the stones, the player to move and the captures, and at the end on the
  * area score (PLAN §3.3: legality, captures and final area score).
  *
  * The game: a random board size, ruleset and handicap (with standard komi); then random legal stones that
  * don't fill the player's own one-point eyes (so the game ends), with the odd pass in mid-game (post-pass
  * situations, R-KO-2) and the odd takeback (R-KO-8). Two passes open the scoring phase. Play resumes
  * (R-SP-6, R-SP-9) if a player still had a stone to play, and a quarter of the time anyway; otherwise the
  * game ends and is scored.
  */
object DifferentialGame:

  def setupFor(rnd: Random): Setup =
    val size = rnd.nextInt(4) match
      case 0 | 1 => BoardSize.Nine
      case 2 => BoardSize.Thirteen
      case _ => BoardSize.Nineteen
    val ruleset = if rnd.nextBoolean() then Ruleset.Japanese else Ruleset.Chinese
    val handicap = if rnd.nextInt(5) == 0 then 2 + rnd.nextInt(8) else 0
    Setup(size, ruleset, Komi.standard(ruleset, handicap), handicap)

  def play(seed: Long, oracle: Oracle): Either[Disagreement, GameStats] =
    // java.util.Random's first draws from neighbouring seeds are alike (seeds 1 to 20 all drew 13x13), so
    // the seed is mixed first.
    val rnd = Random(java.util.SplittableRandom(seed).nextLong())
    val setup = setupFor(rnd)
    val size = setup.size
    val start = GoGame.start(setup).fold(e => sys.error(s"seed $seed: ${e.message}"), identity)
    oracle.newGame(size, setup.komi, start.stones.keySet)

    var game = start
    var stats = GameStats(size, setup.handicap)
    // A safety net: random games end well before this (about 1.2 actions per point).
    val maxActions = size.points * 4

    def disagree(what: List[String]) = Left(
      Disagreement(seed, game.actions.size, setup, what, Sgf.write(game))
    )

    // The adapter's legal points in the current position, read once per action (it costs milliseconds on
    // 19x19) and shared by the comparison and the choice of the next stone.
    var legal = Vector.empty[Point]

    def compare(): Either[Disagreement, Unit] =
      val theirs = oracle.position
      legal = if game.phase == Phase.Play then game.legalPoints.toVector else Vector.empty
      val diffs = List(
        Option
          .when(game.phase == Phase.Play)(legal.toSet)
          .flatMap(setDiff("legal points", _, oracle.legalPoints)),
        setDiff("stones", game.stones.toSet, theirs.stones.toSet),
        Option.when(game.toMove != theirs.toMove)(s"to move: ours ${game.toMove}, KataGo ${theirs.toMove}"),
        Option.when(game.captures != theirs.captures)(
          s"captures: ours ${game.captures}, KataGo ${theirs.captures}"
        )
      ).flatten
      if diffs.isEmpty then Right(()) else disagree(diffs)

    // Sorts the refused empty points for the report. Asking the adapter (`play`) would cost about a millisecond
    // per point on 19x19, and late in a game most empty points are refused, so a stone that would have no
    // liberty is recognised here from the board instead; the comparison itself never relies on this.
    def refusals(legal: Set[Point]): GameStats =
      val empty = allPoints(size).filterNot(p => game.stones.contains(p) || legal(p))
      empty.foldLeft(stats): (s, p) =>
        if !hasLibertyAfter(game.stones, p, game.toMove, size) then
          s.copy(suicideRefusals = s.suicideRefusals + 1)
        else if game.koPoint.contains(p) then s.copy(koRefusals = s.koRefusals + 1)
        else s.copy(superkoRefusals = s.superkoRefusals + 1)

    // Which passes were forced (the passer had no stone left to play), by action index. Two forced passes in a
    // row mean the game is settled: every empty point is an eye of one colour, so every group has two eyes and
    // KataGo's count agrees with a plain count of the board. KataGo's area count treats stones inside the
    // opponent's pass-alive area as dead (boardhistory.cpp countAreaScoreWhiteMinusBlack), so an unsettled
    // board can differ by design, not by a rules disagreement.
    var forced = Map.empty[Int, Boolean]

    def settled: Boolean =
      val n = game.actions.size
      forced.get(n - 1).contains(true) && forced.get(n - 2).contains(true)

    // Only the first of two passes can be a random one, so the scoring phase opens when the second player has
    // nothing left to play. A takeback past a resumption is refused, so skipping it here changes nothing.
    def lastWasPass: Boolean = game.actions.reverseIterator.find(_ != Action.Resume).contains(Action.Pass)

    /** Plays one action; false when the game is over. */
    def step(): Boolean =
      if game.phase == Phase.Scoring then
        // An unsettled end resumes whenever it may (R-SP-9 decides); a settled one a quarter of the time.
        game.resume match
          case Right(resumed) if !settled || rnd.nextInt(4) == 0 =>
            game = resumed
            stats = stats.copy(resumes = stats.resumes + 1)
            true
          case _ => false
      else
        val roll = rnd.nextInt(100)
        game.undo.toOption.filter(_ => roll == 0) match
          case Some(undone) =>
            game = undone
            oracle.undo()
            stats = stats.copy(undos = stats.undos + 1)
          case None =>
            stats = refusals(legal.toSet)
            val candidates = legal.filterNot(p => ownEye(game, p))
            val mover = game.toMove
            val index = game.actions.size
            if candidates.isEmpty || (roll < 3 && !lastWasPass) || index >= maxActions then
              game = game.pass.fold(r => sys.error(s"seed $seed: pass refused (${r.key})"), identity)
              oracle.play(mover, None)
              forced += index -> candidates.isEmpty
              stats = stats.copy(passes = stats.passes + 1)
            else
              val at = candidates(rnd.nextInt(candidates.size))
              val before = game.stones.size
              game = game
                .play(at)
                .fold(r => sys.error(s"seed $seed: legal point ${at.sgf} refused (${r.key})"), identity)
              oracle.play(mover, Some(at))
              forced -= index
              stats = stats.copy(
                stones = stats.stones + 1,
                captured = stats.captured + before + 1 - game.stones.size
              )
        stats = stats.copy(actions = stats.actions + 1)
        true

    @annotation.tailrec
    def loop(): Either[Disagreement, GameStats] =
      compare() match
        case Left(d) => Left(d)
        case Right(()) if step() => loop()
        case Right(()) if !settled => Right(stats) // only after the safety net: nothing to count
        case Right(()) =>
          val ours = EngineScore.whiteMinusBlack(game)
          val theirs = oracle.finalScore
          if ours == theirs then Right(stats.copy(scored = true))
          else disagree(List(s"area score (White minus Black): ours $ours, KataGo $theirs"))

    loop()

  def allPoints(size: BoardSize): IndexedSeq[Point] =
    for row <- 0 until size.lines; col <- 0 until size.lines yield Point(col, row)

  /** An empty point whose neighbours are all the player's own stones: filling it is legal but pointless, and
    * random games that never do it come to an end.
    */
  def ownEye(game: GoGame, p: Point): Boolean =
    neighbours(p, game.size).forall(n => game.stones.get(n).contains(game.toMove))

  /** Whether a `color` stone at the empty point `p` would have a liberty once it has captured what it
    * captures: an empty neighbour, an opponent chain whose last liberty is `p`, or an own chain with another
    * liberty.
    */
  def hasLibertyAfter(stones: Map[Point, Color], p: Point, color: Color, size: BoardSize): Boolean =
    def liberties(from: Point): Set[Point] =
      val c = stones(from)
      @annotation.tailrec
      def grow(todo: List[Point], chain: Set[Point], libs: Set[Point]): Set[Point] = todo match
        case Nil => libs
        case q :: rest =>
          val ns = neighbours(q, size)
          val more = ns.filter(n => stones.get(n).contains(c) && !chain(n))
          grow(more ++ rest, chain ++ more, libs ++ ns.filterNot(stones.contains))
      grow(List(from), Set(from), Set.empty)
    neighbours(p, size).exists: n =>
      stones.get(n) match
        case None => true
        case Some(c) if c == color => (liberties(n) - p).nonEmpty
        case Some(_) => liberties(n) == Set(p)

  def neighbours(p: Point, size: BoardSize): List[Point] =
    List(Point(p.col - 1, p.row), Point(p.col + 1, p.row), Point(p.col, p.row - 1), Point(p.col, p.row + 1))
      .filter(size.contains)

  private def setDiff[A](name: String, ours: Set[A], theirs: Set[A]): Option[String] =
    Option.when(ours != theirs):
      def show(s: Set[A]) = s.toList
        .map {
          case p: Point => p.sgf
          case (p: Point, c) => s"${p.sgf}=$c"
          case other => other.toString
        }
        .sorted
        .mkString(" ")
      s"$name differ: only ours [${show(ours -- theirs)}], only KataGo's [${show(theirs -- ours)}]"
