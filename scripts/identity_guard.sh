#!/bin/sh

set -eu

zero_sha='0000000000000000000000000000000000000000'

resolve_remote_default_ref() {
  remote_name="${1:-}"

  [ -n "$remote_name" ] || return 0

  symbolic_ref=$(git symbolic-ref --quiet --short "refs/remotes/$remote_name/HEAD" 2>/dev/null || true)

  if [ -n "$symbolic_ref" ]; then
    printf '%s' "$symbolic_ref"
    return 0
  fi

  remote_head=$(git remote show "$remote_name" 2>/dev/null | sed -n 's/.*HEAD branch: //p' | head -n 1)

  if [ -n "$remote_head" ]; then
    printf '%s/%s' "$remote_name" "$remote_head"
  fi
}

resolve_pre_push_base() {
  remote_name="$1"
  local_sha="$2"
  remote_sha="$3"

  if [ -n "$remote_sha" ] && [ "$remote_sha" != "$zero_sha" ] &&
    git rev-parse --verify "${remote_sha}^{commit}" >/dev/null 2>&1; then
    printf '%s' "$remote_sha"
    return 0
  fi

  default_ref=$(resolve_remote_default_ref "$remote_name")

  if [ -n "$default_ref" ] && git rev-parse --verify "$default_ref" >/dev/null 2>&1; then
    git merge-base "$local_sha" "$default_ref"
    return 0
  fi

  printf '%s' "$zero_sha"
}

expected_name() {
  if [ -n "${IDENTITY_GUARD_NAME:-}" ]; then
    printf '%s' "$IDENTITY_GUARD_NAME"
    return 0
  fi

  git config --get identity.guard.name 2>/dev/null ||
    git config --get identity.guardName 2>/dev/null ||
    true
}

expected_email() {
  if [ -n "${IDENTITY_GUARD_EMAIL:-}" ]; then
    printf '%s' "$IDENTITY_GUARD_EMAIL"
    return 0
  fi

  git config --get identity.guard.email 2>/dev/null ||
    git config --get identity.guardEmail 2>/dev/null ||
    true
}

normalize_email() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

load_expected_identity() {
  guard_name=$(expected_name)
  guard_email=$(expected_email)

  if [ -z "$guard_name" ] && [ -z "$guard_email" ]; then
    return 1
  fi

  if [ -z "$guard_name" ] || [ -z "$guard_email" ]; then
    printf '%s\n' 'identity guard misconfigured: set both identity.guard.name and identity.guard.email, or unset both to disable exact-identity mode' >&2
    exit 1
  fi

  return 0
}

extract_ident_name() {
  printf '%s\n' "$1" | sed -E 's/ <[^>]+>.*$//'
}

extract_ident_email() {
  printf '%s\n' "$1" | sed -E 's/^.*<([^>]+)>.*$/\1/'
}

denylist_pattern() {
  first_name=$(printf '\144\145\156\156\151\163')
  last_name=$(printf '\147\157\163\154\141\162')
  legacy_brand=$(printf '\153\141\155\151\171\157')
  legacy_alias=$(printf '\155\151\172\165\153\151')
  legacy_account=$(printf '\153\141\155\151\171\157\055\141\151')
  legacy_domain=$(printf '\153\141\155\151\171\157\056\141\151')
  printf '%s' "${first_name}[[:space:]]+${last_name}|${legacy_brand}|${legacy_alias}|${legacy_account}|${legacy_domain}"
}

denylist_label() {
  printf '%s' 'blocked legacy identifier'
}

fail_with_paths() {
  message="$1"
  paths="$2"

  printf '%s\n' "$message" >&2
  printf '%s\n' "$paths" >&2
  exit 1
}

fail_with_commit() {
  message="$1"
  commit_sha="$2"

  printf '%s\n' "$message" >&2
  printf '%s\n' "$commit_sha" >&2
  exit 1
}

check_exact_identity() {
  label="$1"
  actual_name="$2"
  actual_email="$3"

  if ! load_expected_identity; then
    return 0
  fi

  if [ "$actual_name" != "$guard_name" ] || [ "$(normalize_email "$actual_email")" != "$(normalize_email "$guard_email")" ]; then
    printf '%s\n' "identity guard blocked: $label must be '$guard_name <$guard_email>' but was '$actual_name <$actual_email>'" >&2
    exit 1
  fi
}

