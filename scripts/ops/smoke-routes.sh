#!/usr/bin/env bash
# 전 라우트 스모크 — 상태코드 + 서버 오류 마커 검사
set -uo pipefail
BASE="http://localhost:5199"
fail=0

probe() { # probe <path> <expected-codes-regex> [query]
  local path="$1" expect="$2" q="${3:-}"
  local url="$BASE$path$q"
  local body code
  body="$(curl -s -w $'\n%{http_code}' "$url")"
  code="${body##*$'\n'}"
  if ! [[ "$code" =~ $expect ]]; then
    echo "FAIL $code $path$q (expected $expect)"
    fail=1
    return
  fi
  if echo "$body" | grep -qiE "Internal Error|500: |svelte:error"; then
    echo "FAIL body-error $path$q"
    fail=1
    return
  fi
  echo "ok   $code $path$q"
}

echo "== guest (public)"
for p in / /login /about /about/charter /about/executives /about/elections /about/press /about/finance \
         /archive /archive/seminars /archive/studies /archive/activities /archive/gallery /archive/projects \
         /archive/misc /archive/misc/integration-bee /archive/problems /archive/discussions /members \
         /robots.txt /sitemap.xml; do
  probe "$p" "^200$"
done

echo "== guest blocked (member zone → login redirect, admin → 404)"
for p in /study /settings/notifications /seminar/apply; do
  probe "$p" "^(302|303)$"
done
for p in /admin /admin/members; do
  probe "$p" "^404$"
done

echo "== dev_preview=member"
for p in /study /study/apply /seminar/apply /settings/notifications /settings/withdraw /events/manage; do
  probe "$p" "^200$" "?dev_preview=member"
done

echo "== dev_preview=admin"
for p in /admin /admin/members /admin/activities /admin/seminars /admin/studies /admin/gallery \
         /admin/events/new /admin/events/connect; do
  probe "$p" "^200$" "?dev_preview=admin"
done

exit $fail
