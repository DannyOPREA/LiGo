# Upstream tracking

LiGo is a hard fork ([ADR 0001](decisions/0001-fork-current-lila.md)). This file records exactly
what we forked and every upstream change we port later. The `upstream-scout` agent reads it monthly.

## Pinned snapshots

| Upstream | Repo | Pinned SHA | Date | Imported into |
|---|---|---|---|---|
| lila | https://github.com/lichess-org/lila | _set in unit 0.2_ | | `lila/` |
| lila-ws | https://github.com/lichess-org/lila-ws | _set in unit 0.2_ | | `lila-ws/` |

## Reused libraries (tracked for fixes)

| Library | Repo | Version | Used in |
|---|---|---|---|
| _added as each component is adopted_ | | | |

## Ported upstream commits

| Date | Upstream | SHA | What | LiGo PR |
|---|---|---|---|---|
