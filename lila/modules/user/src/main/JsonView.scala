package lila.user

import play.api.libs.json.*

import lila.common.Json.given
import lila.core.LightUser
import lila.core.perf.{ KeyedPerf, Perf, PuzPerf, UserPerfs }
import lila.core.user.{ LightPerf, PlayTime, Profile }
import lila.core.rating.UserRankMap
import lila.rating.UserPerfsExt.perfsList

final class JsonView(isOnline: lila.core.socket.IsOnline) extends lila.core.user.JsonView:

  import JsonView.{ *, given }
  import lila.user.Profile.*

  def full(
      u: User,
      perfs: Option[UserPerfs | KeyedPerf],
      withProfile: Boolean,
      rankMap: Option[UserRankMap] = None
  ): JsObject =
    if u.enabled.no then disabled(u.light)
    else
      base(u, perfs, rankMap) ++ Json
        .obj("createdAt" -> u.createdAt)
        .add(
          "profile" -> u.profile
            .ifTrue(withProfile)
            .map(p => Json.toJsObject(p.filterTroll(u.marks.troll)).noNull)
        )
        .add("seenAt" -> u.seenAt)
        .add("playTime" -> u.playTime)

  def roundPlayer(u: User, perf: Option[KeyedPerf]) =
    if u.enabled.no then disabled(u.light)
    else base(u, perf).add("online" -> isOnline.exec(u.id))

  def base(u: User, perfs: Option[UserPerfs | KeyedPerf], rankMap: Option[UserRankMap] = None) =
    Json
      .obj(
        "id" -> u.id,
        "username" -> u.username,
        "perfs" -> perfs.fold(Json.obj()):
          case p: UserPerfs => perfsJson(p, rankMap)
          case p: KeyedPerf => keyedPerfJson(p)
      )
      .add("title" -> u.title)
      .add("flair" -> u.flair)
      .add("tosViolation" -> u.lame)
      .add("patron" -> u.isPatron)
      .add("patronColor" -> u.patronAndColor.map(_.color))
      .add("verified" -> u.isVerified)

  def lightPerfIsOnline(lp: LightPerf) =
    lightPerfWrites.writes(lp).add("online" -> isOnline.exec(lp.user.id))

  given lightPerfIsOnlineWrites: OWrites[LightPerf] = OWrites(lightPerfIsOnline)

  def disabled(u: LightUser) = Json.obj(
    "id" -> u.id,
    "username" -> u.name,
    "disabled" -> true
  )
  def ghost = disabled(LightUser.ghost)

object JsonView:

  given OWrites[Profile] = Json.writes
  given OWrites[PlayTime] = Json.writes

  given lightPerfWrites: OWrites[LightPerf] = OWrites[LightPerf]: l =>
    Json
      .obj(
        "id" -> l.user.id,
        "username" -> l.user.name,
        "perfs" -> Json.obj(
          l.perfKey.value -> Json
            .obj("rating" -> l.rating, "progress" -> l.progress)
            .add("goRank" -> lightGoRankOf(l))
        )
      )
      .add("title" -> l.user.title)
      .add("patron" -> l.user.isPatron)
      .add("patronColor" -> l.user.patronAndColor.map(_.color))

  given perfWrites: OWrites[Perf] = OWrites: o =>
    Json
      .obj(
        "games" -> o.nb,
        "rating" -> o.glicko.rating.toInt,
        "rd" -> o.glicko.deviation.toInt,
        "prog" -> o.progress
      )
      .add("prov", o.glicko.provisional)

  def keyedPerfJson(p: KeyedPerf): JsObject =
    Json.obj(p.key.value -> perfWrites.writes(p.perf).add("goRank" -> goRankOf(p.key, p.perf)))

  // LiGo: the Go perf's kyu/dan label beside its rating (ADR 0021 §3, unit 5.5); `rank` is lila's
  // leaderboard position
  private def goRankOf(key: PerfKey, perf: Perf): Option[String] =
    (key == PerfKey.go).option(lila.rating.GoRating.label(perf.glicko))

  // a leaderboard entry is stable (deviation at most 75, under the "?" threshold), so its label has no "?"
  private def lightGoRankOf(l: LightPerf): Option[String] =
    (l.perfKey == PerfKey.go).option(lila.rating.GoRating.label(l.rating, chess.rating.RatingProvisional.No))

  def perfsJson(p: UserPerfs, rankMap: Option[UserRankMap] = None): JsObject =
    JsObject:
      p.perfsList.collect:
        case (key, perf) if perf.nb > 0 || lila.rating.PerfType.standardSet(key) =>
          key.value -> perfWrites
            .writes(perf)
            .add("rank" -> rankMap.flatMap(_.get(key)))
            .add("goRank" -> goRankOf(key, perf))
    .add("storm", p.storm.option)
      .add("racer", p.racer.option)
      .add("streak", p.streak.option)

  private given OWrites[PuzPerf] = OWrites: p =>
    Json.obj(
      "runs" -> p.runs,
      "score" -> p.score
    )

  def perfsJson(perfs: UserPerfs, onlyPerfs: List[PerfKey]) =
    JsObject:
      onlyPerfs.map: key =>
        key.value -> perfWrites.writes(perfs(key)).add("goRank" -> goRankOf(key, perfs(key)))

  def notes(ns: List[Note])(using lightUser: LightUserApi) =
    lightUser
      .preloadMany(ns.flatMap(_.userIds).distinct)
      .inject(JsArray:
        ns.map: note =>
          Json
            .obj(
              "from" -> lightUser.syncFallback(note.from),
              "to" -> lightUser.syncFallback(note.to),
              "text" -> note.text,
              "date" -> note.date
            )
            .add("mod", note.mod)
            .add("dox", note.dox))

  given leaderboardsWrites(using OWrites[LightPerf]): OWrites[lila.rating.UserPerfs.Leaderboards] =
    OWrites: leaderboards =>
      Json.obj("go" -> leaderboards.go)
