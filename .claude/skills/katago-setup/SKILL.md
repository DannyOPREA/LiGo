---
name: katago-setup
description: Sets up KataGo for LiGo - OpenCL on the owner's AMD GPU or the Eigen CPU backend in cloud sessions - downloads a network, tunes and benchmarks it. Use for any KataGo installation, configuration or benchmark task.
argument-hint: "[local | cloud]"
---

# /katago-setup [local | cloud]

Owned by unit 0.5 (environments); until then some steps can't run in the cloud because KataGo's
download hosts aren't on the network allowlist yet (logs/tooling.md).

- **local** (owner's box, AMD GPU): KataGo's OpenCL build from its GitHub releases; check
  `clinfo` sees the GPU; run `katago benchmark` to tune and pick threads; record the numbers.
- **cloud**: the Eigen (CPU) build and a small network; few visits (`LIGO_KATAGO_BACKEND=cpu`).

Steps: download the binary and a network from the official sources (verify checksums where
published), keep them out of git (.gitignore covers them), write the analysis-engine config next
to `services/scoring` once it exists, run a short analysis query as a smoke test, and log the
benchmark in `logs/scoring.md`. Confirm the network's licence before any public use (PLAN §9).
