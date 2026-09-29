package lila.api

import org.apache.pekko.stream.Materializer
import org.apache.pekko.stream.scaladsl.*
import reactivemongo.pekkostream.cursorProducer

import lila.coach.Coach
import lila.db.dsl.{ *, given }
import lila.game.Game
import lila.streamer.Streamer

final class PersonalDataExport(
    securityEnv: lila.security.Env,
    gameEnv: lila.game.Env,
    noteApi: lila.round.NoteApi,
    chatEnv: lila.chat.Env,
    relationEnv: lila.relation.Env,
    userRepo: lila.user.UserRepo,
    streamerApi: lila.streamer.StreamerApi,
    coachApi: lila.coach.CoachApi,
    appealApi: lila.appeal.AppealApi,
    shutupEnv: lila.shutup.Env,
    modLogApi: lila.mod.ModlogApi,
    reportEnv: lila.report.Env,
    picfitUrl: lila.memo.PicfitUrl
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

    val streamer = Source.futureSource:
      streamerApi
        .find(user)
        .map:
          _.map(_.streamer).so: s =>
            List(textTitle("Streamer profile")) :::
              List(
                "name" -> s.name,
                "image" -> s.picture.so(p => picfitUrl.thumbnail(p)(Streamer.imageDimensions).value),
                "headline" -> s.headline.so(_.value),
                "description" -> s.description.so(_.value),
                "twitch" -> s.twitch.so(_.fullUrl),
                "youtube" -> s.youtube.so(_.fullUrl),
                "createdAt" -> textDate(s.createdAt),
                "updatedAt" -> textDate(s.updatedAt),
                "seenAt" -> textDate(s.seenAt),
                "liveAt" -> s.liveAt.so(textDate)
              ).map: (k, v) =>
                s"$k: $v"
        .map(Source.apply)

    val coach = Source.futureSource:
      coachApi
        .find(user)
        .map:
          _.map(_.coach).so: c =>
            List(textTitle("Coach profile")) :::
              c.profile.textLines :::
              List(
                "image" -> c.picture.so(p => picfitUrl.thumbnail(p)(Coach.imageDimensions).value),
                "languages" -> c.languages.mkString(", "),
                "createdAt" -> textDate(c.createdAt),
                "updatedAt" -> textDate(c.updatedAt)
              ).map: (k, v) =>
                s"$k: $v"
        .map(Source.apply)

    // forum posts and direct messages went with the forum and msg modules (unit 3.6).

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
