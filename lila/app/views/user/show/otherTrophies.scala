package views.user
package show

import lila.app.UiEnv.{ *, given }
import lila.user.{ Trophy, TrophyKind }

object otherTrophies:

  import bits.awards.*

  def apply(info: lila.app.mashup.UserInfo)(using ctx: Context) =
    frag(
      info.trophies.trophies
        .filter(_.kind.klass.has("fire-trophy"))
        .nonEmptyOption
        .map: trophies =>
          div(cls := "stacked")(
            trophies.sorted.map: trophy =>
              trophy.kind.icon.map: iconChar =>
                maybeLink(trophy.anyUrl)(awardCls(trophy), ariaTitle(s"${trophy.kind.name}")):
                  raw(iconChar)
          ),
      // shield and revolution trophies were tournament-only mementos; the tournament feature that
      // rendered them is gone (unit 3.2), so old awards no longer render a link.
      info.trophies.trophies.find(_.kind._id == TrophyKind.zugMiracle).map(zugMiracleTrophy),
      info.trophies.trophies.filter(_.kind.withCustomImage).map { t =>
        maybeLink(t.anyUrl)(
          awardCls(t),
          ariaTitle(t.kind.name),
          style := "width: 65px; margin: 0 3px!important;"
        ):
          img(src := assetUrl(s"images/trophy/${t.kind._id}.png"), cssWidth := 65, cssHeight := 80)
      },
      info.trophies.trophies.filter(_.kind.klass.has("icon3d")).sorted.map { trophy =>
        trophy.kind.icon.map: iconChar =>
          maybeLink(trophy.anyUrl)(awardCls(trophy), ariaTitle(trophy.kind.name)):
            raw(iconChar)
      }
      // coach and streamer trophies went with those modules (unit 3.7).
    )
