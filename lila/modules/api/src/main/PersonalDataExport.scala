package lila.api

import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.*
import reactivemongo.api.bson.BSONDocument
import reactivemongo.pekkostream.cursorProducer

import lila.db.dsl.{ *, given }
import lila.game.Game

final class PersonalDataExport(
    securityEnv: lila.security.Env,
    gameEnv: lila.game.Env,
    noteApi: lila.round.NoteApi,
    chatEnv: lila.chat.Env,
    relationEnv: lila.relation.Env,
    userRepo: lila.user.UserRepo,
    appealApi: lila.appeal.AppealApi,
    shutupEnv: lila.shutup.Env,
    modLogApi: lila.mod.ModlogApi,
    reportEnv: lila.report.Env,
    db: lila.db.Db
)(using Executor, Materializer):

  private val lightPerSecond = 60
  private val heavyPerSecond = 30

  def apply(user: User): Source[String, ?] =

    val intro = Source.futureSource:
      userRepo.currentOrPrevEmail(user.id).map { email =>
        Source(
          List(
            textTitle(s"Personal data export for ${user.username}"),
            "All dates are UTC",
            bigSep,
            s"Signup date: ${textDate(user.createdAt)}",
            s"Last seen: ${user.seenAt.so(textDate)}",
            s"Public profile: ${user.profile.so(_.toString)}",
            s"Email: ${email.so(_.value)}"
          )
        )
      }

    val connections =
      Source(List(textTitle("Connections"))).concat(
        securityEnv.store.allSessions(user.id).documentSource().throttle(lightPerSecond, 1.second).map { s =>
          s"${s.date.so(textDate)} ${s.ip} ${s.ua}"
        }
      )

    val followedUsers = Source.futureSource:
      relationEnv.api.fetchFollowing(user.id).map { userIds =>
        Source(List(textTitle("Followed players")) ++ userIds.map(_.value))
      }

    // forum posts and direct messages went with the forum and msg modules (unit 3.6).
    // The streamer and coach modules went with unit 3.7, but profiles stored before then stay
    // until the account is deleted, so the export still includes them, as stored.
    def storedProfile(collName: String, title: String) = Source.futureSource:
      db(lila.core.config.CollName(collName))
        .byId[Bdoc](user.id.value)
        .map: doc =>
          Source(doc.so(d => List(textTitle(title), BSONDocument.pretty(d))))

    val streamer = storedProfile("streamer", "Streamer profile")
    val coach = storedProfile("coach", "Coach profile")

    def gameChatsLookup(lookup: Bdoc) =
      gameEnv.gameRepo.coll
        .aggregateWith[Bdoc](readPreference = ReadPref.sec): framework =>
          import framework.*
          List(
            Match(bdoc(Game.BSONFields.playerUids -> user.id)),
            Project(bid(true)),
            PipelineOperator(lookup),
            Unwind("chat"),
            ReplaceRootField("chat"),
            Project(bdoc("_id" -> false, "l" -> true)),
            Unwind("l"),
            Match("l".regexStart(s"${user.id} ", "i"))
          )
        .documentSource()
        .map { _.string("l").so(_.drop(user.id.value.size + 1)) }
        .throttle(heavyPerSecond, 1.second)

    val spectatorGameChats =
      Source(List(textTitle("Spectator game chat messages"))).concat(gameChatsLookup:
        lookup.pipelineFull(
          from = chatEnv.coll.name,
          as = "chat",
          let = bdoc("id" -> bdoc("$concat" -> barr("$_id", "/w"))),
          pipe = List(bdoc("$match" -> expr(bdoc("$eq" -> barr("$_id", "$$id")))))
        ))

    val gameNotes =
      Source(List(textTitle("Game notes"))).concat(
        gameEnv.gameRepo.coll
          .aggregateWith[Bdoc](readPreference = ReadPref.sec): framework =>
            import framework.*
            List(
              Match(bdoc(Game.BSONFields.playerUids -> user.id)),
              Project(bid(true)),
              PipelineOperator(
                lookup.pipelineFull(
                  from = noteApi.collName,
                  as = "note",
                  let = bdoc("id" -> bdoc("$concat" -> barr("$_id", user.id))),
                  pipe = List(bdoc("$match" -> expr(bdoc("$eq" -> barr("$_id", "$$id")))))
                )
              ),
              Unwind("note"),
              ReplaceRootField("note"),
              Project(bdoc("_id" -> false, "t" -> true))
            )
          .documentSource()
          .map(~_.string("t"))
          .throttle(heavyPerSecond, 1.second)
      )

    // blog posts went with the ublog module (unit 3.6).

    val appeals = Source.futureSource:
      appealApi
        .findAll(user)
        .map: appeals =>
          Source:
            appeals.flatMap: appeal =>
              List(textTitle("Appeal")) ++ appeal.msgs.map: msg =>
                val author = if appeal.user.is(msg.by) then "you" else "LiGo"
                s"${textDate(msg.at)} by $author\n${msg.text}$bigSep"

    val reports = Source.futureSource:
      reportEnv.api
        .personalExport(user)
        .map: atoms =>
          Source:
            List(textTitle("Reports you created")) :::
              atoms.map: a =>
                s"${textDate(a.at)}\n${a.text}$bigSep"

    val dubiousChats = Source.futureSource:
      shutupEnv.api
        .getPublicLines(user.id)
        .map: lines =>
          Source:
            List(textTitle("Dubious public chats")) :::
              lines.map: l =>
                s"${textDate(l.date)}\n${l.text}$bigSep"

    val timeouts = Source.futureSource:
      modLogApi
        .timeoutPersonalExport(user.id)
        .map: modlogs =>
          Source:
            List(textTitle("Messages you were timeouted for")) :::
              modlogs.map: m =>
                // do not export the reason of the timeout as not personal data
                val timeoutMsg = m.details.so(_.split(":").drop(1).mkString(":").trim())
                s"${textDate(m.date)}\n${timeoutMsg}$bigSep"

    // title request export removed with the title module (unit 3.3).

    val outro = Source(List(textTitle("End of data export.")))

    List[Source[String, ?]](
      intro,
      connections,
      followedUsers,
      streamer,
      coach,
      spectatorGameChats,
      gameNotes,
      reports,
      dubiousChats,
      timeouts,
      appeals,
      outro
    ).foldLeft(Source.empty[String])(_ concat _)
      .keepAlive(15.seconds, () => " ")

  private val bigSep = "\n------------------------------------------\n"

  private def textTitle(t: String) = s"\n${"=" * t.length}\n$t\n${"=" * t.length}\n"

  import java.time.format.{ DateTimeFormatter, FormatStyle }
  private val englishDateTimeFormatter =
    DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.MEDIUM)
  private def textDate(date: Instant) = englishDateTimeFormatter.print(date)
