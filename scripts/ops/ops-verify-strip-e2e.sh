#!/usr/bin/env bash
# 입구 차단 재검증: 구글 이름·폼 필드에 비가시 문자를 넣어 실제 /signup 제출 →
# 저장된 신청 행이 깨끗한지 dev DB에서 확인 → 행 정리
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a

SHY=$'­'
ZWSP=$'​'
EMAIL="strip-probe@snu.ac.kr"
NAME="${SHY}차단검증 / 학부생 / 수리${ZWSP}과학부"

TOKEN="$(node scripts/ops/forge-session.mjs "$EMAIL" "$NAME")"

echo "== POST /signup (오염된 이름/필드로 제출)"
curl -s -X POST "http://localhost:5199/signup" \
  -H "Cookie: authjs.session-token=$TOKEN" \
  --data-urlencode "phone=010${SHY}-1234-5678" \
  --data-urlencode "studentId=2024-${ZWSP}12345" \
  --data-urlencode "background=배경${SHY}지식" \
  --data-urlencode "agreement=on" | head -c 120
echo

echo "== 저장된 행 검사"
node scripts/ops/ops-strip-probe-check.mjs "$EMAIL"
