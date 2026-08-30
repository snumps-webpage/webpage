#!/usr/bin/env bash
# Supabase 셋업 자동화 — 모든 비밀값은 파일로만 흐르고 stdout에 절대 찍지 않는다.
# 산출: .env (dev 개발용), .env.prod-secrets (운영자가 Vercel에 옮길 값), dev DB 마이그레이션 적용.
set -euo pipefail
cd "$(dirname "$0")/../.."

PROD_REF="rwlvnttpaqkhpebtebif"
DEV_REF="gcahkryexewswzvtfltj"
DEVPW="$(tr -d '\n' < .env.devdbpass)"

step() { echo "== $1"; }

# ---- 1) API 키를 파일로만 수집 ------------------------------------------------
step "dev/prod API keys -> files (never printed)"
supabase projects api-keys --project-ref "$DEV_REF"  --reveal -o json 2>/dev/null > .env.keys-dev.json
supabase projects api-keys --project-ref "$PROD_REF" --reveal -o json 2>/dev/null > .env.keys-prod.json
chmod 600 .env.keys-dev.json .env.keys-prod.json
DEV_SECRET="$(jq -r '.[] | select(.type=="secret") | .api_key' .env.keys-dev.json | head -1)"
PROD_SECRET="$(jq -r '.[] | select(.type=="secret") | .api_key' .env.keys-prod.json | head -1)"
if [ -z "$DEV_SECRET" ] || [ "$DEV_SECRET" = "null" ]; then
  # sb_secret 키가 아직 없으면 legacy service_role로 폴백하지 않고 표시만 남긴다
  echo "!! dev sb_secret key not found in api-keys output — check .env.keys-dev.json manually"
fi
if [ -z "$PROD_SECRET" ] || [ "$PROD_SECRET" = "null" ]; then
  echo "!! prod sb_secret key not found — check .env.keys-prod.json manually"
fi

# ---- 2) .env (로컬 dev) 조립 --------------------------------------------------
step "write .env (dev project, for local development)"
if [ -f .env ]; then cp .env ".env.backup-$(date +%s)"; fi
{
  # 기존 .env의 비-Supabase 줄 보존 (있다면)
  if [ -f .env ]; then grep -vE '^(SUPABASE_|ASSETS_CDN_URL|DATA_BACKEND)' .env || true; fi
  echo ""
  echo "# --- Supabase dev (ops-setup.sh 생성) ---"
  echo "SUPABASE_URL=https://${DEV_REF}.supabase.co"
  echo "SUPABASE_SECRET_KEY=${DEV_SECRET}"
  echo "SUPABASE_ASSETS_BUCKET=assets"
  echo "SUPABASE_STAGING_BUCKET=staging"
  echo "SUPABASE_BACKUPS_BUCKET=backups"
  echo "ASSETS_CDN_URL=https://${DEV_REF}.supabase.co/storage/v1/object/public/assets"
  echo "DATA_BACKEND=supabase"
} > .env.new && mv .env.new .env
chmod 600 .env

# ---- 3) 운영자용 prod 값 파일 -------------------------------------------------
step "write .env.prod-secrets (operator copies these into Vercel)"
{
  echo "# Vercel(Production) env에 옮길 값 — docs/OPERATOR-TODO.md 3절"
  echo "SUPABASE_URL=https://${PROD_REF}.supabase.co"
  echo "SUPABASE_SECRET_KEY=${PROD_SECRET}"
  echo "SUPABASE_ASSETS_BUCKET=assets"
  echo "SUPABASE_STAGING_BUCKET=staging"
  echo "SUPABASE_BACKUPS_BUCKET=backups"
  echo "ASSETS_CDN_URL=https://${PROD_REF}.supabase.co/storage/v1/object/public/assets"
  echo "DATA_BACKEND=supabase"
  echo "# CRON_SECRET / HEALTHCHECKS_PING_URL / GITHUB_BACKUP_* 은 OPERATOR-TODO 절차로 별도 발급"
} > .env.prod-secrets
chmod 600 .env.prod-secrets

# ---- 4) dev 프로젝트에 마이그레이션 적용 ---------------------------------------
step "link + db push (dev)"
supabase link --project-ref "$DEV_REF" -p "$DEVPW" 2>&1 | grep -viE "password|new version|recommend" || true
for i in 1 2 3 4 5; do
  if supabase db push -p "$DEVPW" --include-all --yes 2>&1 | grep -viE "password|new version|recommend"; then
    break
  fi
  echo "   retry $i (db may still be provisioning)"; sleep 20
done

step "done"
