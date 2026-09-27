"""PreToolUse(Bash) guard: hard blocks that hold in every permission mode (docs/CLAUDE_SETUP.md §6).

Reads the hook's JSON on stdin. Exit 0 allows the command; exit 2 blocks it, and stderr is shown
to Claude. Parsing a shell command is best-effort: it splits on ; && || | and newlines, then
looks at each simple command. Deny rules in .claude/settings.json are the first line of defence.

Licence: MIT (LiGo's own code, ADR 0006).
"""

import json
import os
import re
import shlex
import subprocess
import sys

PROTECTED_BRANCHES = {"main", "master"}


def block(msg):
    print(f"Blocked by .claude/hooks/guard-bash.sh: {msg}", file=sys.stderr)
    sys.exit(2)


HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1[^\n]*\n.*?\n\s*\2[ \t]*(?=\n|$)", re.S)


def strip_heredocs(command):
    """Drop here-document bodies: they are data (file contents), not commands."""
    return HEREDOC.sub(lambda m: m.group(0).split("\n", 1)[0], command)


def segments(command):
    """Split a command line into simple commands (lists of words)."""
    out = []
    command = strip_heredocs(command)
    for part in re.split(r"\|\||&&|[;|\n&]", command):
        part = part.strip().lstrip("({").rstrip(")}").strip()
        if not part:
            continue
        try:
            words = shlex.split(part, comments=True)
        except ValueError:
            words = part.split()
        # Drop leading VAR=value assignments and wrappers that just run the rest.
        while words and (re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0]) or words[0] in ("sudo", "command", "exec", "time", "nohup", "env")):
            words = words[1:]
        if words:
            out.append(words)
    return out


def git_args(words):
    """For `git [-C dir] [-c k=v] sub ...` return (sub, args, dir); else None."""
    if os.path.basename(words[0]) != "git":
        return None
    i, gdir = 1, None
    while i < len(words) and words[i].startswith("-"):
        if words[i] in ("-C", "-c", "--git-dir", "--work-tree") and i + 1 < len(words):
            if words[i] == "-C":
                gdir = words[i + 1]
            i += 2
        else:
            i += 1
    if i >= len(words):
        return None
    return words[i], words[i + 1:], gdir


