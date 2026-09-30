---
name: rebrand-text-review-patterns
description: Checks that paid off reviewing lila text rebrands (unit 3.8) - en-US dest overrides, CRLF churn, code-level lichess.org on kept pages, sbt 2 cached tests
metadata:
  type: feedback
---

From unit 3.8 (rebrand text, 2026-09-30):
- lila has two English sources: `translation/source/*.xml` (en-GB, default fallback in
  i18n Registry and merged under every locale in ui/.build/src/i18n.ts) and
  `translation/dest/*/en-US.xml`. Deleting an en-US key is safe (falls back to en-GB). Script-check:
  every deleted en-US key had its source changed; no en-US key modified.
- Mixed-line-ending XML (features.xml, onboarding.xml are CRLF): count `\r` per file before/after;
  a Python rewrite silently flips a few lines to LF (net no-op churn).
- Grep for text-in-code, not only i18n: `@verify.lichess.org` mailto on /account/email-confirm-help
  (EmailConfirm.scala) sent LiGo users to email lichess. Code-built addresses/links on kept pages
  are "visible text" too.
- Swapping lichess.org links for local `/page/<key>` CMS links gives 404s on a fresh DB.
- sbt 2 caches test results: `dev/ligo test lila` prints Total 0 everywhere after a prior run.
  Run `./lila.sh --server --batch "i18n/testOnly *"` (TranslationTest checks placeholder args over
  all langs) to get a real run.
- Parallel units merge: always `git fetch` + `git merge-tree --write-tree HEAD origin/main`
  (logs/decisions.md and area logs conflict every time).

**Why:** Playwright brand tests only read innerText of a few pages; these slip past.
**How to apply:** any unit editing translation XML or user-visible strings in lila.
