---
name: log
description: Appends a structured entry to the right logs/<area>.md at the end of a unit, curates its Lessons section, and archives when the file gets long. Use at the end of every unit and whenever the stop hook says no log entry was written.
argument-hint: "[area]"
---

# /log [area]

1. Pick the log from the path → log map in `logs/README.md` ($ARGUMENTS overrides). Work that
   spans areas gets an entry in each, kept short.
2. Insert the entry directly under `## Entries (newest first)` using the template in
   logs/README.md: Did / Worked / Didn't work / Lessons / Decisions / Verified by Claude · Needs
   owner verification / Follow-ups. A failure or dead end is logged as carefully as a success.
3. Entries are append-only (a hook blocks rewriting them). To correct an old entry, add a new one.
4. Promote durable lessons to the Lessons section: keep it ≤ 30 lines, merge duplicates, drop
   superseded ones, end each with (date, unit).
5. If the file is over ~400 lines, first copy its oldest entries verbatim into
   `logs/archive/<area>-<year>-Q<n>.md`, then remove them from the log (the hook allows removal
   only once they are archived).
6. Every question asked and answer given also gets its line in `logs/decisions.md`.
