#!/usr/bin/env bash
# 격리된 실측 서버를 띄운다 — 사용법은 scripts/measure/README.md.
#
#   scripts/measure/start.sh                 # 현재 작업 트리, :5199
#   scripts/measure/start.sh --ref HEAD --port 5198   # 대조용 (커밋된 코드)
#
# 레포를 작업 디렉터리($MEASURE_DIR, 기본 $TMPDIR/snumps-measure)로 복사하고
# 거기서만 시드 API를 끼워 넣은 뒤, .env 없이 메모리 백엔드로 vite dev를 띄운다.
# 포그라운드로 돈다 — 멈추려면 Ctrl-C.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
MEASURE_DIR="${MEASURE_DIR:-${TMPDIR:-/tmp}/snumps-measure}"
REF=""
PORT=5199
NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$NAME" ]; then
  if [ -n "$REF" ]; then NAME="ref-$(printf '%s' "$REF" | tr -c 'A-Za-z0-9._-' '_')"; else NAME="work"; fi
fi
APP="$MEASURE_DIR/$NAME"
mkdir -p "$APP"
[ -f "$MEASURE_DIR/clock-offset" ] || echo 0 > "$MEASURE_DIR/clock-offset"

# 1) 복사 — 비밀값·개인정보·빌드 산출물은 절대 가져가지 않는다.
if [ -n "$REF" ]; then
  find "$APP" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
  git -C "$REPO" archive "$REF" | tar -x -C "$APP"
else
  rsync -a --delete \
    --exclude .git --exclude node_modules --exclude '.env*' \
    --exclude backups --exclude exports --exclude .extra \
    --exclude .vercel --exclude .svelte-kit --exclude .claude \
    --exclude '*.docx' --exclude scripts/migration/out \
    "$REPO/" "$APP/"
fi
ln -sfn "$REPO/node_modules" "$APP/node_modules"

# 2) 시드 API는 복사본에만 — 레포의 src/에는 없다.
mkdir -p "$APP/src/routes/api/__probe"
cp "$REPO/scripts/measure/inject/probe-server.ts" "$APP/src/routes/api/__probe/+server.ts"

# 3) 깨끗한 환경으로 기동. 여기서 넣지 않은 env는 존재하지 않는다.
#    Google 값은 가짜라 메일 토큰 발급이 실패한다 — 메일은 한 통도 나가지 않는다.
echo "measure server: $APP → http://127.0.0.1:$PORT (log: $MEASURE_DIR/$NAME.log)"
cd "$APP"
exec env -i PATH="$PATH" HOME="$MEASURE_DIR" \
  NODE_OPTIONS="--require $REPO/scripts/measure/clock.cjs" \
  FAKE_CLOCK_FILE="$MEASURE_DIR/clock-offset" \
  DATA_BACKEND=memory \
  AUTH_SECRET="${MEASURE_AUTH_SECRET:-measure-secret-0123456789abcdef}" \
  GOOGLE_CLIENT_ID=dummy GOOGLE_CLIENT_SECRET=dummy ADMIN_REFRESH_TOKEN=dummy \
  ADMINS_EMAILS=admin@snu.ac.kr CRON_SECRET=measure-cron \
  PROBE_TOKEN="${MEASURE_PROBE_TOKEN:-probe-token}" \
  SITE_ORIGIN="http://127.0.0.1:$PORT" \
  ./node_modules/.bin/vite dev --port "$PORT" --strictPort --host 127.0.0.1 \
  > "$MEASURE_DIR/$NAME.log" 2>&1
