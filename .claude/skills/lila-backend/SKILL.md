---
name: lila-backend
description: Recipes for adapting lila's Scala server - routes, controllers, Mongo collections and BSON, module Env wiring, i18n keys, lila-ws messages. Use whenever changing server code in lila/ or lila-ws/, before writing anything new.
---

# Adapting lila's backend

First look for an existing lila feature that already does most of it (grep modules/ and app/);
adapting beats writing. lila/CLAUDE.md has the architecture primer.

## Recipes
- **New endpoint:** add a line to `conf/routes`, an action in the matching
  `app/controllers/*.scala` (copy a neighbouring action's auth, CSRF and rate-limit pattern), and a
  scalatags view in the module's `src/main/ui/`.
- **New Mongo field or collection:** it's a schema change, so ask first. Then: case class +
  BSON handler next to it (`BsonHandlers.scala`), the collection name in the module's `Env`, and an
  index in `bin/mongodb/indexes.js` if it's queried on a hot path.
- **Wiring:** a new service is a class with its dependencies as constructor parameters, created
  with `wire[...]` in the module's `Env.scala`. Cross-module access goes through `lila.core.*`
  interfaces rather than a direct module dependency.
- **i18n key:** add the English string to `translation/source/<file>.xml`, regenerate
  `key.scala` with `pnpm i18n-file-gen` (never hand-edit it), use it via the generated key.
- **Socket message:** lila side in the module's `*Socket.scala` / `modules/socket`; lila-ws side
  in `ipc/LilaIn`/`LilaOut` and the client actor. Protocol changes are major decisions.
- **Async:** return `Fu[A]`; chain with `map`/`flatMap`/for-comprehensions; never `Await`.

Compile and test through `dev/ligo compile lila|ws` and `dev/ligo test lila|ws`.
