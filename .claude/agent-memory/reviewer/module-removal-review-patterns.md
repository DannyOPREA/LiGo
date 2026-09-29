---
name: module-removal-review-patterns
description: What slips through Phase 3 "remove module X" units (3.2, 3.3) — orphan bundles/CSS/assets, silent behaviour changes in lila-ws glue, mislabelled moves in UPSTREAM.md
metadata:
  type: feedback
---

Checks that found real problems in Phase 3 removal units (3.2 tournaments, 3.3 studies/broadcasts, 2026-09-28):

- Orphan bundles: for every `Esm("...")`/`.css("...")`/`loadEsm('...')` name in the DELETED lines
  (`git diff --cached HEAD -- app modules ui | grep '^-'`), check the bundle still exists and whether
  anything still references it. 3.3 missed `bits.publicChats`, `mod.publicChats`, `chart.relayStats`
  (loaded via `site.asset.loadEsm` from deleted TS, so grep ui/*/src too) and `analyse.practice`.
- Author "moved partials out of the deleted folder" can mean they kept an orphan: 3.3 moved study
  partials into `analyse/css/practice/`, which was the deleted /practice PAGE's bundle, not the
  in-board practice (that is `_practice.scss` in analyse.base). Check the build file's referrer.
- Orphan public assets (`public/images/<feature>`) referenced only from deleted SCSS.
- Glue that replaces a feature-specific branch often changes behaviour for everyone: 3.3's
  CrowdJson dropped the >20-users "count only" branch for ALL rooms (non-study rooms got Nil users),
  on the false claim "only studies reach 20". Read the old code's else-branch.
- UPSTREAM.md "modified files" lists miss a few (Api.scala, ui/lib); COPYING prose ("what stays in
  public/") goes stale when a listed dir is deleted.
- Dead user-facing copy/settings: prefs (studyInvite), OAuth scopes, Dev CLI help, FAQ/coach text
  pointing to removed flows, developers page embed sections.
- origin/main moves during review (Phase 4 merges touch COPYING.md, pnpm-lock, decisions.md):
  flag the re-merge + re-verify.

**Why:** compile + UI build pass with all of these; only grep-driven review finds them.
**How to apply:** every Phase 3 removal unit (3.4–3.7 next). See also [[lila-edit-review-patterns]].
