package lila.lobby

import chess.ByColor

import lila.core.socket.Sri
import lila.core.user.{ GameUsers, WithPerf }

final private class Biter(
    userApi: lila.core.user.UserApi,
    gameRepo: lila.core.game.GameRepo,
    newPlayer: lila.core.game.NewPlayer
)(using Executor)(using idGenerator: lila.core.game.IdGenerator):

  def apply(hook: Hook, sri: Sri, user: Option[LobbyUser]): Fu[JoinHook] =
    if canJoin(hook, user)
    then join(hook, sri, user)
    else fufail(s"$user cannot bite hook $hook")

  def apply(seek: Seek, user: LobbyUser): Fu[JoinSeek] =
    if canJoin(seek, user)
    then join(seek, user)
    else fufail(s"$user cannot join seek $seek")

  private def join(hook: Hook, sri: Sri, lobbyUserOption: Option[LobbyUser]): Fu[JoinHook] =
    for
      users <- userApi.gamePlayersAny(ByColor(lobbyUserOption.map(_.id), hook.userId), hook.perfType)
      (joiner, owner) = users.toPair
      ownerColor <- assignCreatorColor(owner, joiner, hook.color)
      newGame <- makeGame(hook, ownerColor.fold(ByColor(owner, joiner), ByColor(joiner, owner)))
      game <- idGenerator.withUniqueId(newGame)
      _ <- gameRepo.insertDenormalized(game)
    yield
      lila.mon.lobby.hook.join.increment()
      JoinHook(sri, hook, game, ownerColor)

  private def join(seek: Seek, lobbyUser: LobbyUser): Fu[JoinSeek] =
    for
      users <- userApi
        .gamePlayersLoggedIn(ByColor(lobbyUser.id, seek.user.id), seek.perfType)
        .orFail(s"No such seek users: $seek")
      (joiner, owner) = users.toPair
      ownerColor <- assignCreatorColor(owner.some, joiner.some, TriColor.Random)
      newGame <- makeGame(seek, ownerColor.fold(ByColor(owner, joiner), ByColor(joiner, owner)).map(some))
      game <- idGenerator.withUniqueId(newGame)
      _ <- gameRepo.insertDenormalized(game)
    yield JoinSeek(joiner.id, seek, game, ownerColor)

  private def assignCreatorColor(
      creator: Option[WithPerf],
      joiner: Option[WithPerf],
      color: TriColor
  ): Fu[Color] =
    color match
      case TriColor.Random => userApi.firstGetsWhite(creator.map(_.id), joiner.map(_.id)).map(Color.fromWhite)
      case fixed =>
        creator.map(_.id).foreach(userApi.incColor(_, fixed.resolve()))
        fuccess(fixed.resolve())

  // A Go game from the hook's or seek's setup (unit 3.15); the setup was checked when it was made.
  private def makeGame(hook: Hook, users: GameUsers): Fu[lila.core.game.NewGame] =
    newGo(
      hook.go,
      hook.clock.fischer.map(_.toClock),
      users,
      hook.rated,
      daysPerTurn = none,
      hook.clock.byoyomi
    )

  private def makeGame(seek: Seek, users: GameUsers): Fu[lila.core.game.NewGame] =
    newGo(seek.goSetup, clock = none, users, seek.rated, seek.daysPerTurn, byoyomi = none)

  private def newGo(
      setup: ligo.gorules.Setup,
      clock: Option[chess.Clock],
      users: GameUsers,
      rated: chess.Rated,
      daysPerTurn: Option[scalalib.model.Days],
      byoyomi: Option[ligo.gorules.ByoyomiConfig]
  ): Fu[lila.core.game.NewGame] =
    lila.core.game
      .newGoGame(
        setup,
        clock,
        players = users.mapWithColor(newPlayer.apply),
        rated = rated,
        source = lila.core.game.Source.Lobby,
        daysPerTurn = daysPerTurn,
        byoyomi = byoyomi
      )
      .fold(e => fufail(s"Can't start a Go game from $setup: ${e.message}"), g => fuccess(g.start))

  def canJoin(hook: Hook, user: Option[LobbyUser]): Boolean = Biter.canJoin(hook, user)

  def canJoin(seek: Seek, user: LobbyUser): Boolean = Biter.canJoin(seek, user)

  def showHookTo(hook: Hook, member: LobbySocket.Member): Boolean =
    hook.sri == member.sri || Biter.visible(hook, member.user)

private object Biter:

  def canJoin(hook: Hook, user: Option[LobbyUser]): Boolean =
    visible(hook, user) &&
      hook.isAuth == user.isDefined && user.forall: u =>
        !hook.userId.contains(u.id) &&
          hook.ratingRangeOrDefault.contains(u.ratingAt(hook.perfType))

  def canJoin(seek: Seek, user: LobbyUser): Boolean =
    seek.user.id != user.id && visible(seek, user) &&
      seek.realRatingRange.forall:
        _.contains(user.ratingAt(seek.perfType))

  /* Which open games a player is sent (ADR 0022 §5, unit 6.5): all but those from or to players they
   * block or who block them, and those of the other "lame" kind (troll and banned accounts; a guest
   * counts as not lame). Games they can't join for being a guest or a member, for their rating or for
   * being rated when they are a guest are sent too, and greyed by the browser; joining is still
   * checked by `canJoin`. */
  def visible(hook: Hook, user: Option[LobbyUser]): Boolean =
    user.so(_.lame) == hook.lame && (hook.user, user).tupled.forall(notBlocked)

  def visible(seek: Seek, user: LobbyUser): Boolean =
    user.lame == seek.user.lame && notBlocked(seek.user, user)

  private def notBlocked(a: LobbyUser, b: LobbyUser) =
    !a.blocking.value.contains(b.id) && !b.blocking.value.contains(a.id)
