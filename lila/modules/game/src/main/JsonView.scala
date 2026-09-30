package lila.game

import chess.format.Fen
import chess.{ Clock, Color }
import play.api.libs.json.*

import lila.common.Json.{ *, given }
import lila.core.LightUser
import lila.core.game.{ Blurs, Game, GoBridge, Player, Pov, Source }
import lila.game.GameExt.{ expirable, timeForFirstMove }

final class JsonView(rematches: Rematches):

  import JsonView.given

  def immutable(game: Game, initialFen: Option[Fen.Full]) =
    Json
      .obj(
        "id" -> game.id,
        "variant" -> game.variant,
        "speed" -> game.speed.key,
        "perf" -> game.perfKey,
        "rated" -> game.rated,
        "source" -> game.source,
        "createdAt" -> game.createdAt
      )
      .add("startedAtTurn" -> game.startedAtPly.some.filter(_ > 0))
      .add("initialFen" -> initialFen)
      .add("tournamentId" -> game.tournamentId)
      .add("swissId" -> game.swissId)
      .add("rules" -> game.metadata.nonEmptyRules)

  def base(game: Game, initialFen: Option[Fen.Full]) =
    immutable(game, initialFen) ++ Json
      .obj(
        "turns" -> game.ply,
        "status" -> game.status
      )
      // A Go game has no FEN: its setup, moves and position facts instead (ADR 0019 §3).
      .add("fen" -> (!game.isGo).option(Fen.write(game.chessState)))
      .add("go" -> game.go.map(JsonView.go))
      .add("threefold" -> game.history.threefoldRepetition)
      .add("winner" -> game.winnerColor)
      .add("abortedBy" -> game.abortedBy)
      .add("rematch" -> rematches.getAcceptedId(game.id))
      .add("drawOffers" -> (!game.drawOffers.isEmpty).option(game.drawOffers.normalizedPlies))

  // adds fields that should be computed by the client instead
  def baseWithChessDenorm(game: Game, initialFen: Option[Fen.Full]) =
    base(game, initialFen) ++ Json
      .obj("player" -> game.turnColor)
      .add("check" -> game.position.checkSquare.map(_.key))
      .add("lastMove" -> game.lastMoveKeys)

  def ownerPreview(pov: Pov)(using LightUser.GetterSync) =
    Json
      .obj(
        "fullId" -> pov.fullId,
        "gameId" -> pov.gameId,
        "color" -> pov.color,
        "lastMove" -> (if pov.game.isGo then "" else pov.game.lastMoveKeys | ""),
        "source" -> pov.game.source,
        "status" -> pov.game.status,
        "variant" -> Json.obj(
          "key" -> pov.game.variant.key,
          "name" -> pov.game.variant.name
        ),
        "speed" -> pov.game.speed.key,
        "perf" -> pov.game.perfKey,
        "rated" -> pov.game.rated,
        "hasMoved" -> pov.hasMoved,
        "opponent" -> Json
          .obj(
            "id" -> pov.opponent.userId,
            "username" -> lila.game.Namer
              .playerTextBlocking(pov.opponent, withRating = false)
          )
          .add("rating" -> pov.opponent.rating)
          .add("ratingDiff" -> pov.opponent.ratingDiff)
          .add("ai" -> pov.opponent.aiLevel),
        "isMyTurn" -> pov.isMyTurn
      )
      .add("fen" -> (!pov.game.isGo).option(maybeFen(pov)))
      .add("go" -> pov.game.go.map(JsonView.go))
      .add("secondsLeft" -> pov.remainingSeconds)
      .add("tournamentId" -> pov.game.tournamentId)
      .add("swissId" -> pov.game.swissId)
      // .add("orientation" -> pov.game.variant.racingKings.option(chess.White))
      .add("winner" -> pov.game.winnerColor)
      .add("rating" -> pov.player.rating)
      .add("ratingDiff" -> pov.player.ratingDiff)

  def maybeFen(pov: Pov): Fen.Full =
    if pov.player.blindfold then Fen.Full("8/8/8/8/8/8/8/8") else Fen.write(pov.game.chessState)

  def player(p: Player, user: Option[LightUser]) =
    Json
      .obj()
      .add("user", user)
      .add("rating", p.rating)
      .add("ratingDiff", p.ratingDiff)
      .add("name", p.name)
      .add("provisional" -> p.provisional)
      .add("aiLevel" -> p.aiLevel)
      .add("blindfold" -> p.blindfold)

