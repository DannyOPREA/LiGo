# 0026. Phase 9: the PWA, sounds, themes, accessibility, performance budget, credits and handoff
- Status: Accepted
- Date: 2026-09-29
- Decided by: Claude, under the owner's 2026-09-28 delegation ("Don't ask for my approval for
  anything, just work until I tell you to stop")

## Context
Phase 9 (docs/PLAN.md §5, units 9.1–9.10) makes LiGo installable and pleasant to use and packages
it for a Go club demo and a possible handoff to OGS (PLAN §1.3, §3.1's PWA row, §8). ADR 0018 keeps
lila's `serviceWorker`, `site`, `dasher` and `pref` pieces; the board is OGS goban wrapped by
`libs/board` ([ADR 0014](0014-ogs-goban-for-client-rules-and-board.md),
[ADR 0017](0017-libs-board-in-lila-workspace.md)), shown today only on the playground page (unit
2.2). Decided here: what each Phase 9 item covers, what is reused, and how each is checked.

What lila and goban have today (read for this ADR; paths under `lila/` unless said otherwise):
- **Manifest:** `/manifest.json` is built by `modules/web/src/main/StaticContent.scala`
  (`manifest`): name = the domain, short name "Lichess", lichess's description, LiGo's favicons
  (unit 3.1), and `related_applications` pointing at lichess's Android and iOS apps.
- **Service worker:** `ui/serviceWorker` handles web push only (subscribe, show a notification,
  focus a tab on click). It caches nothing, so offline the browser shows its own error page. There
  is no install prompt anywhere.
- **Sounds:** `ui/site/src/sound.ts` plays a named file from the chosen set
  (`public/sound/<set>/<Name>.mp3`); the `soundSet` preference (`modules/pref/SoundSet.scala`) offers
  sfx (default), piano, nes, futuristic, silent and speech ("speech" reads chess moves aloud). After
  unit 3.1 the four sets left are free under upstream's own table (COPYING.md §1.1), and each has
  the same 31 names (futuristic adds NewChatMessage): Move, Capture, Confirmation, Error,
  GenericNotify, LowTime, CountDown0–10, Victory, Defeat, Draw, NewChallenge, NewPM and chess- or
  tournament-only ones (Check, Checkmate, Berserk, Explosion, OutOfBound, Tournament1st/2nd/3rd/Other).
  goban's board already emits `audio-stone`, `audio-pass`, `audio-capture-stones`, `audio-clock`,
  `audio-enter-stone-removal` and `audio-game-ended` events; it plays nothing itself.
- **Themes:** the site themes (`bg`: light, dark, transparent with a background picture, system) are
  game-neutral. The board preferences (`theme`, `pieceSet`, their 3D twins) list chess boards and
  piece sets. goban 8.3.226 draws its board and stones from code for Plain, Night Play, HNG,
  HNG Night and Book (boards) and Plain, Slate, Shell, Glass, Worn Glass and Night (stones);
  Kaya, Red Oak, Persimmon, Black Walnut, Granite and Bright Kaya load pictures from OGS's CDN,
  which neither the goban npm package nor OGS's repository licenses (checked 2026-09-29: OGS's AGPL
  repository only links the CDN); the Anime set is picture art too (embedded in goban.js, fetched
  from the CDN on Firefox), and "Custom" loads any picture URL a user gives. LiGo shows
  Plain/Plain/Plain today (ADR 0017).
- **Accessibility:** lila has a "blind mode" (a cookie set from `/settings` or the footer) that
  swaps the round, analysis and puzzle pages for a text interface, `nvui` (`ui/lib/src/nvui`,
  `ui/*/src/*.nvui.ts`), built around chess notation and chess commands. goban's board is an SVG
  with no keyboard input and no text alternative.
- **Size:** measured on today's build (`dev/ligo compile ui`, gzip -9): lila's shared site code
  107 KiB, the playground page with the site code it shares 112 KiB (its own entry 3.6 KiB), and
  the lazily loaded board chunk (goban with the adapter) 142 KiB.

## Decision

### 1. The PWA (unit 9.6)
- **Manifest:** name "LiGo", short name "LiGo", description "A free, open-source Go server in the
  style of lichess", `start_url` "/", `display` "standalone", background and theme colours from the
  dark site theme, `id` "/", LiGo's existing icons plus a 512 px maskable icon made from the LiGo
  logo, and **no** `related_applications` (LiGo has no store app).
- **Service worker:** lila's push handling stays unchanged; it adds one thing, an **offline page**:
  on install it caches a small `/offline` page (the LiGo logo, "You are offline", a retry button)
  and its CSS, and serves it when a page navigation fails. No other caching and **no offline play**
  (every game is on the server).
- **Install prompt:** no pop-up. An "Install LiGo" entry in the account menu (dasher) appears only
  when the browser fires `beforeinstallprompt`; on iOS Safari, where there is no such event, the
  entry shows "Share, then Add to Home Screen" instead. A dismissed or installed state is kept in
  local storage.
