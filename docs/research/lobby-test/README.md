# Lobby player test: LiGo vs OGS

The kit for PLAN §4's player test: at least three Western Go players do the same four tasks in
OGS's lobby and in LiGo's, thinking aloud, so we learn whether LiGo's lobby is easier to read and
use. The method is [ADR 0022](../../decisions/0022-phase-6-lobby-pools-handicap-challenges.md) §8.
It is written so the findings are useful to OGS whatever happens to LiGo.

**When:** after unit 6.10's demo works on your machine. Nothing here needs doing before then.

## What's in the kit

| File | What it's for |
|---|---|
| [protocol.md](protocol.md) | The session script you follow: set-up, the four tasks word for word, what to note, the closing questions |
| [consent.md](consent.md) | What you tell each participant and ask them to agree to, before starting |
| [notes-template.md](notes-template.md) | Copy once per participant (`P1.md`, `P2.md`, …) and fill in during the session |

## Before the first session (about 30 minutes, once)

1. Recruit at least 3 people who play Go, live in or learned Go in the West, and have used OGS at
   least once. A mix of kyu and dan players helps; nobody who has worked on LiGo.
2. On your machine: `dev/ligo up`, then create two LiGo accounts for yourself (the "helper" and the
   "named player", signed up at about 5k and 1d) and one account per participant, signed up at the
   participant's own rank (ask them for it).
3. Make sure each participant has an OGS account (their own is fine).
4. Decide how they reach LiGo: sharing your screen and handing them control, or a laptop on the
   same network ([phase-2.md §4](../../demos/phase-2.md) explains reaching the site from another device).
5. Decide the order: P1 and P3 start with OGS, P2 starts with LiGo (then alternate for any more).

## After the sessions

1. Put each filled-in notes file in this folder as `P1.md`, `P2.md`, … (no real names, no contact
   details, no recordings).
2. Tell Claude in the project that the notes are in. Claude writes `results.md` (the timings and
   ease ratings side by side, the problems seen by more than one person, quotes) and turns each
   finding into a proposed unit. Changes to the lobby presets become a new ADR superseding ADR 0005.
