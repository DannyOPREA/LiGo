# Third-party notices for tools/puzzles

tools/puzzles' own code and its puzzle files are MIT (ADR 0007, ADR 0024,
[`LICENSE-MIT`](../../LICENSE-MIT)). One file is a port: `src/frame.ts` is KaTrain's tsumego frame
in TypeScript, under KaTrain's MIT licence ([`LICENSE-katrain.txt`](LICENSE-katrain.txt)); its test
vectors (`test/fixtures/frame.json`) were computed by KaTrain's own Python file.

Otherwise it depends on, but does not copy, the npm packages below, which pnpm downloads at install
time (pinned in `lila/pnpm-lock.yaml`: tools/puzzles is in lila's pnpm workspace, unit 8.3, the
same reasoning as `services/scoring`, ADR 0017). It also imports `services/scoring`'s KataGo
client and `libs/board`'s SGF reader by path; their own notices are in `services/scoring/NOTICE.md`
and `libs/board/NOTICE.md`.

## goban-engine 8.3.226 (Apache-2.0)

OGS's Go engine (https://github.com/online-go/goban), the engine-only build of `goban` (ADR 0014),
used for every rule. Copyright (C) Online-Go.com, licensed under the Apache License, Version 2.0:
the full text is in [`LICENSE-Apache-2.0.txt`](LICENSE-Apache-2.0.txt). The package ships only the
licence header and no NOTICE file. goban-engine bundles lightvector's goscorer and depends on
eventemitter3 (both MIT); their notices are in `services/scoring/NOTICE.md` (the same copy of
goban-engine, same version).

## ajv 8.20.0 (MIT) and its dependencies

The JSON Schema validator that checks every puzzle against `schema/puzzle.schema.json`
(https://github.com/ajv-validator/ajv). Copyright (c) 2015-2021 Evgeny Poberezkin. Its own
dependencies: fast-deep-equal 3.1.3 and json-schema-traverse 1.0.0 (MIT, Copyright (c) 2017 Evgeny
Poberezkin), require-from-string 2.0.2 (MIT, Copyright (c) Vsevolod Strukchinsky) and fast-uri 3.1.7
(BSD-3-Clause, Copyright (c) 2011-2021 Gary Court, Copyright (c) 2021-present the Fastify team).

The MIT licence text, which each of the MIT packages above carries with its own copyright line:

```text
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

fast-uri's BSD-3-Clause text is in its package (`fast-uri/LICENSE`); it asks that redistributions
keep its copyright notice, conditions and disclaimer, which ship with the package itself.

## KataGo and its networks

KataGo is not a dependency: `dev/katago.sh` installs it (MIT). The second opinion runs it with the
test network pinned there (from KataGo's MIT repository) or the owner's full-size network (KataGo
Neural Network License, MIT-style, PR #50). Puzzle files record only the network's name and
sha256, and whether KataGo agreed, nothing derived from the network (ADR 0025 §2).
