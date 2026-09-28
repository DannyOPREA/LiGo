# 0017. Phase 3 module map: what lila keeps, keeps dormant and removes
- Status: Accepted
- Date: 2026-09-28
- Decided by: Claude, under the owner's 2026-09-28 delegation ("Don't ask for my approval for
  anything, just work until I tell you to stop"). The owner can revisit any row with a superseding
  ADR; a removed module comes back from git history.

## Context
PLAN §3.4 names the lila modules to keep, keep dormant and remove, but lila has 85 server modules
and 35 `ui/` packages, and about 30 of them are not named there (e.g. `activity`, `tv`, `search`,
`evaluation`, `fide`). Phase 3 removes chess, so every module must land in one bucket before the
removal units start, and removing anything beyond §3.4's list is a decision (PLAN §7).

"Keep dormant" can't mean "untouched": once scalachess goes (unit 3.17), every module that stays
must compile against Go types. So each dormant module is a module we pay to migrate, and the map
keeps only what the POC or a possible public demo (§8) needs.

## Decision
Server modules (`lila/modules/`):

| Bucket | Modules |
|---|---|
| Keep (infrastructure) | core, coreI18n, common, db, memo, mon, markdown, i18n, ui, web, api, socket, room, chat, tree, notify, mailer, push, oauth, cms, irc |
| Keep and adapt (§3.4) | game, round, lobby, pool, setup, challenge, playban, user, security, pref, rating, history, analyse, puzzle |
| Keep and adapt (not named in §3.4) | activity (profile activity), perfStat (profile stats), bookmark, relation (follow/block), timeline |
| Keep dormant (§3.4, plus appeal, which serves mod) | report, mod, appeal, shutup (kid mode, data export and account closure live in `user`/`security`/`api`) |
| Remove (§3.4) | tournament, swiss, simul, study, relay, fishnet, evalCache, opening, explorer, insight, tutor, coach, streamer, forum, ublog, team, msg, video, practice, learn, storm, racer, bot |
| Remove (not named in §3.4) | gathering (only tournaments use it), event, fide, title, coordinate, jsBot, irwin, evaluation (chess engine assessment), studySearch, forumSearch, teamSearch, search, gameSearch (Elasticsearch isn't needed, §3.2), feed, plan (Patron), recap, clas, tv |

`ui/` packages: keep `@types`, analyse (minus its study, practice, explorer and eval parts), bits,
build, challenge, chart, dasher, lib, lobby, mod, notify, puzzle (minus storm/streak), round,
serviceWorker, site, test, user. Remove botDev, botPlay, coordinateTrainer, dgt, editor, fide,
insight, keyboardMove, learn, msg, opening, racer, recap, simul, storm, swiss, team, tournament,
tutor, voice. `editor` (the chess position editor) returns, if wanted, as a Go editor in Phase 7.

lila-ws loses the handlers of removed features (study, relay crowd, tournaments, simuls, storm,
eval cache, TV) in the same unit as the lila module they serve.

## Consequences
- Phase 3's removal units (3.2–3.7) follow this table, in dependency order, each compiling.
- Moderation stays dormant without engine assessment (`evaluation`, `irwin` go), which is
  chess-only anyway; `mod` loses those hooks.
- Without `tv`, the home page has no featured game and there is no "current games" page until the
  lobby (Phase 6) or a later unit brings one back.
- Without `search`/`gameSearch`, a user's game list is the only way to find past games in the POC.
- i18n translation files are left alone; unused keys are harmless and pruning them is churn.

## Alternatives considered
- **Keep every unnamed module dormant.** Rejected: each would have to be migrated off scalachess,
  multiplying Phase 3 for features the POC doesn't show.
- **Keep `tv` for a "watch games" page.** Deferred rather than rejected: it's chess-coupled today and
  is easy to restore once Go games exist.
- **Keep `msg` (private messages).** §3.4 already removes it; correspondence uses `notify`.
