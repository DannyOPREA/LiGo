# Upstream tracking

LiGo is a hard fork ([ADR 0001](decisions/0001-fork-current-lila.md)). This file records exactly
what we forked and every upstream change we port later. The `upstream-scout` agent reads it monthly.

## Pinned snapshots

| Upstream | Repo | Pinned SHA | Commit date (committer's time zone) | Imported into |
|---|---|---|---|---|
| lila | https://github.com/lichess-org/lila | `b3f190be9d532d5f9cdf746938e9d480b1464e25` | 2026-09-25 | `lila/` (squashed snapshot) |
| lila-ws | https://github.com/lichess-org/lila-ws | `24053fc0f0eb5e040233356dc62e13804c531bd6` | 2026-09-22 | `lila-ws/` (squashed snapshot) |

Notes on the snapshots:
- Imported with `git archive` of each pinned commit. In the import commit `adff5f9` the trees are
  identical to upstream (tree ids `41d7ac5a…` lila, `04bbd626…` lila-ws; independently verified
  2026-09-26). Every later change is listed in the modification register below.
- The lila-ws date is 2026-09-23 in UTC.
- **Git LFS:** upstream keeps ~777 MiB of `lila/public/lifat/` assets (nnue, maia, vosk, bots,
  background galleries) in Git LFS. For those, the snapshot contains only the **94 pointer files**,
  not the objects (see ADR 0009). The other 10 lifat files are real content, including 4
  Unsplash-licensed montage images (COPYING §1.1).
- **Non-free upstream assets** are kept temporarily and removed in the first Phase 3 unit
  (COPYING.md §1.1, ADR 0007).

## LiGo modifications to upstream files

AGPL §5(a) modification notices. Every change to a file under `lila/` or `lila-ws/` is listed here.

| Date | File(s) | Change | Why | Commit / PR |
|---|---|---|---|---|
| 2026-09-26 | `lila/.gitattributes` | Removed upstream's 8 `filter=lfs` rules under `public/lifat/`; added an explanatory comment | The snapshot has pointer files only; checkouts failed wherever git-lfs is installed | commit 6479d55 (unit 0.2 PR), ADR 0009 |

## Reused libraries (tracked for fixes)

| Library | Repo | Version | Used in |
|---|---|---|---|
| _added as each component is adopted_ | | | |

## Ported upstream commits

| Date | Upstream | SHA | What | LiGo PR |
|---|---|---|---|---|
