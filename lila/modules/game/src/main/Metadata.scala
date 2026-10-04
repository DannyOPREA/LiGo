package lila.game

import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest

object PgnImport:

  def hash(pgn: String) = // ByteArray {
    MessageDigest
      .getInstance("MD5")
      .digest:
        pgn.linesIterator
          .map(_.replace(" ", ""))
          .filter(_.nonEmpty)
          .to(List)
          .mkString("\n")
          .getBytes(UTF_8)
      .take(12)

  def make(user: Option[UserId], date: Option[String], pgn: String) =
    lila.core.game.PgnImport(
      user = user,
      date = date,
      pgn = pgn,
      h = hash(pgn).some
    )
