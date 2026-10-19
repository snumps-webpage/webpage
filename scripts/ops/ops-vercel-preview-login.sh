#!/usr/bin/env bash
# Vercel Preview 로그인 우회(snumps-webpage/D-000177·182) 환경 변수 등록·키 교체.
#
#   bash scripts/ops/ops-vercel-preview-login.sh            # 없으면 키를 만들어 등록
#   bash scripts/ops/ops-vercel-preview-login.sh --rotate   # 키 교체(기존 우회 쿠키는 모두 무효)
#
# Preview target에만 PREVIEW_LOGIN_BYPASS=on, PREVIEW_LOGIN_KEY(무작위 64자)를 넣는다.
# 키는 리포 루트 .env.preview-login(권한 600, git 제외)에만 저장하고 출력하지 않는다.
# 등록·교체 뒤에는 Preview를 다시 배포해야 반영된다.
# 접속: <Preview 주소>/<경로>?dev_preview=admin&key=<키> → 키가 빠진 주소로 이동, 쿠키 8시간.
# CLI의 preview add는 git branch를 묻는데, 세 번째 인자를 ""로 주면 모든 Preview branch에 들어간다.
set -euo pipefail
cd "$(dirname "$0")/../.."
KEYFILE=.env.preview-login

if [ "${1:-}" = "--rotate" ]; then
  rm -f "$KEYFILE"
  vercel env rm PREVIEW_LOGIN_KEY preview --yes > /dev/null 2>&1 || true
fi

if [ ! -f "$KEYFILE" ]; then
  umask 077
  printf 'PREVIEW_LOGIN_KEY=%s\n' "$(openssl rand -hex 32)" > "$KEYFILE"
fi
chmod 600 "$KEYFILE"
key="$(sed -n 's/^PREVIEW_LOGIN_KEY=//p' "$KEYFILE")"
[ "${#key}" -ge 32 ] || { echo "키가 너무 짧다: $KEYFILE"; exit 1; }

if printf '%s' "$key" | vercel env add PREVIEW_LOGIN_KEY preview "" --sensitive --yes > /dev/null 2>&1; then
  echo "set  PREVIEW_LOGIN_KEY (preview, sensitive)"
else
  echo "keep PREVIEW_LOGIN_KEY (이미 있음 — 바꾸려면 --rotate)"
fi
if vercel env add PREVIEW_LOGIN_BYPASS preview "" --value on --no-sensitive --yes > /dev/null 2>&1; then
  echo "set  PREVIEW_LOGIN_BYPASS=on (preview)"
else
  echo "keep PREVIEW_LOGIN_BYPASS (이미 있음)"
fi
echo "다음: Preview를 다시 배포해야 반영된다."