- **Touch settings:** touch-confirm stays as unit 2.3 made it (on by default on touch screens); the
  board takes a phone's full width and sets `touch-action: manipulation` so a double tap never
  zooms the page.
- **Checked by:** Chromium at phone size: installable per the DevTools protocol
  (`Page.getInstallabilityErrors` empty), the offline page shown with the network cut, push still
  subscribing. Installing on a real phone is on the owner's list.

### 2. Sounds (units 9.2 and 9.7): lila's free sets, used as they are
Top rung of the reuse ladder: the four kept sets already hold every sound a Go game needs, so LiGo
adds **no new sound files** in Phase 9. Go events map onto the existing names:

| Go event | Sound |
|---|---|
| A stone is placed | Move |
| A stone placed captures (any number) | Capture, instead of Move |
| Pass | Confirmation |
| Illegal move refused (suicide, ko, superko; a click on a stone is ignored silently, as goban does) | Error |
| Game starts; the scoring phase starts | GenericNotify |
| Byo-yomi: a new period starts, or the last period starts | LowTime |
| Byo-yomi: the last 10 seconds of a period | CountDown10 … CountDown1, one per second |
| Game ends | Victory, Defeat or Draw (jigo or no result) |

- `libs/board` reports each move that counted as one `onPlayed` event (the move, its colour, the
  number of stones it captured), from `play`, and refusals through its existing `onRefused`. It
  does not forward goban's `audio-*` events: goban also fires `audio-capture-stones` for a
  previewed stone that hasn't been played, and logs every capture to the console. The same
  `onPlayed` event feeds the live region (§4); the page plays them through `site.sound`, so the sound preference, volume
  and "silent" apply everywhere. Clock and game-end sounds belong to the round page (9.7).
- The `soundSet` preference keeps sfx (default), piano, nes, futuristic and silent. "speech" stays
  and reads a Go move as its coordinate ("D 4", "pass", "3 captured") in 9.7, the same text the
  board's live region uses (§4).
- 9.7 deletes the chess- and tournament-only files from each set (Check, Checkmate, Berserk,
  Explosion, OutOfBound, Tournament1st/2nd/3rd/Other) and NewPM (private messages went in unit
  3.6), with their callers; NewChallenge and NewChatMessage stay.
- A wooden stone-click set is not made in Phase 9: OGS's sound packs are served from its CDN with
  no stated licence, and freesound/opengameart are not reachable from the cloud to check one. It
  can come later as its own unit with a licence check.

### 3. Themes (units 9.3 and 9.7)
- **Site themes:** lila's light, dark, transparent and system stay unchanged.
- **Board and stones:** only goban's **picture-free** themes, which are Apache-2.0 code like the
  rest of goban: boards Plain (default), Book, Night Play, HNG and HNG Night; stones Plain
  (default), Slate, Shell, Glass, Worn Glass and Night, black and white chosen together as goban
  pairs them. The picture themes (Kaya and the other woods, Granite, Anime) stay off until their
  pictures' licence is known, and "Custom" is never offered (it loads any URL); `libs/board` never lets goban reach OGS's CDN.
- **Where the choice lives:** `mountBoard` takes `{ board, stones }` theme names (9.3). On lila's
  pages (9.7) the existing `theme` and `pieceSet` preference fields hold the board and stone
  theme names (no new Mongo field; their chess values and the 3D twins go, and an unknown stored
  value falls back to the default, as lila already does). The playground keeps its choice in local
  storage until then.

### 4. Accessibility basics (units 9.4 and 9.7)
- **Target:** WCAG 2.2 level AA on LiGo's own pages (the playground now; lobby, round, analysis,
  puzzle, profile and credits pages as they land), checked automatically with **axe-core** through
  Playwright (`@axe-core/playwright`, MPL-2.0, a dev dependency of `libs/board`'s and `ui/`'s
  browser tests; never shipped to players) at desktop and phone sizes: no serious or critical
  violations. **MPL-2.0 joins LiGo's allowed licences** (PLAN §2.2's list and `ALLOWED` in
  `dev/ci/meta_checks.py`, changed in 9.4): it is a file-level copyleft that allows commercial use
  and names the GNU licences as compatible (its §3.3), so it passes the owner's licence rule; the
  CI licence check reads dev dependencies too, which is why the list must change. Automated checks catch about a third of problems, so each demo checklist includes a
  keyboard-only and a screen-reader pass for the owner.
- **The board, in `libs/board` (9.4):** keyboard play on the board itself: Tab focuses the board,
  arrow keys move a visible cursor over the intersections (Home/End jump to the edges), Enter or
  Space places a stone (with touch-confirm, a second Enter confirms), a documented key passes;
  every move and capture is announced in an `aria-live="polite"` region as text ("Black D4",
  "White passes", "3 stones captured", "Illegal: ko"); the board has an accessible name and a
  text description of the position on request (a key reads the stones near the cursor); a focus
  ring and a cursor with at least 3:1 contrast against every theme; reduced motion respected
  (no stone animation).
