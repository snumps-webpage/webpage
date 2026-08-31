#!/usr/bin/env bash
# 타 사용자 신청서 유출 재현: B의 신청이 큐에 있을 때 A(신청 없음)가
# applicant 존 페이지들을 돌며 B의 고유 토큰 노출 여부 검사
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a
SCRATCH="/tmp/claude-1000/-home-toxiclemon-Working-webpage/5ee05ade-3617-426c-ae18-1efaafcb5854/scratchpad"
TOKEN_A="$(node scripts/ops/forge-session.mjs bootadmin@snu.ac.kr "부트관리자 / 운영진 / 수리과학부")"
for path in /signup /signup/edit /wait /admin /admin/members; do
  slug=$(echo "$path" | tr / _)
  CODE=$(curl -s -D "$SCRATCH/lh$slug.txt" -o "$SCRATCH/lb$slug.html" \
    "http://localhost:5199$path" -H "Cookie: authjs.session-token=$TOKEN_A" -w "%{http_code}")
  LOC=$(grep -i "^location" "$SCRATCH/lh$slug.txt" | tr -d '\r' || echo "")
  HITS=$(grep -cE "유출검증대상|010-7777-3333|유출검증-배경" "$SCRATCH/lb$slug.html" || true)
  echo "$path -> $CODE $LOC | B-데이터 노출: $HITS"
done