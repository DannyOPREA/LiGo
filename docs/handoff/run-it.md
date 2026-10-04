# Run LiGo from a fresh clone

One command drives everything: `dev/ligo` (run `dev/ligo help` for the full list). It works in
two modes with the same commands:

| Mode | Where | What runs where | Site |
|---|---|---|---|
| **docker** | the default on your own machine | everything in containers, via `dev/lila-docker` (a trimmed copy of lichess's lila-docker, ADR 0010) | http://localhost:8080 |
| **native** | the default in Claude Code cloud sessions | lila, lila-ws and the build on the host; only Mongo and Redis in Docker | http://localhost:9663 |

Set `LIGO_MODE=docker` or `LIGO_MODE=native` to override. Run `dev/ligo mode` to see which one is in use.

## On your own machine (docker mode)

You need Docker with Compose, git, Python 3, at least 12 GB of memory (16 GB is comfortable) and
10 GB of free disk. lila's build alone needs about 12 GB.

```sh
git clone https://github.com/DannyOPREA/LiGo.git
cd LiGo
dev/ligo doctor        # checks the machine; in docker mode, missing host JDK/sbt/Node are only warnings
dev/ligo up            # the first run builds the browser code and compiles the server: it takes a while
```

Then open http://localhost:8080. `dev/ligo status` shows what is running and whether the browser
build is up to date. `dev/ligo logs lila` follows the server's log; new accounts' confirmation
links appear there, since the site sends no mail. `dev/ligo down` stops everything but keeps the
database. After a `git pull` that changes browser code, run `dev/ligo up` again; it rebuilds what is stale.

Notes:
- **Paths with spaces:** the scripts quote every path, so a clone under a path with spaces
  (`~/VScode Projects/LiGo`) works.
- **Fedora with SELinux:** bind mounts may need the `:z` option.
- **Your phone:** to reach the site from a phone on the same network, open port 8080 in the
  firewall (`docs/demos/phase-2.md` §4).

## In a Claude Code cloud session (native mode)

1. **Setup script, once per cloud environment:** paste [`dev/cloud-setup.sh`](../../dev/cloud-setup.sh)
   into the environment's Setup script box. It installs Node 24, pnpm, sbt 2, the dependency mirror
   settings (ADR 0008), the Mongo and Redis images, bats, shellcheck and KataGo's CPU build.
2. **Network allowlist** (`docs/CLAUDE_SETUP.md` §12.1): beyond the trusted defaults, the
   environment needs `jitpack.io`, `repo.scala-sbt.org`, `central.sonatype.com` and
   `codeload.github.com`. Add `media.katagotraining.org` too for the full-size KataGo network.
3. **In the session:**

   ```sh
   dev/cloud-setup.sh     # only if the Setup script box doesn't have it yet
   dev/ligo deps          # sbt update, the mirror cross-check, the frozen pnpm install
   dev/ligo up            # lila on :9663, lila-ws on :9664
   ```

   If `dev/ligo up` says the Docker daemon is not running, start it detached and try again:
   `setsid nohup dockerd </dev/null >/tmp/dockerd.log 2>&1 &`.

Cloud sessions can't show the site to you directly. Browser tests (`dev/ligo e2e demo`) play
games on it in Chromium instead.

## The KataGo network

KataGo suggests dead stones in the scoring phase and checks the puzzles. It is never committed:
binaries and networks live under `~/.local`.

```sh
dev/ligo katago install          # CPU build; on a GPU machine: dev/ligo katago install opencl
dev/ligo katago smoke            # one analysis query, checks an ownership map comes back
dev/ligo katago bench            # benchmark; on OpenCL the first run also tunes the GPU
```

`install` fetches KataGo's small test network everywhere. Outside the cloud it also downloads the
full-size b18 network (about 100 MB) from katagotraining.org. Its sha256 is pinned in
`dev/katago.sh`, so an unchecked network is never used silently. The network's licence is
MIT-style (checked 2026-09-29). Cloud sessions use the test network until
`media.katagotraining.org` is on the allowlist. To measure the dead-stone suggestions on your own
machine: `LIGO_MODE=native dev/ligo scoring bench --gate 97`. This needs Node 24 and pnpm on the
host, and `pnpm install --frozen-lockfile` once in `lila/`.

## Checking it works

- `dev/ligo e2e`: a smoke test of the running site (home page and the lobby's websocket).
- `dev/ligo e2e demo`: the demo games in two browsers (desktop and phone): a 9×9 game to
  resignation, two games through the scoring phase, and a puzzle walk.
- `dev/ligo test all`: every unit test suite. `dev/ligo test rules` runs only the two rules
  engines against the shared fixtures.
- The demo checklists in `docs/demos/` are what a person checks by hand.

## Don't

- Don't run a non-frozen `pnpm install`: it rewrites the lockfile.
- Don't run `sbt clean` in a cloud session: the rebuild is slow and memory-hungry.
- Don't run `lila/bin/deploy`: it is lichess's own production deploy.
