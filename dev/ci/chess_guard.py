#!/usr/bin/env python3
"""LiGo's chess-code guard (unit 3.17 part 3, ADR 0019 §8): once Phase 3 is done, lila and lila-ws
use no chess rules or formats, and only libs/go-rules talks to strategygames.

Usage:
  chess_guard.py [--root DIR]

It looks at every tracked Scala file (`git ls-files`) and finds:
  - in lila/ and lila-ws/: any use of `chess.format`, `chess.variant`, `chess.opening` or
    `chess.eval`, and of `chess.Board`, `chess.Position`, `chess.Square`, `chess.Move` or `chess.Game`
    (written out anywhere, or named in an `import`/`export chess.{ … }`);
  - anywhere but libs/go-rules/: an `import strategygames…`.

It fails on any finding. (While units 3.17 parts 1 to 2b removed the chess code it had a
`--report-only` mode with a baseline of known files; the last 3.17 PR removed both.)

Known limit: a wildcard `import chess.*` followed by a bare `Board` isn't caught (no type
information here); scalachess stays a dependency for its neutral types (ADR 0019 §1), so the
compiler is no backstop and reviews are. Comment
stripping doesn't know about string literals, so a `//` or `/*` inside a string hides the rest of
that line (or up to the next `*/`); on today's tree that changes nothing.

Licence: MIT (LiGo's own code, ADR 0006).
"""

import argparse
import os
import re
import subprocess
import sys

CHESS_ROOTS = ("lila/", "lila-ws/")
RULES_LIB = "libs/go-rules/"
PACKAGES = r"(?:format|variant|opening|eval)"
NAMES = r"(?:Board|Position|Square|Move|Game)"

RULES = [
    (
        "chess format/variant/opening/eval",
        CHESS_ROOTS,
        re.compile(
            rf"(?<![\w.])(?:_root_\.)?chess\.{PACKAGES}\b"
            rf"|^\s*(?:import|export)\s+(?:_root_\.)?chess\.\{{[^}}]*\b{PACKAGES}\b[^}}]*\}}",
            re.M,
        ),
    ),
    (
        "chess Board/Position/Square/Move/Game",
        CHESS_ROOTS,
        re.compile(
            rf"(?<![\w.])(?:_root_\.)?chess\.{NAMES}\b"
            rf"|^\s*(?:import|export)\s+(?:_root_\.)?chess\.\{{[^}}]*\b{NAMES}\b(?!\s*(?:=>|as)\s*_)[^}}]*\}}",
            re.M,
        ),
    ),
    (
        "strategygames import outside libs/go-rules",
        None,  # everywhere except RULES_LIB
        re.compile(r"^\s*import\s+(?:_root_\.)?strategygames\b", re.M),
    ),
]


def tracked_scala(root):
    out = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.scala", "*.sbt"], cwd=root, capture_output=True, check=True
    ).stdout.decode()
    return sorted(f for f in out.split("\0") if f)


def strip_comments(text):
    """Blanks out // and /* */ comments, keeping line numbers, so a comment naming chess code
    doesn't count. String literals are left alone (an import can't be inside one)."""
    text = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def findings(root):
    """{file: [(line, rule, text)]} for every tracked Scala file that breaks a rule."""
    found = {}
    for path in tracked_scala(root):
        applicable = [
            (name, rx)
            for name, roots, rx in RULES
            if (path.startswith(roots) if roots else not path.startswith(RULES_LIB))
        ]
        if not applicable:
            continue
        try:
            with open(os.path.join(root, path), encoding="utf-8", errors="replace") as fh:
                text = strip_comments(fh.read())
        except FileNotFoundError:  # deleted in the work tree but still tracked
            continue
        for name, rx in applicable:
            for m in rx.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                snippet = " ".join(m.group(0).split())[:100]
                found.setdefault(path, []).append((line, name, snippet))
    return found


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=None, help="repository root (default: this script's repo)")
    args = ap.parse_args(argv)
    root = args.root or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

    found = findings(root)
    print("chess guard")
    print(f"{'Chess code that fails the check' if found else 'No chess code'}: {len(found)} file(s)")
    for f in sorted(found):
        for line, rule, snippet in found[f]:
            print(f"  {f}:{line}: {rule}: {snippet}")
    for f in sorted(found):
        line, rule, _ = found[f][0]
        # GitHub Actions turns this into an annotation on the file
        print(f"::error file={f},line={line}::{rule} (chess guard, ADR 0019 §8)")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
