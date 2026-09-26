# Scoring log

## Lessons (curated, ≤ 30 lines — read this first)
- OGS autoscore uses TWO KataGo ownership maps (black to move and white to move); it removes stones above 0.7 ownership and flags points below 0.3 as needing sealing (2026-09-25, planning research).
- goscorer (MIT, lightvector) does territory/area counting with seki detection once dead stones are marked, and is bundled in goban (2026-09-25, planning research).
- KataGo on CPU (Eigen) manages ~10–20 playouts/s with small nets: fine for scoring tests, not for review. The AMD GPU uses the OpenCL backend (2026-09-25, planning research).

## Entries (newest first)
_none yet_
