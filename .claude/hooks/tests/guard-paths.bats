#!/usr/bin/env bats
# guard-paths.sh protects the rules spec, accepted ADRs, generated files and log history.
load helpers

setup() { make_repo; cd "$REPO"; }

edit() {  # edit <file> <old> <new> [agent_type]
  local args=(tool_name Edit cwd "$REPO" tool_input.file_path "$REPO/$1" tool_input.old_string "$2" tool_input.new_string "$3")
  [[ -n "${4:-}" ]] && args+=(agent_type "$4")
  hook guard-paths.sh "$(json "${args[@]}")"
}
write() {  # write <file> <content> [agent_type]
  local args=(tool_name Write cwd "$REPO" tool_input.file_path "$REPO/$1" tool_input.content "$2")
  [[ -n "${3:-}" ]] && args+=(agent_type "$3")
  hook guard-paths.sh "$(json "${args[@]}")"
}

@test "only go-rules-expert may touch rules fixtures and the rules spec" {
  write libs/conformance/fixtures/ko.json '{}'
  [ "$status" -eq 2 ]; [[ "$output" == *go-rules-expert* ]]
  write docs/rules/japanese.md 'x' lila-backend
  [ "$status" -eq 2 ]
  write libs/conformance/fixtures/ko.json '{}' go-rules-expert
  [ "$status" -eq 0 ]
  write docs/rules/japanese.md 'x' go-rules-expert
  [ "$status" -eq 0 ]
}

@test "an ADR that is Accepted on main can't be edited" {
  edit docs/decisions/0001-accepted.md "Do the thing." "Do another thing."
  [ "$status" -eq 2 ]; [[ "$output" == *immutable* ]]
  write docs/decisions/0001-accepted.md "rewritten"
  [ "$status" -eq 2 ]
}

@test "an accepted ADR may only be marked Superseded by NNNN" {
  edit docs/decisions/0001-accepted.md "- Status: Accepted" "- Status: Superseded by 0002"
  [ "$status" -eq 0 ]
  edit docs/decisions/0001-accepted.md "- Status: Accepted" "- Status: Rejected"
  [ "$status" -eq 2 ]
}

@test "new and not-yet-merged ADRs are editable" {
  write docs/decisions/0002-new.md "# 0002. New
- Status: Accepted"
  [ "$status" -eq 0 ]
}

@test "generated files are never hand-edited" {
  write lila/modules/coreI18n/src/main/key.scala "x"
  [ "$status" -eq 2 ]
  write lila/translation/dest/site/fr-FR.xml "x"
  [ "$status" -eq 2 ]
  write lila/public/compiled/site.js "x"
  [ "$status" -eq 2 ]
  write lila/ui/lobby/src/ctrl.ts "x"
  [ "$status" -eq 0 ]
}

@test "logs: entries can be added, Lessons can be edited" {
  edit logs/tooling.md "## Entries (newest first)" "## Entries (newest first)
### 2026-09-27 · unit 0.4 · New
- Did: more"
  [ "$status" -eq 0 ]
  edit logs/tooling.md "- an old lesson" "- a better lesson"
  [ "$status" -eq 0 ]
  edit logs/general.md "## Entries (newest first)
_none yet_" "## Entries (newest first)
### 2026-09-27 · first entry"
  [ "$status" -eq 0 ]
  edit logs/decisions.md "|---|---|---|---|" "|---|---|---|---|
| 2026-09-27 | New question? | No | this log |"
  [ "$status" -eq 0 ]
}

@test "logs: past entries can't be rewritten or deleted" {
  edit logs/tooling.md "- Worked: yes" "- Worked: partly"
  [ "$status" -eq 2 ]; [[ "$output" == *append-only* ]]
  write logs/tooling.md "# Tooling log
## Lessons
## Entries (newest first)"
  [ "$status" -eq 2 ]
  edit logs/decisions.md "| 2026-09-26 | First question? | Yes | ADR 0001 |" ""
  [ "$status" -eq 2 ]
}

@test "logs: archiving is allowed once the entries are in logs/archive/" {
  printf '### 2026-09-26 · unit 0.3 · Something\n- Did: things\n- Worked: yes\n' > logs/archive/tooling-2026-Q3.md
  edit logs/tooling.md "### 2026-09-26 · unit 0.3 · Something
- Did: things
- Worked: yes" ""
  [ "$status" -eq 0 ]
}

@test "files outside the protected areas pass untouched" {
  write README.md "hello"
  [ "$status" -eq 0 ]
  write /tmp/elsewhere.txt "hello"
  [ "$status" -eq 0 ]
}

@test "logs: an entry added on this branch stays editable until it merges" {
  edit logs/tooling.md "## Entries (newest first)" "## Entries (newest first)
### 2026-09-27 · unit 0.4 · New
- Worked: 43 tests"
  [ "$status" -eq 0 ]
  printf '### 2026-09-27 · unit 0.4 · New\n- Worked: 43 tests\n' >> logs/tooling.md
  edit logs/tooling.md "- Worked: 43 tests" "- Worked: 44 tests"
  [ "$status" -eq 0 ]
  edit logs/tooling.md "- Worked: yes" "- Worked: partly"
  [ "$status" -eq 2 ]
}
