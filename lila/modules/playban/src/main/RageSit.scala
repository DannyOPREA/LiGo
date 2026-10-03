package lila.playban

import chess.{ Color, Speed }
import scalalib.ThreadLocalRandom

import lila.core.playban.RageSit

object RageSit:

  object extensions:
    extension (a: RageSit)
      inline def counter: Int = a.value
      def isBad = a.value <= -40
      def isVeryBad = a.value <= -80
      def isTerrible = a.value <= -160
      def isLethal = a.value <= -200

  val empty = lila.core.playban.RageSit(0)

  enum Update:
    case Noop
    case Reset
    case Inc(v: Int)

  // A rage quit or a flag after a lopsided position counted extra in chess; Go has no material to weigh, so
  // it counts nothing extra (unit 3.17).
  val imbalanceInc: Update = Update.Inc(0)

  def redeem(game: Game) = Update.Inc:
    game.speed match
      case s if s < Speed.Bullet => 0
      case Speed.Bullet => ThreadLocalRandom.nextInt(2)
      case Speed.Blitz => 1
      case _ => 2