object JsonView:

  /** A Go game's setup (with its custom starting position, if any), its moves (SGF points, `pass`, `resume`),
    * prisoners (`b` counts the White stones Black took), phase and ko point.
    */
  def go(g: ligo.gorules.GoGame): JsObject =
    import ligo.gorules.{ Action, Phase, Ruleset }
    val s = g.setup
    Json
      .obj(
        "size" -> s.size.lines,
        "rules" -> (s.ruleset match
          case Ruleset.Japanese => "japanese"
          case Ruleset.Chinese => "chinese"),
        "komi" -> s.komi,
        "moves" -> g.actions
          .map:
            case Action.Place(at) => at.sgf
            case Action.Pass => "pass"
            case Action.Resume => "resume"
          .mkString(" "),
        "prisoners" -> Json.obj("b" -> g.captures.black, "w" -> g.captures.white),
        "phase" -> (g.phase match
          case Phase.Play => "play"
          case Phase.Scoring => "scoring")
      )
      .add("handicap" -> Option.when(s.handicap > 0)(s.handicap))
      .add("position" -> s.position.map: p =>
        def points(c: ligo.gorules.Color) = p.stones.collect { case (at, `c`) => at.sgf }.toList.sorted
        Json.obj(
          "black" -> points(ligo.gorules.Color.Black),
          "white" -> points(ligo.gorules.Color.White),
          "toMove" -> GoBridge.color(p.toMove).name
        ))
      .add("ko" -> g.koPoint.map(_.sgf))

  def expiration(game: Game) =
    game.expirable.option:
      Json.obj(
        "idleMillis" -> (nowMillis - game.movedAt.toMillis),
        "millisToMove" -> game.timeForFirstMove.millis
      )

  given OWrites[chess.Status] = OWrites: s =>
    Json.obj(
      "id" -> s.id,
      "name" -> s.name
    )

  given OWrites[Crosstable.Result] = Json.writes

  given OWrites[Crosstable.Users] = OWrites: users =>
    JsObject(users.toList.map: u =>
      u.id.value -> JsNumber(u.score / 10d))

  given OWrites[Crosstable] = OWrites: c =>
    Json.obj(
      "users" -> c.users,
      "nbGames" -> c.nbGames
      // "results" -> c.results
    )

  given OWrites[Crosstable.Matchup] = OWrites: m =>
    Json.obj(
      "users" -> m.users,
      "nbGames" -> m.users.nbGames
    )

  given OWrites[Crosstable.WithMatchup] = OWrites: c =>
    Json.toJsObject(c.crosstable).add("matchup" -> c.matchup)

  given OWrites[Blurs] = OWrites: blurs =>
    import lila.game.Blurs.binaryString
    Json.obj(
      "nb" -> blurs.nb,
      "bits" -> blurs.binaryString
    )

  given OWrites[chess.variant.Variant] = OWrites: v =>
    Json.obj(
      "key" -> v.key,
      "name" -> v.name,
      "short" -> v.shortName
    )

  given OWrites[Clock] = OWrites: c =>
    Json.obj(
      "running" -> c.isRunning,
      "initial" -> c.limitSeconds,
      "increment" -> c.incrementSeconds,
      "white" -> c.remainingTime(Color.White).toSeconds,
      "black" -> c.remainingTime(Color.Black).toSeconds,
      "emerg" -> c.config.emergSeconds
    )

  given Writes[Source] = writeAs(_.name)
  given Writes[lila.core.game.GameRule] = writeAs(_.toString)
