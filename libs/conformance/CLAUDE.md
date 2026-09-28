# libs/conformance/ in LiGo

The Go rules test cases shared by the server engine (`libs/go-rules`, unit 1.7), the client engine
(`libs/board` + goban-engine, unit 1.8) and the scoring service. Format, sources and harness
contract: [README.md](README.md). The rules they test: `docs/rules/spec.md`.

- `fixtures/*.json` are the spec in executable form. Only the `go-rules-expert` agent edits them
  (a hook blocks other agents' edits), and each change needs the owner's approval. When the owner is away, draft
  fixture changes in the session scratchpad and write each file once.
- Never change a case to make an engine pass. If an engine and a case disagree, go-rules-expert
  decides which is wrong and the owner is asked.
- A case whose expectation depends on a spec §12 open point says so in `openPoints`; if the owner
  picks the alternative, `grep -l '"openPoints"'` finds the cases to change.
- `check.mjs` (shape, ids, rule IDs, board sanity) runs in `fast-check.sh`, `/verify` and CI. It
  has no dependencies: plain Node, so it runs anywhere the repo does.

## Test
`libs/conformance/fast-check.sh` (add `--coverage` for cases per rule ID).

## Logs to read
`logs/rules-engine.md` (Lessons + latest entries).