def current_branch(cwd):
    try:
        return subprocess.run(["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
                              capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ""


def check_git(sub, args, cwd):
    branch = current_branch(cwd)
    if sub == "push":
        flags = [a for a in args if a.startswith("-")]
        refs = [a for a in args if not a.startswith("-")]
        if any(f in ("-f", "--force", "--force-with-lease", "--force-if-includes", "--mirror") or f.startswith("--force") for f in flags) \
                or any(re.match(r"^-[a-zA-Z]*f", f) and not f.startswith("--") for f in flags):
            block("force pushes are never allowed (CLAUDE.md working agreement).")
        if "--all" in flags or "--mirror" in flags:
            block("pushing all branches could push main; push your unit branch only.")
        if any(r.startswith("+") for r in refs):
            block("a '+refspec' is a force push.")
        targets = []
        for r in refs[1:]:  # refs[0] is the remote
            dst = r.split(":", 1)[1] if ":" in r else r
            targets.append(dst.replace("refs/heads/", ""))
        if any(t in PROTECTED_BRANCHES or t == "HEAD" and branch in PROTECTED_BRANCHES for t in targets):
            block("never push to main. Push your unit branch and open a PR; it lands by squash-merging the PR (ADR 0011).")
        if not targets and branch in PROTECTED_BRANCHES:
            block("you are on main; `git push` would push main. Create a unit branch first.")
        if "--delete" in flags or "-d" in flags or any(r.startswith(":") for r in refs[1:]):
            if any(t.lstrip(":") in PROTECTED_BRANCHES for t in refs[1:]):
                block("never delete main.")
    elif sub == "merge" and branch in PROTECTED_BRANCHES:
        block("never merge into main locally; PRs land by squash-merge on GitHub (ADR 0011).")
    elif branch in PROTECTED_BRANCHES and (
            (sub == "reset" and "--hard" in args) or sub in ("rebase", "filter-branch", "filter-repo")
            or (sub == "commit" and "--amend" in args)):
        block(f"`git {sub}` rewrites history on main. Work on a unit branch.")
    elif sub == "branch" and any(a in ("-D", "-d", "-f", "--force", "-M", "-m", "--delete") for a in args) \
            and any(a in PROTECTED_BRANCHES for a in args):
        block("never delete, move or force-reset main.")
    elif sub == "update-ref" and any(a.endswith("heads/main") or a.endswith("heads/master") for a in args):
        block("never move main by hand.")
    elif sub == "lfs" and args[:1] == ["install"]:
        block("`git lfs install` plants git hooks that break pushes (logs/tooling.md Lessons).")
    elif sub == "config" and any("hookspath" in a.lower() for a in args):
        block("don't change core.hooksPath; LiGo doesn't use git hooks.")


def allowed_rm_roots(cwd):
    roots = [os.environ.get("CLAUDE_PROJECT_DIR") or cwd, "/tmp", "/var/tmp"]
    if os.environ.get("TMPDIR"):
        roots.append(os.environ["TMPDIR"])
    return [os.path.realpath(r) for r in roots if r]


def check_rm(args, cwd):
    flags = "".join(a[1:] for a in args if a.startswith("-") and not a.startswith("--"))
    long = [a for a in args if a.startswith("--")]
    if "r" not in flags.lower() and "--recursive" not in long:
        return
    roots = allowed_rm_roots(cwd)
    for t in (a for a in args if not a.startswith("-")):
        if "$" in t or "`" in t:
            if not re.match(r'^"?\$(TMPDIR|tmp|TMP|scratch|SCRATCH)\b', t):
                block(f"`rm -r {t}`: can't tell where a variable points; use a literal path inside the repo or /tmp.")
            continue
        path = os.path.realpath(os.path.join(cwd, os.path.expanduser(t)))
        if path in ("/", os.path.realpath(os.path.expanduser("~"))) or path in roots[:1]:
            block(f"`rm -r {t}` would delete {path}.")
        if not any(path == r or path.startswith(r + os.sep) for r in roots):
            block(f"`rm -r {t}` is outside the repo and /tmp ({path}).")


def check_mongo(command):
    if re.search(r"dropDatabase|\.drop\(\)|--drop\b", command) and re.search(r"mongo|dropDatabase", command):
        if not re.search(r"\bligo_test\w*", command):
            block("dropping a Mongo database or collection is only allowed for ligo_test* databases.")


GH_MERGE_VALUE_FLAGS = {"-t", "--subject", "-b", "--body", "-F", "--body-file", "-A", "--author-email",
                       "--match-head-commit"}
GH_MERGE_SHORT = {"s": "--squash", "m": "--merge", "r": "--rebase", "d": "--delete-branch"}


def gh_merge_flags(args):
    """Flag names of `gh pr merge`, with `--flag=value` and bundled short flags (-sd) unpacked."""
    flags, skip = set(), False
    for a in args:
        if skip:
            skip = False
            continue
        if a.startswith("--"):
            name = a.split("=", 1)[0]
            flags.add(name)
            skip = name in GH_MERGE_VALUE_FLAGS and "=" not in a
        elif a.startswith("-") and len(a) > 1:
            if a[:2] in GH_MERGE_VALUE_FLAGS:
                flags.add(a[:2])
                skip = len(a) == 2
            else:
                flags.update(GH_MERGE_SHORT.get(c, "-" + c) for c in a[1:])
    return flags


def check_gh_merge(args):
    """Claude may squash-merge its own PR once the checks pass (ADR 0011); nothing looser."""
    flags = gh_merge_flags(args)
    if "--admin" in flags:
        block("`gh pr merge --admin` bypasses branch protection; never use it.")
    if "--auto" in flags:
        block("`gh pr merge --auto` merges before Claude has checked the PR; merge by hand once the checks pass (ADR 0011).")
    if flags & {"--merge", "--rebase"} or "--squash" not in flags:
        block("PRs land by squash-merge only: `gh pr merge <n> --squash` (ADR 0011).")


def check_words(words, cwd, command):
    name = os.path.basename(words[0])
    g = git_args(words)
    if g:
        sub, args, gdir = g
        check_git(sub, args, os.path.join(cwd, gdir) if gdir else cwd)
    elif name == "gh" and words[1:3] == ["pr", "merge"]:
        check_gh_merge(words[3:])
    elif name == "rm":
        check_rm(words[1:], cwd)
    elif name in ("sbt", "lila.sh", "sbtn") and os.environ.get("CLAUDE_CODE_REMOTE") == "true":
        if any(re.search(r"(^|[;\s\"'])clean\b", w) for w in words[1:]):
            block("no `sbt clean` in cloud sessions: the full rebuild needs more memory and time than the VM has.")
    elif name == "pnpm" and len(words) > 1 and words[1] in ("install", "i") and "--frozen-lockfile" not in words:
        block("only `pnpm install --frozen-lockfile` (or `dev/ligo deps`). Changing the lockfile is a dependency decision: ask the owner.")
    elif name == "pnpm" and len(words) > 1 and words[1] in ("add-hooks",):
        block("don't install lila's git hooks; LiGo doesn't use them.")
    elif name == "deploy" and "bin" in words[0]:
        block("lila's bin/deploy is lichess production tooling; never run it.")


def main():
    data = json.load(sys.stdin)
    if (data.get("tool_name") or "").endswith("merge_pull_request"):
        if (data.get("tool_input") or {}).get("merge_method") != "squash":
            block("PRs land by squash-merge only: pass merge_method \"squash\" (ADR 0011).")
        sys.exit(0)
    command = (data.get("tool_input") or {}).get("command") or ""
    cwd = data.get("cwd") or os.getcwd()
    check_mongo(strip_heredocs(command))
    for words in segments(command):
        check_words(words, cwd, command)
    sys.exit(0)


if __name__ == "__main__":
    main()
