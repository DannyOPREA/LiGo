# Scoring log

## Lessons (curated, ≤ 30 lines — read this first)
- OGS autoscore uses TWO KataGo ownership maps (black to move and white to move); it removes stones above 0.7 ownership and flags points below 0.3 as needing sealing (2026-09-25, planning research).
- goscorer (MIT, lightvector) does territory/area counting with seki detection once dead stones are marked, and is bundled in goban (2026-09-25, planning research).
- KataGo on CPU (Eigen) manages ~10–20 playouts/s with small nets: fine for scoring tests, not for review. The AMD GPU uses the OpenCL backend (2026-09-25, planning research).
- Measured: KataGo v1.18.1 Eigen with the b6 test net does ~140 visits/s on the 4 cloud vCPUs (4 threads); the planning estimate above was for full-size nets (2026-09-27, unit 0.5).
- goban's `test/autoscore_test_files/` (31 OGS games with ownership maps and expected results) is a ready-made regression set for autoscore; its expected results were drafted from the same maps, so it is not an accuracy benchmark (2026-09-27, unit 1.3).
- KataGo's multi-threaded search is not deterministic: store the proposal shown to players, recount only with goscorer (2026-09-27, unit 1.3).

## Entries (newest first)
### 2026-09-28 · unit 4.1 · ADR 0020: scoring phase, service protocol, byo-yomi in lila
- Did: wrote ADR 0020: Redis pub/sub messages between lila and `services/scoring` (final board +
  go-rules' prisoners, replies matched by `ref`), the `sc` block on `game5`, the scoring-phase state
  machine with versioned toggles and accepts, timeouts (3 min live, 1 day correspondence), clocks
  stopped during the phase, the no-KataGo and no-service fallbacks, `VariantEnd` for scored games,
  and byo-yomi's `cy` key and clock payload.
- Worked: fishnet's Redis pattern (two channels, re-send on `start`) fits; lila-ws forwards the new
  commands with no Go knowledge (`r/do`).
- Didn't work / dead ends: the first draft missed five things the reviewer found: lila's
  `outoftime` counts a stopped clock as flagged, re-send on `start` only reaches loaded rounds and
  deadlines didn't survive a lila restart, accept could land on an unseen count, widening dead
  stones in lila made the stored count stale, and goban-engine gives 1 point of compensation for
  handicap 1. All fixed in the ADR (outoftime off while `sc` exists, `ck`/`ex` + Titivate, count
  version `v`, the service returns whole chains, handicap 0 for `hc` < 2).
- Lessons: a pause in lila's round needs checking against every out-of-time path (client flag,
  Titivate), and any deadline must live in Mongo (`ck`), not only in the round actor.
- Decisions: all of ADR 0020, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh; reviewer agent (5 blocking findings, fixed); KataGo accepts komi
  from -400 to 400 in half points (reviewer's run). · Needs owner verification: none beyond reading
  the ADR if curious.
- Follow-ups: 4.3 records the two spec additions; 4.4 adds a 1-stone-handicap scoring fixture.
### 2026-09-28 · Phase 4 breakdown · Go-native game split into units 4.1–4.12
- Did: split Phase 4 into 12 units (docs/PLAN.md §5, "Phase 4 units"): a design ADR (4.1), then the
  go-rules byo-yomi clock (4.2) and scoring phase (4.3), `services/scoring` core (4.4) and on Redis
  (4.5), the autoscore benchmark and full-size network (4.6), and the lila halves (4.7–4.11) and the
  demo (4.12), which need Phase 3's round, game creation and round UI.
- Worked: ADRs 0016 and 0019 already fix most of the shape; their open points (message format,
  prisoners, fallback, network licence, "scored" status, byo-yomi storage) all land in 4.1 or 4.6.
- Didn't work / dead ends: none.
- Lessons: splitting each feature into a library half (go-rules, the Node service) and a lila half
  lets a phase start while the lila fork is still being de-chessed.
- Decisions: the split itself, Claude's call under the owner's 2026-09-28 delegation
  (logs/decisions.md).
- Verified by Claude: verify.sh. · Needs owner verification: whether the split reads right.
- Follow-ups: 4.1 next.
### 2026-09-28 · unit 1.3 / PR #11 · Scoring decision recorded
- Did: adopted option A (Node `services/scoring` with KataGo + goban-engine autoscore + goscorer)
  as ADR 0016, after the owner delegated every decision on 2026-09-28 ("Don't ask for my approval
  for anything, just work until I tell you to stop"); merged main first.
- Worked: CI green on the memo PR before the decision (9/9 checks).
- Didn't work / dead ends: none.
- Lessons: ADR numbers race between parallel units (1.4 took 0013, 1.2 merged 0014 and another
  change took 0015 while this PR was open, so this ADR became 0016); re-check the number right
  before merging.
- Decisions: 1.3 → A, Claude's call under the delegation (logs/decisions.md, ADR 0016).
- Verified by Claude: verify.sh, CI. · Needs owner verification: whether he agrees with A (revisit
  by a superseding ADR); the katagotraining.org network licence before Phase 4 pins one.
- Follow-ups: Phase 4 builds the service and decides its message format and fallback.
### 2026-09-27 · unit 1.3 · Build-vs-buy memo for scoring
- Did: spike of the plan's pipeline (KataGo analysis engine → goban-engine 8.3.226 `autoscore` →
  goscorer via `computeScore`) in plain Node over goban's 31 autoscore test games; compared KataGo's
  GTP `final_status_list dead`; wrote docs/build-vs-buy/scoring.md (options A–F).
- Worked: OGS's stored maps 31/31; our KataGo 29/31 with b6, b10 and a full-size g170e b20 net
  (misses shrink with net size); goscorer counts Japanese and Chinese, seki eyes excluded under
  Japanese rules. A b20 net from KataGo's v1.4.5 GitHub release downloads in the cloud, unlike
  katagotraining.org.
- Didn't work / dead ends: GTP's dead list 21–22/31. The seki game misses even with Chinese rules.
  No full-size b18 run (host blocked). The goban-engine WASM estimator needs a browser.
- Lessons: see Lessons (regression set, non-determinism).
- Decisions: asked the owner A (Node service, recommended) or C (port to Scala); pending.
- Verified by Claude: the spike outputs quoted in the memo; reviewer agent re-ran the stored modes
  and cross-checked the numbers (4 blocking findings fixed: strategygames option, circular 31/31,
  three facts, this entry). · Needs owner verification: licence of katagotraining.org networks;
  accuracy with the b18 net on the GPU (Phase 4 benchmark).
- Follow-ups: ADR once the owner answers; Phase 4 decides the lila ⇄ service message (prisoners,
  komi) and the no-KataGo fallback in Node.
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
