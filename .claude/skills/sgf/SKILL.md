---
name: sgf
description: SGF (FF[4]) essentials and quirks for reading and writing Go game records in LiGo. Use whenever importing, exporting or testing SGF, and before anyone writes an SGF parser.
---

# SGF in LiGo

**Don't write a parser.** In the browser use `@sabaki/sgf` (ADR 0023: goban-engine's SGF reader hangs
on truncated files and plays moves unchecked, so it is kept only for unit 1.8's read-back tests); anything else goes through
/build-vs-buy. The one exception is the server's reader in `libs/go-rules` (unit 7.3,
ADR 0023 §3, memo docs/build-vs-buy/server-sgf-reader.md): no maintained JVM reader fits.

Essentials of FF[4]:
- A game is `(;GM[1]FF[4]SZ[19]KM[6.5]RU[Japanese]...;B[pd];W[dp]...)`; properties are
  `IDENT[value]`, nodes start with `;`, variations are nested `( ... )`.
- Coordinates are two letters `a`–`s` (column then row, from the top-left); `B[]` or `W[]` is a
  pass (`tt` is an old pass convention on 19×19; accept it on input, never write it).
- Setup: `AB`/`AW` add stones (handicap uses `AB` + `HA`); `PL` sets who plays next.
- Game info: `PB`, `PW`, `BR`, `WR` (ranks), `DT`, `RE` (`B+R`, `W+3.5`, `0` for a draw,
  `Void`), `TM` and `OT` for time; `KM` komi; `RU` rules.
- Text values escape `]` and `\\`; line breaks are allowed; `CA` gives the charset (default
  Latin-1, most files in the wild are UTF-8).

Quirks to test: lower/upper case property names from old files, missing `SZ` (means 19), comments
with escaped brackets, empty variations, moves on occupied points in broken files (reject with a
clear message). Round-trip tests (parse → write → parse) belong in the conformance suite.
Both readers replay `libs/conformance/sgf/root.json` (root settings) and `records.json` (whole
records: main line or refusal); add a quirk there, not in one reader's tests only.
