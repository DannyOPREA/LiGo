# Backend log

## Lessons (curated, ≤ 30 lines — read this first)
- lila's Clock.Config is Fischer-only; scalachess keeps one Glicko-2 rating per PerfType; ~90 modules under modules/ (2026-09-25, planning research).

## Entries (newest first)
### 2026-09-27 · unit 0.7 (Phase 0 dry run) · Rebrand lichess to LiGo
- Did: `net.site.name = "LiGo"` in `lila/conf/base.conf` (the docker dev override removed), and
  `siteName` exposed on `lila.ui.AssetHelper` so the header, top menu, login box, OAuth page and
  "About" link read it instead of a literal "lichess.org". AGPL §13 source links (the HTML top
  comment, the /source page's version links in Scala and `ui/bits/src/bits.ts`) point at
  https://github.com/DannyOPREA/LiGo (`LigoBrand.scala`). /source now shows a default body (HTML
  and markdown) when the "source" CMS page is missing, as on any fresh database; it used to 404.
  New Playwright spec `lila/tests/brand.spec.ts` (4 tests, no seeded database needed).
- Worked: test first: the 3 original checks failed on the old code (header "lichess.dev", title,
  top comment, /source 404) and all 4 pass on the new code against the native stack.
- Didn't work / dead ends: lila's `@playwright/test` wants a newer Chromium build than the
  container has; a scratch config with `launchOptions.executablePath: '/opt/pw-browsers/chromium'`
  runs it. The first scalafmt check failed on two hand-edited Scala files (fixed with scalafmtAll).
- Lessons: Play's dev `run` here didn't pick up source edits on the next request; stop the stack,
  `dev/ligo compile lila`, `dev/ligo compile ui` (for bits.ts), then `dev/ligo up`. Scala lines
  must fit 110 columns (`lila/.scalafmt.conf`).
- Decisions: none asked. Claude's scope choice, for the owner to confirm after merge: "Lichess"
  inside translated strings (e.g. "Lichess updates", "About Lichess"), logos/favicons and the
  lobby's lichess texts stay until Phase 3's first unit and the de-chess work; the footer's
  GitHub/social links, the FAQ's "lila" link and the email footer are left too. The brand name
  lives in `net.site.name` plus `OpenGraph`'s default; the repo URL in `LigoBrand.scala` plus a
  commented copy in bits.ts.
- Review: reviewer found a >110-column line (format check would fail) and the missing log entry
  (both blocking, fixed), /source as markdown still 404ing (fixed, with a test), "Connect to
  lichess.org" on the OAuth page (fixed), and admins with the Pages permission no longer being
  offered the CMS create form on a missing /source (accepted: the page is created from the CMS list).
- Verified by Claude: /verify pass (lila compile, scalafmt, tests; ui lint, format, tests; dev
  checks 42/0), bats 48/0, brand.spec.ts 4/4, screenshots of / and /source. · Needs owner
  verification: the header and /source page on your box after `dev/ligo up` (docker mode reads the
  edited `dev/lila-docker/conf/lila.conf`).
- Follow-ups: remaining lichess links and wording (above) in Phase 3.

