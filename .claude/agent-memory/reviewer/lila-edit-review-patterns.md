---
name: lila-edit-review-patterns
description: Recurring issues when reviewing edits inside lila/ (Scala/TS) — scalafmt width, duplicated brand constants, markdown CMS path
metadata:
  type: feedback
---

Checks that paid off reviewing lila/ edits (first seen unit 0.7 rebrand, 2026-09-27):
- Edited Scala lines over 110 cols (lila/.scalafmt.conf maxColumn) that scalafmt can break -> CI `lila` job
  fails on scalafmtCheckAll. Run `awk 'length>110'` on touched files; ignore long string literals.
- Constants duplicated across Scala and ui/ TS (e.g. repo URL in LigoBrand.scala and bits.ts) or hard-coded
  defaults (OpenGraph siteName) that bypass the config layer.
- Cms controller has a separate markdown-negotiation path (negotiateCmsOption) that bypasses HTML fallbacks.
- `git diff origin/main...HEAD` can be inflated when origin/main is stale: `git fetch` first, or diff the commit.

**Why:** these slip past compile and Playwright checks.
**How to apply:** any unit touching lila/ Scala views/controllers.
