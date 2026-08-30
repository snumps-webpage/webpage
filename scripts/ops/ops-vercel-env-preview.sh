#!/usr/bin/env bash
# Vercel Preview 스코프에 dev Supabase 값 등록 — REST API 직접 호출.
# (프로젝트에 Git repo가 연결돼 있지 않아 CLI의 preview add가 non-interactive에서 막힌다.)
# 토큰·값은 파일→셸 변수로만 흐르고 출력하지 않는다.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a
TOKEN="$(jq -r .token "$HOME/.local/share/com.vercel.cli/auth.json")"
PROJECT="prj_mS3WYNZNBiay5bcJjmxzsckJLb9A"
TEAM="team_fPTrYzHbubXWVRi0LV5DIVIb"

add() { # add <NAME> <VALUE> <plain|encrypted>
  local type_="encrypted"
  [ "${3:-}" = "plain" ] && type_="plain"
  local code
  code="$(jq -n --arg k "$1" --arg v "$2" --arg t "$type_" \
      '{key:$k, value:$v, type:$t, target:["preview"]}' \
    | curl -s -o /dev/null -w "%{http_code}" \
      -X POST "https://api.vercel.com/v10/projects/$PROJECT/env?teamId=$TEAM&upsert=true" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      --data-binary @-)"
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then echo "set  $1"; else echo "FAIL $1 (HTTP $code)"; fi
}

add SUPABASE_URL "$SUPABASE_URL" plain
add SUPABASE_SECRET_KEY "$SUPABASE_SECRET_KEY" encrypted
add SUPABASE_ASSETS_BUCKET "$SUPABASE_ASSETS_BUCKET" plain
add SUPABASE_STAGING_BUCKET "$SUPABASE_STAGING_BUCKET" plain
add SUPABASE_BACKUPS_BUCKET "$SUPABASE_BACKUPS_BUCKET" plain
add ASSETS_CDN_URL "$ASSETS_CDN_URL" plain
add DATA_BACKEND "supabase" plain
