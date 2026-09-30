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
