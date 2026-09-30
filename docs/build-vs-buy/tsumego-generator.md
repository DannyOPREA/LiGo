# Build-vs-buy: the tsumego generator and solver (code)

- Unit: 8.2 (Phase 8). Status: **Decided** as recommended ([ADR 0025](../decisions/0025-phase-8-puzzle-format-trainer.md) §2), by Claude under the owner's 2026-09-28 delegation. The owner may overrule it.
- Follows [ADR 0024](../decisions/0024-tsumego-content-generated-plus-classics.md) point 5 and the content memo ([tsumego-content.md](tsumego-content.md), "Recommendation"). That memo checked content; this one checks code.
- A licence *reading*, not legal advice. Evidence: files fetched or cloned on 2026-09-29 (GitHub raw files were reachable). The forums.online-go.com thread about an OGS life-and-death generator was blocked from the cloud: UNCHECKED.
- Constraint: `tools/` is MIT (ADR 0007). Allowed inputs are MIT, BSD, Apache-2.0, LGPL, GPL-3.0 and AGPL-3.0. GPL code cannot be copied into an MIT file; it could live only as a separate GPL-3.0 file, which would make the tool awkward to hand to OGS.

## What is needed (the four parts)

1. A catalogue of eye-space shapes turned into positions inside an enclosing wall.
2. An exact local solver: both sides play only in a region of about 12 empty points, the wall counts as alive, and the result is dead, alive (including seki) or ko. It produces the solution tree.
3. A KataGo second opinion (ownership, best moves), which needs a "tsumego frame" of stones filling the rest of the board.
4. A difficulty estimate.

## Candidates

