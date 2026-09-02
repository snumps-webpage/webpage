#!/usr/bin/env bash
# prod 마이그레이션 적용 — .env.proddbpass 파일 필요 (운영자가 직접 생성, 절대 커밋 금지)
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ ! -f .env.proddbpass ]; then
  echo "!! .env.proddbpass 없음 — 프롬프트에서 다음처럼 직접 만들어 주세요 (값은 Supabase 대시보드의 webpage 프로젝트 DB 비밀번호):"
  echo "   ! printf '%s' '<비밀번호>' > .env.proddbpass && chmod 600 .env.proddbpass"
  exit 1
fi
PW="$(tr -d '\n' < .env.proddbpass)"
supabase link --project-ref rwlvnttpaqkhpebtebif -p "$PW" 2>&1 | grep -viE "password|new version|recommend" || true
supabase db push -p "$PW" --include-all --yes 2>&1 | grep -viE "password|new version|recommend"
# 이후 로컬 개발이 dev를 다시 보도록 링크 원복
DEVPW="$(tr -d '\n' < .env.devdbpass)"
supabase link --project-ref gcahkryexewswzvtfltj -p "$DEVPW" 2>&1 | grep -viE "password|new version|recommend" || true
echo "== prod push done, link restored to dev"
