---
name: credits-page-review-patterns
description: Checks that paid off reviewing unit 9.8 (credits page, generated HTML + COPYING cross-check) - indexOf -1 vacuity, substring matching, symlinked argv[1] main guard, stale upstream font licences
metadata:
  type: feedback
---

From unit 9.8 (credits page, 2026-09-30):
- Doc-parsing checks: `s.slice(s.indexOf(heading))` with a renamed heading gives slice(-1), so the
  check silently passes. Probe by renaming the heading in a scratch copy and calling the exported fn.
- Name-substring matching against COPYING §3 rows: COPYING's own convention ("X, Y's only
  dependency") means any new transitive-dep row passes via its parent's name. Print per-row which
  names matched; redundant names reveal it.
- `if (process.argv[1] === fileURLToPath(import.meta.url))` main guard: through a symlinked path the
  script does nothing and exits 0, so `--check` is vacuous. Test with `ln -s repo scratch/link`.
- Credits copied from lila/COPYING.md inherit its stale claims: Noto Sans and Roboto are OFL-1.1 now
  (roboto woff2 carries "googlefonts/roboto-classic" copyright = OFL era). Decompress woff2 with
  node zlib.brotliDecompressSync at offsets after the table dir to read strings.
- g170 KataGo networks: memo says CC0, SOURCES.md says in KataGo's MIT repo; don't let them be lumped
  under the kata1 "KataGo Neural Network License".
- Restore any file touched while probing (cp backup) and confirm `git status` clean.

**Why:** the unit's own negative test only covered the happy parsing path.
**How to apply:** any generated-artefact + "--check" drift guard, or any credits/licence listing.
