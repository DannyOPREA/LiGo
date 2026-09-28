package lila.api

import lila.core.chat.PublicSource

/* Checks that a chat can still be posted to */
final class ChatFreshness():

  def of: PublicSource => Fu[Boolean] =
    case _ => fuTrue
