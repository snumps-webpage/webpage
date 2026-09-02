#!/usr/bin/env bash
# Supabase dev 프로젝트 생성 — 비밀번호는 파일→셸 치환으로만 전달 (stdout 미노출)
set -euo pipefail
cd "$(dirname "$0")/../.."
PW="$(tr -d '\n' < .env.devdbpass)"
supabase projects create snumps-dev \
  --org-id xbqjlcwonrobmvulheta \
  --region ap-northeast-1 \
  --db-password "$PW" \
  -o json 2>/dev/null | grep -vi "password" | head -25
