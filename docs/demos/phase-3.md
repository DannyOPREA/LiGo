# Phase 3 demo: a whole Go game on the real site

Phase 3's acceptance (docs/PLAN.md §5, unit 3.20): **two browsers play a casual 9×9 Fischer game
from the lobby to a resignation, at desktop and phone sizes.** The `e2e` workflow plays it every
night and on any pull request labelled `e2e` (lila/tests/e2e-demo). This checklist is the part only
you can do: the same game by hand, on your box and your phone. It takes about 15 minutes.

## 1. Start the site (Fedora box)

```sh
cd ~/"VScode Projects/LiGo"
git pull
dev/ligo up
```

Open http://localhost:8080 in two different browsers (for example Firefox and Chrome, or one normal
and one private window), so the site sees two players. You don't need an account.

## 2. Desktop

- [ ] In the first browser, press **Create a game**. Choose **9×9**; keep the 5+3 clock. The
      dialog says guests play casual games and offers sign-up for rated ones. Press **Create**.
- [ ] In the second browser, open **Open challenges**. Your game is there as "9×9 · 5+3 · Casual".
      Click it.
- [ ] Both browsers open the same game. Each shows a 9×9 board, both clocks, both players online,
      and "5+3 • Casual • 9×9 • Japanese • komi 6.5".
- [ ] Play a few stones each. Each stone appears at once in the other browser, and the clocks
      take turns running.
- [ ] Capture a stone. It disappears on both boards.
- [ ] In one browser press the resign flag, then confirm. Both browsers show the other player as
      victorious, with "B+R" or "W+R".

## 3. Your phone

As in docs/demos/phase-2.md §4: restart the site with your box's address and open the port,
then on the phone open `http://<your address>:8080`.

- [ ] Join a game the desktop created (or create one and join it from the desktop).
- [ ] The board fills the screen's width. A tap shows a preview stone and **Confirm move**
      plays it.
- [ ] Play a few stones each, then resign from the phone. Both sides show the result.
- [ ] Afterwards, run `dev/ligo down` and then `dev/ligo up` without the two settings.

## 4. Optional: the automated game

It needs host Node 24 and pnpm, and `pnpm install --frozen-lockfile` once in `lila/` (as the
KataGo bench in docs/STATUS.md does), then with the site up:

```sh
dev/ligo e2e demo
```

It should end with "2 passed" (desktop and phone).

Tell Claude in the Phase 3 thread anything that looked wrong, with a screenshot if you can.