| Part | Candidate | Exact licence (file) | Language, state | Fit | Ladder rung | OGS handoff |
|---|---|---|---|---|---|---|
| 3 frame | KaTrain `katrain/core/tsumego_frame.py` | MIT, "Copyright 2020 Sander Land and/or other authors" ([LICENSE](https://raw.githubusercontent.com/sanderland/katrain/master/LICENSE)). The file's header says "ported from lizgoban by kaorahi". | Python, 290 lines | Port to TypeScript (about 150 lines) | Port | Good (MIT) |
| 3 frame | lizgoban `src/tsumego_frame.js` (177 lines, the original) | GPL-3.0 ([LICENSE.txt](https://raw.githubusercontent.com/kaorahi/lizgoban/master/LICENSE.txt), and `package.json` says "GPL-3.0"). There is no file named `LICENSE`. | JavaScript (Electron app) | Reference only. Copying it into MIT `tools/` is not allowed. | None | None |
| 2 solver | cameron-martin/tsumego-solver | **No licence file** (`LICENSE`, `LICENSE.md`, `LICENSE.txt`, `COPYING` all 404; no `license` in `Cargo.toml`). By default that means all rights reserved. | Rust, last commit 2020-07-06, 43 stars, 10 open issues; implements the AAAI 2005 paper "Search versus Knowledge for Solving Life and Death Problems in Go" | Reference only. Not usable, and Rust does not fit. | None | None |
| 2 solver | facebookresearch/darkforestGo `tsumego/solver.h` | BSD 3-clause plus a separate "Additional Grant of Patent Rights Version 2" file ([LICENSE](https://raw.githubusercontent.com/facebookresearch/darkforestGo/master/LICENSE), [PATENTS](https://raw.githubusercontent.com/facebookresearch/darkforestGo/master/PATENTS)) | C/C++, a live-or-die search inside a full engine; unmaintained | Reference only: it is tied to that engine's board | None | Low |
| 2 solver | GoTools (Thomas Wolf) | UNCHECKED (site not reachable; I believe closed source) | Windows program | Reference only, if at all | None | None |
| 2 fast board | @sabaki/go-board 1.4.3 | MIT ([LICENSE](https://raw.githubusercontent.com/SabakiHQ/go-board/master/LICENSE), `package.json` "MIT") | TypeScript, immutable board with `makeMove` and ko detection | Possible npm dep for speed, but see the recommendation | Use as-is | Good |
| 2 rules | goban-engine 8.3.226 (already pinned) | Apache-2.0 ([LICENSE](https://raw.githubusercontent.com/online-go/goban/master/LICENSE)) | TypeScript | Already decided for rules (ADR 0014) | Use as-is | Best (it is OGS's) |
| 2 helper | Benson's algorithm in JS/TS | Searched: no Go-specific JS or TS implementation found | Not applicable | Write it (about 80 lines) if the solver wants an early "alive" cut-off | Custom | Good |
| 1 generator | kendfrey/tsumego-generator | **No licence file** | Rust, 2 commits, last 2026-09-19. Random walk through positions, keeps ones where KataGo sees one winning move | Reference only. Its idea (KataGo as the judge) is the opposite of ours: exact search judges first. | None | None |
| 1 generator | cameron-martin/tsumego-solver (its `generation` module) | No licence file (see above) | Rust | Reference only | None | None |
| 1 generator | adum/tsumegobench | **No licence file** | TypeScript and Python; last commit 2026-09-27. A benchmark of whether an AI can write tsumego, not a generator. | Reference only | None | None |
| 3 client | `services/scoring/src/katago.ts` (in this repo) | MIT (LiGo's own, ADR 0006) | TypeScript, 206 lines | Reuse with a small extension, see below | Configure / wrap | Good |
| 3 engine | KataGo analysis engine | MIT, "Copyright 2025 David J Wu" for the code, with third-party notices ([LICENSE](https://raw.githubusercontent.com/lightvector/KataGo/master/LICENSE)) | C++, already pinned (ADR 0016) | Use as-is | Use as-is | Good |
| misc | Tenuki, WGo.js | Tenuki: UNCHECKED (no LICENSE file found at the guessed URL). WGo.js: MIT per a search result only, so UNCHECKED. | JS board UIs | Not relevant: they are displays, and neither has a solver | None | None |

## Findings that matter

- **The KaTrain frame is safe to port.** KaTrain issue #498 says kaorahi, who wrote lizgoban, contributed the Python port himself ("imported from lizgoban as an exercise of python", [issue](https://github.com/sanderland/katrain/issues/498)). The copyright holder released his own code into an MIT repository, so the Python file is MIT and its origin is not a licence trap. One residue: the issue page states no licence for it, so I am taking the MIT reading from the repo LICENSE, not from an explicit statement. Keep the credit line "Ported from KaTrain (MIT), itself from lizgoban by kaorahi" in the file.
- **Do not open lizgoban's JS while porting.** It is GPL-3.0. Port from the Python, or better, from the plain idea (below). The idea (fill the far side with attacker stones, the near side with defender stones, leave a gap at the problem, add ko threats when needed) is not copyrightable; only the code is.
- **KaTrain's LICENSE has carve-outs** (KataGo binaries, icons, a font that is free for non-commercial use only). None concerns `tsumego_frame.py`. Do not vendor anything else from KaTrain.
- **No existing solver or generator can be used.** The only usable-looking one (cameron-martin) has no licence and is Rust. Nothing in JS/TS was found. I found no open generator that is MIT/BSD/Apache-licensed.
- **The KataGo client is nearly reusable as is.** It runs one long-lived `katago analysis` process, matches replies by id, times out, restarts after a crash and handles warnings. Two limits: `query()` is `private`, and the only public method is `ownershipMaps` (ownership only). Tsumego needs the full request fields `allowMoves` (KataGo's [Analysis_Engine.md](https://raw.githubusercontent.com/lightvector/KataGo/master/docs/Analysis_Engine.md) says at most one entry per player, so it can confine both sides to the region), `maxVisits`, and the `moveInfos` and `rootInfo` (winrate, scoreLead) in the reply. Change: add a public generic `analyse(payload)` and a typed reply. About 30 lines, same file. `allowMoves` also has an `untilDepth` field, so the frame does not have to be perfect.

## Recommendation, per part

| Part | Reuse | Write | Why |
|---|---|---|---|
| 1 Catalogue and wall | none exists | Write, about 150 lines of TypeScript data and a placer. Shapes are common Go knowledge (ADR 0024). | Tiny and specific to LiGo. |
| 2 Exact solver | goban-engine for legality, captures, ko and the rules (already pinned). Optional: Benson written by us for an early "alive" exit. | Write a memoised search (alpha-beta over the region's states, with a transposition table keyed on board plus ko point, and a move-ordering heuristic for eye-point moves). Roughly 300 to 500 lines. | No usable code exists. The paper behind tsumego-solver (AAAI 2005) is a public description of the technique. I may read the paper, not that repo's code. |
| 2 board for speed | Start with goban-engine's own play. Add `@sabaki/go-board` (MIT) only if the 8.2 spike misses its time budget. | Otherwise write a 100-line bitboard for the region. | Any new dependency needs its own approval and a COPYING.md line; measure first. A 12-point region has a small search space, so speed is probably fine. |
| 3 Frame | Port KaTrain's Python (MIT) to TypeScript with the credit line. | About 150 lines, tested by asking KataGo (small network) whether known easy corner problems come out right. | Saves working out the pattern from scratch, with no licence cost. Runner-up: write the frame from the idea alone, also allowed, with no dependence on either repo. |
| 3 KataGo client | Reuse `services/scoring`'s `KataGoClient`; add the generic `analyse` method. | About 30 lines. | It already handles restarts and time-outs. Import via the pnpm workspace, not a copy. |
| 4 Difficulty | none exists | Write from the solver's own numbers: search nodes, depth of the longest refutation, number of wrong first moves that look plausible (KataGo's prior), and size of the region. About 50 lines. | Calibrated against how hard the shapes really are in Go teaching (three in a row is easy; bulky five needs care). |

**Overall:** part 3's frame is the only place to reuse third-party code (one Python port). Everything else is our own code on top of goban-engine and our existing KataGo client. That is rung 6 of the ladder (custom), but only about 700 to 900 lines, and every rule question goes to goban-engine.

**Runner-up (if the spike shows the exact solver too slow in TypeScript):** use `@sabaki/go-board` inside the search. The final fallback is a small Rust or C solver, which would break the "one Node toolchain" rule and needs a new decision.

## What the owner must decide

- Nothing new. Under the standing delegation Claude proceeds. The two things the owner could overrule: (a) porting KaTrain's frame rather than writing it from the idea; (b) writing our own solver rather than adopting an unlicensed Rust one (this is not really a choice: no licence, no use).
- Carried from ADR 0024 point 7, now settled: the owner's b18 network is under the KataGo Neural Network License (MIT-style, PR #50); the cloud checks with the pinned g170 test network (ADR 0025 §2).
- One request for later: ask cameron-martin and kendfrey to add a licence. Only worth doing if the owner wants their code, and it would still be Rust.
