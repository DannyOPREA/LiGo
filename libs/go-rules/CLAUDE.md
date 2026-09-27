# libs/go-rules/ in LiGo

The server's Go rules: a thin adapter over PlayStrategy's strategygames (ADR 0012). How it works and
what it adds: [README.md](README.md). The rules it implements: `docs/rules/spec.md`.

- **We adapt strategygames, we don't rewrite it.** Legality, captures, ko and superko hashing and
  the handicap tables are strategygames'. The adapter only adds what the spec asks for on top
  (post-pass situations, the scoring phase, resume and its limit, takebacks, SGF export). A rules
  bug in strategygames gets an upstream report/patch and, meanwhile, the smallest fix here.
- lila code uses only `ligo.gorules.*`, never `strategygames.*`.
- Truth is the fixtures in `libs/conformance/fixtures/` (only go-rules-expert edits them). Never
  change a fixture to make the adapter pass; the server never has a known gap.
- Bumping strategygames: change the version in `build.sbt` and the SHA-256 in `check-pin.sh` and
  `docs/UPSTREAM.md` together, read its Go changes since the pinned commit (upstream-scout), run
  `dev/ligo test rules`. A version bump is a dependency change: ask the owner first.
- Own sbt build (sbt 2, Scala and scalalib as lila). Phase 3 wires it into lila's build.

## Test
`dev/ligo test rules` (sbt `testFull`: plain `test` in sbt 2 skips tests whose code didn't change,
and a fixture change is not a code change), then `libs/go-rules/check-pin.sh`. Format:
`cd libs/go-rules && sbt scalafmtAll`. CI: `.github/workflows/rules.yml`.

## Logs to read
`logs/rules-engine.md` (Lessons + latest entries).
