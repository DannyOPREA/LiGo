package lila.setup

import ligo.gorules.{ BoardSize, Ruleset, Setup as GoSetup }

import lila.core.game.GoSetups

// Unit 3.15: the create-game forms and API take a board size, ruleset and komi, and refuse chess
// variants and positions. Unit 5.7: signed-in players may create rated games on setups the rating maths
// covers; guests create casual games only.
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

  test("a guest's lobby game is casual only, and chess variants are refused"):
    assert(SetupForm.hook.bind(lobbyGame + ("mode" -> "1")).hasErrors, "rated")
    assert(!SetupForm.hook.bind(lobbyGame + ("mode" -> "0")).hasErrors, "casual")
    assert(SetupForm.hook.bind(lobbyGame + ("variant" -> "2")).hasErrors, "chess960")

  private val signedIn: Option[Me] = Me(
    lila.core.user.User(
      id = UserId("kaya"),
      username = UserName("Kaya"),
      count = lila.core.user.Count(0, 0, 0, 0, 0),
      enabled = lila.core.user.UserEnabled.Yes,
      roles = Nil,
      playTime = none,
      createdAt = nowInstant,
      seenAt = none,
      kid = lila.core.user.KidMode.No,
      lang = none,
      plan = lila.core.user.Plan(0, active = false, lifetime = false, since = none)
    )
  ).some

  test("a signed-in player's lobby game may be rated on 9x9 or 19x19 with the standard komi"):
    given Option[Me] = signedIn
    val rated = SetupForm.hook.bind(lobbyGame + ("mode" -> "1"))
    assert(!rated.hasErrors, rated.errors)
    assertEquals(rated.get.rated, chess.Rated.Yes)
    val nine = SetupForm.hook.bind(lobbyGame ++ Map("mode" -> "1", "size" -> "9", "ruleset" -> "chinese"))
    assert(!nine.hasErrors, nine.errors)
    for bad <- List(Map("size" -> "13"), Map("komi" -> "0.5"), Map("ruleset" -> "chinese", "komi" -> "6.5"))
    do assert(SetupForm.hook.bind(lobbyGame + ("mode" -> "1") ++ bad).hasErrors, bad)
    for ok <- List(Map("size" -> "13"), Map("komi" -> "0.5"))
    do assert(!SetupForm.hook.bind(lobbyGame + ("mode" -> "0") ++ ok).hasErrors, ok)

  test("a signed-in player's lobby game is rated by default, a guest's casual"):
    assertEquals(HookConfig.default(auth = true).rated, chess.Rated.Yes)
    assertEquals(HookConfig.default(auth = false).rated, chess.Rated.No)

  test("a guest's lobby hook is casual even if a rated config gets through"):
    val config = HookConfig.default(auth = true)
    val hook = config.hook(lila.core.socket.Sri("sri"), none, none, lila.core.pool.Blocking(Set.empty))
    assertEquals(hook.left.toOption.map(_.rated), Some(chess.Rated.No))

  test("a rated friend game may have up to 9 stones on 19x19 and 4 on 9x9, with 0.5 komi"):
    given Option[Me] = signedIn
    val friend = lobbyGame ++ Map("color" -> "random", "mode" -> "1")
    assert(!SetupForm.friend.bind(friend + ("handicap" -> "9")).hasErrors, "9 stones on 19x19")
    assert(!SetupForm.friend.bind(friend ++ Map("size" -> "9", "handicap" -> "4")).hasErrors, "4 on 9x9")
    assert(SetupForm.friend.bind(friend ++ Map("size" -> "9", "handicap" -> "5")).hasErrors, "5 on 9x9")
    assert(SetupForm.friend.bind(friend ++ Map("handicap" -> "3", "komi" -> "6.5")).hasErrors, "komi")
    assert(SetupForm.friend.bind(friend).value.exists(_.rated.yes))
    assert(SetupForm.friend(using None).bind(friend).hasErrors, "a guest's rated friend game")

  test("a rated open challenge has no handicap: it has no named opponent"):
    val open = SetupForm.api.open(isAdmin = false)
    assert(!open.bind(Map("rated" -> "true")).hasErrors, "rated even")
    assert(open.bind(Map("rated" -> "true", "handicap" -> "2")).hasErrors, "rated with stones")
    assert(!open.bind(Map("rated" -> "false", "handicap" -> "2")).hasErrors, "casual with stones")

  test("a friend game can't start from a chess position"):
    val friend = lobbyGame + ("color" -> "random")
    assert(!SetupForm.friend.bind(friend).hasErrors, SetupForm.friend.bind(friend).errors)
    val fen = friend + ("fen" -> "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")
    assert(SetupForm.friend.bind(fen).hasErrors)

  test("the challenge API takes Go options and refuses positions; a rated game needs a rated setup"):
    val api = SetupForm.api.admin
    val ok = api.bind(Map("rated" -> "false", "size" -> "13", "ruleset" -> "japanese"))
    assert(!ok.hasErrors, ok.errors)
    assertEquals(ok.get.goSetup, GoSetup(BoardSize.Thirteen, Ruleset.Japanese, 6.5))
    assertEquals(ok.get.perfType, lila.rating.PerfType.Go)
    assert(!api.bind(Map("rated" -> "true")).hasErrors, "rated 19x19")
    assert(api.bind(Map("rated" -> "true", "size" -> "13")).hasErrors, "rated 13x13")
    assert(!api.bind(Map("rated" -> "true", "handicap" -> "5")).hasErrors, "rated with stones")
    assert(api.bind(Map("rated" -> "false", "variant" -> "chess960")).hasErrors, "variant")
    val startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    assert(api.bind(Map("rated" -> "false", "fen" -> startFen)).hasErrors, "fen")

  test("the board API's seek form takes Go options; a rated seek needs a rated setup"):
    val board = SetupForm.boardApiHook(allowFastGames = true)
    val ok = board.bind(Map("time" -> "10", "increment" -> "5", "size" -> "9"))
    assert(!ok.hasErrors, ok.errors)
    assertEquals(ok.get.goSetup.size, BoardSize.Nine)
    assert(!board.bind(Map("time" -> "10", "increment" -> "5", "rated" -> "true")).hasErrors)
    assert(board.bind(Map("time" -> "10", "increment" -> "5", "rated" -> "true", "size" -> "13")).hasErrors)

  test("New opponent after a rated handicap game makes a rated, even Go hook on the same board"):
    import lila.core.game.{ Player, Source, newGoGame }
    val players = chess.ByColor(c =>
      Player(
        lila.core.id.GamePlayerId(if c.white then "wwww" else "bbbb"),
        c,
        none,
        userId = UserId(c.name).some
      )
    )
    val nine = GoSetup(BoardSize.Nine, Ruleset.Chinese, 0.5, handicap = 2)
    val clock =
      chess.Clock(chess.Clock.Config(chess.Clock.LimitSeconds(300), chess.Clock.IncrementSeconds(3)))
    val old = newGoGame(nine, clock.some, players, chess.Rated.Yes, Source.Lobby)
      .fold(e => fail(e.message), _.sloppy)
    assertEquals(old.rated, chess.Rated.Yes)
    val config = HookConfig.default(auth = true).updateFrom(old)
    assertEquals((config.rated, config.variant), (chess.Rated.Yes, chess.variant.Standard))
    // even, so with the ruleset's standard komi again
    assertEquals(config.goSetup, nine.copy(handicap = 0, komi = 7.5))

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
