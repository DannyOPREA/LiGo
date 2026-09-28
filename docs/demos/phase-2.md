# Phase 2 demo: the board in the playground

Phase 2's acceptance (docs/PLAN.md §5): **you play both colours in the playground on your phone and
desktop, and the visual snapshots pass.** CI already runs the snapshots and a scripted game on every
pull request that touches lila's ui (the `ui` job; unit 2.4). This checklist is the part only you can do.
It takes about 15 minutes.

## 1. Start the site (Fedora box)

```sh
cd ~/"VScode Projects/LiGo"
dev/ligo compile ui
dev/ligo up
```

Open http://localhost:8080/playground. You should see a 9×9 board, a side panel with
prisoner counts, "Black to play.", Pass and Undo buttons, and a New game form.

## 2. Desktop

- [ ] Play a few moves for both colours by clicking. Each click plays a stone at once, and the
      turn line changes to "White to play." and then back to "Black to play.".
- [ ] Capture a stone (for example Black B9, White A9, Black A8). The captured stone disappears
      and "Black prisoners" goes up by one.
- [ ] Click an occupied point. Nothing happens.
- [ ] Press Undo. The last move comes off, and a capture's prisoner goes back.
- [ ] Press Pass twice. The page says "Both players passed…"; you can then carry on playing.
- [ ] Use New game to start a 19×19 game with a 4-stone handicap. Four black stones sit on the
      star points and it is White's turn. Then try 13×13: its handicap choice is greyed out
      (even games only, for now).
- [ ] Make the window narrow. The panel moves under the board and the board shrinks to fit.

## 3. Preferences: "Confirm moves"

- [ ] Sign in (or create a local account), open Preferences, then Game behaviour. Set
      "Confirm moves" to **Always**.
- [ ] Back on /playground, a click now shows a preview stone with a "+" and a Confirm move button
      becomes active. Confirm move plays the stone. Clicking the preview again takes it back.
- [ ] Set it back to **On touch screens**. On the desktop, clicks play at once again.

## 4. Your phone

The phone must be on the same Wi-Fi as the box. Find the box's address with `hostname -I`
(the first number, e.g. `192.168.1.20`). Restart the site so its pages point at that address
rather than at `localhost`, which on the phone would mean the phone itself:

```sh
dev/ligo down
LILA_DOMAIN=192.168.1.20:8080 LILA_URL=http://192.168.1.20:8080 dev/ligo up
sudo firewall-cmd --add-port=8080/tcp   # Fedora's firewall; lasts until the next reboot
```

On the phone, open `http://192.168.1.20:8080/playground` (with your address).

- [ ] The board fills the screen's width, and the panel sits under it.
- [ ] A tap shows a preview stone, and **Confirm move** plays it (touch screens confirm by default).
      Tapping somewhere else moves the preview.
- [ ] Play both colours to a capture, then Undo, Pass and New game as on the desktop.
- [ ] Afterwards, run `dev/ligo down` and then `dev/ligo up` without the two settings, so the site
      goes back to `localhost`.

If the phone can't reach the page, Chrome's device toolbar on the desktop (F12, then the phone
icon, then choose a phone with touch) is a fallback. It isn't a real finger, though.

## 5. Snapshots

- [ ] On the pull request, the `ui` check is green. It includes "Playground screenshots and
      scripted game".
- [ ] Optional, on your box: `dev/ligo test pages` runs the same tests natively. In docker mode
      they're skipped because the ui container has no Chromium, so CI is the one that counts.
      The pictures they compare against are in
      `lila/ui/playground/e2e/__screenshots__/`. Open a few to see what "correct" looks like.

## What to tell Claude

"Phase 2 demo passed", or what went wrong, with the step number and a screenshot.
