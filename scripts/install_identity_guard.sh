#!/bin/sh

set -eu

usage() {
  cat <<'EOF'
usage:
  scripts/install_identity_guard.sh <name> <email>

or set:
  IDENTITY_GUARD_NAME
  IDENTITY_GUARD_EMAIL
EOF
}

guard_name="${1:-${IDENTITY_GUARD_NAME:-}}"
guard_email="${2:-${IDENTITY_GUARD_EMAIL:-}}"

if [ -z "$guard_name" ] || [ -z "$guard_email" ]; then
  usage
  exit 1
fi

git config --local core.hooksPath .githooks
git config --local user.name "$guard_name"
git config --local user.email "$guard_email"
git config --local identity.guard.name "$guard_name"
git config --local identity.guard.email "$guard_email"

printf '%s\n' "identity guard installed for $guard_name <$guard_email>"
printf '%s\n' 'core.hooksPath=.githooks'
