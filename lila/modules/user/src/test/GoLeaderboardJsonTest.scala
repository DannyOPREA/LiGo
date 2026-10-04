package lila.user

import chess.IntRating
import chess.rating.IntRatingDiff
import play.api.libs.json.*

import lila.core.LightUser
import lila.core.plan.PatronMonths
import lila.core.user.LightPerf
import lila.rating.GoRating
import lila.rating.UserPerfs.Leaderboards

// LiGo: the one Go leaderboard's JSON (ADR 0021 §3, unit 5.5)
class GoLeaderboardJsonTest extends munit.FunSuite:

  import JsonView.{ leaderboardsWrites, lightPerfWrites }

  private def entry(name: String, rating: Int, key: PerfKey = PerfKey.go) =
    LightPerf(
      LightUser(UserId(name), UserName(name), None, None, PatronMonths.zero, None),
      key,
      IntRating(rating),
      IntRatingDiff(12)
    )

  private def perfOf(js: JsValue, key: String = "go") = (js \ "perfs" \ key).as[JsObject]

  test("the leaderboard JSON has the one Go list, each entry with its rating and kyu/dan rank"):
    val js = Json.toJson(Leaderboards(List(entry("alice", 1960), entry("bob", 1500))))
    assertEquals(js.as[JsObject].keys, Set("go"))
    val List(alice, bob) = (js \ "go").as[List[JsValue]]: @unchecked
    assertEquals((alice \ "username").as[String], "alice")
    assertEquals((perfOf(alice) \ "rating").as[Int], 1960)
    assertEquals((perfOf(alice) \ "progress").as[Int], 12)
    assertEquals((perfOf(alice) \ "goRank").as[String], "1d")
    assertEquals((perfOf(bob) \ "goRank").as[String], "6k")

  test("a leaderboard rank starts at its rank-table edge"):
    GoRating.rankTable.foreach: (name, edge) =>
      val rank = (perfOf(Json.toJson(entry("p", edge))) \ "goRank").as[String]
      assertEquals(rank, name)

  test("only a Go entry gets a goRank"):
    assertEquals((perfOf(Json.toJson(entry("p", 1500, PerfKey.blitz)), "blitz") \ "goRank").toOption, None)

  test("a player's Go rating and rank are in the user JSON before a first game (unit 5.8)"):
    val perfs = lila.rating.UserPerfs
      .default(UserId("newcomer"))
      .copy(go = lila.core.perf.Perf(GoRating.startingGlicko(GoRating.Rank.Kyu(5)), 0, Nil, None))
    val go = (JsonView.perfsJson(perfs) \ "go").as[JsObject]
    assertEquals((go \ "games").as[Int], 0)
    assertEquals((go \ "rating").as[Int], 1579)
    assertEquals((go \ "goRank").as[String], "5k?") // provisional: deviation 250

  test("a player who declared no rank has no Go rating in the user JSON before a first game (unit 5.8)"):
    val perfs = lila.rating.UserPerfs.default(UserId("unranked"))
    assert((JsonView.perfsJson(perfs) \ "go").toOption.isEmpty)
