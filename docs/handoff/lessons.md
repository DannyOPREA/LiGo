# Lessons, by area

A digest of the Lessons sections of LiGo's logs (`logs/*.md`), as they stood on 2026-10-04. The
logs themselves hold the full entries, with dates and units. Each lesson here is shortened and
grouped by area. The source log is named in each heading.

## Forking lila (upstream-fork.md, backend.md)

- lila moves fast (about 10,000 commits a year), so a hard fork with a monthly review of upstream
  is the only realistic option. Lishogi forked in 2020 and is now stuck on Scala 2.13, which shows
  how hard forks age.
- lila's stack in September 2026: Scala 3, sbt 2, JDK 21, Pekko, ReactiveMongo. The browser side
  is Node 24, pnpm, TypeScript, esbuild, oxlint/oxfmt and snabbdom. Building it needs about 12 GB of memory.
- Import with `git archive` and compare `git ls-files` with upstream afterwards: upstream tracks
  some files its own `.gitignore` ignores. A snapshot copies only Git LFS pointers, so drop
  inherited `filter=lfs` attributes.
- Record a baseline (compile warnings, which pages fail on an empty database) right after the
  import. New warnings or errors after that are yours.
- **Removing a module:** the compiler won't catch everything.
  - Search for its event-bus messages: publishers compile fine with no subscriber.
  - Search the browser code for its URLs.
- **Moving a field out of a nested case class:** also search for `copy(inner = …)`. It keeps
  compiling while the outer copy goes stale.
- **Adding a perf:** matches on opaque string keys are never flagged as missing.
- A sibling sbt build used through `ProjectRef` passes on its libraries but not its resolvers or
  exclusions; repeat them in lila.
- **Scripted edits:** cut code by indentation or by adjacent markers, never "from marker A to a
  far marker B", and list the removed definitions afterwards.
- Before LiGo's changes, lila's `Clock.Config` was Fischer-only and kept one Glicko-2 rating per
  perf type.

## Go rules (rules-engine.md)

- PlayStrategy's strategygames has a pure-Scala Go (MIT) with area scoring, situational superko,
  handicap and dead-stone agreement. It ships as one artifact for all its games: exclude the other
  games' engines (some are GPL), and read the whole POM for licences.
- strategygames' quirks:
  - two passes open its own dead-stone phase rather than ending the game;
  - its default komi differs by board size;
  - it has no Japanese or Chinese ruleset of its own.
- **The engines disagree on superko history:** strategygames skips positions after passes, while
  goban skips the start position and looks back only 30 moves. A written spec is the truth, and
  adapters bridge the difference.
- **goban-engine's quirks:**
  - `place(x, y, true, true)` is the only fully checked move; the defaults skip ko.
  - Its SGF loader plays moves unchecked and turns an out-of-turn move into an edit.
  - Its fixed handicap placement runs only without `initial_state`.
- **KataGo as a rules oracle:** read legality from the policy's NaN mask, since its GTP `play` is
  lenient. Its `final_score` removes stones in pass-alive areas, so compare scores only on settled boards.
- **Two readers that must agree:** feed both the same seeded broken inputs and compare their
  verdicts. Fuzzing that only checks "it didn't throw" finds none of the disagreements.
- PlayStrategy's Go bug history makes good test cases: early ends on repetition, endless games,
  dead-stone countdowns, one-click group selection.

## The board (board-ui.md)

- chessground is built around square cells and pieces. LiGo wraps OGS goban's SVG board instead.
  Avoid jgoboard (non-commercial licence); Shudan (MIT) is the fallback.
- **Mounting goban:**
  - Mount it in a snabbdom `insert` hook and destroy it in `destroy`.
  - Mount it in a child of the element the page sizes, and give that box an explicit width.
  - Set `square_size` from the container: "auto" draws a tiny board.
  - It draws in a shadow root, so tests find it with Playwright locators.
- **Playing moves:** goban plays over OGS's protocol, so subclass it and override `sendMove`.
  - It turns stone placement off after `sendMove`: report the move in a microtask.
  - `pass()` leaves placement on, and previews turn it off, so the adapter keeps its own "a move
    is waiting" state.
  - Wrap `errorHandler`, since `onError` skips suicide.
- **goban's rule presets are OGS's:** pass superko settings, komi and the server's handicap
  stones (`initial_state`) on every game. Its SGF reader ignores `SZ`, `KM` and `PL`.
- **Themes:** the default theme loads a picture from OGS's CDN, which has no stated licence.
  Override `getSelectedThemes`; goban calls it inside its constructor, before a subclass's fields exist.
- **Licences and size:**
  - goban bundles goscorer (MIT) and its minified build drops the notice, so COPYING.md carries it by hand.
  - The npm package is about 104 KB gzipped and lags goban's `main` by months.
- **Phones:** a second tap on a preview removes it and double taps are ignored, so phones need a Confirm button.
- **Screenshot tests:**
  - Set the tolerance as a pixel count: a stone is about 0.15% of a page.
  - Hide web-font text, since Chromium builds rasterise it differently, and check text with locators instead.
- **Tooling:** run libs/board's scripts from `lila/` with `--filter @ligo/board`, and don't list
  lila's lint tools again in libs/board.
- **snabbdom:** bind an input's shown value with `props: { value }`, not `attrs`.

