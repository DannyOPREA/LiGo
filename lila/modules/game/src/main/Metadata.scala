package lila.game

import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest

object SgfImport:

  /** A hash of the whole SGF text, as lila hashed the whole PGN: spaces and blank lines don't count, so the
    * same file saved by two editors is stored once, while two files with the same moves but other settings or
    * notes stay apart (ADR 0023 §2).
    */
  def hash(sgf: String) = // ByteArray {
    MessageDigest
      .getInstance("MD5")
      .digest:
        sgf.linesIterator
          .map(_.replace(" ", ""))
          .filter(_.nonEmpty)
          .to(List)
          .mkString("\n")
          .getBytes(UTF_8)
      .take(12)

  def make(
      user: Option[UserId],
      date: Option[String],
      sgf: String,
      re: Option[String] = none,
      ru: Option[String] = none
  ) =
    lila.core.game.SgfImport(
      user = user,
      date = date,
      sgf = sgf,
      h = hash(sgf).some,
      re = re,
      ru = ru
    )
