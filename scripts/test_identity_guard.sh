#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
guard_script="$script_dir/identity_guard.sh"

cleanup() {
  if [ -n "${tmpdir:-}" ] && [ -d "$tmpdir" ]; then
    rm -rf "$tmpdir"
  fi
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

new_repo() {
  tmpdir=$(mktemp -d)
  repo="$tmpdir/repo"
  mkdir -p "$repo"
  git init -q "$repo"
  printf '%s' "$repo"
}

commit_file() {
  repo="$1"
  name="$2"
  email="$3"
  content="$4"

  (
    cd "$repo"
    printf '%s\n' "$content" >note.txt
    git add note.txt
    GIT_AUTHOR_NAME="$name" \
    GIT_AUTHOR_EMAIL="$email" \
    GIT_COMMITTER_NAME="$name" \
    GIT_COMMITTER_EMAIL="$email" \
      git commit -q -m "commit from $name"
  )
}

expect_success() {
  output_file=$(mktemp)

  if ! "$@" >"$output_file" 2>&1; then
    cat "$output_file" >&2
    rm -f "$output_file"
    fail "expected success: $*"
  fi

  rm -f "$output_file"
}

expect_failure() {
  output_file=$(mktemp)

  if "$@" >"$output_file" 2>&1; then
    rm -f "$output_file"
    fail "expected failure: $*"
  fi

  rm -f "$output_file"
}

test_scan_range_ignores_repo_local_identity() {
  repo=$(new_repo)

  (
    cd "$repo"
    commit_file "$repo" "alice" "alice@example.com" "first"
    root_commit=$(git rev-list --max-parents=0 HEAD)
    commit_file "$repo" "bob" "bob@example.com" "second"
    git config identity.guard.name "local-only"
    git config identity.guard.email "local-only@example.com"
    expect_success "$guard_script" scan-range "$root_commit" HEAD
  )

  cleanup
  tmpdir=''
}

test_pre_commit_enforces_repo_local_identity() {
  repo=$(new_repo)

  (
    cd "$repo"
    git config user.name "wrong"
    git config user.email "wrong@example.com"
    git config identity.guard.name "expected"
    git config identity.guard.email "expected@example.com"
    printf '%s\n' "draft" >note.txt
    git add note.txt
    expect_failure "$guard_script" pre-commit

    git config user.name "expected"
    git config user.email "expected@example.com"
    expect_success "$guard_script" pre-commit
  )

  cleanup
  tmpdir=''
}

test_misconfigured_identity_fails_closed() {
  repo=$(new_repo)

  (
    cd "$repo"
    git config user.name "expected"
    git config user.email "expected@example.com"
    git config identity.guard.name "expected"
    printf '%s\n' "draft" >note.txt
    git add note.txt
    expect_failure "$guard_script" pre-commit
  )

  cleanup
  tmpdir=''
}

trap cleanup EXIT HUP INT TERM

tmpdir=''

test_scan_range_ignores_repo_local_identity
test_pre_commit_enforces_repo_local_identity
test_misconfigured_identity_fails_closed
