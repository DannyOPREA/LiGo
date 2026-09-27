---
name: katago-setup
description: Sets up KataGo for LiGo - OpenCL on the owner's AMD GPU or the Eigen CPU backend in cloud sessions - downloads a network, tunes and benchmarks it. Use for any KataGo installation, configuration or benchmark task.
argument-hint: "[local | cloud]"
---

# /katago-setup [local | cloud]

Built in unit 0.5 (environments). Everything goes through `dev/ligo katago` (dev/katago.sh); don't
download KataGo by hand.

- `dev/ligo katago install [cpu|opencl]`: KataGo v1.18.1 from its GitHub release, checked against
  the SHA-256 pinned in dev/katago.sh, unpacked from its AppImage (no FUSE needed) under
  `~/.local/opt`, linked as `~/.local/bin/katago`. Also fetches KataGo's small test network
  (g170 b6c96, pinned by commit and SHA-256) and, outside the cloud, the full-size b18 network
  from katagotraining.org. Backend: argument, else `LIGO_KATAGO_BACKEND`, else cpu in the cloud
  and opencl elsewhere.
- `dev/ligo katago smoke`: one analysis query; checks visits and a 361-point ownership map.
- `dev/ligo katago bench`: `katago benchmark` (OpenCL tunes itself on the first run), saved to
  `.ligo/katago-benchmark.txt`. Record the numbers in `logs/scoring.md`.
- `dev/ligo doctor` reports the build, networks, `clinfo` devices and whether a benchmark exists.

- **local** (owner's box, AMD GPU): install opencl; `clinfo -l` must list the GPU (Fedora:
  `ocl-icd` + `mesa-libOpenCL` with `RUSTICL_ENABLE=radeonsi`, or ROCm's `rocm-opencl`); smoke; bench; pin the b18 network's SHA-256 once the owner reports it.
- **cloud**: the cloud setup script and the SessionStart hook install the CPU build. Only the test
  network is reachable until `media.katagotraining.org` is on the allowlist; it's weak, fine for
  smoke tests and plumbing, not for judging scoring accuracy.

Upgrading KataGo is a dependency change: ask the owner, then update the version, both zip
checksums and the commit in dev/katago.sh together. The analysis-engine config for scoring lives
in `services/scoring` once it exists (the shipped `analysis_example.cfg` is only for the smoke
test). Confirm the network's licence before any public use (PLAN §9).
