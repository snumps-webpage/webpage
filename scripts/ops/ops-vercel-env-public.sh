#!/usr/bin/env bash
# 비밀 아닌 env를 --no-sensitive로 재등록 (env pull 검증 가능하게)
set -euo pipefail
cd "$(dirname "$0")/../.."
add() {
  vercel env add "$1" production --value "$2" --yes --force --no-sensitive >/dev/null 2>&1 \
    && echo "set  $1" || echo "FAIL $1"
}
add SUPABASE_URL "https://rwlvnttpaqkhpebtebif.supabase.co"
add SUPABASE_ASSETS_BUCKET "assets"
add SUPABASE_STAGING_BUCKET "staging"
add SUPABASE_BACKUPS_BUCKET "backups"
add ASSETS_CDN_URL "https://rwlvnttpaqkhpebtebif.supabase.co/storage/v1/object/public/assets"
add DATA_BACKEND "supabase"
add GITHUB_BACKUP_REPO "snumps-webpage/snumps-backups"
add PUBLIC_SITE_ORIGIN "https://snumps.vercel.app"
