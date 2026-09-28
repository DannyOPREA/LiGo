# Decisions log

One line per question put to the owner, and the answer. Newest first. Details live in ADRs and
area logs.

| Date | Question | Answer | Record |
|---|---|---|---|
| 2026-09-27 | 1.4: ratings: lila's Glicko-2 with OGS's Glicko-2 settings (A) or lila's own (A2), both with OGS's rank curve and goratings' handicap values (settles the 9×9 stone value = 6 ranks)? | A, OGS's Glicko-2 settings (owner, on Claude's recommendation, 2026-09-28) | ADR 0013 |
| 2026-09-27 | 1.1: server-side Go rules + byo-yomi clock: strategygames as a dependency (unused games excluded) or vendor only its Go package and clock? | Dependency, unused games excluded (owner, on Claude's recommendation) | ADR 0012 |
| 2026-09-27 | Start Phase 1 (unit 1.1)? | Covered by the owner's "autonomously work towards the goal" message; Phase 1 broken into units 1.1–1.9 | PLAN §5 |
| 2026-09-27 | 0.6: add an sbt plugin to scan Scala dependency licences in CI? | Defer (owner): Scala deps covered by the manifest → COPYING.md rule; revisit when Scala dependencies change | docs/CLAUDE_SETUP.md §13, PR #7 |
| 2026-09-27 | 0.5: KataGo version, cloud network, b18 download, auto-install | Claude's defaults, owner to confirm after merge: pin v1.18.1 (newest with Linux zips); KataGo's g170 b6c96 test net in the cloud; b18 downloaded on the owner's box without a pinned checksum until he reports it; cloud setup + SessionStart install the CPU build | logs/tooling.md, PR #6 |
| 2026-09-27 | Start unit 0.5 (environments)? | "Autonomously work towards the goal … without waiting for me to prompt you" (owner), taken as approval of each next unit in the build order | logs/tooling.md |
| 2026-09-27 | Check a PR's "Needs your verification" list before or after Claude merges? | After merge (owner) | ADR 0011, PLAN §6 |
| 2026-09-27 | Owner asked: change the working agreement so Claude can merge without his approval | Claude squash-merges its own PRs once /verify (and CI, when it exists) passes, the reviewer has no blocking finding, no review thread or owner question is open; then tells the owner (owner, default picked by Claude) | ADR 0011 |
| 2026-09-26 | Start unit 0.4 (Claude config)? | "Continue." (owner), taken as approval of the next unit in the build order | logs/tooling.md |
| 2026-09-26 | How should unit 0.3 reuse lila-docker: trimmed copy in the repo, or clone on demand? | Trimmed copy (owner) | ADR 0010 |
| 2026-09-26 | Start unit 0.3 (dev tooling)? | "Continue work on the project" (owner), taken as approval of the next unit in the build order | logs/tooling.md |
| 2026-09-26 | Approve unit 0.2 (import + baseline) and import style? | Approved; squashed snapshot | logs/upstream-fork.md |
| 2026-09-26 | Owner's Linux-box baseline check: now or after unit 0.3? | After unit 0.3 | CLAUDE_SETUP §14 |
| 2026-09-26 | Git LFS pointer files breaking clones | Remove the LFS lines from lila/.gitattributes | ADR 0009 |
| 2026-09-26 | PR #2 merge method (merge vs squash): old branch commits carry LFS attributes | Squash (owner) | STATUS |
| 2026-09-26 | Non-free/NC upstream assets in the public repo, plus licence corrections (lila-ws AGPL-3.0 only, screenshots not MIT) | Document now; strip in the first Phase 3 unit; corrections applied | ADR 0007 |
| 2026-09-26 | Cloud dependency sources (Google Central mirror, resolver override, ab-stub tarball) | Approved | ADR 0008 |
| 2026-09-26 | PR #1 / repo settings | Merged; repo public; `main` default + protected (owner) | STATUS |
| 2026-09-26 | Allow jitpack.io, repo.scala-sbt.org, central.sonatype.com, codeload.github.com in the cloud env? | Allowed (owner) | CLAUDE_SETUP §12.1 |
| 2026-09-26 | Where to create `main`? | At the approved-plan commit (d70e004); unit 0.1 goes through a PR | this log |
| 2026-09-26 | How to protect `main` on a private free account? | Make the repo public (owner does it), then enable branch protection | STATUS |
| 2026-09-26 | Approve proposed defaults (superko, OGS rank curve, lobby presets)? | Approved | ADRs 0003–0005 |
| 2026-09-26 | Licence for LiGo's own non-lila code? | MIT | ADR 0006 |
| 2026-09-26 | Approve the plan? | Approved; start Phase 0 | PLAN status |
| 2026-09-25 | Reuse-first, logging, intent, working agreement | Owner requirements added | ADR 0002, PLAN §2.2/§7 |
| 2026-09-25 | Fork base | Current lila, port Go | ADR 0001 |
| 2026-09-25 | Code review in GitHub CI? | No, local only | PLAN §1.1 |
| 2026-09-25 | Time per week | < 5 h | PLAN §1.1 |
| 2026-09-25 | Lobby pain specifics | Confusing lobby | PLAN §4 |
| 2026-09-25 | Upstream policy / tsumego source / languages / plan location | Hard fork + cherry-pick; classics + generated; English i18n-ready; repo markdown | PLAN §1 |
| 2026-09-25 | Hardware / hosting / dev box / name | AMD CPU+GPU; local-only; 32 GB+ Linux; keep LiGo | PLAN §1.1 |
| 2026-09-25 | Dev env / Claude plan / budget / autonomy | Web + local; Max 5x; own hardware; PRs + gates, owner merges | PLAN §1.1 |
| 2026-09-25 | POC scope, mobile, guests | Correspondence, SGF + analysis, tsumego; responsive + PWA; guests casual | PLAN §1.3 |
| 2026-09-25 | Ratings, pools, handicap, new players | Glicko-2 as kyu/dan; one pool; rated auto-handicap; self-declared rank | PLAN §1.2 |
| 2026-09-25 | Board sizes, rules, scoring, clocks | 19×19 + 9×9; JP + CN; AI proposes + confirm; byo-yomi + Fischer | PLAN §1.2 |
| 2026-09-25 | OGS pain, team, scale, funding | Game-finding; solo, new to Scala; POC; self-funded | PLAN §1.1 |
