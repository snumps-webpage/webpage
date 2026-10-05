#!/usr/bin/env bash
# The app key of a commit: a hash of its tree without docs/, scripts/ and root
# *.md — the files the deployed app is built from. Two commits with the same key
# build the same site.
#
# One definition for every user: release-prod.sh keys its skip records on it
# and stamps it into the build (VITE_BUILD_APP_KEY); check-deployed.mjs compares
# the live stamp with it.
#
# usage: scripts/ops/app-key.sh [ref]     (default HEAD; prints 40 hex chars)
set -euo pipefail

ref="${1:-HEAD}"
git rev-parse --verify --quiet "$ref^{commit}" > /dev/null || {
  echo "app-key: 커밋을 찾지 못했다: $ref" >&2
  exit 2
}
git ls-tree -r "$ref" | { grep -vE $'\t(docs/|scripts/|[^/]+\\.md$)' || true; } |
  git hash-object --stdin
