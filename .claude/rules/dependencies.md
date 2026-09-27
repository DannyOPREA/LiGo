---
paths:
  - "**/package.json"
  - "**/pnpm-lock.yaml"
  - "**/pnpm-workspace.yaml"
  - "**/build.sbt"
  - "**/project/*.scala"
  - "**/project/*.sbt"
---
# Dependency rules
Adding, removing, upgrading or swapping a dependency is a major decision. Before any change here:
1. An approved build-vs-buy memo (`docs/build-vs-buy/`) or ADR covering it (/build-vs-buy).
2. A licence check: AGPL-3.0-compatible only.
3. A `COPYING.md` update in the same PR.
You'll get a permission prompt for these files anyway; that prompt is the owner's approval
moment, so explain the change first. Never run a non-frozen `pnpm install`.
