# @ligo/scoring

What this package does, in plain English: after two players pass, LiGo needs to say which stones
are dead, whose territory each empty point is, and the final score. This package does that
scoring, the same way OGS does it: it asks KataGo (a Go-playing AI) what it thinks of the position,
picks out the stones that are clearly dead, and counts the result under Japanese or Chinese rules.
It has no server of its own yet — no Redis, no long-running process (that's a later unit) — just
the scoring logic itself, callable as a function or from a small command-line tool.

See [CLAUDE.md](CLAUDE.md) for the engineering rules (what never to change, why); this file is
about running and testing it.

## How it works

1. **Board in, board only.** lila sends the *final* position (after both passes), not the list of
   moves: this package never replays a game, so it can never disagree with the server's own Go
   rules about how the game got there.
2. **`propose`**: for a fresh game just entering the scoring phase, this package asks KataGo twice
   (once assuming Black moves next, once assuming White does) for its read of the position, then
   runs OGS's `autoscore` algorithm on the two answers to pick out the stones that are almost
   certainly dead. If KataGo isn't available (not installed, crashed, or too slow — 30 seconds),
   it answers anyway with nothing marked dead, so players can mark stones by hand instead.
3. **`count`**: given a set of stones the players have agreed are dead (from a fresh proposal, or
   after they've toggled some), this package counts the score. This half needs no AI at all — it's
   a deterministic algorithm (`goscorer`, bundled in `goban-engine`), so the same input always
   gives the same answer.
4. Either way, the answer is: which stones are dead, which points still look unsettled and may
   need another move, who owns each point, and the score for each side (territory, stones,
   prisoners, komi, any handicap compensation, and the total).

## Running it

There's no server yet, just a function (`handle`, in `src/handle.ts`) and a tiny CLI that reads one
request as JSON on stdin and prints the reply:

```sh
cd lila && pnpm --filter @ligo/scoring run cli <<'EOF'
{"t":"propose","ref":"g:1:1","size":9,"rules":"c","komi":7.5,"handicap":0,
 "board":"9/9/9/2bbbbb2/2wwwww2/9/9/9/9","prisoners":{"b":0,"w":0}}
EOF
```

Without `KATAGO_BIN`/`KATAGO_MODEL`/`KATAGO_CONFIG` set (see `src/cli.ts`'s comment), `propose`
always answers with nothing marked dead — useful for trying the counting side without installing
KataGo. `dev/ligo katago install` sets up KataGo; `dev/ligo katago env` prints the pieces this
package's env vars need (its `KATAGO_GTP_CONFIG` is for a different KataGo mode, not this one — the
analysis config lives next to the installed binary, see `src/cli.ts`).

## Testing it

`dev/ligo test scoring` runs everything (typecheck, lint, and the test suite: `node --test`, no
build step). The test suite includes:

- **OGS's own 31-game regression set**: real finished games from OGS, with KataGo's stored
  analysis of each and the expected dead-stone answer. All 31 must match.
- **LiGo's rules fixtures** (`libs/conformance/`): the same test cases the server's and the
  browser's Go rules engines use, replayed through this package's counting path.
- **Unit tests** for the board format, widening dead stones to whole chains, the KataGo client
  (using a fake `katago` program, so these run without KataGo installed), and the handicap rule.
- **One real-KataGo test**, only when KataGo is actually installed (`dev/ligo katago install`);
  skipped otherwise rather than failing.
