package controllers

import lila.app.*

// LiGo's local Go playground (unit 2.2, docs/PLAN.md Phase 2): play both colours on one board in
// the browser. No server game, no clock, nothing stored - the whole page is client-side.
final class Playground(env: Env) extends LilaController(env):

  def home = Open:
    Ok.page(views.playground.home)
