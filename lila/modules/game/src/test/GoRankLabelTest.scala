package lila.game

import chess.{ Color, IntRating }
import chess.rating.RatingProvisional

import lila.core.game.Player
import lila.core.id.GamePlayerId

// Unit 5.5 (ADR 0021 §3): a game player's rating shows as its kyu/dan label, made on the server.
class GoRankLabelTest extends munit.FunSuite:

  private def player(rating: Option[Int], provisional: Boolean) =
    Player(GamePlayerId("wwww"), Color.White, aiLevel = none)
      .copy(rating = rating.map(IntRating(_)), provisional = RatingProvisional(provisional))

  test("the name text and game lists show the label, with ? while provisional"):
    assertEquals(Namer.ratingString(player(1580.some, provisional = true)), Some("5k?"))
    assertEquals(Namer.ratingString(player(1960.some, provisional = false)), Some("1d"))
    assertEquals(Namer.ratingString(player(none, provisional = false)), None)
