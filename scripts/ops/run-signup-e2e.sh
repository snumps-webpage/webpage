#!/usr/bin/env bash
# 가입 라이프사이클 라이브 E2E — dev Supabase 대상 (prod 금지)
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a
if ! printf '%s' "$SUPABASE_URL" | grep -q "gcahkryexewswzvtfltj"; then
  echo "!! .env가 dev 프로젝트를 가리키지 않습니다 — 중단"; exit 1
fi
LIVE_E2E=1 npx vitest run src/lib/server/services/signup-e2e.live.test.ts 2>&1 | tail -12
