package lila.setup

import com.softwaremill.macwire.*

@Module
final class Env(gameApi: lila.core.game.GameApi)(using Executor):

  val forms = SetupForm

  val setupForm: lila.core.setup.SetupForm = SetupForm.api

  val processor = wire[Processor]
