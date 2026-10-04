package lila.setup

import ligo.gorules.{ BoardSize, Ruleset, Setup as GoSetup }

import lila.core.game.GoSetups

// Unit 3.15: the create-game forms and API take a board size, ruleset and komi, create casual games
// only, and refuse chess variants and positions.
class GoSetupFormTest extends munit.FunSuite:

  given Option[Me] = None

  private val lobbyGame =
    Map("variant" -> "1", "timeMode" -> "1", "time" -> "5", "increment" -> "3", "days" -> "2")

  test("a lobby game that names no Go options is 19x19, Japanese, 6.5 komi"):
    val form = SetupForm.hook.bind(lobbyGame)
    assert(!form.hasErrors, form.errors)
    assertEquals(form.get.goSetup, GoSetups.default)

  test("a lobby game takes a board size, ruleset and komi"):
    val form = SetupForm.hook.bind(lobbyGame ++ Map("size" -> "9", "ruleset" -> "chinese", "komi" -> "5.5"))
    assert(!form.hasErrors, form.errors)
    assertEquals(form.get.goSetup, GoSetup(BoardSize.Nine, Ruleset.Chinese, 5.5))
    val hook = form.get.hook(lila.core.socket.Sri("sri"), none, none, lila.core.pool.Blocking(Set.empty))
    assertEquals(hook.left.toOption.map(_.go), Some(GoSetup(BoardSize.Nine, Ruleset.Chinese, 5.5)))

  test("a bad board size, ruleset or komi is a form error"):
    for bad <- List(Map("size" -> "10"), Map("ruleset" -> "aga"), Map("size" -> "9", "komi" -> "90"))
    do assert(SetupForm.hook.bind(lobbyGame ++ bad).hasErrors, bad)

  test("games are casual until Phase 5, and chess variants are refused"):
    assert(SetupForm.hook.bind(lobbyGame + ("mode" -> "1")).hasErrors, "rated")
    assert(!SetupForm.hook.bind(lobbyGame + ("mode" -> "0")).hasErrors, "casual")
    assert(SetupForm.hook.bind(lobbyGame + ("variant" -> "2")).hasErrors, "chess960")

  test("a friend game can't start from a chess position"):
    val friend = lobbyGame + ("color" -> "random")
    assert(!SetupForm.friend.bind(friend).hasErrors, SetupForm.friend.bind(friend).errors)
    val fen = friend + ("fen" -> "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")
    assert(SetupForm.friend.bind(fen).hasErrors)

  test("the challenge API takes Go options, and refuses rated games and positions"):
    val api = SetupForm.api.admin
    val ok = api.bind(Map("rated" -> "false", "size" -> "13", "ruleset" -> "japanese"))
    assert(!ok.hasErrors, ok.errors)
    assertEquals(ok.get.goSetup, GoSetup(BoardSize.Thirteen, Ruleset.Japanese, 6.5))
    assertEquals(ok.get.perfType, lila.rating.PerfType.Go)
    assert(api.bind(Map("rated" -> "true")).hasErrors, "rated")
    assert(api.bind(Map("rated" -> "false", "variant" -> "chess960")).hasErrors, "variant")
    val startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    assert(api.bind(Map("rated" -> "false", "fen" -> startFen)).hasErrors, "fen")

  test("the board API's seek form takes Go options and refuses rated games"):
    val board = SetupForm.boardApiHook(allowFastGames = true)
    val ok = board.bind(Map("time" -> "10", "increment" -> "5", "size" -> "9"))
    assert(!ok.hasErrors, ok.errors)
    assertEquals(ok.get.goSetup.size, BoardSize.Nine)
    assert(board.bind(Map("time" -> "10", "increment" -> "5", "rated" -> "true")).hasErrors)

  test("New opponent after a rated handicap game makes a casual, even Go hook on the same board"):
    import lila.core.game.{ Player, Source, newGoGame }
    val players =
      chess.ByColor(c => Player(lila.core.id.GamePlayerId(if c.white then "wwww" else "bbbb"), c, none))
    val nine = GoSetup(BoardSize.Nine, Ruleset.Chinese, 0.5, handicap = 2)
    val old = newGoGame(nine, none, players, chess.Rated.Yes, Source.Lobby)
      .fold(e => fail(e.message), _.sloppy)
      .copy(rated = chess.Rated.Yes)
    val config = HookConfig.default(auth = true).updateFrom(old)
    assertEquals((config.rated, config.variant), (chess.Rated.No, chess.variant.Standard))
    assertEquals(config.goSetup, nine.copy(handicap = 0))

  // Unit 4.9: byo-yomi clocks in both forms, handicap in the challenge forms.
  private val byoyomi = Map("timeMode" -> "3", "time" -> "10", "periods" -> "5", "periodTime" -> "30")

  test("a byo-yomi lobby game: main time in minutes, then periods of seconds"):
    val form = SetupForm.hook.bind(lobbyGame ++ byoyomi)
    assert(!form.hasErrors, form.errors)
    assertEquals(form.get.makeByoyomi, Some(ligo.gorules.ByoyomiConfig(600, 5, 30)))
    assertEquals(form.get.makeClock, None)
    val hook = form.get.hook(lila.core.socket.Sri("sri"), none, none, lila.core.pool.Blocking(Set.empty))
    assertEquals(hook.left.toOption.map(_.clock.show), Some("10+5×30s"))

  test("byo-yomi periods and lengths come from fixed lists, and a form without them gets 5 × 30 s"):
    val noPeriods =
      SetupForm.friend.bind(lobbyGame ++ byoyomi - "periods" - "periodTime" + ("color" -> "random"))
    assertEquals(noPeriods.value.flatMap(_.makeByoyomi), Some(ligo.gorules.ByoyomiConfig(600, 5, 30)))
    for bad <- List(Map("periods" -> "11"), Map("periods" -> "0"), Map("periodTime" -> "7"))
    do assert(SetupForm.hook.bind(lobbyGame ++ byoyomi ++ bad).hasErrors, bad)
    val sudden = SetupForm.hook.bind(lobbyGame ++ byoyomi ++ Map("time" -> "0", "periodTime" -> "5"))
    assertEquals(sudden.value.flatMap(_.makeByoyomi), Some(ligo.gorules.ByoyomiConfig(0, 5, 5)))

  test("a friend game takes a handicap, with 0.5 komi unless one is given"):
    val friend = lobbyGame + ("color" -> "black")
    val four = SetupForm.friend.bind(friend + ("handicap" -> "4"))
    assert(!four.hasErrors, four.errors)
    assertEquals(four.get.goSetup, GoSetup(BoardSize.Nineteen, Ruleset.Japanese, 0.5, handicap = 4))
    val nine = SetupForm.friend.bind(friend ++ Map("size" -> "9", "handicap" -> "2", "komi" -> "3.5"))
    assertEquals(
      nine.value.map(_.goSetup),
      Some(GoSetup(BoardSize.Nine, Ruleset.Japanese, 3.5, handicap = 2))
    )
    assert(SetupForm.friend.bind(friend + ("handicap" -> "10")).hasErrors, "10 stones")

  test("lobby games stay even: the lobby form has no handicap"):
    val form = SetupForm.hook.bind(lobbyGame + ("handicap" -> "4"))
    assertEquals(form.value.map(_.goSetup.handicap), Some(0))

  test("the challenge API takes a byo-yomi clock or a Fischer one, and a handicap"):
    val api = SetupForm.api.admin
    val byo = Map("byoyomi.limit" -> "600", "byoyomi.periods" -> "3", "byoyomi.period" -> "30")
    val ok = api.bind(Map("rated" -> "false", "handicap" -> "3") ++ byo)
    assert(!ok.hasErrors, ok.errors)
    assertEquals(ok.get.byoyomi, Some(ligo.gorules.ByoyomiConfig(600, 3, 30)))
    assertEquals(ok.get.goSetup.handicap, 3)
    assertEquals(ok.get.clockSettings.map(_.show), Some("10+3×30s"))
    val both = Map("clock.limit" -> "300", "clock.increment" -> "3")
    assert(api.bind(Map("rated" -> "false") ++ byo ++ both).hasErrors, "clock and byoyomi")
    assert(api.bind(Map("rated" -> "false", "days" -> "3") ++ byo).hasErrors, "days and byoyomi")
    assert(api.bind(Map("rated" -> "false", "byoyomi.limit" -> "0", "byoyomi.periods" -> "3")).hasErrors)