- **lila's blind mode (`nvui`):** **dropped**, not adapted. It is a second, chess-shaped UI on
  every game page; the board's own keyboard and live-region support serves screen-reader and
  keyboard players on the normal pages instead. The blind-mode toggle, `ui/lib/src/nvui` and the
  pages' `*.nvui.ts` go in 9.7 (or earlier, with 3.18, 7.4 and 8.7, which replace those pages'
  chess boards). Recorded in logs/decisions.md.
- Coordinates are the ones printed on a board (letters A–T without I, numbers from the bottom),
  the same as the board's labels, never SGF's two-letter form.

### 5. The performance budget (units 9.5 and 9.10)
Numbers measured on the built output and in Chromium, gzip -9, checked by a script in `dev/ci`
(run by the `ui` CI job and `dev/ligo test budget`). Limits start at today's size plus about 15%
headroom, under a ceiling a phone on a slow connection tolerates:

| Budget | Today | Limit |
|---|---|---|
| The board chunk (goban + adapter), loaded lazily | 142 KiB | 165 KiB |
| lila's shared site JS | 107 KiB | 125 KiB |
| All JS a page loads before the board (site + the page's entry and its chunks; the playground today, its own entry being 3.6 KiB) | 112 KiB | 130 KiB |
| A page's CSS | measured in 9.5 | measured + 15% |
| Board mount to first drawn stone, 19×19, Chromium with the CPU slowed 4× | measured in 9.5 | measured + 15%, and never above 1 s |

A budget raised later needs a line in logs/frontend.md saying why. New pages (round, analysis,
puzzle, lobby) add their own line when they land; 9.10 runs the whole set over every page.

### 6. The credits page (unit 9.8)
`/credits`, a lila page beside `/source`, linked from the footer and from `/source`: lichess (lila,
lila-ws), lishogi, PlayStrategy (strategygames), OGS (goban, goban-engine), KataGo and its
network, goscorer, `@sabaki/sgf`, the fonts, the sound sets and board themes (§2, §3), and every
puzzle source from 8.4's list; each with its licence and a link. Its text is generated from one
list in the repository (`docs/credits.md` or a data file 9.8 picks) so COPYING.md and the page
cannot drift; a test fails when COPYING.md names a third party the list lacks.

### 7. The handoff package (unit 9.9)
In `docs/handoff/`: `README.md` (what LiGo is, what it reuses, what it built, what is unfinished,
one page); `run-it.md` (a fresh clone to a running site, docker and cloud modes, the KataGo
network); `lessons.md` (a digest of every log's Lessons section, grouped by area); `lobby-research.md`
(the 6.3 kit and the player test's findings); `for-ogs.md` (PLAN §8's portable parts: the board
adapter, fixtures, UX designs, research, logs, anything worth upstreaming to goban, with their
licences). The demo video (a full 9×9 game with scoring, a puzzle, an SGF import, the phone
layout) is recorded by a Playwright script kept in the repository; the video file itself goes to
the project's files and the PR, **not** into git. Sending the package to OGS or anyone else is the
owner's call (§8); Claude never does it.

### 8. What stays out of Phase 9
Offline play, store apps, languages other than English (i18n stays ready), a stone-click sound set
(§2), picture board themes (§3), a public deployment (§8's legal steps first) and contacting OGS.

## Consequences
- 9.2–9.5 touch only `libs/board`, the playground and `dev/ci`, so they run before Phase 3 ends.
- No new sound or picture files, so COPYING.md only gains axe-core (a dev dependency, MPL-2.0,
  which widens the allowed licence list) in Phase 9's early units and the maskable icon (LiGo's own, MIT) in 9.6.
- Blind-mode users of lichess would find the text interface gone; LiGo's accessible path is the
  normal page with the keyboard board, which a demo checks by hand.
- The `theme` and `pieceSet` preference fields change meaning (chess names to goban theme names);
  stored chess values fall back to the defaults, so no migration is needed.

## Alternatives considered
- **A new LiGo stone-click sound set** (recorded or synthesised): better Go feel, but it adds a
  building step with no licence-checked source reachable now; lila's Move/Capture are clicks
  already. Deferred.
- **OGS's picture themes via its CDN:** the prettiest boards, but unlicensed pictures and a runtime
  call to another site; rejected until OGS states a licence.
- **Adapting `nvui` to Go:** a full text interface for blind players, but a second UI on every page
  to build and keep in step; the keyboard board gives the basics at a fraction of the work.
- **Workbox or a caching service worker:** faster repeat loads, but stale-asset bugs are a known
  cost (PR #51 fixed one in the dev setup) and lila's hashed assets already cache well; only the
  offline page is added.
- **Lighthouse CI for the budget:** needs the full site, which cloud sessions can't run; the
  script measures built files and the playground in Chromium instead, and 9.10 adds whole pages.
