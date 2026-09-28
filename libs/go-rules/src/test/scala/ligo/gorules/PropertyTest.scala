package ligo.gorules

import scala.util.Random

// PLAN §6 property checks over seeded random games: after every accepted action no chain lacks a
// liberty, stones are conserved, and no stone placement repeats a situation (R-KO-1, R-KO-2),
// checked on real boards rather than strategygames' hashes.
// Licence: MIT (LiGo's own code, ADR 0006).
class PropertyTest extends munit.FunSuite:

  override val munitTimeout = scala.concurrent.duration.Duration(3, "min")

  private type Situation = (Map[Point, Color], Color)

  private def neighbours(p: Point, size: BoardSize): List[Point] =
    List(Point(p.col - 1, p.row), Point(p.col + 1, p.row), Point(p.col, p.row - 1), Point(p.col, p.row + 1))
      .filter(size.contains)

  private def chainHasLiberty(stones: Map[Point, Color], at: Point, size: BoardSize): Boolean =
    val color = stones(at)
    @annotation.tailrec
    def grow(todo: List[Point], seen: Set[Point]): Boolean = todo match
      case Nil => false
      case p :: rest =>
        val ns = neighbours(p, size)
        if ns.exists(!stones.contains(_)) then true
        else
          val more = ns.filter(n => stones.get(n).contains(color) && !seen(n))
          grow(more ++ rest, seen ++ more)
    grow(List(at), Set(at))

  private def count(stones: Map[Point, Color], c: Color) = stones.values.count(_ == c)

  private def play(seed: Long, size: BoardSize, handicap: Int, maxActions: Int): Int =
    val rnd = Random(seed)
    val start = GoGame.start(Setup(size, Ruleset.Chinese, 0.5, handicap)).toOption.get
    val initial = (count(start.stones, Color.Black), count(start.stones, Color.White))
    var game = start
    var seen: Set[Situation] = Set(start.stones -> start.toMove)
    var placed = Map(Color.Black -> 0, Color.White -> 0)
    var history = List.empty[(GoGame, Set[Situation], Map[Color, Int])]
    var actions = 0
    while actions < maxActions do
      val roll = rnd.nextInt(100)
      val next: Option[GoGame] =
        if game.phase == Phase.Scoring then game.resume.toOption
        else if roll < 3 && history.nonEmpty then
          val (prev, prevSeen, prevPlaced) = history.head
          val undone = game.undo.toOption.get
          assertEquals(undone.stones, prev.stones, s"seed $seed: undo restores the stones")
          assertEquals(undone.toMove, prev.toMove)
          seen = prevSeen; placed = prevPlaced; history = history.tail
          Some(undone)
        else if roll < 10 then
          val passed = game.pass.toOption.get
          history = (game, seen, placed) :: history
          seen += passed.stones -> passed.toMove
          Some(passed)
        else
          val empty = (for c <- 0 until size.lines; r <- 0 until size.lines yield Point(c, r))
            .filterNot(game.stones.contains)
          val tried =
            Iterator.continually(empty(rnd.nextInt(empty.size))).take(8).map(at => at -> game.play(at))
          tried
            .collectFirst { case (at, Right(after)) => at -> after }
            .orElse(game.pass.toOption.map(Point(-1, -1) -> _))
            .map: (at, after) =>
              val situation = after.stones -> after.toMove
              history = (game, seen, placed) :: history
              if at.col >= 0 then
                assert(!seen(situation), s"seed $seed: ${at.sgf} repeated a situation")
                placed = placed.updated(game.toMove, placed(game.toMove) + 1)
              seen += situation
              after
      next match
        case None => actions = maxActions // no legal stone and the random pass didn't come: stop
        case Some(g) =>
          if g.phase == Phase.Play && g.actions.lastOption.contains(Action.Resume) then
            history = Nil // a takeback never reaches back past a resumption
          game = g
          actions += 1
          game.stones.keys.foreach: p =>
            assert(chainHasLiberty(game.stones, p, size), s"seed $seed: chain at ${p.sgf} has no liberty")
          val caps = game.captures
          assertEquals(
            count(game.stones, Color.Black),
            initial._1 + placed(Color.Black) - caps.white,
            s"seed $seed"
          )
          assertEquals(
            count(game.stones, Color.White),
            initial._2 + placed(Color.White) - caps.black,
            s"seed $seed"
          )
    actions

  test("random 9x9 games keep liberties, stone counts and superko"):
    val total = (1L to 40L).map(seed => play(seed, BoardSize.Nine, (seed % 4).toInt * 2 % 10, 400)).sum
    assert(total > 12000, s"only $total actions played")

  test("random 19x19 games keep liberties, stone counts and superko"):
    val total = (1L to 4L).map(seed => play(seed, BoardSize.Nineteen, (seed * 3 % 10).toInt, 600)).sum
    assert(total > 2000, s"only $total actions played")
