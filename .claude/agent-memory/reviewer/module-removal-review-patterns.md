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

- 3.4 (2026-09-29) finds: the log/decisions text said "profile shows old scores without links" while
  the code deleted the profile display. Diff each "Decisions:" claim against the code.
- Replacement nav targets can undo guards: TopNav's "Learn" header was repointed at /coach, which
  lila hides from kid accounts (`ctx.kid.no`). Check the guard on the item you point at.
- Removed controllers carry side effects: analyse fork hover drew its arrow via ExplorerCtrl.hovering;
  deleting explorer silently dropped fork-hover arrows. Grep what the kept code called on it.
- Hard-coded URLs outside routes survive (contact.scala `/learn#/15`, recap `/opening/`, IrcApi):
  grep string literals like "/learn", not only `routes.X`.

- 3.5 (2026-09-29) finds: deleting an API (Board API stream/moves) broke a KEPT in-repo client
  (`ui/dgt/src/play.ts` fetches `/api/board/game/stream`, page still routed + in TopNav). Grep
  ui/*/src for the removed URL strings, not just routes. Also: form fields whose handler was cut
  stay on kept pages (import page "Request a computer analysis" checkbox, GameUi.scala); dead prefs
  (insightShare); Bus publishers with no subscriber left (CheatReportCreated); orphan bundles loaded
  only by deleted packages (`bits.polyglot`, `user.bot.list`). UPSTREAM "modified" lists name files
  that weren't touched (Api, plan) — diff `--name-status` against the row.
- When told not to run builds, the author's verify logs are in `.claude/state/verify/*.log`
  (read-only) — cite them, and flag `testQuick` partial runs.

- 3.6 (2026-09-29) finds: deleted TS can carry side effects on KEPT DOM — lobby `carousel.ts` was
  what set `.lobby__support` visible (CSS default `visibility: hidden`), so deleting the blog
  carousel hid the donate/swag box. Grep deleted TS for `querySelector`/`style.` on kept elements.
  Routes removed with a module can serve a kept client in another package (`/diagnostic` was
  ForumTopic's; `bits.diagnosticDialog` still posts to it). Diff the routes' `-` lines against
  `ui/*/src` literals. "Stored notifications render as before" was false: the ui/notify renderers
  were deleted (missing renderer = silently hidden). Also dead pref rows (notify table, "who can
  message you"), mod "Send PM" dropdown that now only logs, package.json deps whose sole user was a
  deleted file (ui/mod tagify). A def-name `comm -23` per modified file (old vs new) is a fast check
  for script-edit collateral deletions.

- 3.7 (2026-09-30) finds: kept pages carry hard-coded links to removed pages that no route grep
  catches: lobby counter `href: '/games'` (ui/lobby/src/view/table.ts), the developers page's
  "Embed TV" iframe (`/tv/frame` in SitePages.scala), ResponseBuilder `movedMap` ("donate" ->
  "/patron"). Grep string literals in Scala AND TS for every removed path prefix. Also: bundles
  whose only loader was deleted code (`site.tvEmbed` via the `site.*Embed.ts` glob, `bits.flatpickr`,
  `bits.confetti`, `bits.feature` css) and their npm deps. Privacy: AccountTermination /
  PersonalDataExport lose the removed module's delete/export of personal data (streamer/coach
  profiles) — 3.6 disclosed this, 3.7 didn't; check the decisions row says it. Removing a grid
  area can widen a kept box ('tv puzzle' -> 'puzzle puzzle' doubles the daily-puzzle board on tablets).
  Review base: when origin/main has moved, `git diff origin/main` (two-dot) shows other units'
  merges as reverts; use `git diff $(git merge-base HEAD origin/main)`.

- 3.19 part 2 (2026-10-04, chessground/chessops removal) finds: "stand-ins" re-implementing a removed
  library to keep a kept file compiling can be keeping DEAD code alive — follow each kept export to a
  live caller (sanWriter's parser had only the deleted nvui; `speakable` only `site.sound.saySan`,
  which nothing calls; `fenColor` only deleted miniBoard). Dead Scala helpers emitting removed assets
  (`chessgroundTag` -> npm/chessground.min.js, `chessgroundMini`) survive a "UI only" unit. Check open
  sibling PRs for file overlap with `gh api repos/:owner/:repo/pulls/N/files`. verify.sh has no
  `compile ui` (tsc/esbuild/sass) gate; stale `ui/*/dist/*.d.ts` and `public/compiled` copies of
  deleted modules sit on disk (gitignored), so grep src, not the build tree.

**Why:** compile + UI build pass with all of these; only grep-driven review finds them.
**How to apply:** every Phase 3 removal unit (3.4–3.7 next). See also [[lila-edit-review-patterns]].