check_author_identity() {
  pattern=$(denylist_pattern)
  author_ident=$(git var GIT_AUTHOR_IDENT 2>/dev/null || true)
  committer_ident=$(git var GIT_COMMITTER_IDENT 2>/dev/null || true)

  if printf '%s\n%s\n' "$author_ident" "$committer_ident" | LC_ALL=C grep -Eiq "$pattern"; then
    printf '%s\n' "commit blocked: $(denylist_label) found in author or committer identity" >&2
    exit 1
  fi

  check_exact_identity 'author identity' "$(extract_ident_name "$author_ident")" "$(extract_ident_email "$author_ident")"
  check_exact_identity 'committer identity' "$(extract_ident_name "$committer_ident")" "$(extract_ident_email "$committer_ident")"
}

check_staged_content() {
  pattern=$(denylist_pattern)
  matches=$(LC_ALL=C git grep --cached -lI -E -i -e "$pattern" -- . || true)

  if [ -n "$matches" ]; then
    fail_with_paths "commit blocked: $(denylist_label) found in staged content" "$matches"
  fi
}

check_head_tree() {
  pattern=$(denylist_pattern)

  if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    exit 0
  fi

  matches=$(LC_ALL=C git grep -lI -E -i -e "$pattern" HEAD -- . || true)

  if [ -n "$matches" ]; then
    fail_with_paths "check failed: $(denylist_label) found in repository tree" "$matches"
  fi
}

check_message_file() {
  pattern=$(denylist_pattern)
  message_file="$1"

  if [ ! -f "$message_file" ]; then
    return 0
  fi

  if LC_ALL=C grep -Eiq "$pattern" "$message_file"; then
    printf '%s\n' "commit blocked: $(denylist_label) found in commit message" >&2
    exit 1
  fi
}

range_commits() {
  base_sha="$1"
  head_sha="$2"

  if [ "$head_sha" = "$zero_sha" ]; then
    return 0
  fi

  if [ -z "$base_sha" ] || [ "$base_sha" = "$zero_sha" ]; then
    git rev-list "$head_sha"
    return 0
  fi

  git rev-list "${base_sha}..${head_sha}"
}

check_commit_metadata() {
  pattern=$(denylist_pattern)
  commit_sha="$1"
  metadata=$(git show -s --format='%an%n%ae%n%cn%n%ce%n%B' "$commit_sha")

  if printf '%s\n' "$metadata" | LC_ALL=C grep -Eiq "$pattern"; then
    fail_with_commit "check failed: $(denylist_label) found in commit metadata" "$commit_sha"
  fi
}

check_commit_tree() {
  pattern=$(denylist_pattern)
  commit_sha="$1"
  matches=$(LC_ALL=C git grep -lI -E -i -e "$pattern" "$commit_sha" -- . || true)

  if [ -n "$matches" ]; then
    fail_with_paths "check failed: $(denylist_label) found in committed content" "$matches"
  fi
}

check_range() {
  base_sha="$1"
  head_sha="$2"
  commits_file=$(mktemp)

  trap 'rm -f "$commits_file"' EXIT HUP INT TERM
  range_commits "$base_sha" "$head_sha" >"$commits_file"

  if [ ! -s "$commits_file" ]; then
    exit 0
  fi

  while IFS= read -r commit_sha; do
    check_commit_metadata "$commit_sha"
    check_commit_tree "$commit_sha"
  done <"$commits_file"
}

check_pre_push() {
  remote_name="${1:-}"

  while IFS=' ' read -r local_ref local_sha remote_ref remote_sha; do
    [ -n "${local_sha:-}" ] || continue
    [ "$local_sha" = "$zero_sha" ] && continue

    base_sha=$(resolve_pre_push_base "$remote_name" "$local_sha" "${remote_sha:-$zero_sha}")
    check_range "$base_sha" "$local_sha"
  done
}

usage() {
  cat <<'EOF'
usage:
  scripts/identity_guard.sh pre-commit
  scripts/identity_guard.sh prepare-commit-msg <message-file>
  scripts/identity_guard.sh commit-msg <message-file>
  scripts/identity_guard.sh pre-push [<remote-name>]
  scripts/identity_guard.sh scan-tree
  scripts/identity_guard.sh scan-range <base-sha> <head-sha>
EOF
}

command_name="${1:-}"

case "$command_name" in
  pre-commit)
    check_author_identity
    check_staged_content
    ;;
  prepare-commit-msg)
    [ "$#" -ge 2 ] || {
      usage
      exit 1
    }
    check_author_identity
    check_staged_content
    check_message_file "$2"
    ;;
  commit-msg)
    [ "$#" -ge 2 ] || {
      usage
      exit 1
    }
    check_message_file "$2"
    ;;
  pre-push)
    check_pre_push "${2:-}"
    ;;
  scan-tree)
    check_head_tree
    ;;
  scan-range)
    [ "$#" -eq 3 ] || {
      usage
      exit 1
    }
    check_range "$2" "$3"
    ;;
  *)
    usage
    exit 1
    ;;
esac
