// libs/go-rules: LiGo's server-side Go rules, an adapter over PlayStrategy's strategygames
// (ADR 0012). lila code talks to this adapter, never to strategygames directly.
// Licence: MIT (LiGo's own code, ADR 0006).

name := "go-rules"
organization := "org.ligo"
version := "0.1.0-SNAPSHOT"

// Same Scala and scalalib as lila (lila/project/BuildSettings.scala, Dependencies.scala), so the
// library drops into lila's build in Phase 3 without version conflicts.
scalaVersion := "3.8.4"
scalacOptions ++= Seq("-feature", "-deprecation", "-Wunused:all")

// strategygames is published only to PlayStrategy's GitHub-hosted Maven repo (ADR 0012). Cloud
// sessions ignore these resolvers and read ~/.sbt/repositories instead (ADR 0008), which
// dev/cloud-setup.sh writes with the same repo.
resolvers ++= Seq(
  "ps-lila-maven".at("https://raw.githubusercontent.com/Mind-Sports-Games/lila-maven/master"),
  "jitpack".at("https://jitpack.io")
)

libraryDependencies ++= Seq(
  // Pinned exactly; its jar's SHA-256 is in docs/UPSTREAM.md.
  "org.playstrategy" %% "strategygames" % "10.2.1-s3-ps14",
  // lila's version; strategygames asks for an older one, which sbt evicts (memo 1.1).
  "com.github.lichess-org.scalalib" %% "scalalib-core" % "11.10.12",
  // Tests only, both already in lila's build: munit is lila's test framework, play-json reads the
  // conformance fixtures.
  "org.scalameta" %% "munit" % "1.3.6" % Test,
  "org.playframework" %% "play-json" % "3.0.6" % Test
)

// strategygames ships every PlayStrategy game in one artifact. The Go package and the clock load
// none of the others, so their engines (native Fairy-Stockfish, Joan Sala's aalina and samurai)
// and what they drag in are left out (ADR 0012).
excludeDependencies ++= Seq(
  ExclusionRule("org.playstrategy", "fairystockfish"),
  ExclusionRule("com.joansala.aalina"),
  ExclusionRule("com.joansala")
)

// The fixtures live in libs/conformance; tests find them relative to this folder.
Test / fork := true
Test / baseDirectory := baseDirectory.value
