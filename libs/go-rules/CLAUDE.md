# libs/go-rules/ in LiGo

The server's Go rules: a thin adapter over PlayStrategy's strategygames (ADR 0012). How it works and
what it adds: [README.md](README.md). The rules it implements: `docs/rules/spec.md`.

- **We adapt strategygames, we don't rewrite it.** Legality, captures, ko and superko hashing and
  the handicap tables are strategygames'. The adapter only adds what the spec asks for on top
  (post-pass situations, the scoring phase, resume and its limit, takebacks, SGF export). A rules
  bug in strategygames gets an upstream report/patch and, meanwhile, the smallest fix here.
- lila code uses only `ligo.gorules.*`, never `strategygames.*`.
- **SGF in is `SgfReader` + `SgfImport`** (unit 7.3, ADR 0023 §3), the one SGF parser LiGo writes.
  It must read a file as `libs/board/src/sgf.mjs` does: a change to what either accepts changes
  `libs/conformance/sgf/root.json` or `records.json`, which both replay, and the seeded
  differential (`SgfDifferentialExportTest` + `libs/board/test/parity.test.mjs`) must stay green.
  It takes untrusted text: no recursion, no exceptions, the 200 KB, 10,000-node and 1,000-depth
  limits.
- Truth is the fixtures in `libs/conformance/fixtures/` (only go-rules-expert edits them). Never
  change a fixture to make the adapter pass; the server never has a known gap.
- Bumping strategygames: change the version in `build.sbt` and the SHA-256 in `check-pin.sh` and
  `docs/UPSTREAM.md` together, read its Go changes since the pinned commit (upstream-scout), run
  `dev/ligo test rules`. A version bump is a dependency change: ask the owner first.
- Own sbt build (sbt 2, Scala and scalalib as lila). lila's build loads it as a source dependency
  (`ProjectRef` in `lila/build.sbt`, unit 3.10): lila's `core` compiles against it, so a change
  here recompiles lila too, and `lila/project/Dependencies.scala` repeats this build's resolver and
  `excludeDependencies` (sbt doesn't pass them on). Change both lists together.

## Test
`dev/ligo test rules`: resolves, checks the strategygames jar's SHA-256 (`check-pin.sh`), then
runs sbt `testFull` (plain `test` in sbt 2 skips tests whose code didn't change, and a fixture
change is not a code change). `dev/ligo differential [--games N --seed S]`: random games against
KataGo (README, unit 1.9; nightly in CI). Format:
`cd libs/go-rules && sbt scalafmtAll`. CI: `.github/workflows/rules.yml` and
`nightly-differential.yml`.

## Logs to read
`logs/rules-engine.md` (Lessons + latest entries).
