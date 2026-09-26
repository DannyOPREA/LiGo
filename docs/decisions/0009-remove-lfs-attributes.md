# 0009. Remove upstream Git LFS attributes
- Status: Accepted
- Date: 2026-09-26
- Decided by: owner, on Claude's recommendation

## Context
lichess stores ~777 MiB of assets under `public/lifat/` (chess engine nets, Maia nets, Vosk speech
models, background photos) in Git LFS. A snapshot import copies only the 94 LFS **pointer** files,
but `lila/.gitattributes` still marked those paths `filter=lfs`. On any machine with git-lfs
installed, checking out LiGo failed ("Error downloading object … 404", exit 128); verified on
2026-09-26.

## Decision
Delete the `filter=lfs` lines from `lila/.gitattributes`. This is LiGo's first modification of
upstream lila, recorded in `docs/UPSTREAM.md`. The pointer files stay as plain text until Phase 3
removes the chess-only lifat assets.

## Consequences
- Checking out commit 6479d55 or later works with git-lfs installed. Verified with git-lfs 3.7.1 on
  a local clone: exit 0 after the change, 128 before. Earlier branch commits still carry the
  attributes and need `GIT_LFS_SKIP_SMUDGE=1`; whether they reach `main`'s history depends on the
  PR merge method (owner's choice).
- Features that load lifat assets (backgrounds, local engine nets, voice input) receive pointer text
  instead of data. They already did before this change, and all are chess-only or cosmetic.

## Alternatives considered
Leave upstream untouched and require `GIT_LFS_SKIP_SMUDGE=1` for every clone; delete the pointer
files now as well.
