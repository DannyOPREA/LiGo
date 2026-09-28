---
name: conformance-fixture-review-patterns
description: What to check when reviewing libs/conformance (rules fixtures, check.mjs, replay oracles): CI wiring, argv bugs, circular oracles, phase in client cases, licence of adapted cases
metadata:
  type: feedback
---

Checks that found real problems in unit 1.6 (libs/conformance, 2026-09-27):

- **"CI runs it" claims:** grep `.github/workflows/` for the script. 1.6 said meta.yml runs
  fast-check.sh and moved `libs/conformance/` to changed.sh's no-build list, but no workflow ran it.
- **Checker CLI:** run `node check.mjs <dir>` with the dir as the FIRST arg and with a missing/empty
  dir. `i !== specAt + 1` with specAt = -1 skipped argv[0], silently checking the default folder;
  an empty or missing dir exited 0. Authors only ever ran it with `--spec` first.
- **Scratch oracles can be circular:** replay.mjs checked koPoint with its own model, handicap
  stones from its own table, and gave server-only cases (resume/undo/phase) only a KataGo legality
  check. Write an independent model (SP/rv/model.mjs pattern) and check every expect field of every
  case; flip open-point behaviour (e.g. drop post-pass situations) to find untagged `openPoints`.
- **goban-engine phase stays "play" after two passes** (8.3.226), so `expect.phase` in client cases
  cannot be checked by the engine.
- **Scoring cases:** re-run goban `autoscore` on the source file; correct_ownership ' ' can mean a
  dead stone inside a seki eye, not an alive seki stone. Verify totals with computeScore.
- **Licence:** COPYING.md §3 says adapted third-party material keeps its licence; a NOTICE that
  re-labels adapted fixtures as MIT is a licensing (§7) call.
- **Merge gating:** fixtures built on an unmerged draft spec with open §12 points must not
  self-merge (ADR 0011 pending-question rule). See [[build-vs-buy-memo-review-patterns]].

**How to apply:** for 1.7/1.8 harness PRs and any fixture change.
