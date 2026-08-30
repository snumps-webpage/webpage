#!/usr/bin/env bash
# 로컬 .env에 Auth 관련 키 추가 — AUTH_SECRET은 생성값, 값은 출력하지 않음
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! grep -q "^AUTH_SECRET=" .env; then
  {
    echo ""
    echo "# --- Auth (로컬 dev) ---"
    echo "AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')"
    echo "GOOGLE_CLIENT_ID=dev-placeholder"
    echo "GOOGLE_CLIENT_SECRET=dev-placeholder"
    echo "PUBLIC_SITE_ORIGIN=http://localhost:5199"
  } >> .env
  echo "added AUTH_SECRET + placeholders"
else
  echo "AUTH_SECRET already present"
fi
