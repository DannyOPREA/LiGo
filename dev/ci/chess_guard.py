#!/usr/bin/env python3
"""LiGo's chess-code guard (unit 3.17 part 3, ADR 0019 §8): once Phase 3 is done, lila and lila-ws
use no chess rules or formats, and only libs/go-rules talks to strategygames.

Usage:
  chess_guard.py [--report-only] [--root DIR] [--baseline FILE]

It looks at every tracked Scala file (`git ls-files`) and finds:
  - in lila/ and lila-ws/: any use of `chess.format`, `chess.variant`, `chess.opening` or
    `chess.eval`, and of `chess.Board`, `chess.Position`, `chess.Square`, `chess.Move` or `chess.Game`
    (written out anywhere, or named in an `import`/`export chess.{ … }`);
  - anywhere but libs/go-rules/: an `import strategygames…`.

Full mode (the default) fails on any finding. `--report-only` (while units 3.17 parts 2a and 2b are
still removing chess code) lists every finding but fails only on a file that isn't in the baseline
(dev/ci/chess-guard-baseline.txt), so no new file picks up chess code meanwhile; a baseline file that
is now clean is listed so it can be dropped from the baseline. The last 3.17 PR deletes
`--report-only` from .github/workflows/lila.yml, and the baseline with it.

Known limit: a wildcard `import chess.*` followed by a bare `Board` isn't caught (no type
information here); the compile, once 3.17 removes lila's chess dependency, is the backstop. Comment
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


def read_baseline(path):
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8") as fh:
        return {l.strip() for l in fh if l.strip() and not l.lstrip().startswith("#")}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--root", default=None, help="repository root (default: this script's repo)")
    ap.add_argument("--baseline", default=None)
    args = ap.parse_args(argv)
    root = args.root or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    baseline_path = args.baseline or os.path.join(root, "dev", "ci", "chess-guard-baseline.txt")

    found = findings(root)
    baseline = read_baseline(baseline_path) if args.report_only else set()
    known = {f: v for f, v in found.items() if f in baseline}
    new = {f: v for f, v in found.items() if f not in baseline}
    cleaned = sorted(baseline - found.keys())

    def show(title, group):
        print(f"{title}: {len(group)} file(s)")
        for f in sorted(group):
            for line, rule, snippet in group[f]:
                print(f"  {f}:{line}: {rule}: {snippet}")

    mode = "report-only (baseline files are reported, not failed)" if args.report_only else "full"
    print(f"chess guard, {mode}")
    if args.report_only:
        show("Known chess code (baseline, still to remove)", known)
    show("Chess code that fails the check" if new else "No chess code outside the baseline", new)
    if cleaned:
        print(f"Clean now, drop from {os.path.relpath(baseline_path, root)}: " + ", ".join(cleaned))
    if new:
        for f in sorted(new):
            line, rule, _ = new[f][0]
            # GitHub Actions turns this into an annotation on the file
            print(f"::error file={f},line={line}::{rule} (chess guard, ADR 0019 §8)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
