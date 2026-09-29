# dev/lila-docker

A trimmed copy of lichess's official dev environment,
[lichess-org/lila-docker](https://github.com/lichess-org/lila-docker), at commit
`cbba92c7f59bc7a95f4d1d8b177b0228349bc337` (2026-09-26). `dev/ligo` drives it; you shouldn't
need to call `docker compose` yourself.

Licence: AGPL-3.0, as upstream ships it (no "or later"); see [`COPYING.md`](../../COPYING.md) §1.
Decision: [ADR 0010](../../docs/decisions/0010-dev-tooling-on-lila-docker.md).

## What's here

| File | From upstream | LiGo changes |
|---|---|---|
| `compose.yml` | `compose.yml` + `compose-lila-ws-build.yml` | See below |
| `compose.native.yml` | (new) | Mongo + Redis only, for native mode in cloud sessions |
| `docker/sbt.Dockerfile`, `docker/ui.Dockerfile` | same paths | none |
| `conf/lila.conf` | same path | header; firebase `jsonPath` and `swiss.bbpairing` commented out (neither is set up); `net.site.name` override removed so `lila/conf/base.conf` sets the brand (unit 0.7) |
| `conf/lila-ws.conf` | same path | none |
| `conf/Caddyfile` | same path | header; removed the picfit (`/display`) and opening-explorer routes |
| `scripts/replica-set.js` | same path | none |
| `static/errors/502.html` | same path | none |

`compose.yml` changes from upstream:
- Paths point at LiGo's `../../lila` and `../../lila-ws` instead of `./repos/…`.
- Compose project name `ligo` and network `ligo-network`, so it can't clash with a real lila-docker.
- lila-ws is **built from our source** (upstream's optional `lila-ws-build` variant) instead of
  lichess's prebuilt `ghcr.io/lichess-org/lila-ws` image, because LiGo will change lila-ws.
- Mongo keeps its data in named volumes (`mongo-data`, `mongo-secondary-data`), so `dev/ligo down`
  doesn't lose the database.
- The `ui` service mounts the monorepo's `.git` read-only and points `GIT_DIR` at it: `ui/build`
  runs `git rev-parse HEAD`, and `lila/` isn't a git repo of its own here.
- `depends_on` added so lila and lila-ws start after Mongo and Redis.
- No `profiles: base`: the core services always start. `ui` stays in the `utils` profile.
- Dropped services LiGo doesn't use: the opening explorer, the one-container `mono` quick setup,
  API docs, chessground, pgn-viewer, external engine, fishnet (Stockfish), lila-gif, push,
  picfit, mailpit, search (Elasticsearch), monitoring, and the Python seeding container.
- Added `scoring`: LiGo's own service, not in upstream lila-docker at all. Runs
  `services/scoring`'s Redis worker (unit 4.5) using the `ui` service's own Node image/pattern, with
  `lila`/`libs`/`services` all `:z`-mounted so pnpm workspace resolution works; no `profiles:`, so
  it starts by default like the core services. It has no KataGo env in this container (no OpenCL
  passthrough to the owner's GPU, no binary staged into an image), so every `propose` there answers
  `src:"none"` (ADR 0020 §4's fallback) until a later unit gives docker mode a KataGo story.

Not copied: the Rust setup dialog (`command/`) and the `lila-docker` script, whose job `dev/ligo`
does non-interactively; database seeding (`lila-db-seed` makes chess data, so LiGo will need its
own seed later); devcontainer, VS Code and Windows files.

## Updating from upstream

Diff upstream's files at a newer commit against the table above, port what's relevant, update the
commit here and in `docs/UPSTREAM.md`, and log it in `logs/tooling.md`.
