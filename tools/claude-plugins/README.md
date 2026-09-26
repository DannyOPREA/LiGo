# LiGo's local plugin marketplace

Plugins here are **local-only extras**: Claude Code cloud sessions don't install plugins or start
language servers (docs/CLAUDE_SETUP.md §11). `.claude/settings.json` registers this folder as the
`ligo-local` marketplace, so on your machine `/plugin` lists what's here.

| Plugin | What it does |
|---|---|
| `ligo-metals` | Points Claude Code at [Metals](https://scalameta.org/metals/), the existing Scala language server (there's no official Scala LSP plugin). Install Metals first: `cs install metals`. Experimental; Metals indexes lila with a lot of memory, so enable it only on the 32 GB box. |

Enable plugins per machine in `.claude/settings.local.json` (see `.claude/settings.local.json.example`).
Licence: MIT (LiGo's own code, ADR 0006).
