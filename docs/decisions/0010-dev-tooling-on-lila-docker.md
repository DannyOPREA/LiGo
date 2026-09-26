# 0010. Dev tooling on a trimmed copy of lila-docker, with a native mode for cloud sessions
- Status: Accepted
- Date: 2026-09-26
- Decided by: owner, on Claude's recommendation

## Context
PLAN §5 chose lichess's official dev environment, [lila-docker](https://github.com/lichess-org/lila-docker),
over plain docker compose. Upstream lila-docker assumes a different layout from LiGo's monorepo:
- it clones lila, lila-ws and friends into its own `repos/` folder;
- a Rust program asks setup questions interactively and writes `settings.env`;
- by default it runs lichess's **prebuilt** lila-ws image, not a lila-ws built from source;
- it runs sbt inside containers, which cloud sessions can't do well: Maven Central throttles the
  session's egress, and containers don't get ADR 0008's mirror setup or the proxy's certificate.

Unit 0.2 proved the other route in cloud sessions: sbt and pnpm on the host, Mongo in Docker.

## Decision
1. **Trimmed copy.** Keep a pinned, trimmed copy of lila-docker's compose file, Dockerfiles and
   configs in `dev/lila-docker/`, pointed at `../../lila` and `../../lila-ws`, with lila-ws built
   from our source. Every difference from upstream is listed in `dev/lila-docker/README.md` and
   the pinned commit is in `docs/UPSTREAM.md`. The Rust dialog and the `lila-docker` script are
   not copied; `dev/ligo` does their job non-interactively.
2. **One command, two modes.** `dev/ligo` has the same commands in both modes:
   - **docker** (default on your own machine): everything in containers, like lila-docker;
     site on `http://localhost:8080`.
   - **native** (default in Claude Code cloud sessions): sbt and pnpm on the host, only Mongo and
     Redis in Docker (`compose.native.yml`); site on `http://localhost:9663`.
   `LIGO_MODE=docker|native` overrides the default.
3. **Cloud setup** is split: `dev/cloud-setup.sh` (the environment's setup script) installs
   machine-level tools and ADR 0008's dependency sources; `dev/ligo deps` does the repo-level
   part (sbt update, the mirror cross-check, frozen pnpm install with the ab-stub workaround), so
   it can be rerun in any session. `dev/ligo` reruns the mirror cross-check after every sbt
   command in cloud sessions, so dependencies added later are checked too.

## Consequences
- Your Linux box needs only Docker for docker mode; `dev/ligo doctor` also reports the JVM and
  Node tools, which native mode, editors and Claude's hooks use.
- Updating from upstream lila-docker is a manual diff against a short table, not a merge.
- Both modes use the same Mongo and Redis versions as upstream lila-docker.
- Docker mode was validated in the cloud only as far as the cloud allows (see logs/tooling.md);
  the owner's run on the Linux box is its real test.

## Alternatives considered
- **Clone lila-docker at a pinned commit on demand** and override it with symlinks and an extra
  compose file: less in the repo, but the setup dialog, `repos/` layout and prebuilt lila-ws image
  all need overriding anyway, and the result is harder to review.
- **Plain docker compose written from scratch**: rejected in PLAN §5 (reuse first).
- **Docker mode in cloud sessions too**: containers would need the proxy certificate and mirror
  configuration injected; more moving parts than the host route unit 0.2 proved.
