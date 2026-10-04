package lila.game

import chess.*
import org.scalacheck.{ Arbitrary, Gen }
import play.api.libs.json.Json

object Arbitraries:

  // TODO move somewhere
  given [S, T](using SameRuntime[S, T], Arbitrary[S]): Arbitrary[T] = Arbitrary:
    Arbitrary.arbitrary[S].map(summon[SameRuntime[S, T]].apply)

  given Arbitrary[Color] = Arbitrary(Gen.oneOf(Color.all))

  given Arbitrary[Event.RedirectOwner] = Arbitrary:
    for
      color <- Arbitrary.arbitrary[Color]
      id <- Arbitrary.arbitrary[GameFullId]
      cookie <- Gen.option(Gen.alphaNumStr.map(v => Json.obj("v" -> v)))
    yield Event.RedirectOwner(color, id, cookie)

  given Arbitrary[Status] = Arbitrary(Gen.oneOf(Status.all))

  given Arbitrary[Event.State] = Arbitrary:
    for
      turns <- Arbitrary.arbitrary[Ply]
      status <- Gen.option(Arbitrary.arbitrary[Status])
      winner <- Gen.option(Arbitrary.arbitrary[Color])
      whiteOffersDraw <- Arbitrary.arbitrary[Boolean]
      blackOffersDraw <- Arbitrary.arbitrary[Boolean]
    yield Event.State(turns, status, winner, whiteOffersDraw, blackOffersDraw)

  given Arbitrary[Event.ClockEvent] = Arbitrary:
    for
      whiteTime <- Arbitrary.arbitrary[Centis]
      blackTime <- Arbitrary.arbitrary[Centis]
      nextLag <- Arbitrary.arbitrary[Option[Centis]]
    yield Event.Clock(whiteTime, blackTime, nextLag)
