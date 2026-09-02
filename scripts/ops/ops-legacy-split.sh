#!/usr/bin/env bash
# usage: ops-legacy-split.sh dev|prod
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
if [ "${1:-dev}" = "prod" ]; then . ./.env.prod-secrets; else . ./.env; fi
set +a
echo "== target: ${1:-dev} (${SUPABASE_URL})"
node scripts/ops/ops-legacy-split.mjs
