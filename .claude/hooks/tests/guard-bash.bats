#!/usr/bin/env bats
# guard-bash.sh blocks what docs/CLAUDE_SETUP.md §6 says it blocks, and nothing ordinary.
load helpers

setup() { make_repo; cd "$REPO"; }

blocked() { hook guard-bash.sh "$(bash_input "$1")"; [ "$status" -eq 2 ] || { echo "not blocked: $1 ($output)"; return 1; }; }
allowed() { hook guard-bash.sh "$(bash_input "$1")"; [ "$status" -eq 0 ] || { echo "blocked: $1 ($output)"; return 1; }; }

@test "blocks force pushes in every spelling" {
  blocked "git push --force origin claude/test"
  blocked "git push -f origin claude/test"
  blocked "git push -uf origin claude/test"
  blocked "git push --force-with-lease origin claude/test"
  blocked "git push origin +claude/test"
  blocked "echo hi && git push --force"
}

@test "blocks pushes to main" {
  blocked "git push origin main"
  blocked "git push -u origin HEAD:main"
  blocked "git push origin claude/test:refs/heads/main"
  blocked "git push --all origin"
  git checkout -q main
  blocked "git push"
  blocked "git push origin HEAD"
}

@test "blocks merging and history rewrites on main" {
  blocked "gh pr merge 5 --squash"
  blocked "git branch -D main"
  git checkout -q main
  blocked "git merge claude/test"
  blocked "git reset --hard HEAD~1"
  blocked "git rebase claude/test"
  blocked "git commit --amend -m x"
}

@test "allows normal work on a unit branch" {
  allowed "git status"
  allowed "git push -u origin claude/test"
  allowed "git -C \"$REPO\" push -u origin claude/test"
  allowed "git reset --hard HEAD"
  allowed "git commit -m 'never push --force to main'"
  allowed "gh pr view 5"
}

@test "blocks rm -r outside the repo and /tmp" {
  blocked "rm -rf /"
  blocked "rm -rf ~"
  blocked "rm -rf /etc/something"
  blocked "rm -r /home/someone/elsewhere"
  blocked "rm -rf \"\$HOME/stuff\""
  blocked "rm -rf \"$REPO\""
}

@test "allows rm -r inside the repo and /tmp, and plain rm anywhere in the repo" {
  allowed "rm -rf target"
  allowed "rm -rf \"$REPO/lila/target\""
  allowed "rm -rf /tmp/scratch-dir"
  allowed "rm code.txt"
}

@test "blocks dropping Mongo databases other than ligo_test*" {
  blocked "mongosh lichess --eval 'db.dropDatabase()'"
  blocked "docker compose exec mongodb mongosh --eval 'db.game5.drop()' lichess"
  allowed "mongosh ligo_test_rules --eval 'db.dropDatabase()'"
}

@test "blocks sbt clean in cloud sessions only" {
  export CLAUDE_CODE_REMOTE=true
  blocked "sbt clean"
  blocked "cd lila && ./lila.sh clean compile"
  blocked "sbt 'clean; compile'"
  allowed "sbt compile"
  unset CLAUDE_CODE_REMOTE
  allowed "sbt clean"
}

@test "blocks non-frozen installs, git hook installers and lila's deploy" {
  blocked "pnpm install"
  blocked "cd lila && pnpm i"
  allowed "pnpm install --frozen-lockfile"
  blocked "git lfs install"
  blocked "git config core.hooksPath bin/git-hooks"
  blocked "pnpm add-hooks"
  blocked "lila/bin/deploy"
}

@test "here-document bodies are data, not commands" {
  allowed "cat > notes.md <<'MD'
Never run pnpm install or git push origin main.
MD
echo done"
  blocked "cat > notes.md <<MD
text
MD
git push origin main"
}
