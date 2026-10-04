# Lobby research

LiGo's main bet is the lobby. The pain it set out to fix is OGS's lobby: hard to read and filter,
and it's hard to see which games suit you. The lobby LiGo built (ADR 0022) is lichess's: one-click
quick pairing into seven pools, with handicap set automatically from the players' ranks. Below
that are open challenges shown with the games that suit you first and the others greyed out. The
player test checks whether that is easier for real Go players than OGS's lobby.

## The test kit (ready)

The kit is in [`docs/research/lobby-test/`](../research/lobby-test/) (unit 6.3). The method is ADR
0022 §8:

- At least three Western Go players who have used OGS, a mix of kyu and dan, none who worked on LiGo.
- Each does the same four tasks on OGS and on LiGo, thinking aloud, with the starting site
  alternating between participants:
  1. Start a quick 19×19 game at your level.
  2. Join an open game that suits you, and say why.
  3. Create a custom game: 19×19, Chinese rules, 10 minutes plus five 30-second byo-yomi periods,
     casual, even.
  4. Challenge a named player to a 9×9 game.
- Each task is timed and rated from 1 (very difficult) to 7 (very easy). There are closing
  questions, and no recordings or real names are kept.

| File | What it's for |
|---|---|
| [README.md](../research/lobby-test/README.md) | Recruiting, the one-off set-up (accounts, the helper's games), what happens after |
| [protocol.md](../research/lobby-test/protocol.md) | The session script, with the four tasks word for word |
| [consent.md](../research/lobby-test/consent.md) | What each participant is told and agrees to |
| [notes-template.md](../research/lobby-test/notes-template.md) | One copy per participant |

## The findings (later)

The test can run now that unit 6.10, the lobby demo, has merged (2026-10-04). It hadn't been run
when this was written. Once the notes are in, `docs/research/lobby-test/results.md` will set out:

- the timings and ease ratings side by side;
- the problems more than one person hit;
- quotes;
- a proposed unit per finding.

This page then gains a summary. Changes to the lobby presets would become a new ADR superseding ADR 0005.

The kit and its findings are LiGo's own work under MIT, written to be useful to OGS whatever happens to LiGo.
