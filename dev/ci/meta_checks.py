#!/usr/bin/env python3
"""LiGo's repository-rule checks, run by .github/workflows/meta.yml (unit 0.6).

Usage:
  meta_checks.py logs <base> [head]       code changed -> a logs/ file changed too
  meta_checks.py manifests <base> [head]  a dependency manifest changed -> COPYING.md changed too
  meta_checks.py pr-body [template]       the PR description (env PR_BODY) has every template section,
                                          and "Needs your verification" isn't empty
  meta_checks.py js-licences [json]       every production npm package of lila has an
                                          AGPL-compatible licence (input: `pnpm licenses list
                                          --prod --json`, from a file or stdin)

Each prints what it found and exits 1 on a violation. The rules come from docs/CLAUDE_SETUP.md
§9.3 and §13. Licence: MIT (LiGo's own code, ADR 0006).
"""

import json
import os
import re
import subprocess
import sys

# Dependency manifests: editing one means dependencies may have changed, so COPYING.md must be
# reviewed and updated in the same PR.
MANIFEST = re.compile(
    r"^(lila/(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|bin/package\.json"
    r"|ui/[^/]+/package\.json|ui/@types/[^/]+/package\.json|build\.sbt|project/[^/]+)"
    r"|lila-ws/(build\.sbt|project/[^/]+)"
    r"|(libs|services|tools)/.*/(package\.json|pnpm-lock\.yaml|build\.sbt|requirements[^/]*\.txt|pyproject\.toml))$"
)

# SPDX ids LiGo accepts in production dependencies: permissive licences and the GPL family that
# AGPL-3.0 can combine with (GPL-3.0 via AGPL §13). "BSD" is how some old packages spell BSD-3.
ALLOWED = {
    "0BSD", "Apache-2.0", "BlueOak-1.0.0", "BSD", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0",
    "CC-BY-3.0", "CC-BY-4.0", "ISC", "MIT", "MIT-0", "MPL-2.0", "Python-2.0", "Unlicense",
    "Zlib", "WTFPL", "LGPL-2.1-or-later", "LGPL-3.0", "LGPL-3.0-only", "LGPL-3.0-or-later",
    "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later", "GPL-2.0-or-later",
    "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later",
}


def changed_files(base, head):
    out = subprocess.run(
        ["git", "diff", "--name-only", base, head, "--"], check=True, capture_output=True, text=True
    ).stdout
    return [f for f in out.splitlines() if f]


def check_logs(base, head="HEAD"):
    files = changed_files(base, head)
    code = [f for f in files if not f.endswith(".md")]
    logs = [f for f in files if f.startswith("logs/") and f.endswith(".md")]
    if not code:
        print("only Markdown changed: no log entry needed")
        return 0
    if logs:
        print(f"code changed and so did {', '.join(logs)}")
        return 0
    print("code changed but no logs/*.md file did. Append an entry with /log (logs/README.md):")
    print("\n".join(f"  {f}" for f in code[:20]))
    return 1


def check_manifests(base, head="HEAD"):
    files = changed_files(base, head)
    manifests = [f for f in files if MANIFEST.match(f)]
    if not manifests:
        print("no dependency manifest changed")
        return 0
    if "COPYING.md" in files:
        print(f"dependency manifests changed ({', '.join(manifests)}) and so did COPYING.md")
        return 0
    print("dependency manifests changed but COPYING.md didn't. Review the new or updated")
    print("dependencies' licences and record them in COPYING.md:")
    print("\n".join(f"  {f}" for f in manifests))
    return 1


def strip_comments(text):
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


def sections(markdown):
    """Maps each '## heading' to the text under it (HTML comments removed)."""
    out, current = {}, None
    for line in strip_comments(markdown).splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            current = m.group(1).strip().lower()
            out[current] = ""
        elif current is not None:
            out[current] += line + "\n"
    return out


def check_pr_body(template=".github/pull_request_template.md"):
    body = os.environ.get("PR_BODY", "")
    with open(template, encoding="utf-8") as f:
        wanted = list(sections(f.read()))
    have = sections(body)
    missing = [h for h in wanted if h not in have]
    empty = [h for h in wanted if h in have and not have[h].strip()]
    problems = 0
    if missing:
        problems += 1
        print("PR description is missing template sections: " + ", ".join(f'"## {h}"' for h in missing))
    if empty:
        problems += 1
        print("PR description has empty sections (write \"n/a — <reason>\" instead): "
              + ", ".join(f'"## {h}"' for h in empty))
    if not problems:
        print(f"PR description has all {len(wanted)} template sections, none empty")
    return 1 if problems else 0


def licence_ok(expr):
    """True if an SPDX expression is acceptable: any alternative of an OR, every part of an AND."""
    expr = expr.strip()
    while expr.startswith("(") and expr.endswith(")") and balanced(expr[1:-1]):
        expr = expr[1:-1].strip()
    for op, combine in ((" OR ", any), (" AND ", all)):
        parts = split_top(expr, op)
        if len(parts) > 1:
            return combine(licence_ok(p) for p in parts)
    return expr in ALLOWED


def balanced(s):
    depth = 0
    for c in s:
        depth += {"(": 1, ")": -1}.get(c, 0)
        if depth < 0:
            return False
    return depth == 0


def split_top(expr, op):
    parts, depth, start, i = [], 0, 0, 0
    while i < len(expr):
        c = expr[i]
        depth += {"(": 1, ")": -1}.get(c, 0)
        if depth == 0 and expr.startswith(op, i):
            parts.append(expr[start:i])
            i += len(op)
            start = i
            continue
        i += 1
    parts.append(expr[start:])
    return parts


def check_js_licences(path=None):
    data = json.load(open(path, encoding="utf-8") if path else sys.stdin)
    bad = {lic: pkgs for lic, pkgs in data.items() if not licence_ok(lic)}
    total = sum(len(p) for p in data.values())
    if bad:
        print("npm production dependencies with licences not on LiGo's list (dev/ci/meta_checks.py):")
        for lic, pkgs in sorted(bad.items()):
            print(f"  {lic}: " + ", ".join(f"{p['name']}@{','.join(p.get('versions', []))}" for p in pkgs))
        print("Ask the owner before adding a dependency (CLAUDE.md); record approved ones in COPYING.md.")
        return 1
    print(f"{total} npm production packages, {len(data)} licences, all AGPL-compatible")
    return 0


def main(argv):
    cmds = {
        "logs": check_logs,
        "manifests": check_manifests,
        "pr-body": check_pr_body,
        "js-licences": check_js_licences,
    }
    if len(argv) < 2 or argv[1] not in cmds:
        print(__doc__, file=sys.stderr)
        return 2
    return cmds[argv[1]](*argv[2:])


if __name__ == "__main__":
    sys.exit(main(sys.argv))
