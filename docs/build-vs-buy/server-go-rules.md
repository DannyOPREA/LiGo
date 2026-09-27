# Build-vs-buy: server-side Go rules and byo-yomi clock

- Unit: 1.1 (Phase 1). Status: **Proposed, waiting for the owner's choice.** The choice becomes an ADR.
- Date: 2026-09-27. Evidence gathered in a throwaway spike outside the repo (code and output below).

## Capability

This is the PLAN §3.1 row "Server-side Go rules (legality, captures, superko, handicap placement,
byo-yomi clock)". lila has to decide, on the server, whether a move is legal, which stones it
captures, whether it breaks the ko / superko rule, where handicap stones go, when the game moves to
scoring, and how a byo-yomi clock runs down. Today lila does this for chess with `scalachess`. LiGo
needs the Go equivalent, in Scala, inside lila's JVM (PLAN §3.4 steps 3–4).

Final score counting is **proposed** to be goscorer's job in `services/scoring` (PLAN §3.3, settled
in unit 1.3). If that proposal were rejected, strategygames' own area scoring would matter more.

## What the plan proposed

PlayStrategy's `strategygames` (MIT) as a dependency, if its Go package can be used without pulling
in the other games; otherwise vendor just its Go package into `libs/go-rules`. For byo-yomi,
scalashogi's clock (MIT) as the fallback.

## What the spike found

Checked on 2026-09-27 against strategygames commit `7344183` (2026-09-17), release `10.2.1-s3-ps14`.
The published jar's version string matches that commit's `build.sbt`; we did not rebuild it to
compare bytes.

1. **The Go rules are pure Scala and actively maintained.** PlayStrategy rewrote them in
   August–September 2026. The new rules were written alongside the old engine, Joan Sala's Java
   `com.joansala:go-engine` (GPL), which was removed on 2026-08-30 (commit `49b3776`); the last Go
   fix is from 2026-09-14. We did not trace where the new code's ideas came from; it is published
   under strategygames' MIT licence. About 6,450 lines, with 27 Go test files (413 passing tests,
   run below). It has: suicide illegal, captures, a simple ko point, **situational superko**
   (matches our ADR 0003), handicap placement for 9×9 / 13×13 / 19×19, pass, a dead-stone selection
   phase after two passes, area scoring, and SGF.
2. **The byo-yomi clock is in the same artifact.** `strategygames.ByoyomiClock` (shared by all its
   games; PlayStrategy uses it for shogi and Go) handles main time, periods and increments. Its tests
   live in strategygames' shogi test package, so we'd add Go-side clock tests in our adapter unit.
   The spike ran it: 45 s of thinking on "no main time, 3 × 30 s" uses one period and is not out of
   time. So option A covers both halves of the §3.1 row, and scalashogi's clock isn't needed.
