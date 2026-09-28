#!/usr/bin/env bash
# prod 마이그레이션만 적용 — 전체 반영(백업·배포·사후 보정·확인)은 scripts/ops/release-prod.sh 를 쓴다.
#
# 이 스크립트는 db push 한 가지만 한다. 코드 배포 전에 옛 코드가 새 필드를 지울 수 있으므로
# (release-prod.sh 머리말 "왜 9단계가 있고…"), 단독으로 쓰면 배포 직후
#   bash scripts/ops/release-prod.sh --from 9
# 로 백필과 확인을 돌려야 한다.
#
# 비밀번호: .env.proddbpass가 있으면 그것을(환경변수로 넘겨 argv에 남지 않게), 없으면
# `supabase login` 세션의 로그인 역할로 접속한다.
set -Eeuo pipefail
shopt -s inherit_errexit # $(…) 안에서도 실패하면 멈춘다
case "$-" in
  *x*)
    echo "set -x로 돌리지 말 것 — 비밀값이 출력된다." >&2
    exit 1
    ;;
  *) ;;
esac
cd "$(dirname "$0")/../.."
REPO="$(pwd -P)"

readonly PROD_REF="rwlvnttpaqkhpebtebif"
readonly DEV_REF="gcahkryexewswzvtfltj"
unset SUPABASE_WORKDIR SUPABASE_PROFILE SUPABASE_PROJECT_ID SUPABASE_DB_PASSWORD SUPABASE_DB_URL

# stdin 없이(숨은 프롬프트에서 멈추지 않게), 작업 디렉터리 고정. 업데이트 안내만 거른다.
sb() {
  supabase --workdir "$REPO" "$@" < /dev/null 2>&1 | { grep -vE 'A new version of Supabase CLI|We recommend updating regularly' || true; }
}
linked_ref() { cat supabase/.temp/project-ref 2> /dev/null || true; }

# 어떤 이유로 끝나든 링크를 dev로 되돌린다 — prod에 걸린 채로 남으면 다음 로컬 db push가 prod로 간다.
# 되돌리지 못하면 링크 파일을 지워 아무 곳도 가리키지 않게 한다.
restore_dev_link() {
  unset SUPABASE_DB_PASSWORD
  if sb link --project-ref "$DEV_REF" -p "" > /dev/null && [ "$(linked_ref)" = "$DEV_REF" ]; then
    echo "== link restored to dev"
  else
    rm -f supabase/.temp/project-ref
    echo "!! dev로 다시 링크하지 못해 링크를 지웠다 — 필요하면: supabase link --project-ref $DEV_REF" >&2
  fi
}
trap restore_dev_link EXIT

AUTH=(-p "")
if [ -e .env.proddbpass ]; then
  [ -s .env.proddbpass ] || {
    echo "!! .env.proddbpass가 비어 있다 — 지우거나 비밀번호를 넣을 것." >&2
    exit 1
  }
  SUPABASE_DB_PASSWORD="$(tr -d '\r\n' < .env.proddbpass)"
  export SUPABASE_DB_PASSWORD
  AUTH=()
fi

sb link --project-ref "$PROD_REF" "${AUTH[@]}"
[ "$(linked_ref)" = "$PROD_REF" ] || {
  echo "!! 링크가 prod로 바뀌지 않았다" >&2
  exit 1
}
# --include-all 은 쓰지 않는다: 원격 이력보다 앞선 날짜의 파일을 조용히 끼워 넣는다.
sb db push --linked --dry-run "${AUTH[@]}"
read -r -p "위 파일들을 prod($PROD_REF)에 적용한다. 계속하려면 prod ref 입력: " answer < /dev/tty
[ "$answer" = "$PROD_REF" ] || {
  echo "중단" >&2
  exit 1
}
[ "$(linked_ref)" = "$PROD_REF" ] || {
  echo "!! push 직전 링크가 prod가 아니다" >&2
  exit 1
}
sb db push --linked --yes "${AUTH[@]}"
echo "== prod push done — 코드 배포가 Ready 되면 곧바로: bash scripts/ops/release-prod.sh --from 9"
