#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a
node scripts/ops/ops-check-buckets.mjs
