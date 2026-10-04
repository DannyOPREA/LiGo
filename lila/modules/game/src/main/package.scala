package lila.game

import alleycats.Zero

export lila.core.lilaism.Lilaism.{ Game as CoreGame, Pov as CorePov, *, given }
export lila.common.extensions.*
export lila.core.id.{ GameFullId, GamePlayerId, GameAnyId }

type GameQuickOpening = lila.core.game.Game => Option[chess.opening.Opening]

private lazy val logger = lila.log("game")

/* LiGo: a handicap game's rematch keeps the colours, so the same player gets the stones again (units 4.9
 * and 5.7, ADR 0021 §4); the in-game rematch (round's Rematcher) and the challenge one (ChallengeMaker)
 * both ask here. */
def rematchAlternatesColor(game: lila.core.game.Game, users: List[Option[lila.core.user.User]]): Boolean =
  game.go.setup.handicap == 0 && !(game.fromPosition && users.count(_.exists(_.isBot)) == 1)
