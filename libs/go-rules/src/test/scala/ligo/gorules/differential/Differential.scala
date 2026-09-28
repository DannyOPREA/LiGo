package ligo.gorules.differential

import java.nio.charset.StandardCharsets.UTF_8
import java.nio.file.{ Files, Path }
import java.util.concurrent.{ Executors, TimeUnit }
import java.util.concurrent.atomic.AtomicLong

import scala.jdk.CollectionConverters.*
import scala.util.{ Failure, Success, Try }

import ligo.gorules.*

// Licence: MIT (LiGo's own code, ADR 0006).

/** The nightly differential test (PLAN §3.3, unit 1.9): random games played by the adapter and followed by
  * KataGo, compared on legality, captures and the final area score.
  *
  * {{{
  * sbt "Test/runMain ligo.gorules.differential.Differential --games 1000 --seed 20260928 --workers 4
  *      --katago /path/to/katago --model /path/to/net.bin.gz --config /path/to/default_gtp.cfg --out /tmp/diff"
  * }}}
  * (`--katago`, `--model`, `--config` and `--out` default to `$KATAGO_BIN`, `$KATAGO_TEST_NET`,
  * `$KATAGO_GTP_CONFIG` and `$DIFFERENTIAL_OUT`.) Game k uses seed `seed + k`, so
  * `--seed <a game's seed> --games 1` replays one game. Writes `summary.md` and, for each disagreement,
  * `<seed>.sgf` and `<seed>.txt` to `--out`. Exits 1 on any disagreement, 2 if KataGo failed.
  * `dev/ligo differential` fills in the KataGo paths.
  */
