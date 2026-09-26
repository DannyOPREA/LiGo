"""PreToolUse(Edit|Write|MultiEdit|NotebookEdit) guard (docs/CLAUDE_SETUP.md §6).

- Only the go-rules-expert agent may change rules fixtures and the rules spec.
- ADRs that are Accepted on main are immutable, except for setting "Superseded by NNNN".
- Generated files are never hand-edited.
- Log files are append-only below their Lessons section: entries that are on main can't be
  changed or removed (archiving moves them, it doesn't delete them); entries added on the
  current branch stay editable until it merges.

Exit 0 allows the edit; exit 2 blocks it with the reason on stderr.

Licence: MIT (LiGo's own code, ADR 0006).
"""

import glob
import json
import os
import re
import subprocess
import sys
from collections import Counter

RULES_OWNER = "go-rules-expert"
RULES_PATHS = ("libs/conformance/fixtures/", "docs/rules/")
GENERATED = (
    re.compile(r"^lila/modules/coreI18n/src/main/key\.scala$"),
    re.compile(r"^lila/translation/dest/"),
    re.compile(r"^lila/public/compiled/"),
    re.compile(r"(^|/)node_modules/"),
    re.compile(r"(^|/)target/"),
)
ADR = re.compile(r"^docs/decisions/\d{4}-[^/]+\.md$")
LOG = re.compile(r"^logs/(archive/)?[^/]+\.md$")
PLACEHOLDER = re.compile(r"^_none yet_$")


def block(msg):
    print(f"Blocked by .claude/hooks/guard-paths.sh: {msg}", file=sys.stderr)
    sys.exit(2)


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (FileNotFoundError, IsADirectoryError):
        return None


def proposed_content(tool, inp, current):
    """The file's content if the edit goes through (None if it can't be computed)."""
    if tool == "Write":
        return inp.get("content", "")
    if tool == "Edit":
        edits = [inp]
    elif tool == "MultiEdit":
        edits = inp.get("edits") or []
    else:
        return None
    text = current or ""
    for e in edits:
        old, new = e.get("old_string", ""), e.get("new_string", "")
        if old == "":
            text = new + text if current is None else text
            continue
        if old not in text:
            return None  # the tool itself will reject the edit
        text = text.replace(old, new) if e.get("replace_all") else text.replace(old, new, 1)
    return text


def main_version(root, rel):
    for ref in ("origin/main", "main"):
        r = subprocess.run(["git", "-C", root, "show", f"{ref}:{rel}"], capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout
    return None


def check_adr(root, rel, new):
    on_main = main_version(root, rel)
    if on_main is None or not re.search(r"^- Status: Accepted\b", on_main, re.M):
        return  # new or still-proposed ADR: editable until merged
    if new is None:
        block(f"{rel} is Accepted on main and can't be edited this way. Write a new ADR that supersedes it.")
    strip = lambda t: [l for l in t.splitlines() if not l.startswith("- Status:")]
    new_status = re.search(r"^- Status: (.*)$", new, re.M)
    if strip(on_main) == strip(new) and new_status and re.match(r"Superseded by \d{4}$", new_status.group(1).strip()):
        return
    block(f"{rel} is Accepted on main, so it's immutable. The only allowed edit is "
          "'- Status: Superseded by NNNN' after writing the new ADR (docs/decisions/README.md).")


def protected_lines(text):
    """Lines that must survive: everything under '## Entries', or a table's rows if no such heading."""
    lines = text.splitlines()
    for i, l in enumerate(lines):
        if l.startswith("## Entries"):
            body = lines[i + 1:]
            break
    else:
        body = [l for l in lines if l.startswith("|") and not re.match(r"^\|[\s|:-]*\|$", l)]
        body = body[1:] if body else body  # the header row may be reworded
    return [l for l in body if l.strip() and not PLACEHOLDER.match(l.strip())]


def check_log(root, rel, current, new):
    """Entries already on main must survive; entries added on this branch stay editable until merged."""
    if current is None or rel == "logs/README.md":
        return
    on_main = main_version(root, rel)
    if on_main is None:
        return
    if new is None:
        block(f"{rel}: couldn't work out the edit's result; logs are append-only, so use Edit to insert.")
    have = Counter(new.splitlines())
    area = os.path.splitext(os.path.basename(rel))[0]
    archived = Counter()
    if not rel.startswith("logs/archive/"):
        for a in glob.glob(os.path.join(root, "logs", "archive", f"{area}-*.md")):
            archived.update((read(a) or "").splitlines())
    missing = []
    for line, n in Counter(protected_lines(on_main)).items():
        if have[line] + archived[line] < n:
            missing.append(line)
    if missing:
        sample = missing[0][:100]
        block(f"{rel} is append-only below its Lessons section; this edit changes or removes "
              f"{len(missing)} existing line(s), e.g. {sample!r}. Add a new entry with the correction "
              "instead (or move old entries to logs/archive/ first when archiving).")


def main():
    data = json.load(sys.stdin)
    tool = data.get("tool_name", "")
    inp = data.get("tool_input") or {}
    path = inp.get("file_path") or inp.get("notebook_path")
    if not path:
        sys.exit(0)
    root = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd())
    full = os.path.realpath(os.path.join(data.get("cwd") or root, path))
    if not full.startswith(root + os.sep):
        sys.exit(0)
    rel = os.path.relpath(full, root)

    if rel.startswith(RULES_PATHS) and data.get("agent_type") != RULES_OWNER:
        block(f"only the {RULES_OWNER} agent may change {rel} (the rules spec and fixtures are the tests' "
              "source of truth). Delegate to it, and remember a fixture change needs the owner's approval.")
    if any(p.search(rel) for p in GENERATED):
        block(f"{rel} is generated output; change its source and regenerate instead.")

    current = read(full)
    if ADR.match(rel):
        check_adr(root, rel, proposed_content(tool, inp, current))
    if LOG.match(rel):
        check_log(root, rel, current, proposed_content(tool, inp, current))
    sys.exit(0)


if __name__ == "__main__":
    main()
