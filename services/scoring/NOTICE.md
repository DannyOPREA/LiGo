# Third-party notices for services/scoring

services/scoring's own code is MIT (ADR 0006, [`LICENSE-MIT`](../../LICENSE-MIT)). It depends on,
but does not copy, the npm package below, which pnpm downloads at install time (pinned in lila's
`lila/pnpm-lock.yaml`: services/scoring is in lila's pnpm workspace, unit 4.4, the same reasoning
as `libs/board`, ADR 0017). The vendored OGS test games under `test/autoscore_test_files/` have
their own notice: [`test/autoscore_test_files/NOTICE.md`](test/autoscore_test_files/NOTICE.md).

## goban-engine 8.3.226 (Apache-2.0)

OGS's Go engine (https://github.com/online-go/goban), the engine-only build of `goban` (ADR 0014,
ADR 0016). Copyright (C) Online-Go.com, licensed under the Apache License, Version 2.0: the full
text is in [`LICENSE-Apache-2.0.txt`](LICENSE-Apache-2.0.txt). The package ships only the licence
header (`build/goban-engine.js.LICENSE.txt`) and no NOTICE file.

## goscorer (MIT), bundled inside goban-engine

goban-engine's scoring code includes lightvector's goscorer (`src/third_party/goscorer/goscorer.mjs`
in goban). The minified build drops its notice, so it is reproduced here from
https://github.com/lightvector/goscorer/blob/main/LICENSE.txt (already reproduced once in
`libs/board/NOTICE.md`, memo 1.2, ADR 0014; the same code is bundled again here):

```text
Copyright 2024 David J Wu ("lightvector").

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

## eventemitter3 5.0.4 (MIT), goban-engine's only dependency

```text
The MIT License (MIT)

Copyright (c) 2014 Arnout Kazemier

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
