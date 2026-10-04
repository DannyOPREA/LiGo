package lila.user

import chess.IntRating
import chess.rating.{ IntRatingDiff, RatingProvisional }
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
    assertEquals((perfOf(alice) \ "goRank").as[String], GoRating.label(IntRating(1960), RatingProvisional.No))
    assertEquals((perfOf(bob) \ "goRank").as[String], GoRating.label(IntRating(1500), RatingProvisional.No))

  test("a leaderboard rank never has the provisional ?, and starts at its rank-table edge"):
    GoRating.rankTable.foreach: (name, edge) =>
      val rank = (perfOf(Json.toJson(entry("p", edge))) \ "goRank").as[String]
      assertEquals(rank, name)
      assert(!rank.contains("?"))

  test("only a Go entry gets a goRank"):
    assertEquals((perfOf(Json.toJson(entry("p", 1500, PerfKey.blitz)), "blitz") \ "goRank").toOption, None)
