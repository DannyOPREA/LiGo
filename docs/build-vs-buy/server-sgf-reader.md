# Build-vs-buy: server-side SGF reader

- Unit: 7.1 (Phase 7, import). Status: **Decided 2026-09-29: D**, by Claude under the owner's 2026-09-28 delegation ([ADR 0023](../decisions/0023-phase-7-analysis-sgf-correspondence.md) §3).
- Evidence: shallow clones of strategygames (master, 2026-09-17) and sgf4j (master, 2026-01-11) in a scratch dir; web pages linked below.

## Capability

`/paste` and `/api/import` store an imported Go game, so the server must read an SGF (FF[4]) record
into a plain structure: root properties (SZ, KM, RU, HA, AB/AW, PL, PB/PW/BR/WR/DT/RE/EV), the main
line of B/W moves (passes `B[]` and `tt`), escaped `]` and `\`, lower-case legacy names, the CA charset.
LiGo then replays the moves through its own `GoGame`, so the parser needs no Go rules: it only
tokenizes and structures. It lives in `libs/go-rules` (Scala 3, sbt 2, JVM 21), next to `Sgf.write`.
Client-side reading already exists (goban-engine, unit 1.8); `Sgf.scala` says "reading SGF back is
goban-engine's job", which no longer covers server-side import. The `sgf` skill says "don't write a
parser" and sends anything else through /build-vs-buy, hence this memo.

## What was checked

1. **strategygames (MIT) has no SGF reader.** Its Go SGF code is `go/format/Sgf.scala` and
   `format/sgf/{Dumper,tagModel}.scala`: writers only (`actionStrsToOutput`, `Dumper.apply`). Its only
   parsers are for PGN and Forsyth (FEN) text (`go/format/pgn/Reader.scala`, `Forsyth.scala`).
   scalachess is the same (its parser reads PGN). Nothing to reuse.
2. **JVM parsers.** Only two are real candidates (table). Searches also surface GitHub repos in Go,
   Ruby, Python and OCaml, and `mccxj` "go.sgf.parser" (Java) which I did not verify (no page opened).
3. **JS parsers** (`@sabaki/sgf`, goban-engine's `sgf` reader) run only under Node.
4. **Custom.** See below.

## Candidates

| Option | Licence | Maintenance | Fit with lila | Effort | OGS handoff |
|---|---|---|---|---|---|
| A. `com.toomasr:sgf4j-parser` (Java) | Apache-2.0 | Maven Central latest 0.0.6, about 6 years old; GitHub master is 0.0.8-SNAPSHOT, last commit 2026-01-11, 37 stars, 1 open issue, one maintainer. Says it was tested on 90,000+ files | Java 11; pulls zt-zip, commons-io, slf4j and log4j-core/api (log4j-core is unwanted next to lila's logback). Builds a game tree and its own board (`VirtualBoard`), so it does more than we need. Main line and branches supported; README says nothing on FF[4], CA or escapes. Its escape code (`Util.java`) is regex placeholder swaps, not a tokenizer | Low to wire, but a dependency change plus review of 3,000 lines of Java we would not control; the stale Central release means depending on a git build or on 0.0.6 | Low (JVM only) |
| B. `drydenb/sgf` (Scala, FastParse) | MIT | Scala 2.12.2, FastParse 0.4.3, 0 stars; not Scala 3 compatible; no release | Poor | Would need a port | None |
| C. `@sabaki/sgf` or goban-engine's reader via Node | MIT / AGPL-3.0 (OGS, per the ratings memo) | Maintained | Couples import to a Node process (services/scoring is a Redis worker for scoring, not a request-path library). Extra network hop and a failure mode on every `/paste` | Medium | High for goban-engine (same reader both sides), but not needed |
| D. **Custom tokenizer in `libs/go-rules`** | MIT (LiGo's own, ADR 0006) | Us | Exact: pure Scala 3, no dependency, next to `Sgf.write` | Small (below) | High: it is a spec-sized, dependency-free file OGS could take or port |

## Reuse ladder

A: rung 2-3 (configure/wrap, with a new dependency). B: rung 5 (port). C: rung 3 (wrap a service).
D: rung 6 (custom, glue-sized). D is justified only because rungs 1-4 leave the choice between an
unmaintained Java library with heavy transitive dependencies and a process hop.

## Custom estimate (option D)

FF[4] structure is tiny: `(` `)` `;` `IDENT` `[value]`, backslash escapes inside values. Scala 3, no
parser library:
- Tokenizer plus recursive tree builder: about 80 lines. Property values as `List[String]` per key
  (upper-cased letters only, so `ab` and `AB` unify, per the spec's rule to ignore lower-case letters).
- Text unescape (`\]`, `\\`, soft line breaks `\` + newline dropped): about 10 lines.
- CA charset: decode bytes with the `CA` value (default ISO-8859-1 per spec; UTF-8 in practice), needs a
  byte-level entry point that sniffs `CA[...]` first: about 15 lines.
- Main-line extraction plus root-property mapping to a `SgfGame` case class (size, komi, ruleset,
  handicap, setup stones, first player, info, moves incl. `tt` on 19x19 and `[]` as pass): about 80 lines.
- Total about 180-220 lines including scaladoc, plus errors as `Either[SgfError, ...]` with a position.

Tests it would need:
1. **Round trip** with `Sgf.write` on the existing games (parse, replay via `GoGame`, write, compare
   text); property test over random games (the go-rules property tests already generate them).
2. **Agreement with goban-engine's reader** on libs/board's corpus. Note: `libs/` holds no `.sgf` files
   today. The 227 server SGF games unit 1.8 reads back are generated by `Sgf.write`, so the corpus
   must be exported once from those games (a small script) and both readers compared on
   root properties and move lists.
3. Hand-written edge cases: escaped `]` and `\`, `C[a\]b]`, lower-case names, missing SZ (19), `tt`
   and `[]`, empty variations, nested variations (main line = first child), unbalanced parens, moves on
   occupied points (rejected by `GoGame`, not the parser), CA[UTF-8] versus Latin-1 bytes, a BOM.
4. Malformed-input fuzz (no exceptions, bounded depth and size: import is a user-facing endpoint).

## Recommendation

**D, a small custom tokenizer in `libs/go-rules`.** No candidate is both maintained and a good fit:
strategygames has none, the only Scala one is a dead Scala 2 experiment, and sgf4j is a large,
single-maintainer Java library whose Central release is six years old and whose dependencies include
log4j-core, all to do what about 200 lines do here. Because the reader is only structure and the
rules stay in `GoGame`, the risk is low and the tests above (round trip plus cross-check against
goban-engine) give strong evidence. Untrusted input is the real risk, hence the size limit and fuzz
test. Note this overrides the `sgf` skill's "don't write a parser" line, so the skill's text should
be updated if the owner approves.

**Runner-up: A (sgf4j 0.0.6 from Maven Central).** Pick it if you would rather not own any parsing
code; cost is the dependency change (a Phase 7 decision), log4j transitives to exclude, and trusting
an unaudited parser with user-supplied files.

Not recommended: C (Node in the import request path).

## What the owner must decide

Approve a custom reader (D, recommended), or a dependency on sgf4j (A)? Either is a change to
`libs/go-rules` (A also changes `build.sbt`). If D: also OK to relax the `sgf` skill's "don't write a
parser" line and the `Sgf.scala` comment, and to export a corpus of SGF files under
`libs/conformance/` for the cross-check.

## Sources

- strategygames: https://github.com/Mind-Sports-Games/strategygames (go/format/Sgf.scala, format/sgf/Dumper.scala)
- sgf4j: https://github.com/toomasr/sgf4j and https://central.sonatype.com/artifact/com.toomasr/sgf4j-parser/0.0.6
- drydenb/sgf: https://github.com/drydenb/sgf
- SGF FF[4] spec: https://www.red-bean.com/sgf/sgf4.html
