# Upstream fork log

## Lessons (curated, ≤ 30 lines — read this first)
- lila (Sept 2026): Scala 3.8.4, sbt 2.0.9, JDK 21, Pekko, ReactiveMongo, liplay; UI on Node ≥ 24, pnpm 12, TypeScript 7, esbuild, oxlint/oxfmt, stylelint, snabbdom 3.5.1 (2026-09-25, planning research).
- lila-docker states lila needs ~12 GB RAM to build; `.sbtopts` uses -Xmx8g (2026-09-25, planning research).
- lila gets ~10k commits a year, so staying mergeable isn't feasible; hard fork + monthly review (ADR 0001).
- The baseline to keep: lila compile has 17 `[warn]` lines and 0 errors; `/storm` returned 500 on an empty DB (upstream behaviour; /storm is gone since unit 3.4). New warnings or 5xx responses after LiGo changes are ours (2026-09-26, unit 0.2).
- Snapshot imports copy only Git LFS *pointers*; drop inherited `filter=lfs` attributes or clones break for git-lfs users (ADR 0009) (2026-09-26, unit 0.2).
- Claude Code auto-loads `lila/AGENTS.md` (lichess's own agent guide) while LiGo has no CLAUDE.md; it doesn't govern LiGo (2026-09-26, unit 0.2).
- Import with `git archive` and diff `git ls-files` against upstream afterwards: upstream tracks some files its own .gitignore ignores (2026-09-26, unit 0.2).
- Removing a module: grep its `lila.core.<module>` Bus messages (publishers compile fine with no subscriber) and `ui/*/src` for its URLs (kept in-repo clients like dgt aren't caught by the compiler) (2026-09-29, unit 3.5).
- Script edits: cut code blocks by indentation or with adjacent markers, never "from marker A to far marker B"; list the removed `def`s in the diff afterwards. sbt 2 caches by content, so `touch` won't re-show a file's warnings (2026-09-29, unit 3.6).
- Lishogi forked in July 2020 and is now frozen on Scala 2.13: a warning about how hard forks age (2026-09-25, planning research).

## Entries (newest first)

### 2026-09-29 · 3.6 · Remove forums, blogs, teams, inbox and classes
- Did: deleted lila modules `forum`, `forumSearch`, `ublog`, `team`, `teamSearch`, `msg` and `clas`,
  their controllers, views, routes (`team.routes`, `clas.routes`, the class login, the inbox
  report form, the mod "full comms export") and core APIs (`lila.core.{forum,msg,ublog,team}`,
  `TeamHelper`, `LogApi`). Callers lost their forum/blog/team/inbox/class parts: activity (forum
  posts, blog posts, teams), the profile (forum/blog counts, team list, blog cards, inbox button),
  the mini profile (class real name), the lobby (blog carousel, class list, "unread message from
  Lichess" notice), top nav and footer links, the mod pages (inbox messages, blog carousel,
  student/teacher sections), the personal data export, account closing, search-by-id, link checks,
  the PGN/JSON team tags, push notifications and the markdown realms (only `cms` is left).
  Every system private message is gone: mod warnings and auto-warnings are only logged, the
  reporters' "action taken" message, the kid mode, welcome, patron and "new wing" messages and the
  GitHub token-revoked message are no longer sent. lila-ws lost its team channel and inbox
  messages; the browser lost `ui/msg`, `ui/team`, the forum/blog/class bundles and five npm packages
  (COPYING §1.2).
- Worked: lila-ws and UI by workers on disjoint paths again; a full grep for
  `lila.(forum|ublog|team|msg|clas)`, their routes and `lila.core.*` messages before the first
  compile left only a handful of compile errors.
- Didn't work / dead ends: a "cut from marker A to marker B" script edit silently deleted
  everything between two far-apart markers twice (ModlogApi, PersonalDataExport); the compiler
  caught both, and the fix was to restore from git and cut by indentation. Also, touching files
  doesn't make sbt 2 recompile them (its cache is by content), so to see all warnings I appended a
  newline to every changed file and let scalafmt remove it.
- Lessons: cut blocks by indentation or with adjacent markers, then list the removed `def`s in the
  diff to check nothing else went; sbt 2 caches by content, so `touch` won't re-show warnings.
- Decisions: see logs/decisions.md (3.6 row).
- Verified by Claude: see the PR.
- Follow-ups: dead but harmless: `Modlog.isForum`, the forum/blog/team `Modlog` action names and
  permissions (`ModerateBlog`, `ModerateForum`, `Teacher`, `FullCommsExport`, stored),
  `PublicSource.{Team,Forum,Ublog}` and their shutup text types, the `Team.*` and `Msg.*` OAuth scopes
  (3.8), notification contents for mentions, private messages and teams (stored ones render as
  plain text with no link, never created), the bulk challenge `message` field, the teacher
  account-close branch, the push `forumMention`/`privateMessage` keys, the forum/blog/team/class
  i18n keys, the `clas.*` monitoring keys. Still to tidy: the preferences page's mention, private
  message and team-update notification rows and the "who can message you" setting; the orphaned
  `bits.markdownTextarea` bundle and `Page.markdownTextarea`; the unused `@yaireo/tagify` and
  `debounce-promise` entries in `ui/mod/package.json`. Mod warnings now reach only the modlog, so a
  player closed for repeated rage-sitting never saw a warning; send warnings as notifications
  later. Account deletion and the data export skip the old forum, blog, team and inbox
  collections: fine on a fresh database, a GDPR gap if lichess data is ever imported. Beta pages
  now need the `Beta` permission (the beta-testers team is gone).
- Review (2026-09-29): no collateral deletions (removed names compared per file). Three findings
  fixed before the PR: the lobby's donate/swag box stayed hidden because the deleted blog carousel
  was what made it visible; the debug dialog still posted to the removed `/diagnostic`; stored
  mention, message and team notifications were hidden in the bell (renderers restored without
  links). Also relabelled the mod "Send PM" warning option, and removed the `msg multi` dev command,
  the `ClasBus` core messages, the forum/team/blog/message config blocks and blank lines in
  build.sbt. Lesson: deleted TS can have side effects on kept DOM; grep it for `.style` and
  `querySelector` on elements that stay.
- CI: CodeQL flagged 7 "incomplete hostname regex / string escaping" alerts in
  `ui/lib/src/chat/spam.ts`, upstream code this unit only trimmed (the team-URL check). The dots
  were escaped at runtime; the list now holds the escaped regex sources directly (same regex,
  checked by comparing the built sources), so CodeQL sees them.

### 2026-09-29 · 3.5 · Remove engines and bots
- Did: deleted lila modules `fishnet`, `irwin`, `evaluation`, `insight`, `tutor`, `jsBot` and
  `bot`, their controllers (including `PlayApi`), views and routes; `mod` lost its engine
  assessment (`AssessApi`, the Irwin/Kaladin/assessment menu and dashboard links, the games-page
  ACPL/blur columns) and now depends on `game` and `analyse` directly (PLAN §5). Games against the
  computer are gone: `POST /setup/ai`, `POST /api/challenge/ai`, `AiConfig`/`ApiAiConfig`, the
  round's fishnet-move and bot-play messages (`FishnetPlay`, `BotPlay`, `BotConnected`,
  `ResignAi`, `FishnetStart`), `UciMemo` and the Board API channels its game stream used. Also
  gone: requesting a server analysis, report auto-analysis, the fishnet key email, the "Chess
  Insights" profile link, the puzzle "my openings" (from insight), the external-engine API with
  its CSP and config, and the fishnet/insight/explorer/externalEngine/kaladin config blocks.
  lila-ws lost `r/bot/online`. Browser: `ui/botDev`, `ui/botPlay`, `ui/insight`, `ui/tutor`,
  `ui/lib`'s ceval and bot code and the six Stockfish/zerofish npm packages; analyse lost the local
  engine, threat, practice, retrospect and live-annotate modes; puzzle, round, lobby and editor
  lost their engine hooks and the "play against the computer" buttons. Also cleaned the unused
  warnings 3.2 and 3.4 left behind (TeamShowUi `toursFrag`, `PuzzleComplete`'s `api`).
- Worked: same recipe as 3.4 (lila-ws and UI by workers on disjoint paths); `dev/ligo compile lila`
  after every cut, fixing warnings as they appear rather than at the end.
- Didn't work / dead ends: an incremental compile only prints warnings for files it recompiles, so
  3.4's unused-symbol warnings only showed up during 3.5.
- Lessons: removing a module that answers on the Bus (fishnet, bot) leaves publishers that compile
  fine and do nothing; grep the `lila.core.<module>` messages and delete their publishers too.
- Decisions: see logs/decisions.md (3.5 row).
- Verified by Claude: see the PR.
- Follow-ups: the Board API seek (`/api/board/seek`) stays without a way to play the game by API
  (decide with the API work); the `Engine.*`, `Bot.Play` and `Board.Play` OAuth scopes are dead
  (3.8 with the other scopes); `analyse` still has `Analyser`/`RequesterApi`, which only fishnet
  fed; `HTTPRequest`'s fishnet client kind, the `mon` fishnet/cheat keys, `Namer`'s "Stockfish
  level" for stored AI games and the `ai` fields in the UI's game types are dead; round and editor
  pages still allow WebAssembly in their CSP; `ui/lib/src/eval.ts` uses lichess's centipawn curve
  (Phase 4); the analysis/puzzle i18n engine keys stay for the i18n clean-up. Known breakage until
  later units: `/dgt/play` used the Board API game stream and moves, so the DGT board can't play a
  game (3.18 removes DGT); API clients still get rematch offers in the event stream but can't
  accept or decline them through the API. Also: the analysis grid keeps an empty eval-gauge column;
  API-only users are no longer marked online (bot's `onlineApiUsers` went); the insight-sharing
  preference stays on the account page (the preference form requires it; stored field); the Patron
  page's "40 server analyses a day" (3.7); the embedded game viewer's "practice with computer"
  label; `Api.eventStream`'s rate-limit message points at lichess's Board API docs.
- Review: 2 blocking, both fixed: the DGT and API-rematch breakage is now disclosed (above and in
  decisions.md); the import page's "Request a computer analysis" checkbox, which did nothing any
  more, is gone. Also removed the leftovers it found: the fishnet key page, the online-bots page and
  its CSS, the polyglot bundle, the mod games page's analyse handler, the fishnet CLI example and
  the unsubscribed `CheatReportCreated` message. Lesson: grep `ui/*/src` for the URLs of a removed
  API; kept in-repo clients (dgt) aren't caught by routes or the compiler.

### 2026-09-29 · 3.4 · Remove chess training and openings
- Did: deleted lila modules `storm`, `racer`, `coordinate`, `learn`, `opening`, `explorer` and
  `evalCache`, their controllers, views and routes, and puzzle streak mode inside `puzzle` (the
  streak page and API, `PuzzleStreakApi`, the streak fields of the round form, the Storm/Racer/Streak
  run events in `lila.core.misc.puzzle`). Removed the class "learn" progress tab, the masters-game
  import redirect, the `/api/cloud-eval` endpoint and its rate limit, the opening explorer entry in
  the user menu and the keyboard help, and the menu, profile and Patron-page links. lila-ws lost the
  racer actor and channel, `StormSign`, the whole `evalCache` package (evalGet/evalPut/evalGetMulti)
  and its two tests, and the `yolo` Mongo connection only it used. Browser: `ui/storm`, `ui/racer`,
  `ui/coordinateTrainer`, `ui/learn`, `ui/opening`, `ui/lib`'s puzzle-run code, streak mode in
  `ui/puzzle`, the explorer and cloud-eval code in `ui/analyse`; `public/images/learn` and the
  racer-car and storm fonts; `@fnando/sparkline` and its types left the lockfile.
- Worked: the 3.2/3.3 recipe; lila-ws and UI done by two workers in parallel while the server was
  stripped in the same checkout (disjoint paths, no commits by workers).
- Didn't work / dead ends: `sbt test` in lila-ws prints "Total 0" when nothing changed (testQuick);
  `sbt "testOnly *"` gives the real count. PR #33's lila CI job hung silently for an hour after
  "set current project" (as main's 3.2 run did) and passed on one re-run.
- Lessons: a silent lila CI hang right after project load has happened twice; it isn't the diff.
- Decisions: fishnet's cached-eval lookup is stubbed to "none" in app/Env.scala until 3.5 removes
  fishnet; tutor's opening links point at the analysis board until 3.5; activity and profile keep
  stored storm/racer/streak scores (ADR 0019: stored fields stay) and show old ones without links;
  the explorer/tablebase endpoints in config stay (fishnet and the CSP still read them until 3.5).
- Verified by Claude: see the PR.
- Follow-ups: the `Racer.Write` OAuth scope and storm/racer monitoring keys are dead (3.8 with the
  other dead scopes); `ui/analyse` practice mode no longer asks the tablebase and learn-from-mistakes
  no longer skips masters' moves (both go with the engine in 3.5); the Storm glyph stays in the
  icon font; storm/racer/learn i18n keys stay with the rest of the i18n clean-up. Also:
  `ui/analyse`'s fork-variation hover arrow went with the explorer hover it relied on (3.5 or
  later, with the engine); the Patron page (3.7), recap slides (3.7) and SitePages still mention
  chess basics, Storm/Racer/Streak, openings or the explorer; `UserApi.addPuzRun` and the streak
  and cloud-eval monitoring keys are dead code; an old cached puzzle page that still sends
  `streakId` now gets a normal rated round.
- Review fixes: the menu's "Learn" heading no longer opens the coach list for kid accounts (it
  opens the first link the viewer may see, or the section is left out); profiles still show old
  storm/racer/streak scores, without links.

### 2026-09-28 · 3.3 · Remove studies and broadcasts
- Did: deleted lila modules `study`, `relay`, `practice`, `studySearch`, `fide`, `title` and the
  core interfaces `lila.core.{relay,fide,practice}` (`lila.core.study` stays: irc, push, timeline,
  notify and the router's path bindables still name its types); their controllers, views and
  routes; the relay-only "Public chats" mod page. Kept modules (activity, api, mod, report, user,
  web, coach, clas, game, timeline) lost their hooks. lila-ws lost the study actor, relay crowd,
  study Redis channel, IPC messages and Mongo lookups. Browser: `ui/fide` and the study, relay,
  gamebook and practice-module code in `ui/analyse` and `ui/bits` deleted; "continue as a study"
  buttons removed from analysis, editor and puzzle; `public/fide` deleted, and with the
  /practice page its CSS and `public/images/practice` (CC BY 3.0 icons, so COPYING.md no longer
  lists them). The Public chats page's UI, the relay stats chart and orphaned CSS went too;
  lila-ws keeps upstream's rule that rooms over 20 users send only a head count.
- Worked: the 3.2 recipe (delete, compile, strip callers, keep stored fields). `PublicFideIdOf`,
  which game and api still need, is a stub that returns no FIDE id.
- Didn't work / dead ends: running the removal in a git worktree broke lila-ws's build (sbt-git's
  JGit can't read a linked worktree's `.git`); the work moved back to the main checkout and the
  build.sbt workaround was dropped.
- Lessons: don't run sbt builds from a git worktree here; use the main checkout.
- Decisions: stub FIDE ids rather than touch game/api; remove the Public chats mod page (it only
  listed broadcast chats); keep `lila.core.study` until its remaining users go (3.6/3.7/3.13).
- Verified by Claude: see the PR (verify.sh, UI build, lila-ws `sbt check` and tests, site smoke).
- Follow-ups: study/relay i18n keys; stale study/broadcast texts in coach, FAQ, game and dev pages
  and the broadcast-embed section of SitePages (3.8); dead prefs, permissions and OAuth scopes;
  unused analyse npm deps (tagify, sortablejs, debounce-promise, shepherd.js; a dependency change);
  the data export no longer includes title requests; notify's study-invite and timeline's study entries render
  nothing for old data and go with 3.13.

### 2026-09-28 · 3.2 · Remove tournaments and events
- Did: deleted lila modules `tournament`, `swiss`, `simul`, `gathering`, `event` and core
  interfaces `lila.core.{tournament,swiss,simul}`; their controllers (incl. TournamentCrud,
  UserTournament), views, routes, `ui/` packages (tournament, swiss, simul) and lila-ws actors
  (Tour/Swiss/SimulClientActor, their Redis channels, IPC messages and Mongo lookups). Stripped the
  hooks in ~95 kept files (activity, api, round, lobby, game, team, mod, user, views). 264 files
  deleted, ~29k lines.
- Worked: keeping the stored fields (game `tournamentId`/`swissId`/`simulId`, chat
  `PublicSource.Tournament/Swiss/Simul`) avoided a schema change; nothing writes them now. Also
  removed the orphaned `bits.tourForm`, `bits.teamBattleForm` and `bits.event` bundles and the
  lobby's `tours` grid area.
- Didn't work / dead ends: an incremental `dev/ligo compile lila` only re-prints warnings for files
  it recompiles, so one run can hide unused-import warnings elsewhere.
- Lessons: after a large deletion, audit warnings from a run that recompiles broadly (verify.sh's
  log), not a single incremental compile. Removing workspace packages changes `pnpm-lock.yaml`,
  and CI's meta check then wants COPYING.md changed too. verify.sh runs neither the meta checks nor
  lila-ws's `sbt check` (scalafix + scalafmt): run `cd lila-ws && sbt check` after lila-ws edits.
- Decisions: keep the stored ids as unused fields rather than migrate data (a 3.2 call, not in
  ADR 0019's key list); leave dormant round-page client code (tour standing, tour/swiss/simul
  links) for 3.18 and dead socket plumbing (TourStanding, SimulMoveEvent, SendToFlag) for 3.13; leave i18n
  keys and the tournament sounds for later clean-ups (logs/decisions.md).
- Verified by Claude: verify.sh (lila compile, scalafmt, lila + lila-ws tests, ui lint/format/tests),
  UI build, independent review. · Needs owner verification: none specific; the lobby no longer shows
  tournaments or simuls.
- Follow-ups: `public/sound/*/Tournament*` sounds, `.team-events` CSS, the `prizeTournamentMakers`
  setting and tournament i18n keys go with 3.6 (team) or 3.8 (rebrand).

### 2026-09-28 · 3.1 · Strip non-free lichess assets
- Did: deleted every asset upstream's `lila/COPYING.md` marks non-free or non-commercial (logo,
  favicons, 17 NC and 9 non-free piece sets plus 3D Staunton, the standard/instrument/other/robot/
  woodland/lisp sounds), plus what the directory audit found: lichess's own 77 flairs (all of
  `bin/flair/custom.txt` but neovim and helix), lichess images, all of `public/lifat`, the
  ChessPursuit mini-game, the unlisted governor and kosal sets, and the logo glyph in the icon font
  (removed from the .sfd; cmap entry and outline dropped from the .ttf/.woff2 with fontTools, since
  fontforge isn't in the cloud). New two-stone LiGo logo (SVG + PNGs, favicon.ico,
  apple-touch-icon) generated by `bin/gen/ligo-logo.mjs` with Playwright's Chromium; the loading
  spinner now draws that logo; small UI images redrawn in `images/ligo/`. Default sound set `sfx`;
  default background the AGPL wood4 board image. COPYING §1.1 and UPSTREAM updated.
- Worked: a script listing every `images/`, `logo/`, `sound/`, `piece/`, `flair/` path in code and
  checking it exists. Remaining misses are all in modules and packages units 3.2–3.7 delete.
- Didn't work / dead ends: that script missed inlined SVG path data (spinner), font glyphs and
  split paths (`'lisp/' + name`); the reviewer found them. verify.sh's oxfmt gate only checks
  changed `ui/` files, so `bin/gen/*.mjs` slipped past it (CI checks all of lila/).
- Lessons: audit by directory, never by licence table; then grep for content (SVG path data,
  glyph names, split paths), not only file paths. Leave references inside modules a later unit
  deletes.
- Decisions: default sound set `sfx`; keep the AGPL `images/board` set incl. the horsey theme;
  delete unlicensed flairs rather than guess; logo drawn by LiGo (logs/decisions.md).
- Verified by Claude: lila compile, scalafmt, lila tests, ui lint/format/tests (verify.sh), UI
  build, screenshots. · Needs owner verification: the logo and favicon look; blind-mode users lose
  the `select` sound (no free set has one); horsey board theme's authorship.
- Follow-ups: manifest name/description (3.8); `ui/lib/package.json` still hashes
  `public/lifat/background/**` (empty glob; dropped with the chess-only bundles later).

### 2026-09-28 · 3.9 · Design: Go core types, game storage, round protocol, scalachess
- Did: ADR 0019. A read-only survey of the kept modules and `lila/app` counted scalachess use (about 245 files touch game-neutral types, about 200 chess rules/formats), read lila's game BSON, the round move flow and lila-ws's `Fens`/`ClientOut`, then decided: scalachess stays for neutral types and Glicko-2 only (a CI check in 3.17 bans chess rules/formats); a Go game sits beside the chess one until 3.17; `game5` keeps neutral keys plus `sz`/`ru`/`km`/`hc`/`ip`/`ac`; moves are an SGF point or `pass`; Fischer stays on `chess.Clock`, byo-yomi comes via go-rules in Phase 4. PLAN §3.4 step 5 reworded.
- Worked: lila already derives turn from ply parity with `startedAtPly`, so Go's "Black first, or White first with handicap 2–9" fits without a new turn field.
- Didn't work / dead ends: this session's first container had an old Setup script without PlayStrategy's Maven repo, so strategygames didn't resolve; re-running `dev/cloud-setup.sh` + `dev/ligo deps` fixed it (`dev/ligo test rules`: 252 passed). Its POM has no scalachess dependency and its jar has `strategygames.ByoyomiClock`. The reviewer found two gaps, fixed in the ADR: what two passes do before Phase 4's scoring phase exists (now: the game ends, no winner), and a claimed `dev/ligo db` reset that doesn't exist (Claude never wipes a database; old chess documents are ignored by query). Its other points (the clock-start recipe, runtime `turnColor`, the chess reader crashing on Go documents, chess's 600-ply forced draw, the bridge living in `core`) are written into the ADR for later units.
- Lessons: `scalachess-rating` needs `ByColor`, `Color`, `Outcome` and `IntRating` from scalachess core, nothing chess-specific; `Lilaism` exports `chess.Color`, so never wildcard-import `ligo.gorules.*` in lila.
- Decisions: ADR 0019, Claude's call under the owner's 2026-09-28 delegation (logs/decisions.md). Fallback: vendor the neutral types if Phase 4's "scored" status or byo-yomi can't live outside scalachess.
- Verified by Claude: the survey's key facts spot-checked (`Lilaism.scala` export, `GoGame.replay` private, `RoundSocket` `r/move` parsing, lila-ws `RoundMove`); `bash .claude/skills/verify/verify.sh` (see PR). · Needs owner verification: none.
- Follow-ups: 3.10 wires go-rules in; 3.12 adds public `GoGame.replay` to go-rules. The designated branch can't be force-pushed (guard-bash) after its PR is squash-merged: merge the old remote branch in and take our side, checking for conflict markers before committing.

### 2026-09-28 · Phase 3 breakdown · Split fork & de-chess into units
- Did: split PLAN §5's Phase 3 row into units 3.1–3.20 (asset strip; six removal units; rebrand leftovers; a design ADR for Go core types, the game schema and the round protocol; go-rules wiring; core, game, round, lila-ws, game creation and remaining-module migrations; dropping scalachess; round and lobby UI; the demo) and classified every lila module and `ui/` package in ADR 0018. Refreshed docs/STATUS.md.
- Worked: lila's `build.sbt` module graph gives a clean removal order (gathering only feeds tournaments; study feeds relay, practice and studySearch). The reviewer's scripted checks found every module in exactly one bucket and no removal unit deleting something a later one needs.
- Didn't work / dead ends: the first draft said scalachess could be dropped while keeping `scalachess-rating`; the reviewer found its POM depends on scalachess core and that kept modules use scalachess's game-neutral types (`ByColor`, `Centis`, `IntRating`, `PlayerTitle`). Unit 3.9 now decides scalachess's fate. It also found gaps in what units touch (`mod` reaching `game` only through `evaluation`, `ui/round` importing `voice`/`keyboardMove`, engine code in `ui/lib`, missing lila-ws actors), now in the table.
- Lessons: read the POM of any artifact a plan says "stays when X goes". "keep dormant" still costs a migration once scalachess goes, so the map keeps dormant only what a public demo would need (report, mod, appeal, shutup).
- Decisions: the split and the module map, Claude's calls under the owner's 2026-09-28 delegation (ADR 0018, logs/decisions.md).
- Verified by Claude: every module in `lila/modules` appears in exactly one bucket of ADR 0018 and every `lila/ui` package is listed (scripted check); `bash .claude/skills/verify/verify.sh` (see PR). · Needs owner verification: none; skim the units and ADR 0018's remove list if you like.
- Follow-ups: 3.1 starts next. Only 3.18–3.20 need Phase 2 (2.1, 2.3, 2.4).
### 2026-09-26 · unit 0.2 · Import upstream snapshots + baseline build — DONE (supersedes the "IN PROGRESS" entry below)
- Did:
  - Owner allowed the four blocked hosts. Built and ran the unmodified lila + lila-ws in a cloud
    session: `pnpm install --frozen-lockfile` (with the ab-stub workaround, ADR 0008) → `./ui/build`
    → `sbt compile` for both → Mongo 7.0.28 (Docker) + Redis → `./lila.sh run` + lila-ws `sbt run`.
  - Took desktop and phone screenshots (`docs/research/baseline/`).
  - Ran a 52-agent verification workflow: 6 independent verifiers, 2–3 skeptics per issue, and a
    completeness critic.
  - Fixed what it found: removed LFS attributes (ADR 0009); corrected COPYING (ADR 0007); recorded
    the cloud dependency sources (ADR 0008).
- Worked:
  - lila compile: 250 s, 87 units / 1,490 sources, 0 errors, 17 `[warn]` lines, all from upstream's
    `-Wunused:all` (10 unused `@nowarn`). Keep these as the baseline for later diffing.
  - lila-ws compile: 63 s, 85 sources, 0 errors (warnings: sbt lintUnused, duplicate `lila-maven`
    resolver name, 1 deprecation).
  - UI build: 22 s (esbuild, sass → 148 CSS files, tsc, i18n, manifest).
  - Running: `GET /` → 200 "lichess.dev • Free Online Chess". The lobby websocket to
    `ws://localhost:9664` opens and receives frames, no console errors, no reconnect banner, and the
    lila ⇄ lila-ws Redis link is up ("LILA BOOT", "LILA VERSIONING READY").
  - About 60 routes probed; only `/storm` returns 500 on an empty DB (upstream behaviour: no puzzles).
  - Import integrity: tree ids identical to upstream (lila `41d7ac5a…`, lila-ws `04bbd626…`),
    15,994 + 105 files, modes and symlinks equal.
  - The builds changed no tracked files; every output is gitignored.
- Didn't work / dead ends:
  - The 94 Git LFS pointer files under `lila/public/lifat` plus inherited `filter=lfs` made clones
    fail wherever git-lfs is installed (exit 128). Fixed by removing the attributes: exit 0 after,
    verified.
  - The imported snapshot contains non-free/NC upstream assets, contradicting COPYING. Fixed by
    documenting them and scheduling the strip as the first Phase 3 unit.
  - `lila/AGENTS.md` (upstream lichess contributor guide) is auto-loaded by Claude Code when reading
    files in `lila/`, because LiGo has no CLAUDE.md yet. Some of it conflicts with LiGo's rules
    ("trust these instructions", non-frozen `pnpm install`, `bin/deploy`). Treat it as upstream
    documentation; LiGo rules win. Unit 0.4's CLAUDE.md files fix it.
  - `main` protection currently blocks deletion and force-push only; "require a pull request"
    isn't enabled yet (owner action).
- Lessons: promoted to the Lessons section.
- Decisions: owner approved ADR 0007 (document + strip early), ADR 0008 (cloud dependency sources),
  ADR 0009 (remove LFS attributes), and moving the Linux-box check to the end of unit 0.3.
- Verified by Claude: all of the above, with real output (compile/UI/run logs, Playwright, tree-id
  comparison, 918/918 mirror artifacts matching Maven Central SHA-1s, the LFS clone before/after
  test).
- Needs owner verification: the baseline on your Linux box (after unit 0.3); a skim of the COPYING.md
  §1.1 wording (licensing is a judgement call).
- Follow-ups:
  - Unit 0.3 codifies ADR 0008 and gives you a one-command local run.
  - The first Phase 3 unit strips non-free assets (by directory, including inline logos, branded
    flair and Unsplash montages) and needs a free default sound set (your decision then).
  - Unit 0.4 adds the CLAUDE.md files, which neutralise `lila/AGENTS.md`.
  - The rebrand unit (0.7) repoints the AGPL §13 source links to LiGo's repo.
  - The "Li-" naming question gets checked before any public demo.
  - A second review pass (44 agents) found only documentation gaps, all fixed before the PR.

### 2026-09-26 · unit 0.2 · Import upstream snapshots + baseline build (IN PROGRESS, blocked)
- Did: imported lila @ b3f190be (2026-09-25) and lila-ws @ 24053fc0 (2026-09-22) as squashed snapshots via `git archive` (owner chose squashed over full history). Recorded SHAs in docs/UPSTREAM.md. Installed sbt 2.0.9 (official GitHub release tarball) and Node 24.20.0 (nodejs.org, checksum verified) + pnpm via corepack. Pulled mongo:7.0.28 from Docker Hub.
- Worked: the file lists match upstream exactly (lila 15,994 files, lila-ws 105). Node, pnpm, sbt launcher and the Mongo image all installed.
- Didn't work / dead ends:
  - `lila/public/data/bot/README.md` is tracked upstream despite lila's own `.gitignore` (`/public/data/*`); a plain `git add` skipped it and it had to be force-added. Lesson: after importing, always diff `git ls-files` against upstream.
  - Build blocked by the cloud network policy (403) on four hosts lila needs: `jitpack.io` (liplay sbt plugin, scalalib, scalachess — used by both lila and lila-ws), `repo.scala-sbt.org` (sbt plugin repo), `central.sonatype.com` (snapshot resolver) and `codeload.github.com` (the GitHub-hosted `ab-stub` npm package needed by `pnpm install`). Owner must add them to the environment's allowed domains.
  - Maven Central (`repo1.maven.org`, `repo.maven.apache.org`) randomly returns HTTP 429 to this environment (~1 in 6 requests). coursier's JVM launcher broke on it (a skipped jar left a conflicting classpath). Fix: Google's official Central mirror `maven-central.storage-download.googleapis.com/maven2` (0 × 429 in 30 requests) via `~/.config/coursier/mirror.properties` and `~/.sbt/repositories` + `-Dsbt.override.build.repos=true`. That file must also list lila's own resolvers (lila-maven on raw.githubusercontent.com, jitpack), or the override hides them.
- Lessons: promoted above.
- Decisions: squashed snapshot (owner, 2026-09-26). Waiting: network allowlist (owner action).
- Verified by Claude: file-list parity with upstream; Node checksum; tool versions. Not yet verified: compile, UI build, running server (blocked).
- Follow-ups: once hosts are allowed, run `pnpm install`, `./ui/build`, `sbt compile` (lila, lila-ws), start lila + lila-ws + Mongo + Redis, screenshot the homepage; then the owner repeats it on the Linux box. Bake the mirror config into dev/cloud-setup.sh in unit 0.3.
