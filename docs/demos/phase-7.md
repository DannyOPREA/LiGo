# Phase 7 demo: analysis, SGF and a correspondence game

Phase 7's acceptance (docs/PLAN.md §5, unit 7.8): **you import a pro game from SGF, explore it, add a
variation and export it; and two players finish a correspondence game: a move each, the
notifications seen, two passes and an accepted count.**

The `e2e` workflow plays this in real browsers every night and on any pull request labelled `e2e`
(lila/tests/e2e-demo/phase7-demo.spec.ts, desktop and phone). It signs two accounts up through the real
form, plays the correspondence game described in section 3, and imports an 1846 game (Shusaku against
Inoue Gennan Inseki, lila/tests/e2e-demo/fixtures/) at /paste, opens its analysis board, adds a variation
and reads the downloaded file back through goban-engine. This checklist is the part only you can do: your
browser, your eyes, Sabaki. It takes about 30 minutes.

## 1. Start the site (Fedora box)

```sh
cd ~/"VScode Projects/LiGo"
git pull
dev/ligo up
dev/ligo status
```

`dev/ligo status` should show lila, lila-ws and the scoring worker running. The site is at
http://localhost:8080.

## 2. Import a game, explore it, add a variation, export it

Get the game: `lila/tests/e2e-demo/fixtures/ear-reddening-1846.sgf` in your clone (Honinbo
Shusaku against Inoue Gennan Inseki, 1846, "the ear-reddening game", 325 moves; a game record from
1846, so in the public domain, no commentary).

- [ ] **2.1** Open http://localhost:8080/paste. Paste the file's text (or choose the file) and
      import it. You land on the game's page, a finished game with the players' names and the result B+2.
- [ ] **2.2** Open its analysis board (add `/analysis` to the game's address, such as
      `http://localhost:8080/<game id>/analysis`). The board and the move list show all 325 moves, Black "Yasuda Shusaku (4d)" and
      White "Inoue Gennan Inseki (8d)", result B+2.
- [ ] **2.3** The analysis board shows 19×19 and Japanese; the move list has 325 moves; the first is "1 R16".
      (The plain board at http://localhost:8080/analysis opens the same file with **Open SGF file**.)
- [ ] **2.4 Explore.** Click a move in the list: the board shows that position. Use the arrow keys (right and
      left step, Home and End jump to the start and the end). The last position is the end of the
      game, with the captured stones counted under the board.
- [ ] **2.5 Add a variation.** Click move 10, then click an empty point on the board (D16 will do).
      The stone appears, the move list shows a second line from move 10, and the original game is still the main line.
- [ ] Right-click (or long-press) the new move: the menu offers **Make main line** and **Delete from here**.
      Try **Make main line**: the new move becomes the main line and the old game the side line. (Reload the
      page to get the stored game back.)
- [ ] **2.6 Export.** Press **Download SGF** (the file is called `ligo-analysis.sgf`).
- [ ] **2.7 Sabaki.** Open that file in [Sabaki](https://sabaki.yichuanshen.de/). It shows the whole game with the
      players, the result B+2 and the variation at move 10 as a branch in the game tree.

## 3. A correspondence game with two accounts

You need two browsers (or one normal window and one private window): player A and player B.

- [ ] **3.1 Two accounts.** Sign up A in one and B in the other at http://localhost:8080/signup. (If a
      sign-up asks for an email confirmation, the site sends no mail: find the link with
      `dev/ligo logs lila`.)
- [ ] **3.2 Challenge.** As A, open B's profile and press the swords (Challenge to a game), or open
      `http://localhost:8080/?user=<B's name>#friend`. Choose board size 9×9 and the **Correspondence** tab
      (2 days per turn), Casual, and press **Challenge <B>**. A waits on the game's page.
- [ ] **3.3 Accept.** In B's window, the crossed swords at the top show a 1; open them, see the
      challenge ("Casual • 2 days • 9×9 ..."); point at it and press the tick that appears. Both windows now show the 9×9 board,
      and each clock shows days (for example "2 days") instead of minutes.
- [ ] **3.4 A move each.** Black plays a stone; the other window shows it, its tab title reads "Your turn"
      and the mover's tab "Waiting for opponent". White answers.
- [ ] **3.5 Two passes.** Black passes, White passes. Both windows turn into the scoring board with the
      count, **Accept score** and **Resume play**.
- [ ] **3.6 The countdown.** Under the count it says "1 day left to agree" (or "23 hours 59 minutes").
      Neither player's days clock is running (no highlighted clock) and the times don't move while you wait.
- [ ] **3.7 The tab title.** The browser tab's title in both windows starts with "Time to count the game".
- [ ] **3.8 The bell.** In both windows the bell at the top has a number. Open it: "Time to count the game,
      Game vs <the opponent's name>". (There is no bell entry for an ordinary move; lila only rings the
      bell at 80% of a player's time, and sends a push if you have turned those on.)
- [ ] **3.9 The lobby.** In a third tab, open http://localhost:8080/. The "now playing" row of
      the game says "Time to count the game", with the opponent's name.
- [ ] **3.10 Accept.** A presses **Accept score**: A's window says "You accepted this score. Waiting for your
      opponent", B's says "Your opponent accepted this score". Now A leaves the game page (open the lobby
      in the same tab). B presses **Accept score**. B's window shows the result (for example `W+6.5`) and
      the final count.
- [ ] **3.11 The bell again.** lila rings the bell at the end of a correspondence game only for a player who is
      not on the game page. A's bell has a new entry on top, "Game vs <B>" with "Congratulations, you won!" or
      "Defeat"; pressing it takes A to the finished game, showing the same result and count as B.
- [ ] **3.12 The SGF.** Open `http://localhost:8080/game/export/<game id>?format=sgf` (the 8 characters after
      `localhost:8080/`), save it as `corr.sgf` and open it in Sabaki: 9×9, the two stones, two passes and
      the result.
- [ ] Optional: start another correspondence game and press **Resume play** instead of accepting. Play
      goes back to the board, with the days clock running for the player to move.

## If something is off

Tell Claude in the "Plan Phase 7 units" thread what you saw (a screenshot helps), and paste the output
of `dev/ligo logs lila` around that time.
