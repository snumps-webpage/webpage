#!/usr/bin/env bash
# Vercel Production env 등록 — 값은 .env.prod-secrets / 생성 파일에서 stdin으로만 전달 (출력 금지)
set -euo pipefail
cd "$(dirname "$0")/../.."

add() { # add <NAME> <VALUE>
  # 에이전트/CI에선 CLI가 non-interactive 기본이라 stdin 프롬프트를 건너뛰고
  # 빈 값을 저장한다 — 반드시 --value로 전달해야 한다.
  if [ -z "$2" ]; then echo "SKIP $1 (empty value)"; return; fi
  vercel env add "$1" production --value "$2" --yes --force >/dev/null 2>&1 \
    && echo "set  $1" || echo "FAIL $1"
}

# 1) Supabase prod 값 (.env.prod-secrets 로드 — 주석 줄 무시)
set -a
. ./.env.prod-secrets
set +a
add SUPABASE_URL "$SUPABASE_URL"
add SUPABASE_SECRET_KEY "$SUPABASE_SECRET_KEY"
add SUPABASE_ASSETS_BUCKET "$SUPABASE_ASSETS_BUCKET"
add SUPABASE_STAGING_BUCKET "$SUPABASE_STAGING_BUCKET"
add SUPABASE_BACKUPS_BUCKET "$SUPABASE_BACKUPS_BUCKET"
add ASSETS_CDN_URL "$ASSETS_CDN_URL"
add DATA_BACKEND "$DATA_BACKEND"

# 2) CRON_SECRET — 없으면 생성해 파일 보관 (cron-job.org 잡 헤더에 같은 값 필요)
if [ ! -f .env.cronsecret ]; then
  openssl rand -base64 32 | tr -d '\n' > .env.cronsecret
  chmod 600 .env.cronsecret
  echo "gen  .env.cronsecret (cron-job.org 잡 3개의 Authorization: Bearer 값으로 복사할 것)"
fi
add CRON_SECRET "$(cat .env.cronsecret)"

# 3) 고정 비민감 값
add GITHUB_BACKUP_REPO "snumps-webpage/snumps-backups"
add PUBLIC_SITE_ORIGIN "https://snumps.vercel.app"

echo "== done. HEALTHCHECKS_PING_URL / GITHUB_BACKUP_TOKEN 은 발급 후 별도 등록"
