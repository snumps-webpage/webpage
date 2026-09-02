#!/usr/bin/env bash
# dev 시드 — .env를 셸 안에서만 로드, 값은 출력하지 않음
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a
npx tsx scripts/seed-dev.ts 2>&1 | grep -viE "sb_secret|secret_key" | tail -30
