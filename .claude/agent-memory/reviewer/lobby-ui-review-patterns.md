---
name: lobby-ui-review-patterns
description: Recurring problems in lila/ui/lobby unit reviews (6.7 open-challenges table): row-click delegation dead zones, guest display regressions, raw reason tokens in titles
metadata:
  type: feedback
---

Things to check in lobby table/card changes (seen in unit 6.7 part one, 2026-09-30):
- lila's tbody click delegation starts at `e.target.parentNode`; if a TR gets padding/grid gaps (phone
  cards), taps landing on the TR itself do nothing. Suggest `(e.target as HTMLElement).closest('tr')`.
- When hook and seek renderers are merged, check guest display: lila showed seek usernames to guests
  but hid hook usernames (`ctrl.me && hook.u`); a shared renderer can turn every seek into "Anonymous".
- Internal enum reasons (`own`, `kind`) leaking into `title` untranslated; ADR 0022 §5 wants i18n words.
- Tests render the table but rarely click a row: the join/cancel path goes untested.
- "suits you" in ADR 0022 §5 means the §2 chip row, not the filter chips; filter chips hide rows,
  so a `suits` rank computed from the same chips is vacuous.

**Why:** these slipped past 43 passing tests and all verify gates.
**How to apply:** on any lobby view change, trace a tap on each element of the card and a guest viewer.
