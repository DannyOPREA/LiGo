---
name: perf-budget-review-patterns
description: Checks for size/timing budget scripts and Playwright timing tests (unit 9.5) — undefined limits pass, harness overhead in timings, goban shadow DOM
metadata:
  type: feedback
---

Found reviewing unit 9.5 (dev/ci/budget.mjs + playground budget.spec.ts, 2026-09-30):
- `size > limit` with a misspelled budget.json key gives `x > undefined` = false: the check shows
  "ok" and exits 0. Probe by copying the script to the scratchpad with a typo'd budget.json and
  passing the lila dir as argv. Ask for a number check on every limit.
- Playwright-side timing (`page.evaluate(now)` → click → expect → waitFor → rAF) counts ~30–45 ms
  before the click even fires, plus trailing round trips: the "130 ms mount" was ~40–75 ms real.
  Measure in-page (capture-phase click listener + rAF poll) to compare.
- goban's SVG lives in a shadow root (`.playground__board div[shadowRoot] > svg`): plain
  querySelector/MutationObserver on document miss it; Playwright locators pierce it.
- Scratch Playwright probes outside lila/: need `{"type":"module"}` package.json in the scratch dir
  and a node_modules symlink, then import page.ts by absolute path.
- Chunk finding via manifest reachability + marker string: verify stale files aren't counted
  (public/compiled held 8 goban chunks) and what the chosen chunk statically imports.

**Why:** these pass locally and hide a disabled check or an inflated baseline.
**How to apply:** any unit adding budgets, benchmarks or timing assertions. See [[playwright-e2e-review-patterns]].