object Differential:

  // KataGo's paths and the output folder default to environment variables, which `dev/ligo differential`
  // and the workflow set (paths may contain spaces, which sbt's argument line would split).
  private def env(name: String, default: String) = sys.env.get(name).filter(_.nonEmpty).getOrElse(default)

  final case class Options(
      games: Int = 1000,
      seed: Long = 1,
      workers: Int = Runtime.getRuntime.availableProcessors,
      katago: String = env("KATAGO_BIN", "katago"),
      model: String = env("KATAGO_TEST_NET", ""),
      config: String = env("KATAGO_GTP_CONFIG", ""),
      out: Path = Path.of(env("DIFFERENTIAL_OUT", "differential-out")).toAbsolutePath
  )

  def main(args: Array[String]): Unit =
    val options = parse(args.toList, Options())
    Files.createDirectories(options.out)
    val started = System.nanoTime
    val (results, errors) = run(options)
    val seconds = (System.nanoTime - started) / 1e9
    val summary = report(options, results, errors, seconds)
    Files.writeString(options.out.resolve("summary.md"), summary, UTF_8)
    println(summary)
    val failures = results.collect { case (_, Left(d)) => d }
    failures.foreach: d =>
      Files.writeString(options.out.resolve(s"${d.seed}.sgf"), d.sgf, UTF_8)
      Files.writeString(options.out.resolve(s"${d.seed}.txt"), d.summary + "\n", UTF_8)
    // Fewer results than games: a KataGo process failed (the summary says why).
    sys.exit(
      if results.size < options.games then 2
      else if failures.nonEmpty || !enoughScored(options, results) then 1
      else 0
    )

  // Nearly every random game ends settled and is scored; a run that scores few games has stopped testing
  // the score (say, a change to how games end), so it fails rather than staying green.
  private def enoughScored(o: Options, results: List[(Long, Either[Disagreement, GameStats])]): Boolean =
    results.count(_._2.exists(_.scored)) * 10 >= o.games * 9

  /** Plays the games on `workers` threads, each with its own KataGo, and returns them in seed order. A worker
    * whose KataGo fails stops; the others play on.
    */
  def run(options: Options): (List[(Long, Either[Disagreement, GameStats])], List[String]) =
    val next = AtomicLong(0)
    val results = java.util.concurrent.ConcurrentHashMap[Long, Either[Disagreement, GameStats]]()
    val workers = options.workers.max(1).min(options.games.max(1))
    val pool = Executors.newFixedThreadPool(workers)
    val errors = java.util.concurrent.ConcurrentLinkedQueue[String]()
    (1 to workers).foreach: w =>
      pool.execute: () =>
        Try(KataGo(command(options), options.out.resolve(s"katago-$w.stderr.log").toFile)).fold(
          e => errors.add(s"worker $w could not start KataGo: $e"),
          kataGo =>
            try
              var k = next.getAndIncrement()
              while k < options.games do
                val seed = options.seed + k
                Try(DifferentialGame.play(seed, kataGo)) match
                  case Success(result) =>
                    results.put(seed, result)
                    if results.size % 100 == 0 then println(s"differential: ${results.size} games played")
                    k = next.getAndIncrement()
                  case Failure(e) =>
                    errors.add(s"seed $seed stopped worker $w: $e")
                    k = options.games
            finally kataGo.close()
        )
    pool.shutdown()
    pool.awaitTermination(1, TimeUnit.DAYS)
    (results.asScala.toList.sortBy(_._1), errors.asScala.toList)

  private def command(o: Options): Seq[String] =
    Seq(o.katago, "gtp", "-model", o.model, "-config", o.config, "-override-config", overrides(o))

  // One search thread (the test never searches), no dagger-shape move bans (they would mark legal moves
  // illegal in the policy), logs next to the report.
  private def overrides(o: Options): String =
    s"numSearchThreads=1,avoidMYTDaggerHack=false,logToStderr=false,logDir=${o.out.resolve("katago-logs")}"

  def report(
      o: Options,
      results: List[(Long, Either[Disagreement, GameStats])],
      errors: List[String],
      seconds: Double
  ): String =
    val stats = results.collect { case (_, Right(s)) => s }
    val failures = results.collect { case (_, Left(d)) => d }
    def sum(f: GameStats => Int) = stats.map(f).sum
    val bySize = BoardSize.values.toList.map(b => s"${b.lines}x${b.lines}: ${stats.count(_.size == b)}")
    val verdict =
      if results.size < o.games then
        s"**Incomplete**: ${o.games - results.size} of ${o.games} games did not run"
      else if failures.nonEmpty then s"**${failures.size} of ${o.games} games disagree with KataGo.**"
      else if !enoughScored(o, results) then
        s"**Too few final scores compared** (${stats.count(_.scored)} of ${o.games}; at least 90% expected)."
      else s"**All ${o.games} games agree with KataGo.**"
    val lines = List(
      "# Differential test: libs/go-rules vs KataGo",
      "",
      verdict,
      "",
      s"- Seeds ${o.seed} to ${o.seed + o.games - 1}; ${o.workers} workers; ${seconds.round} s.",
      s"- Games that agree: ${stats.size} (${bySize.mkString(", ")}); with handicap: ${stats.count(_.handicap > 0)}.",
      s"- Actions compared: ${sum(_.actions)} (stones ${sum(_.stones)}, passes ${sum(_.passes)}, " +
        s"takebacks ${sum(_.undos)}, resumptions ${sum(_.resumes)}); stones captured: ${sum(_.captured)}.",
      s"- Refusals of an empty point, counted per position, by both: suicide ${sum(_.suicideRefusals)}, simple ko ${sum(_.koRefusals)}, " +
        s"other superko ${sum(_.superkoRefusals)}.",
      s"- Final area scores compared: ${stats.count(_.scored)} (a game stopped by the safety net of 4 actions " +
        "per point ends unsettled and is not counted)."
    ) ++ Option.when(errors.nonEmpty)("\n## Errors\n").toList ++ errors.map(e => s"- $e") ++
      Option.when(failures.nonEmpty)("\n## Disagreements\n").toList ++
      failures.map(d => s"- ${d.summary} (replay: `--seed ${d.seed} --games 1`; SGF: ${d.seed}.sgf)")
    lines.mkString("\n") + "\n"

  @annotation.tailrec
  private def parse(args: List[String], o: Options): Options = args match
    case Nil => o
    case "--games" :: v :: rest => parse(rest, o.copy(games = v.toInt))
    case "--seed" :: v :: rest => parse(rest, o.copy(seed = v.toLong))
    case "--workers" :: v :: rest => parse(rest, o.copy(workers = v.toInt))
    case "--katago" :: v :: rest => parse(rest, o.copy(katago = v))
    case "--model" :: v :: rest => parse(rest, o.copy(model = v))
    case "--config" :: v :: rest => parse(rest, o.copy(config = v))
    case "--out" :: v :: rest => parse(rest, o.copy(out = Path.of(v).toAbsolutePath))
    case other =>
      System.err.println(s"differential: unknown arguments ${other.mkString(" ")}")
      sys.exit(2)
