package lila.game
package core

object insight:

  trait InsightDb

  trait InsightApi:
    def indexAll(user: lila.core.user.User, force: Boolean): Funit
