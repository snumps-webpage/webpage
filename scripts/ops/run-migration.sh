#!/usr/bin/env bash
# Notion → Supabase(prod) 이주 실행기 — env는 .env.migration(gitignored)에서만 로드
# 사용: bash scripts/ops/run-migration.sh <00|10|20|30|zod> [extra args...]
set -euo pipefail
cd "$(dirname "$0")/../.."
# Supabase prod 값은 로컬 .env.prod-secrets에서 (Vercel의 sensitive 값은 pull 불가).
# Notion 값은 vercel env pull 산출물에서 필요한 키만 추출 — 통째 source는
# 다중행 값(커밋 메시지 등) 때문에 깨진다.
grep -E '^(NOTION_API_KEY|NOTION_DB_[A-Z_]+|ADMINS_EMAILS)=' .env.migration > .env.migration.clean
chmod 600 .env.migration.clean
set -a
. ./.env.prod-secrets
. ./.env.migration.clean
set +a
step="$1"; shift || true
case "$step" in
  00) npx tsx scripts/migration/00-dump.ts "$@" ;;
  10) npx tsx scripts/migration/10-assets.ts "$@" ;;
  20) npx tsx scripts/migration/20-export-tables.ts "$@" ;;
  30) npx tsx scripts/migration/30-verify.ts "$@" ;;
  zod) npx vitest run src/lib/server/data "$@" ;;
  *) echo "unknown step: $step"; exit 1 ;;
esac