3. **It resolves and runs with lila's toolchain.** strategygames is built with Scala 3.7.4; a Scala
   3.8.4 project (lila's version) with lila's `scalalib 11.10.12` and `scalachess 17.17.1` on the
   same classpath compiles and runs it (sbt evicts strategygames' older scalalib 11.9.5). There is
   no package clash with scalachess (`strategygames.chess` vs `chess`).
4. **It is one artifact for all ~10 games, with heavy transitive dependencies.** As-is it brings in
   a native Fairy-Stockfish library (GPL-3.0, JNI, linux-x86_64 only), Joan Sala's `aalina` and
   `samurai` engines (GPL-3.0-or-later, per the licence header in their POMs, which have no
   `<licenses>` element), Guice, Guava, an old Berkeley DB (its own "Berkeley DB Java Edition
   License"), JLine, picocli and JavaCPP.
5. **Those can be excluded.** Using the Go package and the clock, the JVM loads only strategygames'
   shared classes (20, plus 5 lambda classes) and its Go classes, and no class from any other game or
   native library (checked with `-verbose:class`). With sbt `excludeDependencies` on
   `fairystockfish`, `com.joansala.aalina` and `com.joansala`, the spike compiles and gives the
   same output. The reason to exclude them is weight, native code and unused games, not licence:
   GPL-3.0 is AGPL-compatible.
6. **It is not on Maven Central.** PlayStrategy publishes to its own Maven repo hosted on GitHub
   (`raw.githubusercontent.com/Mind-Sports-Games/lila-maven`), the same way lichess publishes some of
   lila's dependencies (lila already resolves from `lichess-org/lila-maven` and
   `ornicar/lila-maven`). It works from cloud sessions today. There are no signatures; coursier only
   checks the SHA-1 files served by the same repo.
7. **Rules gaps we'd fill in the adapter, not in strategygames:** the ruleset (Japanese / Chinese)
   isn't modelled (it only does area scoring); komi defaults per board size (5.5 on 9×9, 7.5 on
   13×13 and 19×19) and a game can override it; two passes open strategygames' own dead-stone phase
   rather than ending the game. The adapter unit (1.7) decides how lila's scoring phase maps onto that.

## Candidates

| Option | Ladder rung | Licence | Maintenance | Fit with lila | Effort | OGS handoff value |
|---|---|---|---|---|---|---|
| **A. strategygames as a dependency, unused games excluded** | 1–2 (use as-is, configured) | MIT | Active (Go rewrite Aug–Sep 2026) | Good: Scala 3, same scalalib/cats family as lila (it's a scalachess fork); clock included | Low: one resolver, one dependency, three exclusions | Low (OGS's server isn't Scala) |
| B. Vendor `strategygames.go` (and the clock) into `libs/go-rules` | 4 (vendor minimally) | MIT | We own the copy; upstream fixes are hand-ported | Good, but the Go package uses ~23 shared names (`Player`, `Situation`, `Replay`, `Action`, `History`, `Status`, `Score`, `Clock`, `format.pgn`…), several of them sealed wrappers over every game, so the copy needs cut-down stand-ins | Medium–high: copy, stand-ins, a porting routine | Low |
| C. Build our own Scala Go rules and clock | 6 (custom) | MIT (ours) | Us | Exact fit | High, and it's the wheel ADR 0002 says not to reinvent | Low |
| D. Call another engine (KataGo, a JS library) from the JVM | — | MIT | Good | Poor: an out-of-process call on every move | Medium | Low |

No other maintained, AGPL-compatible Go rules library for the JVM turned up.

### What each option gives and costs

**A. Dependency.**
- Gives: the least code we own; upstream fixes by bumping one version; the clock for free.
- Commits LiGo to:
  - a new Maven repository (PlayStrategy's GitHub-hosted repo) and a new dependency
    (`org.playstrategy::strategygames`) in lila's build, pinned to an exact version, with the three
    exclusions kept in the build. COPYING.md gets its MIT notice;
  - adding that repo to `dev/cloud-setup.sh`'s sbt repositories list (cloud sessions override build
    resolvers, ADR 0008), and checking the lila CI job resolves it;
  - trusting that repo's artifacts and its availability. Mitigation: pin the version and record the
    jar's SHA-256 in `docs/UPSTREAM.md` so a changed artifact is noticed;
  - version bumps that carry changes to the other nine games' shared code;
  - a runtime risk: if a shared code path we use ever touches an excluded game, it fails with a
    missing-class error at runtime, not at compile time. The spike exercised only a narrow path; the
    adapter's tests and the conformance fixtures (1.6–1.7) cover the real one.

**B. Vendor.**
- Gives: no third-party Maven repo or availability dependency; no exclusion list; no older scalalib
  being evicted; bugs fixed in our own tree straight away (PlayStrategy's Go has a bug history);
  bumps never drag in other games' changes.
- Costs: more code we own (about 6,450 lines plus stand-ins and the clock); upstream fixes ported by
  hand, which the monthly `upstream-scout` report would have to track.

## Recommendation

**Option A.** It's the top rung that works: the Go package is maintained by people who just rewrote
it for correctness, it already has the superko rule we chose and a byo-yomi clock, and the
exclusions keep the unused games' native code out of LiGo. The adapter (`libs/go-rules`) stays thin.

**Runner-up: B**, which we'd switch to if A hurts: if upstream breaks the Go API often, stops
publishing, or pulls in something we can't exclude. The adapter boundary means that switch wouldn't
touch lila.

## What the owner must decide

Use strategygames as a dependency with the unused games excluded (A, recommended), or vendor only its
Go package and clock into `libs/go-rules` (B)?

## Spike evidence

The spike project (outside the repo) used lila's Scala, scalalib and scalachess versions:

```scala
// build.sbt (sbt 2.0.9). Run with -Dsbt.repository.config=<~/.sbt/repositories plus the ps-lila-maven line>
scalaVersion := "3.8.4"
resolvers ++= Seq(
  "google-central".at("https://maven-central.storage-download.googleapis.com/maven2/"),
  "ps-lila-maven".at("https://raw.githubusercontent.com/Mind-Sports-Games/lila-maven/master"),
  "jitpack".at("https://jitpack.io")
)
libraryDependencies ++= Seq(
  "org.playstrategy" %% "strategygames" % "10.2.1-s3-ps14",
  "com.github.lichess-org.scalalib" %% "scalalib-core" % "11.10.12",
  "com.github.lichess-org.scalachess" %% "scalachess" % "17.17.1"
)
fork := true
excludeDependencies ++= Seq(
  ExclusionRule("org.playstrategy", "fairystockfish"),
  ExclusionRule("com.joansala.aalina"),
  ExclusionRule("com.joansala")
)
```

```scala
// src/main/scala/Spike.scala
import strategygames.go.{ Game, Pos, Role }
import strategygames.go.format.Forsyth
import strategygames.go.variant.Go9x9

object Spike:
  def play(g: Game, key: String): Either[String, Game] =
    if key == "pass" then Right(g.apply(g.board.variant.validPass(g.situation)))
    else g.board.variant.validDrops(g.situation).find(_.pos.key == key).map(g.apply).toRight(s"$key illegal")

  def run(moves: List[String]): Either[String, Game] =
    moves.foldLeft[Either[String, Game]](Right(Game(Go9x9)))((acc, m) => acc.flatMap(play(_, m)))

  def main(args: Array[String]): Unit =
    // Black captures a white stone at e5 (a single-stone capture that creates a ko shape)
    val koSetup = List("d5", "e5", "e4", "f4", "e6", "f6", "a1", "g5", "f5")
    println("after setup: " + run(koSetup).map(g => Forsyth.>>(g).value))
    // White tries to retake immediately at e5 (the ko): must be illegal
    println("ko retake e5 now: " + run(koSetup :+ "e5").map(_ => "ALLOWED").merge)
    val twoPasses = run(List("e5", "e4", "pass", "pass"))
    println("two passes -> end=" + twoPasses.map(_.situation.end) + " status=" + twoPasses.map(_.situation.status))
    // Byo-yomi: no main time, 3 periods of 30 s. P1 thinks 45 s: one period is used up, 15 s into the next.
    import strategygames.{ ByoyomiClock, MoveMetrics, Player, Timestamp, Timestamper }
    def at(cs: Long) = new Timestamper { val now = Timestamp(cs) }
    val started = ByoyomiClock(0, 0, 30, 3).copy(timestamper = at(0)).start.asInstanceOf[ByoyomiClock]
    val moved   = started.copy(timestamper = at(4500)).step(MoveMetrics(), gameActive = true, switchClock = true)
    println("byo-yomi after 45 s: P1 periods used=" + moved.asInstanceOf[ByoyomiClock].players(Player.P1).spentPeriods +
      ", P1 out of time=" + moved.outOfTime(Player.P1, withGrace = false))
```

Output of `sbt run`, with the exclusions (the position string ends in komi `55`, i.e. 5.5 on 9×9):

```text
after setup: Right(9/9/9/4Ss3/3S1Ss2/4Ss3/9/9/S8[SSSSSSSSSSssssssssss] w e5 60 85 1 0 55 0 5)
ko retake e5 now: e5 illegal
two passes -> end=Right(false) status=Right(None)
byo-yomi after 45 s: P1 periods used=1, P1 out of time=false
```

Classes the JVM loaded from strategygames (`-verbose:class`, first run, before the exclusions and
the clock lines): 25 in `strategygames` (20 classes + 5 lambdas), 93 in `strategygames.go`, 23 in
`.go.format`, 26 in `.go.variant`; 0 matching `fairystockfish`, `joansala` or `bytedeco`.

Jars on the classpath with the exclusions (`sbt "export Compile/dependencyClasspath"`):
`strategygames_3-10.2.1-s3-ps14`, `joda-time-2.10.10` and `scala-parser-combinators_3-2.4.0` are new;
the rest (cats-core/kernel, alleycats, cats-free via monocle, kittens, monocle, shapeless3,
cats-parse, pprint, fansi, sourcecode, scalalib-core/model, scalachess) come with scalachess and
scalalib, which lila already uses. Without the exclusions the list also had `fairystockfish` (plain
and native), `aalina`, `samurai`, `guice`, `guava`, `je`, `jline-*`, `picocli`, `javacpp` and their
annotations jars.

strategygames' own Go tests, run from its repo at `7344183` with its own build (Scala 3.7.4):

```text
$ sbt "testOnly strategygames.go.*"
[info] Passed: Total 413, Failed 0, Errors 0, Passed 413
[success] Total time: 102 s (01:42), completed Sep 27, 2026, 4:35:31 PM
```
