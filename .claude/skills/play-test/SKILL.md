---
name: play-test
description: Plays a scripted two-player game (or another UI scenario) in real browsers against the running LiGo stack and saves screenshots for the PR. Use for any unit that changes the UI or game flow, and when asked to check that the site works.
argument-hint: "[scenario]"
---

# /play-test [scenario]

1. Make sure the stack runs: `dev/ligo status`, else `dev/ligo up` (slow the first time), then
   `dev/ligo e2e` for the smoke check.
2. Scenario: $ARGUMENTS, or the unit's acceptance criteria. For a game: two players in two
   isolated browser contexts (two signed-in users: sign up two test users, or use seeded dev users if the database has them), create a game from the
   lobby, play the moves, reach the end state.
3. Drive it either with the Playwright MCP tools (interactive, good for exploring) or, for
   something repeatable, as a spec in lila's Playwright suite run by `dev/ligo e2e -- <spec>`.
   Wait for conditions, never sleep.
4. Screenshot the key moments at desktop width and at phone width (390×844). Save them under
   `.claude/state/play-test/<unit>/` and attach the important ones to the PR.
5. Report what you saw, step by step, including anything odd; odd behaviour is a finding, not a
   footnote.
