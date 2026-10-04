# Phase 4 demo: a Go game from the first stone to the result

Phase 4's acceptance (docs/PLAN.md §5, unit 4.12): **two players play a 19×19 Japanese byo-yomi
game that ends with an accepted count, and a disputed game that resumes and then ends; the SGF
opens in Sabaki; the scoring benchmark passes on your GPU.**

The `e2e` workflow plays two such games in two real browsers every night and on any pull request
labelled `e2e` (lila/tests/e2e-demo/phase4-demo.spec.ts, desktop and phone). CI also plays two as a
script on every pull request that touches lila, the scoring service or the board: lila plays them through the scoring phase, the scoring service answers lila's
real messages, and goban-engine reads lila's SGF back to the same final position
(`libs/conformance/demo/phase-4/`, its README says how). This checklist is the part only you can
do: the real site, two browsers, Sabaki and your GPU. It takes about 30 minutes.

## 1. Start the site (Fedora box)

```sh
cd ~/"VScode Projects/LiGo"
git pull
dev/ligo up
dev/ligo status
```

`dev/ligo status` should show lila, lila-ws and the scoring worker running.

## 2. Two players

- [ ] In your normal browser, sign in (or sign up) as player A.
- [ ] In a private window (or a second browser), sign up as player B. A new local account needs its
      email confirmed: the site sends no mail, so find the link with `dev/ligo logs lila`.

## 3. Game 1: a byo-yomi game that ends with an accepted count

- [ ] As A, open **Challenge a friend**. Choose board size 19×19, rules **Japanese**, komi 6.5, and
      the **Byo-yomi** time control: 10 minutes, then 5 periods of 30 seconds. Casual. Send the link to
      B (paste it into the private window) and accept there.
- [ ] Both clocks show the main time and "+5×30s" beside it (the periods still to come). Play a short game: a few stones each, a
      capture if you like.
- [ ] Let one player's main time run down into byo-yomi (set the main time to 1 minute if you'd
      rather not wait). The clock shows the period counting down and the periods left; moving in
      time gives the period back in full. The label then shows the periods left, such as "5×30s".
- [ ] Both players pass. The board turns into the scoring board: "Counting…" briefly, then the
      proposed dead stones (crossed out), each side's territory and the live score. The clocks stop.
- [ ] Both press **Accept**. The game ends with a result such as `B+12.5`, shown on both sides.

## 4. Game 2: a dispute that resumes

- [ ] Start another game the same way. Play until White has a stone inside Black's area that
      isn't really dead yet, then both pass.
- [ ] As Black, tap White's stone: it is marked dead and the score changes for both players.
      Black presses **Accept**.
- [ ] As White, press **Resume** instead. Play goes back to the board with Black to move, the marks
      are gone and both clocks run again with the time each player had.
- [ ] Capture the stone in play, then both pass again. A second count appears; both accept, and
      the game ends with the result.
- [ ] Optional: in a third game, pass twice and let the scoring board sit for 3 minutes without
      accepting. The game ends by itself with the count on show.

## 5. The SGF in Sabaki

- [ ] Take game 2's id from its address (the 8 characters after `localhost:8080/`), and open
      `http://localhost:8080/game/export/<id>?format=sgf`. Save the file as `game2.sgf`.
- [ ] Open it in [Sabaki](https://sabaki.yichuanshen.de/). The players, the date, the rules
      (Japanese), komi 6.5, the time (10 minutes, 5 × 30 s byo-yomi) and the result show in Game
      Info; stepping to the end shows the final position, including the resume (two passes, then
      play goes on).
- [ ] Also open the scripted games CI plays: `libs/conformance/demo/phase-4/game1.sgf` (B+12.5) and
      `game2.sgf` (B+8.5).

## 6. KataGo on your GPU

These give the scoring service KataGo's full-size network and check autoscore's accuracy (unit 4.6).

```sh
dev/ligo katago install opencl   # should say the network checksum is verified
dev/ligo katago smoke
dev/ligo katago bench
LIGO_MODE=native dev/ligo scoring bench --gate 97
```

- [ ] The last command ends with a pass at ≥ 97%. It runs on the host, so it needs Node 24 and
      pnpm there, and `pnpm install --frozen-lockfile` once in `lila/`.
- [ ] Optional, native mode only (docker mode's scoring service has no KataGo yet, so its
      proposals mark nothing dead): `dev/ligo down`, then `LIGO_MODE=native dev/ligo up`, and replay
      game 2 (section 4). The first proposal should already mark White's lone stone dead, and
      `dev/ligo logs scoring` shows `"src":"katago"` in the answer.

## If something is off

Tell Claude in the "Plan Phase 4 units" thread what you saw (a screenshot helps), and paste the
output of `dev/ligo logs lila` and `dev/ligo logs scoring` around that time.
