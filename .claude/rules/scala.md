---
paths:
  - "**/*.scala"
  - "**/*.sbt"
---
# Scala rules
- Follow the idioms of the surrounding lila / lila-ws code: same helpers (`Fu`, `funit`, `.so`,
  opaque types), same file layout, same naming. Read two neighbouring files before writing new code.
- No `null`, no blocking (`Await`, `Thread.sleep`, blocking IO on the default executor), no `var` in
  shared state unless the surrounding code already uses that pattern (e.g. inside an actor).
- Prefer adapting an existing lila module over adding a new one. A new module or a new dependency
  between modules is an architecture decision: ask.
- Formatting: lila's `.scalafmt.conf` (`./lila.sh scalafmtAll`); /verify checks it.
- Explain any non-obvious Scala (givens, opaque types, macwire, for-comprehensions over Futures) in
  the PR's plain-English walkthrough.
