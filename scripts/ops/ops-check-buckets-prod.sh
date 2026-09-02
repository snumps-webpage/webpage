#!/usr/bin/env bash
# prod 버킷 확인 — .env.prod-secrets를 셸 안에서만 로드
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env.prod-secrets
set +a
node scripts/ops/ops-check-buckets.mjs
