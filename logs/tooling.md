# Tooling log

## Lessons (curated, ≤ 30 lines — read this first)
- Claude Code cloud sessions do not install plugins or start LSP servers, ignore `~/.claude/`, and keep no auto-memory across machines: everything that matters must be committed (2026-09-25, planning).
- Cloud VM: 4 vCPU / 16 GB / 30 GB, Ubuntu 24.04, JDK 21, Node 20–22, Docker, Redis; no sbt, MongoDB or Node 24 (2026-09-25, planning).
- `auto` permission mode can't be set from project settings, only from `~/.claude/settings.json` (2026-09-25, planning).
- The cloud network policy blocks some hosts (e.g. www.gnu.org). Fetch licence texts etc. from GitHub (`raw.githubusercontent.com`) instead (2026-09-26, unit 0.1).
- There's no official Scala LSP plugin; Metals needs a custom `.lsp.json` plugin (2026-09-25, planning).

## Entries (newest first)

### 2026-09-26 · unit 0.1 · Repo bootstrap
- Did: LICENSE (AGPL-3.0 text taken from lila's repo), LICENSE-MIT, COPYING.md (AGPL for lila-derived, MIT for our own code), README, .gitignore, docs skeleton (STATUS, UPSTREAM, glossary, ADRs 0001–0006, build-vs-buy/rules/research READMEs), logs/ skeleton with path → log map, PR template, PLAN/CLAUDE_SETUP status updates.
- Worked: everything above; the AGPL text matches lila's LICENSE byte for byte (sha256 0d96a4ff…abcb0).
- Didn't work / dead ends: fetching the AGPL text from www.gnu.org was blocked by the cloud network policy, so we used lila's copy instead.
- Lessons: see the Lessons section (network policy).
- Decisions: owner approved the plan, defaults (ADRs 0003–0005) and MIT for own code (ADR 0006). Open: where to create `main` and whether to protect it (see decisions.md).
- Verified by Claude: files present; markdown links resolve (checked with a script); licence text is identical to lila's. Needs owner verification: that you're happy with the licence split wording in COPYING.md (a legal judgement, not something Claude can settle).
- Follow-ups: branch protection once `main` exists; unit 0.2 (import upstream snapshots).

### 2026-09-25 · planning · Requirements interview and plan
- Did: interviewed the owner over 8 rounds; researched lichess/lishogi/PlayStrategy/OGS/KataGo prior art and current Claude Code features; wrote docs/PLAN.md and docs/CLAUDE_SETUP.md; revised them for reuse-first, per-area logging, non-commercial intent and the working agreement.
- Worked: background research agents in parallel with the interview kept the owner's waiting time low.
- Didn't work / dead ends: the first Claude Code research agent returned several inaccurate details (e.g. permission-rule syntax, plugin.json shape), so each fact was re-checked against the docs before use. Lesson: verify agent-reported tool facts against the primary docs.
- Decisions: see decisions.md (2026-09-25 entries).
- Verified by Claude: Claude Code facts checked against code.claude.com. Needs owner verification: n/a (plan approved 2026-09-26).
