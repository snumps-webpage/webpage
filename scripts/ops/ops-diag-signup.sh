#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env.prod-secrets
set +a
ADMINS_EMAILS="$(grep -E '^ADMINS_EMAILS=' .env.migration | cut -d'"' -f2)"
export ADMINS_EMAILS
node scripts/ops/ops-diag-signup.mjs
