#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
. ./.env
set +a
node scripts/ops/ops-t3-gate.mjs
