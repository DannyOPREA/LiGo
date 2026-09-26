---
paths:
  - "**/test/**"
  - "**/tests/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/*Test.scala"
  - "**/*.bats"
---
# Test rules
- Name tests after the behaviour they check ("rejects a suicide move"), not the method.
- Reuse existing suites, harnesses and fixtures before writing new ones (reuse ladder).
- Rules fixtures (`libs/conformance/fixtures/`) are the spec: only `go-rules-expert` edits them,
  with the owner's approval.
- No sleeps in end-to-end tests: wait for a condition (Playwright `expect(...).toBeVisible()`, etc.).
- Never weaken, skip or delete an assertion to make a test pass. A test that looks wrong is an
  "ask the owner" situation: stop and use /ask.
- Tests must be deterministic: seed randomness, fix clocks.
