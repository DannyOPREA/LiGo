package lila.security

import lila.rating.GoRating.Rank
import lila.security.SecurityForm.SignupData

class SignupGoRankTest extends munit.FunSuite:

  test("\"I don't know\" declares no rank"):
    assert(SignupData.validGoRank(""))
    assertEquals(SignupData.parseGoRank(""), None)

  test("\"I'm new to Go\" declares 25k"):
    assertEquals(SignupData.parseGoRank("new"), Some(Rank.Kyu(25)))

  test("every rank from 25k to 9d can be declared"):
    Rank.all.foreach: rank =>
      assert(SignupData.validGoRank(rank.name), rank.name)
      assertEquals(SignupData.parseGoRank(rank.name), Some(rank))

  test("anything else is refused"):
    List("26k", "0k", "10d", "1p", "5K", " 5k", "dan").foreach: v =>
      assert(!SignupData.validGoRank(v), v)
