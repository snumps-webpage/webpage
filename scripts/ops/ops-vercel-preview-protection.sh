#!/usr/bin/env bash
# Preview 배포의 Vercel SSO 보호 토글. usage: ops-vercel-preview-protection.sh off|on
set -euo pipefail
TOKEN="$(jq -r .token "$HOME/.local/share/com.vercel.cli/auth.json")"
PROJECT="prj_mS3WYNZNBiay5bcJjmxzsckJLb9A"
TEAM="team_fPTrYzHbubXWVRi0LV5DIVIb"
case "${1:-off}" in
  off) BODY='{"ssoProtection":null}' ;;
  on)  BODY='{"ssoProtection":{"deploymentType":"preview"}}' ;;
esac
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -X PATCH "https://api.vercel.com/v9/projects/$PROJECT?teamId=$TEAM" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$BODY"
