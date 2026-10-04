package lila.api

import scalatags.Text.all.*

import lila.core.config.NetDomain
import lila.core.misc.lpv.*

final class TextLpvExpand(net: lila.core.config.NetConfig)(using Executor):

  // Every game is a Go game, which has no PGN to show in the (chess) game viewer: game links stay plain
  // links (units 3.16, 3.17).
  def getPgn(@annotation.unused id: GameId): Fu[Option[LpvEmbed]] = fuccess(none)
  // getChapterPgn and getStudyPgn (study/relay PGN embeds) removed with the study and relay
  // modules (unit 3.3).

  // forum linkRenderFromText builds a LinkRender from relative game|chapter urls -> lpv div tags.
  // substitution occurs in common/../RawHtml.scala addLinks
  private[api] def linkRenderFromText(text: String): Fu[LinkRender] =
    regex.forumPgnCandidatesRe
      .findAllMatchIn(text)
      .map(_.group(1))
      .map:
        case regex.gamePgnRe(url, id) => getPgn(GameId(id)).map(url -> _)
        case link => fuccess(link -> link)
      .parallel
      .map:
        _.collect { case (url, Some(LpvEmbed.PublicPgn(pgn))) => url -> pgn }.toMap
      .map: pgns =>
        (url, _) =>
          pgns
            .get(url)
            .map: pgn =>
              div(
                cls := "lpv--autostart is2d",
                attr("data-pgn") := pgn.value,
                attr("data-url") := url,
                plyRe.findFirstIn(url).map(_.substring(1)).map(ply => attr("data-ply") := ply),
                (url.contains("/black")).option(attr("data-orientation") := "black")
              )

  // used by blogs & ublogs to build game|chapter id -> pgn maps
  // the substitution happens later in blog/BlogApi or common/MarkdownRender
  private[api] def allPgnsFromText(text: String, max: Max): Fu[Map[String, LpvEmbed]] =
    regex.markdownPgnCandidatesRe
      .findAllMatchIn(text)
      .map(_.group(1))
      .toList
      .foldLeft(max.value -> List.empty[Fu[(String, Option[LpvEmbed])]]):
        case ((0, replacements), _) => 0 -> replacements
        case ((counter, replacements), candidate) =>
          val (cost, replacement) = candidate match
            case regex.gamePgnRe(_, id) => 1 -> getPgn(GameId(id)).map(id -> _)
            case link => 0 -> fuccess(link -> none)
          (counter - cost) -> (replacement :: replacements)
      ._2
      .parallel
      .map:
        _.collect:
          case (id, Some(embed)) => id -> embed
        .toMap

  private val regex = LpvGameRegex(net.domain)
  private val plyRe = raw"#(\d+)\z".r

private final class LpvGameRegex(domain: NetDomain):

  private val quotedDomain = java.util.regex.Pattern.quote(domain.value)

  val pgnCandidates = raw"""(?:https?://)?(?:lichess\.org|$quotedDomain)(/[/\w#]{8,})\b"""

  val markdownPgnCandidatesRe = pgnCandidates.r
  val forumPgnCandidatesRe = raw"(?m)^$pgnCandidates".r

  val params = raw"""(?:#(?:last|\d{1,4}))?"""

  val gamePgnRe = raw"^(/(\w{8})(?:\w{4}|/(?:white|black))?$params)$$".r
  // chapterPgnRe and studyPgnRe removed with the study and relay modules (unit 3.3).
