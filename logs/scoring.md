# Scoring log

## Lessons (curated, ≤ 30 lines — read this first)
- OGS autoscore uses TWO KataGo ownership maps (black to move and white to move); it removes stones above 0.7 ownership and flags points below 0.3 as needing sealing (2026-09-25, planning research).
- goscorer (MIT, lightvector) does territory/area counting with seki detection once dead stones are marked, and is bundled in goban (2026-09-25, planning research).
- KataGo on CPU (Eigen) manages ~10–20 playouts/s with small nets: fine for scoring tests, not for review. The AMD GPU uses the OpenCL backend (2026-09-25, planning research).
- Measured: KataGo v1.18.1 Eigen with the b6 test net does ~140 visits/s on the 4 cloud vCPUs (4 threads); the planning estimate above was for full-size nets (2026-09-27, unit 0.5).

## Entries (newest first)
### 2026-09-27 · unit 0.5 · KataGo installed and benchmarked in the cloud (CPU)
- Did: `dev/ligo katago install cpu`, `smoke`, `bench` in a cloud session: KataGo v1.18.1 Eigen
  (not the AVX2 build), g170 b6c96 test network, 4 vCPU Intel Xeon @ 2.80 GHz.
- Worked: smoke analysis (50 visits, ownership map of 361 points) in ~1.3 s including startup.
  Benchmark, 200 visits/position, 10 positions: 1 thread 36 visits/s, 2 threads 68, 4 threads
  143 (recommended). A 100-visit run peaked at ~140 visits/s with 8–10 threads.
- Didn't work / dead ends: the full-size network host (media.katagotraining.org) is blocked in
  the cloud, so no b18 numbers here; the b6 test net is far weaker than what scoring will use.
- Lessons: a b6 net on 4 cloud vCPUs does ~140 visits/s, plenty for plumbing tests of the
  scoring service.
- Decisions: KataGo v1.18.1 and the test net are Claude's defaults for the owner to confirm
  (logs/decisions.md).
- Verified by Claude: the numbers above (real output). · Needs owner verification: OpenCL
  benchmark with the b18 network on the AMD GPU (`dev/ligo katago bench`).
- Follow-ups: record the owner's OpenCL benchmark here.
