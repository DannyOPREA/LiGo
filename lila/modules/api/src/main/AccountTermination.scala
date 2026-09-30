package lila.api

import lila.common.Bus
import lila.core.perm.Granter
import lila.user.UserDelete
import lila.db.dsl.{ *, given }

/* There are 2 flavours of account termination.
|                           | disable                          | delete                |
|---------------------------|----------------------------------|-----------------------|
| how                       | from settings menu               | from /account/delete  |
| reopen                    | available to user                | strictly impossible   |
| games                     | intact                           | anonymized            |
| username                  | intact, no reuse                 | anonymized, no reuse  |
| email                     | kept for reopening               | deleted               |
| profile data              | hidden                           | deleted               |
| sessions and oauth tokens | closed                           | deleted               |
| patron subscription       | canceled                         | canceled              |
| public studies            | unlisted                         | anonymized            |
| private studies           | hidden                           | deleted               |
| activity                  | hidden                           | deleted               |
| coach/streamer profiles   | hidden                           | deleted               |
| tournaments joined        | unlisted                         | anonymized            |
| tournaments created       | hidden                           | anonymized            |
| puzzle history            | hidden                           | deleted               |
| follows and blocks        | deleted                          | deleted               |

 Blog posts, forum posts, teams and classes went with their modules (unit 3.6).
 */
final class AccountTermination(
    userRepo: lila.user.UserRepo,
    playbanApi: lila.playban.PlaybanApi,
    relationApi: lila.relation.RelationApi,
    rankingApi: lila.user.RankingApi,
    challengeApi: lila.challenge.ChallengeApi,
    seekApi: lila.lobby.SeekApi,
    securityStore: lila.security.SessionStore,
    pushEnv: lila.push.Env,
    reportApi: lila.report.ReportApi,
    modApi: lila.mod.ModApi,
    modLogApi: lila.mod.ModlogApi,
    appealApi: lila.appeal.AppealApi,
    activityWrite: lila.activity.ActivityWriteApi,
    email: lila.mailer.AutomaticEmail,
    tokenApi: lila.oauth.AccessTokenApi,
    roundApi: lila.core.round.RoundApi,
    gameRepo: lila.game.GameRepo,
    analysisRepo: lila.analyse.AnalysisRepo,
    chatApi: lila.chat.ChatApi
)(using Executor, Scheduler, org.apache.pekko.stream.Materializer):

  def disable(u: User, forever: Boolean)(using me: Me): Funit = for
    _ <- isEssential(u.id).so:
      fufail[Unit](s"Cannot disable essential account ${u.username}")
    playbanned <- playbanApi.hasCurrentPlayban(u.id)
    selfClose = me.is(u)
    teacherClose = !selfClose && !Granter(_.CloseAccount) && Granter(_.Teacher)
    modClose = !selfClose && Granter(_.CloseAccount)
    tos = u.marks.dirty || modClose || playbanned
    _ <- userRepo.disable(u, keepEmail = tos, forever = forever)
    _ <- roundApi.resignAllGamesOf(u.id)
    followedIds <- relationApi.accountTermination(u)
    _ <- rankingApi.remove(u.id)
    _ <- challengeApi.removeByUserId(u.id)
    _ <- seekApi.removeByUser(u)
    _ <- securityStore.closeAllSessionsOf(u.id)
    _ <- selfClose.so(tokenApi.revokeAllByUser(u.id))
    _ <- pushEnv.browserSub.unsubscribeByUser(u)
    _ <- pushEnv.unregisterDevices(u)
    reports <- reportApi.processAndGetBySuspect(lila.report.Suspect(u))
    _ <-
      if selfClose then modLogApi.selfCloseAccount(u.id, forever, reports)
      else if teacherClose then modLogApi.teacherCloseAccount(u.id)
      else modLogApi.closeAccount(u.id)
    _ <- appealApi.onAccountClose(u)
    _ <- (u.marks.troll || u.marks.alt).so(activityWrite.unfollowAll(u, followedIds))
  yield Bus.pub(lila.core.security.CloseAccount(u.id))

  def scheduleDelete(u: User)(using Me): Funit = for
    _ <- disable(u, forever = false)
    _ <- email.delete(u)
    _ <- userRepo.delete.schedule(u.id, UserDelete(nowInstant).some)
  yield ()

  private[api] def garbageCollect(userId: UserId) =
    modApi.garbageCollect(userId) >> lichessDisable(userId)

  private[api] def lichessDisable(userId: UserId) =
    userRepo.lichessAnd(userId).flatMapz { (lichess, user) =>
      disable(user, forever = false)(using Me(lichess))
    }

  lila.common.LilaScheduler.variableDelay(
    "accountTermination.delete",
    delay = prev => _.Delay(if prev.isDefined then 1.second else 10.seconds),
    timeout = _.AtMost(1.minute),
    initialDelay = _.Delay(111.seconds)
  ):
    userRepo.delete.findNextScheduled.flatMapz: user =>
      if user.enabled.yes
      then userRepo.delete.schedule(user.id, none).inject(none)
      else doDeleteNow(user).inject(user.some)

  private def doDeleteNow(u: User): Funit = for
    _ <- isEssential(u.id).so:
      fufail[Unit](s"Cannot delete essential account ${u.username}")
    playbanned <- playbanApi.hasCurrentPlayban(u.id)
    tos = u.marks.dirty || playbanned
    _ = lila.log.system.info(s"Deleting user ${u.username} tos=$tos")
    _ <- if tos then userRepo.delete.nowWithTosViolation(u) else userRepo.delete.nowFully(u)
    _ <- activityWrite.deleteAll(u)
    singlePlayerGameIds <- gameRepo.deleteAllSinglePlayerOf(u.id)
    _ <- analysisRepo.remove(singlePlayerGameIds)
    _ <- deleteAllGameChats(u)
    _ <- tokenApi.revokeAllByUser(u.id)
    _ <- u.marks.clean.so:
      securityStore.deleteAllSessionsOf(u.id)
  yield
    // a lot of deletion is done by modules listening to the following event:
    Bus.pub(lila.core.user.UserDelete(u))

  def deleteAllGameChats(u: User) =
    import lila.game.Query
    import lila.core.game.Source.*
    gameRepo
      .docCursor(Query.user(u.id) ++ Query.sourceIn(List(Lobby, Pool, Friend, Api)), bid(true).some)
      .documentSource()
      .mapConcat(_.getAsOpt[GameId]("_id").toList)
      .grouped(100)
      .mapAsync(1)(ids => chatApi.userChat.removeMessagesBy(ids, u.id))
      .run()

  private val isEssential: Set[UserId] =
    Set(
      UserId.lichess,
      UserId.broadcaster,
      UserId.irwin,
      UserId.kaladin,
      UserId.explorer,
      UserId.ai,
      UserId.lichess4545,
      UserId.watcherbot
    )
