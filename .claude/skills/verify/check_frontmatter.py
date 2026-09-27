"""Checks the frontmatter of .claude agents, skills and rules (used by verify.sh).
Licence: MIT (LiGo's own code, ADR 0006)."""
import glob, os, re, sys

root = os.path.join(os.path.dirname(__file__), "..", "..", "..")
os.chdir(root)
try:
    import yaml
except ImportError:
    yaml = None

errors = []
def check(path, required):
    text = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        errors.append(f"{path}: no frontmatter"); return
    if yaml:
        try:
            data = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError as e:
            errors.append(f"{path}: invalid YAML: {str(e).splitlines()[0]}"); return
    else:
        data = dict(re.findall(r"^([\w-]+):\s*(.*)$", m.group(1), re.M))
    for k in required:
        if k not in data:
            errors.append(f"{path}: missing '{k}'")
    if "name" in required and data.get("name") and path.startswith(".claude/skills/"):
        if data["name"] != os.path.basename(os.path.dirname(path)):
            errors.append(f"{path}: name '{data['name']}' doesn't match its folder")
    if "skills" in data:
        for s in data["skills"] or []:
            if not os.path.isfile(f".claude/skills/{s}/SKILL.md"):
                errors.append(f"{path}: preloads unknown skill '{s}'")

for p in sorted(glob.glob(".claude/agents/*.md")): check(p, ["name", "description"])
for p in sorted(glob.glob(".claude/skills/*/SKILL.md")): check(p, ["name", "description"])
for p in sorted(glob.glob(".claude/rules/*.md")): check(p, ["paths"])
print("\n".join(errors) if errors else "frontmatter ok (yaml parser: %s)" % ("yes" if yaml else "fallback"))
sys.exit(1 if errors else 0)
