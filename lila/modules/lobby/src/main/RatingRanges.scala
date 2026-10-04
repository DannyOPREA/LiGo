package lila.lobby

import play.api.libs.json.*

import lila.core.rating.RatingRange
import lila.rating.GoRating

/** An open game's rating range as the lobby's JSON shows it (unit 6.5): `{ min, max, low?, high? }`, with the
  * rank of each bound ("10k", "1d") from the Go rank table; a bound at lila's limit is open and has none. The
  * browser writes the label ("10k–1d", "10k+").
  */
private object RatingRanges:

  def json(r: RatingRange): JsObject =
    Json
      .obj("min" -> r.min.value, "max" -> r.max.value)
      .add("low" -> low(r))
      .add("high" -> high(r))

  def low(r: RatingRange): Option[String] = (r.min > RatingRange.min).option(rank(r.min))
  def high(r: RatingRange): Option[String] = (r.max < RatingRange.max).option(rank(r.max))

  private def rank(r: chess.IntRating) = GoRating.label(r, chess.rating.RatingProvisional.No)
