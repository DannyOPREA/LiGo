# Phase 5 demo: Go ranks and rated games

Phase 5's acceptance (docs/PLAN.md §5, unit 5.8): **a 5k and a 1d sign up with those ranks, play a
rated 19×19 handicap game to resignation, and both ratings move as the rating maths (unit 5.2)
predicts; a guest plays a casual game and can't choose rated.** The `e2e` workflow plays it every
night and on any pull request labelled `e2e` (lila/tests/e2e-demo/phase5-demo.spec.ts). This
checklist is the same thing by hand. It takes about 20 minutes.

## 1. Start the site (Fedora box)

```sh
cd ~/"VScode Projects/LiGo"
git pull
dev/ligo up
```

Use two different browsers (for example Firefox and Chrome, or one normal and one private window),
so the site sees two players.

## 2. Two new players

- [ ] In the first browser, open http://localhost:8080/signup. Pick a username and password, and
      choose **5 kyu** as your rank. Tick the three boxes and sign up.
- [ ] In the second browser, sign up the same way with **1 dan**.
- [ ] Open each player's profile. The 5k shows "5k?" beside the name and under Go; hold the mouse
      over it to see the rating, 1579. The 1d shows "1d?" (1960). The "?" means the rating is still
      provisional: it settles after a few games.

## 3. A rated handicap game

- [ ] As the 1d, open the 5k's profile (http://localhost:8080/@/ and the 5k's username) and press
      the **Challenge** button (crossed swords). A "Challenge" dialog with the 5k's name opens. Choose **19×19**, **Chinese** rules, a **5+3**
      clock and **Rated**.
- [ ] The dialog says "Suggested for your ranks: 5 handicap stones". Choose 5: komi becomes 0.5
      and it says "You play White."
- [ ] Choose 7 stones instead: it says a rated game between you has 4 to 6 handicap stones, or
      none, and won't create it. Go back to 5.
- [ ] Choose **Unlimited** time instead of the clock: **Rated** greys out and switches itself to
      Casual (a rated game needs a clock). Put the 5+3 clock back, choose **Rated** again, and send
      the challenge.
- [ ] As the 5k, accept the challenge (it shows under the crossed swords at the top of any page). Both
      browsers open the game: "Rated", 19×19, Chinese, five black stones on the board, and White
      (the 1d) to play.
- [ ] Play **at least 20 stones each**. Shorter games between two brand-new accounts on the same
      network don't move ratings: that's lichess's guard against people boosting a new account
      against a second one of their own.
- [ ] As the 1d, resign. Both browsers say "Black is victorious" with "B+R".
- [ ] The game page shows +116 beside the 5k and −118 beside the 1d. The 5k's rating is now
      **1695** and the 1d's **1842**: the numbers goratings, the maths behind OGS's ranks, gives for
      this exact game (lila/modules/rating/src/test/resources/goRatingCases.json). The profiles now
      say "3k?" and "1k?", with "1 game" under Go.

## 4. A guest can't play rated

- [ ] Open a private window without signing in. On the home page press **Create a game**. There is
      no Rated button, only a "Sign up to play rated games" link.
- [ ] Create a 9×9 game. In another browser (signed out too), join it from **Open challenges**.
      The game page says "Casual". Play one stone each (before that you can only abort), then
      resign from one side: no rating changes.

## 5. Optional: the automated demo

It needs host Node 24 and pnpm, and `pnpm install --frozen-lockfile` once in `lila/` (as the
KataGo bench in docs/STATUS.md does), then with the site up:

```sh
dev/ligo e2e demo
```

It runs the Phase 3 and Phase 5 demos, desktop and phone, and should end with "6 passed". It signs
up four players; the site allows 10 sign-ups from one address in 10 minutes, so wait 10 minutes
before running it a third time.

Tell Claude in the Phase 5 thread anything that looked wrong, with a screenshot if you can.
