package lila.puzzle

import chess.rating.glicko.Glicko
import reactivemongo.api.bson.*
import scala.util.{ Success, Try }

import lila.db.BSON
import lila.db.dsl.{ *, given }

private object BsonHandlers:

  import Puzzle.BSONFields as F
  import lila.rating.Glicko.glickoHandler

  // LiGo (ADR 0025 section 5): reads the document `tools/puzzles/mongo/doc.js` writes. Numbers are
  // read from an int, a long or a double, whichever the shell that wrote them chose.
  private[puzzle] given puzzleReader: BSONDocumentReader[Puzzle] with

    private def subDoc(r: BSONDocument, key: String): Option[BSONDocument] =
      r.get(key).collect { case d: BSONDocument => d }

    private def floatOf(r: BSONDocument, key: String): Float =
      r.get(key)
        .collect:
          case BSONDouble(d) => d.toFloat
          case BSONInteger(i) => i.toFloat
        .getOrElse(0f)

    private def readBounds(r: BSONDocument): Option[Puzzle.Bounds] =
      subDoc(r, F.bounds).flatMap: b =>
        for
          top <- Puzzle.number(b, "top")
          left <- Puzzle.number(b, "left")
          bottom <- Puzzle.number(b, "bottom")
          right <- Puzzle.number(b, "right")
        yield Puzzle.Bounds(top.toInt, left.toInt, bottom.toInt, right.toInt)

    def readDocument(r: BSONDocument) = for
      id <- r.getAsTry[PuzzleId](F.id)
      size <- Puzzle.number(r, F.size).map(_.toInt).toTry("Missing puzzle size")
      setup <- subDoc(r, F.setup).toTry("Missing puzzle setup")
      color <- r.string(F.player).flatMap(Color.fromName).toTry("Missing or invalid puzzle player")
      tree <- subDoc(r, F.tree).toTry("Missing puzzle tree")
      goal <- r.string(F.goal).toTry("Missing puzzle goal")
      glicko <- r.getAsTry[Glicko](F.glicko)
      themes <- r.getAsTry[Set[PuzzleTheme.Key]](F.themes)
    yield Puzzle(
      id = id,
      size = size,
      bounds = readBounds(r),
      setup = Puzzle.Setup(
        black = setup.string("black").getOrElse(""),
        white = setup.string("white").getOrElse("")
      ),
      color = color,
      tree = tree,
      goal = goal,
      glicko = glicko,
      plays = Puzzle.number(r, F.plays).fold(0)(_.toInt),
      vote = floatOf(r, F.vote),
      themes = themes,
      prov = subDoc(r, F.prov)
    )

  private[puzzle] given roundIdHandler: BSONHandler[PuzzleRound.Id] = tryHandler[PuzzleRound.Id](
    { case BSONString(v) =>
      v.split(PuzzleRound.idSep) match
        case Array(userId, puzzleId) => Success(PuzzleRound.Id(UserId(userId), PuzzleId(puzzleId)))
        case _ => handlerBadValue(s"Invalid puzzle round id $v")
    },
    id => BSONString(id.toString)
  )

  private[puzzle] given BSONHandler[PuzzleRound.Theme] = tryHandler[PuzzleRound.Theme](
    { case BSONString(v) =>
      PuzzleTheme
        .findAny(v.tail)
        .fold[Try[PuzzleRound.Theme]](handlerBadValue(s"Invalid puzzle round theme $v")) { theme =>
          Success(PuzzleRound.Theme(theme.key, v.head == '+'))
        }
    },
    rt => BSONString(s"${if rt.vote then "+" else "-"}${rt.theme}")
  )

  given roundHandler: BSON[PuzzleRound] with
    import PuzzleRound.BSONFields.*
    def reads(r: BSON.Reader) = PuzzleRound(
      id = r.get[PuzzleRound.Id](id),
      win = r.get[PuzzleWin](win),
      fixedAt = r.dateO(fixedAt),
      date = r.date(date),
      vote = r.intO(vote),
      themes = r.getsD[PuzzleRound.Theme](themes)
    )
    def writes(w: BSON.Writer, r: PuzzleRound) =
      bdoc(
        id -> r.id,
        win -> r.win,
        fixedAt -> r.fixedAt,
        date -> r.date,
        vote -> r.vote,
        themes -> w.listO(r.themes)
      )

  import PuzzlePath.given
  private[puzzle] given pathIdHandler: BSONHandler[PuzzlePath.Id] = stringIsoHandler

  import PuzzleAngle.given
  private[puzzle] given BSONHandler[PuzzleAngle] = stringIsoHandler
