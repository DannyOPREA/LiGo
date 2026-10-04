# Phase 6 demo: finding a game in LiGo's lobby

Phase 6's acceptance (docs/PLAN.md §5, unit 6.10): **one click from the landing page to a game's
first move in under 10 seconds; a rated handicap pool game between a 5k and a 1d; an open challenge
accepted from the table; a custom game; a challenge from a profile; at desktop and phone sizes.**

The `e2e` workflow does all of it in real browsers every night and on any pull request labelled
`e2e` (lila/tests/e2e-demo/phase6-demo.spec.ts, desktop and phone), and prints the one-click time
("landing page to the first move: … ms"). This checklist is the part only you can do: the same on
your box and your phone, and then the player test. The checklist takes about 20 minutes.

## 1. Start the site (Fedora box)

```sh
cd ~/"VScode Projects/LiGo"
git pull
dev/ligo up
```

Use two browsers that don't share cookies (for example Firefox and Chrome, or a normal and a private
window), so the site sees two players.

## 2. One click, as a guest

- [ ] In browser A, signed out, open http://localhost:8080. The landing page shows the quick-pair
      tiles in three columns and the chip row; as a guest you see "Sign up to play rated games" in
      place of the Rated chip.
- [ ] Click the **9×9 3+2** tile. It shows that you're waiting, with the time going up and Cancel.
- [ ] In browser B, also signed out, open the same address and click the same tile. Count in your
      head (the automated demo measures the machine alone, with no thinking time): both browsers should open the same game, and Black's first stone be on the board, within
      10 seconds of B's page opening (B's own stone counts, if B is Black).
- [ ] Play a stone each, then resign from either browser (before both have moved, lila offers
      Abort instead).

## 3. A 5k and a 1d

- [ ] In browser A, sign up with rank **5k**; in browser B, sign up with rank **1d**. (If the site
      asks you to confirm your email, the link is in `dev/ligo logs lila`.)
- [ ] On the landing page both see **Rated** and **Handicap OK** pressed.

### A rated handicap pool game

- [ ] Both click the **19×19 5+5×10s** tile. Within a few seconds both open the same game:
      Rated, 19×19, komi 0.5, five black stones on the board, the 5k plays Black and White moves
      first.
- [ ] Play a stone or two each, then resign.

### A custom game, accepted from the table

- [ ] As the 1d, click the **Custom** tile. The window opens on "Anyone" with the presets on top.
      Pick **9×9 Blitz**, choose **Rated**, open **Advanced** and choose **Chinese** rules: the
      summary line follows what's inside (ruleset, komi, stones, rank range). Press **Create lobby
      game**. (With exactly a pool's settings and Rated, the window joins that pool instead, as
      lila does, and the game doesn't wait in Open challenges: that's why the demo changes the rules.)
- [ ] As the 5k, open **Open challenges**. The 1d's game is there, with the 1d's name and rank, 9×9,
      Chinese, Rated, and not greyed out. Click it: both open the same rated 9×9 game. Resign.

### A challenge from a profile

- [ ] As the 5k, open the 1d's profile (click their name anywhere) and choose **Challenge** (on a narrow
      window it's under **More**, or the ☰ menu). The window says "Challenge" and the 1d's
      name, and the opponent choice shows the 1d.
- [ ] Choose 19×19 and Rated. It says "Suggested for your ranks: 5 handicap stones", the stones
      are already set to 5 under Advanced, and "You play Black." Press **Send challenge**.
- [ ] As the 1d, accept it (from the notification, or by opening the challenge link). Both open a
      rated game with five black stones. Resign.

## 4. Your phone

As in docs/demos/phase-2.md §4: restart the site with your box's address and open the port, then on
the phone open `http://<your address>:8080`.

- [ ] The tiles fit the screen in one column without sideways scrolling, and the chips wrap.
- [ ] Do §2 with the phone as browser B: one tap on the tile, and the game opens in time.
- [ ] Sign in as the 5k on the phone and join a custom game the 1d creates as in §3: the open challenges are
      cards, and a tap on the 1d's card joins it.
- [ ] Afterwards, run `dev/ligo down` and then `dev/ligo up` without the two settings.

## 5. Optional: the automated demo

It needs host Node 24 and pnpm, and `pnpm install --frozen-lockfile` once in `lila/`, then with the
site up:

```sh
dev/ligo e2e demo phase6-demo
```

It should end with "4 passed" (two tests, desktop and phone) and print the one-click time for
each size. `dev/ligo e2e demo` alone runs every phase's demo. lila allows 10 sign-ups per 10
minutes from one address and a full run uses 9 of them, so wait 10 minutes between full runs
(the Phase 6 demo signs its 5k and 1d up once and signs in as them after that).

## 6. Then: the player test

With the demo working on your box, run the player test from
[docs/research/lobby-test/](../research/lobby-test/README.md): at least three Western Go players, the
same four tasks on OGS and on LiGo. Put the notes files in that folder and tell Claude in the Phase 6
thread; each finding becomes a unit (changes to the lobby presets get a new ADR superseding ADR 0005).

Tell Claude in the Phase 6 thread anything that looked wrong, with a screenshot if you can.
