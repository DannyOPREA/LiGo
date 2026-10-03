package lila.ui

import scala.annotation.targetName
import chess.{ PlayerTitle, IntRating }
import chess.rating.{ IntRatingDiff, RatingProvisional }

import lila.core.LightUser
import lila.core.perf.{ KeyedPerf, UserPerfs, UserWithPerfs }
import lila.core.socket.IsOnline
import lila.ui.ScalatagsTemplate.{ *, given }
import lila.core.plan.PatronTier

trait UserHelper:
  self: I18nHelper & NumberHelper & AssetHelper =>

  protected val ratingApi: RatingApi
  def isOnline: IsOnline
  def lightUserSync: LightUser.GetterSync

  given Conversion[UserWithPerfs, User] = _.user

  def usernameOrId(userId: UserId): UserName = lightUserSync(userId).fold(userId.into(UserName))(_.name)
  def titleNameOrId(userId: UserId): String = lightUserSync(userId).fold(userId.value)(_.titleName)
  def titleNameOrAnon(userId: Option[UserId]): String =
    userId.flatMap(lightUserSync).fold(UserName.anonymous.value)(_.titleName)

  def titleTag(title: Option[PlayerTitle]): Option[Frag] =
    title.map: t =>
      frag(userTitleTag(t), nbsp)
  def titleTag(lu: LightUser): Frag = titleTag(lu.title)

  def userFlair(user: User): Option[Tag] = user.flair.map(userFlair)
  def userFlair(flair: Flair): Tag = img(cls := "uflair", src := flairSrc(flair))
  def userFlairSync(userId: UserId): Option[Tag] = lightUserSync(userId).flatMap(_.flair).map(userFlair)

  // LiGo: the Go rank label, with the rating itself in the hover title (ADR 0021 §3, unit 5.5)
  def goRank(rating: IntRating, provisional: RatingProvisional): Tag =
    span(cls := "go-rank", title := rating.value.toString)(ratingApi.goLabel(rating, provisional))

  // LiGo: Go has one rating (ADR 0021 §1), so any perf shown here is read as the go perf (unit 5.5)
  def renderRating(perf: Perf): Frag = frag(" (", goRank(perf.intRating, perf.provisional), ")")

  // LiGo: UserPerfs shows the one Go rating (ADR 0021 §1), not lila's best perf
  def userRating(perf: Perf | UserPerfs): Frag = perf match
    case p: Perf => renderRating(p)
    case p: UserPerfs => renderRating(p.go)

  def anonUserSpan(cssClass: Option[String] = None, modIcon: Boolean = false) =
    span(cls := List("offline" -> true, "user-link" -> true, ~cssClass -> cssClass.isDefined))(
      if modIcon then frag(moderatorIcon, UserName.anonMod)
      else UserName.anonymous
    )

  def userIdLink[U: UserIdOf](
      userIdOption: Option[U],
      cssClass: Option[String] = None,
      withOnline: Boolean = true,
      withTitle: Boolean = true,
      truncate: Option[Int] = None,
      params: String = "",
      modIcon: Boolean = false,
      withFlair: Boolean = true,
      withPowerTip: Boolean = true
  )(using Translate): Tag =
    userIdOption
      .flatMap(u => lightUserSync(u.id))
      .fold[Tag](anonUserSpan(cssClass, modIcon)): user =>
        userIdNameLink(
          userId = user.id,
          username = user.name,
          patron = user.patronAndColor,
          title = user.title.ifTrue(withTitle),
          flair = if withFlair then user.flair else none,
          cssClass = cssClass,
          withOnline = withOnline,
          truncate = truncate,
          params = params,
          modIcon = modIcon,
          withPowerTip = withPowerTip
        )

  def lightUserLink(
      user: LightUser,
      cssClass: Option[String] = None,
      withOnline: Boolean = true,
      withTitle: Boolean = true,
      truncate: Option[Int] = None,
      params: String = ""
  )(using Translate): Tag =
    userIdNameLink(
      userId = user.id,
      username = user.name,
      patron = user.patronAndColor,
      title = user.title.ifTrue(withTitle),
      flair = user.flair,
      cssClass = cssClass,
      withOnline = withOnline,
      truncate = truncate,
      params = params,
      modIcon = false
    )

  def lightUserSpan(
      user: LightUser,
      cssClass: Option[String] = None,
      withOnline: Boolean = true
  )(using Translate): Tag =
    span(
      cls := userClass(user.id, cssClass, withOnline),
      dataHref := userUrl(user.name)
    )(
      withOnline.so(lineIcon(user.patronAndColor)),
      titleTag(user.title),
      user.name,
      user.flair.map(userFlair)
    )

  def userLink(
      user: User,
      withOnline: Boolean = true,
      withPowerTip: Boolean = true,
      withTitle: Boolean = true,
      withPerfRating: Option[Perf | UserPerfs] = None,
      name: Option[Frag] = None,
      params: String = "",
      withFlair: Boolean = true
  )(using Translate): Tag =
    a(
      cls := userClass(user.id, none, withOnline, withPowerTip),
      href := userUrl(user.username, params)
    )(userLinkContent(user, withOnline, withTitle, withPerfRating, name, withFlair))

  def userSpan(
      user: User,
      cssClass: Option[String] = None,
      withOnline: Boolean = true,
      withPowerTip: Boolean = true,
      withTitle: Boolean = true,
      withPerfRating: Option[Perf | UserPerfs] = None,
      name: Option[Frag] = None,
      withFlair: Boolean = true
  )(using Translate): Tag =
    span(
      cls := userClass(user.id, cssClass, withOnline, withPowerTip),
      dataHref := userUrl(user.username)
    )(userLinkContent(user, withOnline, withTitle, withPerfRating, name, withFlair))

  def userLinkContent(
      user: User,
      withOnline: Boolean = true,
      withTitle: Boolean = true,
      withPerfRating: Option[Perf | UserPerfs] = None,
      name: Option[Frag] = None,
      withFlair: Boolean = true
  )(using Translate) = frag(
    withOnline.so(lineIcon(user)),
    withTitle.option(titleTag(user.title)),
    name | user.username,
    withFlair.so(userFlair(user)),
    withPerfRating.map(userRating)
  )

  def userIdNameLink(
      userId: UserId,
      username: UserName,
      patron: Option[PatronTier.AndColor],
      cssClass: Option[String],
      withOnline: Boolean,
      truncate: Option[Int],
      title: Option[PlayerTitle],
      flair: Option[Flair],
      params: String,
      modIcon: Boolean,
      withPowerTip: Boolean = true
  )(using Translate): Tag =
    a(
      cls := userClass(userId, cssClass, withOnline, withPowerTip),
      href := userUrl(username, params = params)
    )(
      withOnline.so(if modIcon then moderatorIcon else lineIcon(patron)),
      titleTag(title),
      truncate.fold(username.value)(username.value.take),
      flair.map(userFlair)
    )

  def userIdSpanMini(userId: UserId, withOnline: Boolean = false)(using Translate): Tag =
    val user = lightUserSync(userId)
    val name = user.fold(userId.into(UserName))(_.name)
    span(
      cls := userClass(userId, none, withOnline),
      dataHref := userUrl(name)
    )(
      withOnline.so(lineIcon(user)),
      user.map(titleTag),
      name
    )

  def userUrl(username: UserName, params: String = ""): Option[String] =
    Option.when(username.id.noGhost):
      s"${routes.User.show(username)}$params"

  def userClass(
      userId: UserId,
      cssClass: Option[String],
      withOnline: Boolean,
      withPowerTip: Boolean = true
  ): List[(String, Boolean)] =
    if userId.isGhost then List("user-link" -> true, ~cssClass -> cssClass.isDefined)
    else
      (withOnline.so(List((if isOnline.exec(userId) then "online" else "offline") -> true))) ::: List(
        "user-link" -> true,
        ~cssClass -> cssClass.isDefined,
        "ulpt" -> withPowerTip
      )

  def ratingProgress(progress: IntRatingDiff): Option[Frag] =
    if progress.positive then goodTag(cls := "rp")(progress).some
    else if progress.negative then badTag(cls := "rp")(math.abs(progress.value)).some
    else none

  def showPerfRating(
      rating: IntRating,
      name: String,
      nb: Int,
      provisional: RatingProvisional,
      clueless: Boolean,
      icon: Icon,
      go: Boolean = false
  )(using Translate): Frag =
    val games = trans.site.ratingXOverYGames.pluralTxt(nb, name, nb.localize)
    span(
      // LiGo: a Go rating shows as its rank label, always, with the number in the title (ADR 0021 §3)
      title := (if go then s"$rating${provisional.yes.so("?")} · $games" else games),
      dataIcon := icon,
      cls := "text"
    )(
      if go then ratingApi.goLabel(rating, provisional)
      else if clueless then frag(nbsp, nbsp, nbsp, if nb < 1 then "-" else "?")
      else frag(rating, provisional.yes.option("?"))
    )

  def showPerfRating(p: KeyedPerf)(using Translate): Frag =
    import p.perf.*
    showPerfRating(
      intRating,
      p.key.perfTrans,
      nb,
      provisional,
      glicko.clueless,
      p.key.perfIcon,
      go = p.key == PerfKey.go
    )

  def showPerfRating(perfs: UserPerfs, perfKey: PerfKey)(using Translate): Frag =
    showPerfRating(perfs.keyed(perfKey))

  // LiGo: the one Go rating (ADR 0021 §1)
  def showBestPerf(perfs: UserPerfs)(using Translate): Option[Frag] =
    showPerfRating(perfs.keyed(PerfKey.go)).some

  def showRatingDiff(diff: IntRatingDiff): Frag = diff.value match
    case 0 => span("±0")
    case d if d > 0 => goodTag(s"+$d")
    case d => badTag(s"−${-d}")

  val patronIconChar = Icon.Wings
  val lineIconChar = Icon.Disc

  val lineIcon: Frag = iconTag(cls := "line")

  def patronIcon(p: PatronTier.AndColor)(using Translate): Frag =
    iconTag(
      cls := s"line patron ${p.color.value.cssClass}",
      title := s"${trans.patron.lichessPatron.txt()} (${p.tier.name})"
    )

  val moderatorIcon: Frag = iconTag(cls := "line moderator", title := "LiGo Mod")
  @targetName("lineIconPatron")
  private def lineIcon(p: Option[PatronTier.AndColor])(using Translate): Frag =
    p.fold(lineIcon)(patronIcon)
  @targetName("lineIconUser")
  private def lineIcon(user: Option[LightUser])(using Translate): Frag =
    lineIcon(user.flatMap(_.patronAndColor))
  def lineIcon(user: LightUser)(using Translate): Frag = lineIcon(user.patronAndColor)
  def lineIcon(user: User)(using Translate): Frag = lineIcon(user.patronAndColor)
  def lineIconChar(user: User): Icon = if user.isPatron then patronIconChar else lineIconChar
