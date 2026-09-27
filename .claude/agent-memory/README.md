# Agent memory (committed)

Agents with `memory: project` in their frontmatter (`reuse-scout`, `go-rules-expert`, `reviewer`)
keep what they learn in `.claude/agent-memory/<agent-name>/`. It's committed so the learnings reach
every machine and cloud session (docs/CLAUDE_SETUP.md §3). Review changes here like any other
diff: memory is guidance for the agent, never a place for secrets or owner decisions (those go in
logs/ and ADRs).
