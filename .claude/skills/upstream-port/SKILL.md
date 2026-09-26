---
name: upstream-port
description: Ports one upstream lila or lila-ws commit into LiGo's subfolder with git format-patch and git am, and logs it. Use when the owner approves porting an upstream fix.
disable-model-invocation: true
argument-hint: "<lila|lila-ws> <sha>"
---

# /upstream-port <lila|lila-ws> <sha>

LiGo is a hard fork; upstream fixes come in one approved commit at a time (docs/UPSTREAM.md).

1. Clone upstream read-only into /tmp (`git clone --filter=blob:none https://github.com/lichess-org/<repo> /tmp/<repo>`).
2. `git -C /tmp/<repo> format-patch -1 <sha> -o /tmp/port/`.
3. On a unit branch: `git am --directory=<lila|lila-ws> -3 /tmp/port/*.patch`. Conflicts in code
   LiGo changed: resolve keeping LiGo's behaviour, and explain each resolution. If a resolution
   needs judgement, /ask.
4. /verify, then record the port in `docs/UPSTREAM.md` (sha, date, why) and `logs/upstream-fork.md`.
