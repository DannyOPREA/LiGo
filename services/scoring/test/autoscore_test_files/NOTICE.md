# OGS goban's autoscore regression games

The 31 files in this directory are OGS's own autoscore test set, vendored unchanged from
[online-go/goban](https://github.com/online-go/goban), commit `e61c56e2` (`test/autoscore_test_files/`),
2026-09-28 (docs/build-vs-buy/scoring.md, unit 1.3's spike; ADR 0016). Each file is one finished
game's board, the two KataGo ownership maps OGS's own service produced for it, and the expected
autoscore result (dead stones, dame, points that still need sealing), used here as
`test/autoscore.test.ts`'s regression set (31/31, replaying `test_autoscore.ts`'s pass rule).

Copyright (C) Online-Go.com, licensed under the Apache License, Version 2.0: the full text is in
[`../../LICENSE-Apache-2.0.txt`](../../LICENSE-Apache-2.0.txt). The goban repository ships no
NOTICE file for these files.
