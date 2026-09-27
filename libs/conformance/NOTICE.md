# Where the cases come from, and their licences

Three of the four fixture files restate positions and expected outcomes from other projects' test
suites. Each such file keeps its source's licence (COPYING.md §3); `source` in the file names the
project, the exact commit and the licence, and each case's `from` points at the test it came from.
Changes from the sources: positions restated in LiGo's JSON format, small boards embedded in a 9×9
corner, and expectations adjusted to LiGo's rules (situational superko, no suicide, the scoring
phase) where a case's `notes` say so.

| File | Source | Licence |
|---|---|---|
| `fixtures/strategygames.json` | [strategygames](https://github.com/Mind-Sports-Games/strategygames) (PlayStrategy), Go tests | MIT, notice below |
| `fixtures/goban.json` | [goban](https://github.com/online-go/goban) (Online-Go.com), engine tests and autoscore files | Apache-2.0, [LICENSE-Apache-2.0.txt](LICENSE-Apache-2.0.txt); goban ships no NOTICE file |
| `fixtures/katago.json` | [KataGo](https://github.com/lightvector/KataGo), rules tests | MIT, notice below |
| `fixtures/ligo.json`, `check.mjs`, `check.test.mjs`, `fast-check.sh` | LiGo | MIT ([LICENSE-MIT](../../LICENSE-MIT), ADR 0006) |

## strategygames

```
Copyright (c) 2012-2014 Thibault Duplessis

The MIT license

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished
to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## KataGo

```
Copyright 2025 David J Wu ("lightvector") and/or other authors of the content in this repository.
(See 'CONTRIBUTORS' file for a list of authors as well as other indirect contributors).

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
