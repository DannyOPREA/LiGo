package lila.pool

import chess.ByColor

import lila.core.game.{ GameRepo, IdGenerator, NewPlayer, Source }
import lila.core.pool.{ Pairing, Pairings }
import lila.common.Bus

final private class GameStarter(
    userApi: lila.core.user.UserApi,
    gameRepo: GameRepo,
    newPlayer: NewPlayer,
    idGenerator: IdGenerator,
    onStart: GameId => Unit
)(using Executor, Scheduler):

  private val workQueue = scalalib.actor.AsyncActorSequencer(
    maxSize = Max(64),
    timeout = 10.seconds,
    name = "gameStarter",
    lila.mon.asyncActorMonitor.full
  )

  def apply(pool: PoolConfig, couples: Vector[MatchMaking.Couple]): Funit =
    couples.nonEmpty.so:
      val userIds = couples.flatMap(_.userIds)
      workQueue:
        for
          (perfs, ids) <- userApi.perfOf(userIds, pool.perfKey).zip(idGenerator.games(couples.size))
          pairingOpts <- couples.zip(ids).parallel(one(pool, perfs).tupled)
        yield
          val pairings = pairingOpts.flatten.toList
          for
            pairing <- pairings
            (sri, _) <- pairing.players.toList
          do Bus.publishDyn(pairing, s"hookRemove:$sri")
          Bus.pub(Pairings(pairings))

  private def one(pool: PoolConfig, perfs: Map[UserId, Perf])(
      couple: MatchMaking.Couple,
      id: GameId
  ): Fu[Option[Pairing]] =
    import couple.*
    (perfs.get(p1.userId), perfs.get(p2.userId)).tupled.traverse: (perf1, perf2) =>
      for
        // with handicap stones the weaker player takes Black (ADR 0022 §3); otherwise lila's colours
        p1White <- GameStarter.p1White(couple).fold(userApi.firstGetsWhite(p1.userId, p2.userId))(fuccess)
        (whitePerf, blackPerf) = if p1White then perf1 -> perf2 else perf2 -> perf1
        (whiteMember, blackMember) = if p1White then p1 -> p2 else p2 -> p1
        game <- makeGame(
          id,
          pool,
          couple.stones,
          whiteMember.userId -> whitePerf,
          blackMember.userId -> blackPerf
        )
        _ <- gameRepo.insertDenormalized(game)
      yield
        onStart(game.id)
        Pairing(ByColor(whiteMember.sri -> game.fullIds.white, blackMember.sri -> game.fullIds.black))

  /** A Go game on the pool's board size and clock with Japanese rules and the spec's komi (ADR 0022 §1), with
    * the pair's handicap stones (0.5 komi with any handicap, R-KOMI-2); casual until unit 5.7 rates pool
    * games.
    */
  private def makeGame(
      id: GameId,
      pool: PoolConfig,
      stones: Int,
      whiteUser: (UserId, Perf),
      blackUser: (UserId, Perf)
  ): Fu[Game] =
    lila.core.game
      .newGoGame(
        GameStarter.setupFor(pool, stones),
        pool.clock.fischer.map(_.toClock),
        players = ByColor(whiteUser, blackUser).mapWithColor((u, p) => newPlayer(u, p)),
        rated = chess.Rated.No,
        source = Source.Pool,
        byoyomi = pool.clock.byoyomi
      )
      .fold(
        e => fufail(s"Pool ${pool.id} can't start a Go game: ${e.message}"),
        g => fuccess(g.withId(id).start)
      )

private object GameStarter:

  /* Whether the couple's first player takes White, when the pairing decided it: with stones the weaker player
   * takes Black (ADR 0022 §3). None: lila's colours. */
  def p1White(couple: MatchMaking.Couple): Option[Boolean] = couple.black.map(_ != couple.p1.userId)

  /* The pool's own setup with the pair's handicap: 0 is an even game, 1 the no-komi game, 2–9 stones; komi
   * is the spec's for that handicap (6.5 even, 0.5 with any handicap, R-KOMI-1/2). */
  def setupFor(pool: PoolConfig, stones: Int): ligo.gorules.Setup =
    pool.go.copy(handicap = stones, komi = ligo.gorules.Komi.standard(pool.go.ruleset, stones))
