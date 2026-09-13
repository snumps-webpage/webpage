#!/usr/bin/env bash
# 렌더되는 오류 페이지가 HTTP 상태를 지키는지 실측한다 (W-1).
# 루트 레이아웃이 await 없는 프로미스를 반환하면 모든 렌더 응답이 스트리밍이 되고,
# SvelteKit의 스트리밍 분기는 Response에 status를 싣지 않는다(kit#12533, kit#12987).
# 단위 테스트로는 잡히지 않는 층이라 실제 서버에 물어본다.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${PORT:-5399}"
BASE="http://[::1]:${PORT}"

npx vite dev --port "$PORT" --strictPort >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' EXIT
curl -s -o /dev/null --retry 40 --retry-all-errors --retry-delay 1 "$BASE/" || {
  echo "dev 서버가 뜨지 않았다"; exit 1;
}

fail=0
check() { # check <경로> <기대 코드> <설명>
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "$BASE$1")"
  if [ "$code" = "$2" ]; then
    printf '  ok   %-28s %s  (%s)\n' "$1" "$code" "$3"
  else
    printf '  FAIL %-28s %s  기대 %s  (%s)\n' "$1" "$code" "$2" "$3"
    fail=1
  fi
}

echo "상태 코드 (환경과 무관한 것만 단언한다)"
check /zzz-does-not-exist 404 "라우트 미매칭 — 오류 페이지를 렌더한다"
check /archive/nope       404 "아카이브 하위 미매칭"
check /admin              404 "훅에서 throw — 렌더를 거치지 않는 경로"
check /                   200 "정상 페이지"

echo "참고 (데이터 계층 설정에 따라 달라진다)"
for path in /members /about/executives /api/health; do
  printf '  %-28s %s\n' "$path" "$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")"
done

exit "$fail"
