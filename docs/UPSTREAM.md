# Upstream tracking

LiGo is a hard fork ([ADR 0001](decisions/0001-fork-current-lila.md)). This file records exactly
what we forked and every upstream change we port later. The `upstream-scout` agent reads it monthly.

## Pinned snapshots

| Upstream | Repo | Pinned SHA | Date | Imported into |
|---|---|---|---|---|
| lila | https://github.com/lichess-org/lila | `b3f190be9d532d5f9cdf746938e9d480b1464e25` | 2026-09-25 | `lila/` (squashed snapshot) |
| lila-ws | https://github.com/lichess-org/lila-ws | `24053fc0f0eb5e040233356dc62e13804c531bd6` | 2026-09-22 | `lila-ws/` (squashed snapshot) |

## Reused libraries (tracked for fixes)

| Library | Repo | Version | Used in |
|---|---|---|---|
| _added as each component is adopted_ | | | |

## Ported upstream commits

| Date | Upstream | SHA | What | LiGo PR |
|---|---|---|---|---|