## Clocks (clocks.md)

- scalashogi's clock models byo-yomi with periods, and strategygames' is based on it.
  - `spentPeriods` includes the period in progress.
  - Its `recordActionTime` and `endTurn` are unimplemented: use only `step`, `start` and `stop`.
- Speed classes must assume many more moves than chess: about 120 to 150 per player on 19×19.
- In lila, read a game's clock through the `GameClock` view. `game.clock` is the Fischer clock
  only and is empty in a byo-yomi game.
- Lobby seeks and challenges carry `ClockSettings` (Fischer or byo-yomi). "Is it real time" means
  `timeControl.clockSettings`.

## Scoring and KataGo (scoring.md)

- **OGS's autoscore:** it uses two KataGo ownership maps (Black to move and White to move). It
  removes stones above 0.7 ownership and flags points below 0.3 as needing sealing.
  - goscorer counts territory or area, with seki, once the dead stones are marked.
  - goban's 31 autoscore test games make a regression set, not an accuracy benchmark: their
    expected results came from the same maps.
  - Grade autoscore's raw result, not goscorer's `owner`, which marks territory only under Japanese rules.
  - autoscore changes the board it is given: always pass a copy.
- KataGo's multi-threaded search is not deterministic: store the proposal players saw, and recount only with goscorer.
- KataGo's analysis engine takes `"(x,y)"` locations, top to bottom, in the same order as its ownership map.
- goban-engine's Chinese handicap compensation gives 1 point for a 1-stone handicap: clamp
  handicaps below 2 to 0 before `computeScore`.
- KataGo speed on CPU: about 140 visits/s with the small test network on 4 cloud vCPUs. That is
  fine for tests, not for reviewing games; a GPU uses OpenCL.
- **Pub/sub listeners:** probe them with `null`, `[]` and a bare number as well as broken JSON.
  An uncaught throw in an ioredis listener takes the whole process down.
- When a game-ending move becomes resumable (the second pass opens scoring), recheck every
  end-of-game flag: clock activity, increments, byo-yomi period resets.

## Ratings (ratings.md)

- OGS uses Glicko-2 with rank = ln(rating/525) × 23.15, and handicap shifts each player's
  effective rank. That means two calculator calls per game; scalachess's colour advantage doesn't fit.
- scalachess's Glicko-2 (MIT) with tau 0.5 and no step-6 skip reproduces OGS's goratings to six
  decimals. lila itself runs tau 0.75.
- goratings' maths is in `analysis/util/RatingMath.py`, not its package.
- The "?" threshold for provisional ratings is a scalachess constant, not a lila one.
- "Has played a rated game" must exclude aborted and never-started games.

## The lobby (lobby.md)

- The pain LiGo set out to fix is OGS's confusing lobby: hard to read and filter, and hard to see
  which games suit you.
- lila hides open games you can't join on the server, not in the browser. Since LiGo shows them
  greyed out, anything acting on a player's pick must check `Biter.canJoin` before changing state.
- lila's pool score takes the smaller miss bonus of the pair, caps at the lower rating, and has a
  400-point miss ceiling.
- On 9×9 one handicap stone covers six ranks, so the ranks a player can meet come in separate runs.

## Puzzles (tsumego.md)

- Modern tsumego books are copyrighted, and sanderland/tsumego is MIT for its code only.
  Public-domain classics are safe only as your own transcriptions from original sources, because
  UK/EU database right can protect modern collections. That's why LiGo generates its own puzzles (ADR 0024).

## Tooling, cloud sessions and CI (tooling.md, ratings.md)

- **Cloud sessions:**
  - They install no plugins and keep no memory between machines: everything that matters must be committed.
  - The machine is 4 vCPU, 16 GB and 30 GB of disk.
  - The network allowlist blocks several hosts lila needs. Maven Central throttles, so the build
    uses Google's mirror, cross-checked against Central's checksums (ADR 0008).
  - Containers there can't use the egress proxy, which is why the cloud runs in native mode (ADR 0010).
  - Public GitHub repos can be git-cloned when tarballs and the API are refused.
- **sbt 2:** it keeps a server holding about 9 GB after a compile, so stop it before running the site.
  - Play's dev `run` needs stdin kept open.
  - `~/.sbt/repositories` overrides a build's resolvers.
- **Running dockerd from a script:** detach it fully (`setsid nohup … </dev/null &`) and have
  the child write its own pid.
- **Upstream tooling assumes `lila/` is its own git repo:** mount the monorepo's `.git` read-only
  and set `GIT_DIR`.
- **Claude Code:**
  - It reloads `.claude/settings.json` while running. Permission precedence is deny > ask > allow.
  - The cloud safety check stops Claude loosening its own permissions: the owner edits that file himself.
  - Agents must use absolute paths and never run tools that install git hooks or global state.
- **KataGo's Linux binaries are AppImages:** unpack them with `--appimage-extract`, since containers have no FUSE.
- **Playwright:** lila's pinned version wants a newer Chromium than the cloud ships, so point it
  at `/opt/pw-browsers/chromium`.
- **Linting:** CI's `oxlint --type-aware` catches type rules that plain oxlint misses.
- **Shell:** a comment starting with the word "shellcheck" is read as a shellcheck directive.
