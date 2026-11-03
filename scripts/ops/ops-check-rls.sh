#!/usr/bin/env bash
# RLS deny-all 실측 — publishable 키로는 아무것도 못 읽어야 한다 (정책 0개 = 전부 거부)
set -euo pipefail
cd "$(dirname "$0")/../.."
SUPABASE_URL="https://gcahkryexewswzvtfltj.supabase.co"
PUBKEY="$(jq -r '.[] | select(.type=="publishable") | .api_key' .env.keys-dev.json | head -1)"
if [ -z "$PUBKEY" ] || [ "$PUBKEY" = "null" ]; then
  PUBKEY="$(jq -r '.[] | select(.name=="anon") | .api_key' .env.keys-dev.json | head -1)"
fi
SUPABASE_SECRET_KEY="$(jq -r '.[] | select(.type=="secret") | .api_key' .env.keys-dev.json | head -1)"
if [ -z "$SUPABASE_SECRET_KEY" ] || [ "$SUPABASE_SECRET_KEY" = "null" ]; then
  echo "INCOMPLETE — dev secret key required for known-resource controls" >&2
  exit 1
fi
export SUPABASE_URL PUBKEY SUPABASE_SECRET_KEY
node scripts/ops/ops-check-rls.mjs
