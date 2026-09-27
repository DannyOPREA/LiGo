# Third-party notices for libs/go-rules

libs/go-rules' own code is MIT (ADR 0006, [`LICENSE-MIT`](../../LICENSE-MIT)). It depends on, but
does not copy, PlayStrategy's **strategygames** (`org.playstrategy::strategygames`
`10.2.1-s3-ps14`, source commit `7344183`, https://github.com/Mind-Sports-Games/strategygames),
which sbt downloads at build time. strategygames is a fork of lichess's scalachess and carries
scalachess' MIT licence. Its published jar ships no licence file, so the notice from its repository
(`LICENSE` at `7344183`) is reproduced here:

```text
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
