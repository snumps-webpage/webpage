#!/usr/bin/env bash
# applicant-guard 진단 로그 폴링 (runtime-logs REST)
set -euo pipefail
TOKEN="$(jq -r .token "$HOME/.local/share/com.vercel.cli/auth.json")"
DPL="dpl_Hv6qVQmcttcH4wKEj8fMtccfLK9N"
TEAM="team_fPTrYzHbubXWVRi0LV5DIVIb"
PROJECT="prj_mS3WYNZNBiay5bcJjmxzsckJLb9A"
curl -s --max-time 25 \
  "https://api.vercel.com/v1/projects/$PROJECT/deployments/$DPL/runtime-logs?format=lines" \
  -H "Authorization: Bearer $TOKEN" &
CURL_PID=$!
sleep 20
kill $CURL_PID 2>/dev/null || true
wait 2>/dev/null || true
