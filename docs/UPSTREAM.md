# Upstream tracking

LiGo is a hard fork ([ADR 0001](decisions/0001-fork-current-lila.md)). This file records exactly
what we forked and every upstream change we port later. The `upstream-scout` agent reads it monthly.

## Pinned snapshots

| Upstream | Repo | Pinned SHA | Commit date (committer's time zone) | Imported into |
|---|---|---|---|---|
| lila | https://github.com/lichess-org/lila | `b3f190be9d532d5f9cdf746938e9d480b1464e25` | 2026-09-25 | `lila/` (squashed snapshot) |
| lila-ws | https://github.com/lichess-org/lila-ws | `24053fc0f0eb5e040233356dc62e13804c531bd6` | 2026-09-22 | `lila-ws/` (squashed snapshot) |
| lila-docker | https://github.com/lichess-org/lila-docker | `cbba92c7f59bc7a95f4d1d8b177b0228349bc337` | 2026-09-26 | `dev/lila-docker/` (trimmed copy of a few files, ADR 0010) |

Notes on the snapshots:
- Imported with `git archive` of each pinned commit. In the import commit `adff5f9` the trees are
  identical to upstream (tree ids `41d7ac5a…` lila, `04bbd626…` lila-ws; independently verified
  2026-09-26). Every later change is listed in the modification register below.
- The lila-ws date is 2026-09-23 in UTC.
- **Git LFS:** upstream keeps ~777 MiB of `lila/public/lifat/` assets (nnue, maia, vosk, bots,
  background galleries) in Git LFS. For those, the snapshot contains only the **94 pointer files**,
  not the objects (see ADR 0009). The other 10 lifat files were real content, including 4
  Unsplash-licensed montage images. Unit 3.1 deleted all of `public/lifat/` (COPYING §1.1).
- **lila-docker** is not a full snapshot: only the files listed in `dev/lila-docker/README.md` were
  copied, several of them trimmed. That README is its modification register.
- **Non-free upstream assets** were removed in unit 3.1 (COPYING.md §1.1, ADR 0007).

## LiGo modifications to upstream files

AGPL §5(a) modification notices. Every change to a file under `lila/` or `lila-ws/` is listed here.

| Date | File(s) | Change | Why | Commit / PR |
|---|---|---|---|---|
| 2026-09-26 | `lila/.gitattributes` | Removed upstream's 8 `filter=lfs` rules under `public/lifat/`; added an explanatory comment | The snapshot has pointer files only; checkouts failed wherever git-lfs is installed | commit 6479d55 (unit 0.2 PR), ADR 0009 |
| 2026-09-28 | `lila/public/` (logo, favicon.ico, apple-touch-icon.png, 28 piece sets and 3D Staunton, 6 sound sets and the Silence files, lifat, images except board/learn/pieces/practice/puzzle-themes/staunton/trophy, 77 flairs, flair/list.txt, vendor/ChessPursuit; the logo glyph in font/lichess.{sfd,ttf,woff2}), `lila/bin/gen/favicons` | Deleted | Non-free, non-commercial or lichess-branded (COPYING §1.1) | unit 3.1 PR |
| 2026-09-28 | `lila/public/logo/ligo*`, `favicon.ico`, `apple-touch-icon.png`, `public/images/ligo/`, `bin/gen/ligo-logo.mjs` | Added LiGo's own logo, icons and UI images (MIT) with their generator | Replace the deleted lichess artwork | unit 3.1 PR |
| 2026-09-28 | `modules/ui` `Icon.scala`, `helper/HtmlHelper.scala` (spinner) + `modules/web` `ui/bits.scala`, `layout.scala`, `StaticContent.scala`, `FaqUi.scala`, `mobile.scala`; `modules/oauth` `AuthorizeUi.scala`, `OAuthSignedClient.scala`; `modules/user` `UserActionMenu.scala`, `FlairApi.scala`; `modules/mod` `GamifyUi.scala`; `modules/pref` `SoundSet.scala`, `PieceSet.scala`; `modules/pref` `Pref.scala` (default background); `modules/feed` `FeedUi.scala` (default flair); `app/controllers/Dasher.scala` (no gallery); `app/views/base/page.scala`, `base/notFound.scala`, `user/show/page.scala`, `lobby/home.scala`; `lila/.gitattributes` comment | Logo, favicons and manifest icons point at LiGo's files; removed references to deleted images; default sound set `sfx`; deleted piece sets dropped from the choices | Keep the server working after the deletions | unit 3.1 PR |
| 2026-09-28 | `ui/` `lib/src/view/controls.ts` (spinner), `lib/src/licon.ts`, `analyse/src/explorer/explorerView.ts`, `puzzle/src/ctrl.ts`, `round/src/title.ts`, `round/src/plugins/round.yeet.ts`, `serviceWorker/src/serviceWorker.ts`, `lib/src/notification.ts`, `recap/src/slides.ts`, `notify/src/renderers.ts`, `analyse/src/view/settingsView.ts`, `bits/src/bits.devMode.ts`, `site/src/sound.ts`; SCSS in `lib/css` (licon, header title, tree, colorChoice, loader, zen-toggle, multiple-select, board-3d), `bits/css` (auth, not-found, oauth, oauth-connection, markdown-textarea), `lobby/css/app/_app.scss`, `dasher/css/_piece.scss`, `mod/css` (report, user, inquiry), `puzzle/css/_side.scss`; `public/oops/*.html` | Same: LiGo logo, CSS-only loader, LiGo UI images, `sfx` as the fallback sound set, deleted images no longer referenced | Keep the client working after the deletions | unit 3.1 PR |
| 2026-09-28 | `lila/modules/{tournament,swiss,simul,gathering,event}`, `modules/core/src/main/{tournament,swiss,simul}.scala`, `app/controllers/{Tournament,TournamentCrud,UserTournament,Swiss,Simul,Event}.scala`, `app/views/{tournament,swiss,simul}.scala`, `ui/{tournament,swiss,simul}`, `ui/bits/css/tournament/`; lila-ws `actor/{Tour,Swiss,Simul}ClientActor.scala` | Deleted | Tournaments and events aren't in the POC (ADR 0018) | unit 3.2 PR |
| 2026-09-28 | lila: `build.sbt`, `conf/routes`, `conf/team.routes`, `app/Env.scala`, `app/Lila.scala`, controllers (Analyse, Api, Challenge, Clas, Dev, GameMod, Mod, PlayApi, Round, Setup, Team, Tv, User), `http/KeyPages`, `mashup/{Preload,TeamInfo,UserInfo}`, views (activity, analyse, clas, game, lobby, mod, round, team, tv, ui, user), modules `activity`, `api`, `chat`, `core/chat`, `game`, `round`, `tv` and others; `pnpm-lock.yaml` (removed workspace packages) | Removed tournament, swiss, simul and event hooks; stored ids kept as unused fields | Keep the rest compiling after the deletion | unit 3.2 PR |
| 2026-09-28 | lila-ws: `Bus`, `Controller`, `KeepAlive`, `Lila`, `LilaHandler`, `Mongo`, `Router`, `model`, `actor/{ClientActor,RoundClientActor}`, `ipc/{ClientIn,LilaIn,LilaOut}` | Removed tour/swiss/simul rooms, channels and messages; `RacerState` now extends `RacerOut` | Same | unit 3.2 PR |
| 2026-09-28 | `lila/modules/{study,relay,practice,studySearch,fide,title}`, `modules/core/src/main/{relay,fide,practice}.scala`, `app/controllers/{Fide,Practice,RelayRound,RelayTour,Study,TitleVerify}.scala`, `app/views/{fide,relay,study,title}.scala`, mod `PublicChat`; `ui/fide`, `ui/analyse/src/study/**`, `ui/analyse/css/{study,gamebook}`, relay/practice/title bundles in `ui/bits`, `public/fide`; lila-ws `StudyClientActor`, `RelayCrowd` | Deleted | Studies, broadcasts, practice, FIDE pages and title requests aren't in the POC (ADR 0018) | unit 3.3 PR |
| 2026-09-28 | lila: `app/Env.scala`, `app/Lila.scala`, `build.sbt`, `conf/routes`, controllers (Account, Clas, Coach, Dev, Main, Mod, Report), `mashup/{Preload,UserInfo}`, views (coach, lobby/home, mod/ui, ui, user/show/header), modules `activity`, `api`, `clas`, `coach`, `game`, `mod`, `report`, `timeline`, `user`, `web`; ui `analyse` (ctrl, socket, views, keyboard …), `editor`, `puzzle`, `learn`, `bits`, `site/asset.ts`, `@types/lichess`; `pnpm-lock.yaml`; lila-ws `Controller`, `KeepAlive`, `Lila`, `LilaHandler`, `LilaWs`, `Mongo`, `Router`, `model`, `ipc/*`, `application.conf` | Removed study, relay, practice, FIDE and title hooks; `PublicFideIdOf` stubbed; the /practice page CSS (`analyse.practice`), `public/images/practice`, the public-chats mod page and the relay stats chart deleted; the coach list-widget CSS moved to `ui/bits` | Keep the rest working after the deletion | unit 3.3 PR |
| 2026-09-29 | `lila/modules/{storm,racer,coordinate,learn,opening,explorer,evalCache}`, `app/controllers/{Storm,Racer,Coordinate,Learn,Opening}.scala`, `modules/puzzle/src/main/PuzzleStreak.scala`, `modules/web/src/main/ui/LearnUi.scala`; `ui/{storm,racer,coordinateTrainer,learn,opening}`, `ui/lib/src/puz`, `ui/lib/css/puz`, `ui/puzzle/src/streak.ts`, `ui/analyse/src/explorer`, `ui/analyse/src/evalCache.ts`, `ui/analyse/css/explorer`, `public/images/learn`, `public/font/{racer-car,storm}.*`; lila-ws `RacerClientActor`, `StormSign`, `evalCache/`, `EvalCacheTest`, `EvalCacheMultiTest` | Deleted | Chess training, puzzle storm/racer/streak, opening pages, the opening explorer and the cloud eval cache aren't in the POC (ADR 0018) | unit 3.4 PR |
| 2026-09-29 | lila: `app/Env.scala`, `app/Lila.scala`, `build.sbt`, `conf/routes`, `conf/clas.routes`, `conf/base.conf`, controllers (Api, Clas, Coach, Importer, Puzzle), views (analyse, tutor, ui), modules `activity`, `analyse`, `clas`, `core`, `plan`, `puzzle`, `user`, `web`; ui `analyse`, `puzzle`, `lib`; `pnpm-lock.yaml`; lila-ws `Controller`, `KeepAlive`, `Lila`, `LilaHandler`, `LilaWs`, `Mongo`, `Monitor`, `Router`, `Services`, `model`, `actor/ClientActor`, `ipc/*`, `application.conf` | Removed the training, streak, explorer and eval-cache hooks and links; fishnet's cached-eval lookup stubbed; tutor's opening links point at the analysis board | Keep the rest working after the deletion | unit 3.4 PR |
| 2026-09-29 | `lila/modules/rating/src/main/GoRating.scala`, `src/test/GoRatingTest.scala`, `src/test/resources/goRatingCases.{json,py}`, `NOTICE-goratings.md` | Added LiGo's Go rating maths (MIT, ported from goratings) with its tests; no upstream file changed | Phase 5 ratings (ADR 0013, ADR 0021) | unit 5.2 PR |

## Reused libraries (tracked for fixes)

| Library | Repo | Version | Used in |
|---|---|---|---|
| strategygames (PlayStrategy) | https://github.com/Mind-Sports-Games/strategygames | `10.2.1-s3-ps14` (source commit `7344183`), from `https://raw.githubusercontent.com/Mind-Sports-Games/lila-maven/master`; jar SHA-256 `682916195761758d8a4849abdf60deb121d10b0f412c5ea43986fe4ae3de261f`, checked by `libs/go-rules/check-pin.sh` | `libs/go-rules` (ADR 0012) |
| goban-engine (OGS) | https://github.com/online-go/goban | `8.3.226` from npm (its protocol types match goban commit `6276a50`), exact version in `libs/board/package.json`, integrity `sha512-KINA9jC5/0wsTvk6EDnvHjWi15zANCzJHzygGUEuN+am4j9+r/ZNku8U7ge/rzGEmIOlH+5/BkGt6mZQuDSmrg==` in `lila/pnpm-lock.yaml` (libs/board is in lila's pnpm workspace since unit 2.1) | `libs/board` (ADR 0014) |
| goban (OGS) | https://github.com/online-go/goban | `8.3.226` from npm, the same release as goban-engine, exact version in `libs/board/package.json`, integrity `sha512-lOeQkz6/zZAtMNL50n2yXpvQbNNlbufuxqgk11jjL12dfRC8mw419vWqQ65GbD2tKEu8h39oZrIdxawbRGaWmg==` in `lila/pnpm-lock.yaml` | `libs/board/src/board.ts` (ADR 0014, unit 2.1) |

## Ported upstream commits

| Date | Upstream | SHA | What | LiGo PR |
|---|---|---|---|---|
