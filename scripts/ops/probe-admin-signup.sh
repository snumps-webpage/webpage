#!/usr/bin/env bash
# 부트스트랩 관리자의 /signup·/admin 접근 재현 (로컬 dev 서버)
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a
EMAIL="${1:-bootadmin@snu.ac.kr}"
TOKEN="$(node scripts/ops/forge-session.mjs "$EMAIL" "부트 관리자 / 운영진 / 수리과학부")"
probe() {
  local path="$1"
  curl -s -o /dev/null -w "%{http_code} " -D /tmp/claude-1000/-home-toxiclemon-Working-webpage/5ee05ade-3617-426c-ae18-1efaafcb5854/scratchpad/probe-headers.txt \
    -H "Cookie: authjs.session-token=$TOKEN" "http://localhost:5199$path"
  grep -i "^location:" /tmp/claude-1000/-home-toxiclemon-Working-webpage/5ee05ade-3617-426c-ae18-1efaafcb5854/scratchpad/probe-headers.txt | tr -d '\r' || echo "(no redirect)"
}
echo -n "/signup  -> "; probe /signup
echo -n "/admin   -> "; probe /admin
echo -n "/        -> "; probe /
echo -n "/study   -> "; probe /study
