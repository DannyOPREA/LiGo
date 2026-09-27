---
paths:
  - "lila/modules/db/**"
  - "lila/modules/**/*Repo*.scala"
  - "lila/modules/**/BsonHandlers.scala"
  - "lila/bin/mongodb/**"
  - "lila-ws/src/main/scala/Mongo.scala"
---
# Mongo rules
- A schema change (new collection, new or renamed field, changed field meaning) is a major decision:
  ask the owner first, and record it in an ADR.
- Every query that runs on a hot path needs an index; add it to lila's index scripts
  (`lila/bin/mongodb/indexes.js`) in the same PR.
- Keep BSON handlers next to the types they serialise, following lila's pattern.
- Tests and experiments use databases named `ligo_test*`; a hook blocks dropping any other.
