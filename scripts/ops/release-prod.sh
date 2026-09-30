#!/usr/bin/env bash
# release-prod.sh — chore/code-audit-v2를 운영(prod)에 반영하는 전 과정 (docs/OPERATOR-TODO.md §2-2)
#
#   bash scripts/ops/release-prod.sh              # 1단계부터, 단계마다 확인을 받는다
#   bash scripts/ops/release-prod.sh --from 9     # 9단계부터 재개 (중단된 뒤)
#   DRY_RUN=1 bash scripts/ops/release-prod.sh    # 절차만 훑는다 — 바꾸는 명령은 출력만, 질문은 건너뜀
#   SKIP_PREVIEW=1 bash scripts/ops/release-prod.sh   # 프리뷰 배포 없이 (3단계를 로컬 점검으로 대신)
#   FORCE=1 bash scripts/ops/release-prod.sh     # 이 커밋으로 이미 끝낸 단계도 전부 다시
#   DEPLOY_VIA=prebuilt bash scripts/ops/release-prod.sh
#                                                 # git 연동 배포에 더해 로컬 prebuilt도 올린다 (7단계)
#
# 다시 돌려도 된다: 끝낸 단계는 .git/release-prod.state에 기록되고 다시 돌리면 건너뛴다.
#   - 2 검증·3 프리뷰: 배포 내용(트리에서 docs/·scripts/·루트 *.md를 뺀 것)이 같으면 — 문서나 이
#     스크립트만 고친 커밋은 테스트를 다시 돌리지 않는다.
#   - 7 push·8 배포 확인·9 보정·10 재확인: 같은 커밋(HEAD)이면.
# 백업은 6시간 안의 것을 다시 쓴다. prod를 보는 단계(1·5·6·11·12)는 매번 실제 상태를 다시 읽는다 —
# 6단계는 이미 적용된 마이그레이션을 건너뛴다.
# tmux·screen 안에서 돌릴 것 — 6단계(db push) 도중 SSH가 끊기면 적용이 중간에서 멈출 수 있다.
# DRY_RUN은 파싱을 한 번도 거치지 않는다(prod를 읽지 않으므로) — 실제 판정은 실제 실행에서만 한다.
#
# 단계
#   1 사전 점검            도구·로그인·링크 상태·브랜치·깨끗한 트리·main 빨리감기·보호 규칙
#   2 로컬 검증            테스트·타입·린트·포맷·빌드, 서버 번들에 PGlite 없음 → 검증한 커밋을 기록
#   3 프리뷰 확인 (수동)   pnpm 설치, SNU 계정 실로그인, 세미나 흐름 스모크 (SKIP_PREVIEW=1이면 생략)
#   4 prod 백업            세 테이블 전부를 SQL 한 문장(한 스냅숏)으로 backups/에 (롤백의 유일한 수단)
#   5 사전 검사            적용될 파일이 정확히 예상한 5개인지, dry-run, 조회 결과 판독 시험
#   6 적용                 백업·쓰기 동결 확인 → db push (여기서부터 9단계까지 서두른다)
#   7 배포                 전제 재확인 → origin/main을 이 커밋으로 빨리감기 push (강제 push 없음)
#   8 배포 확인            Vercel에서 Ready인 Production 배포의 커밋을 입력받아 대조
#   9 사후 보정            백필 3개 재실행 (6~8 사이 옛 코드가 지운 키를 되살린다)
#  10 확인 쿼리            흐름 19개·백필 누락 0·권한·버킷 비공개 — 통과 후 10분 뒤 9·10을 한 번 더
#  11 공개 스모크          공개 페이지 200, 버킷 상태 (읽기 전용)
#  12 3-0 복구 미리보기    배포 전 쓰기로 사라진 세미나 복구값이 있는지 (미리보기만)
#
# 왜 9단계가 있고 10단계가 두 번인가: 지금 운영 중인 코드(main)는 저장 스키마가 모르는 키를
# 쓰기 때 벗겨 낸다. 6단계의 백필이 채운 publicationStatus·kind·durationMinutes·prerequisites·
# announce·alumniRevocationReason은 옛 코드가 보기에 모르는 키다 — 6단계부터 옛 배포가 완전히
# 물러날 때까지 회원이나 세미나 표에 쓰기가 한 번이라도 일어나면 그 표의 새 필드가 사라지고,
# 새 코드는 필수 필드가 없는 표를 읽지 못한다(회원 표면 사이트 전체가 500). 옛 배포는 Ready 뒤에도
# 진행 중이던 요청이나 옛 배포 URL(*.vercel.app)로 잠시 더 쓸 수 있다. 백필은 재실행 안전하다
# (없거나 타입이 틀린 키만 채우고, 채울 때만 version을 올려 앱 캐시·CAS가 새로 읽는다). 그래서
# 배포 직후 돌리고, 10분 뒤 한 번 더 돌린다.
#
# 안전장치
#   - prod 비밀 키 파일 없이 `supabase login` 세션만으로 된다(결정 2026-09-30). .env.prod-secrets가
#     있으면 11·12단계의 보조 헬퍼만 그것을 쓰고, 셸 코드로 source하지 않고 KEY=VALUE로만 읽는다
#     (허용 목록의 키만). DB 비밀번호 파일이 있으면 argv가 아니라 SUPABASE_DB_PASSWORD로, 없으면
#     로그인 역할로 접속한다(2026-09-28 dev push가 그렇게 됐다). set -x로 돌리면 거부한다.
#   - Supabase CLI는 stdin 없이(</dev/null) 돌린다 — 숨은 프롬프트에서 멈추지 않고 바로 실패한다.
#     작업 디렉터리를 --workdir로 고정하고, 대상을 바꿀 수 있는 SUPABASE_* 환경변수는 지운다.
#   - prod 대상 명령(push·목록·조회)은 prod에 링크하고 링크 파일을 확인한 뒤에만 돌린다. 링크는
#     어떻게 끝나든 dev로 되돌리고, 되돌리지 못하면 링크 파일을 지워 아무 곳도 가리키지 않게 한다.
#   - 되돌릴 수 없는 단계(6·7·9)는 prod 프로젝트 ref를 입력해야 진행한다.
#   - 7단계는 --from으로 바로 와도 브랜치·검증한 커밋·prod 적용 완료를 다시 확인한다.
#   - 모든 판독은 실패하면 멈춘다 — 모르면 성공으로 치지 않는다.
set -Eeuo pipefail
shopt -s inherit_errexit # $(…) 안에서도 실패하면 멈춘다

case "$-" in
  *x*)
    echo "XX set -x(xtrace)로 돌리지 말 것 — 비밀값이 출력된다." >&2
    exit 1
    ;;
  *) ;;
esac

readonly PROD_REF="rwlvnttpaqkhpebtebif"
readonly DEV_REF="gcahkryexewswzvtfltj"
readonly PROD_URL="https://${PROD_REF}.supabase.co"
readonly GITHUB_REPO="snumps-webpage/webpage"
readonly RELEASE_BRANCH="chore/code-audit-v2"
readonly PROD_BRANCH="main"
readonly SITE="https://snumps.vercel.app"
readonly EXPECTED_MIGRATIONS=(
  20260928000000
  20260928000100
  20260928000200
  20260928000300
  20260928000400
)
readonly BACKFILLS=(
  supabase/migrations/20260928000100_seminar_publication_status.sql
  supabase/migrations/20260928000300_seminar_fields.sql
  supabase/migrations/20260928000400_member_revocation_reason.sql
)
readonly PUBLIC_PAGES=(/ /about /archive /archive/seminars /archive/studies /archive/projects /login)
readonly BACKUP_MAX_AGE_SECONDS=$((6 * 3600))
readonly RECHECK_DELAY_SECONDS=600

DRY_RUN="${DRY_RUN:-0}"
DEPLOY_VIA="${DEPLOY_VIA:-git}"
SKIP_PREVIEW="${SKIP_PREVIEW:-0}"
FORCE="${FORCE:-0}"
HEAD_SHA=""
APP_KEY=""
FROM=1
CURRENT_STEP=1
LINKED_PROD=0
REPLY_TEXT=""
TMP=""
REPO=""
STATE=""
DB_AUTH=(-p "")

# 대상 프로젝트·설정을 바꿀 수 있는 변수는 쓰지 않는다 (링크 파일 확인이 CLI가 실제로 쓰는 대상과
# 어긋나지 않게).
unset SUPABASE_WORKDIR SUPABASE_PROFILE SUPABASE_PROJECT_ID SUPABASE_DB_PASSWORD SUPABASE_DB_URL

# ---------------------------------------------------------------------------
# 출력·확인
# ---------------------------------------------------------------------------

say() { printf '%s\n' "$*"; }
step() { printf '\n==== [%s] %s ====\n' "$1" "$2"; }
warn() { printf '!! %s\n' "$*" >&2; }
die() {
  printf '\nXX %s\n' "$*" >&2
  exit 1
}

# 터미널에서 직접 답을 받는다 — 파이프로 흘려 넣은 입력으로 진행하지 않게.
ask() {
  local prompt="$1" answer=""
  if [ "$DRY_RUN" = 1 ]; then
    say "(DRY_RUN) 질문 건너뜀: $prompt"
    REPLY_TEXT=""
    return 0
  fi
  [ -r /dev/tty ] && [ -w /dev/tty ] || die "터미널이 없다 — 이 스크립트는 사람이 답하며 돌린다."
  printf '%s ' "$prompt" > /dev/tty
  IFS= read -r answer < /dev/tty || die "입력을 읽지 못했다."
  REPLY_TEXT="$answer"
}

confirm() {
  ask "$1 [yes 입력 시 진행]"
  [ "$DRY_RUN" = 1 ] && return 0
  [ "$REPLY_TEXT" = "yes" ] || die "중단했다. 재개: --from $CURRENT_STEP"
}

# 되돌릴 수 없는 단계: prod 프로젝트 ref(Supabase 대시보드 주소의 프로젝트 id)를 쳐야 한다.
confirm_prod() {
  ask "$1 — 계속하려면 prod 프로젝트 ref를 입력:"
  [ "$DRY_RUN" = 1 ] && return 0
  [ "$REPLY_TEXT" = "$PROD_REF" ] || die "ref가 다르다 — 중단. 재개: --from $CURRENT_STEP"
}

# 바꾸는 명령. DRY_RUN이면 출력만.
mutate() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '(DRY_RUN)'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

# Supabase CLI: stdin 없이, 작업 디렉터리 고정. 출력은 업데이트 안내만 빼고 그대로 보여 준다
# (실패 원인이 가려지지 않게 — CLI는 비밀번호 값을 출력하지 않는다). 종료 코드는 CLI의 것.
sb() {
  local log rc=0
  log="$(mktemp "$TMP/cli.XXXXXX")"
  supabase --workdir "$REPO" "$@" < /dev/null > "$log" 2>&1 || rc=$?
  grep -vE 'A new version of Supabase CLI|We recommend updating regularly' "$log" || true
  return "$rc"
}

# ---------------------------------------------------------------------------
# 상태 기록 (.git 안 — 커밋되지 않는다)
# ---------------------------------------------------------------------------

state_get() {
  [ -f "$STATE" ] || return 0 # 아직 기록이 없으면 빈 값 (inherit_errexit 아래에서 sed 실패로 죽지 않게)
  sed -n "s/^$1=//p" "$STATE" | tail -n 1
}
state_set() {
  [ "$DRY_RUN" = 1 ] && return 0
  printf '%s=%s\n' "$1" "$2" >> "$STATE"
}

# 이 커밋(HEAD)으로 이미 끝낸 단계인가. 커밋이 바뀌면 기록은 무효, FORCE=1이면 전부 다시.
# 배포 내용(APP_KEY)이 같으면 끝낸 것으로 치는 단계(2·3)용.
done_for_app() {
  [ "$FORCE" != 1 ] && [ -n "$APP_KEY" ] && [ "$(state_get "$1")" = "$APP_KEY" ]
}
done_for_head() {
  [ "$FORCE" != 1 ] && [ -n "$HEAD_SHA" ] && [ "$(state_get "$1")" = "$HEAD_SHA" ]
}
skip_note() { say "이미 끝냄 — 커밋 ${HEAD_SHA:0:7}에서 $1. 건너뛴다 (다시 하려면 FORCE=1)."; }

# ---------------------------------------------------------------------------
# prod 비밀값 (셸 코드로 실행하지 않는다)
# ---------------------------------------------------------------------------

trim() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

# .env.prod-secrets에서 허용 목록의 키만 읽어 현재 셸에 export 한다. 값은 찍지 않는다.
# 규칙은 lib-env.mjs의 parseDotenv와 같다: 빈 줄·주석, export 접두, 따옴표 값, 줄 끝 주석.
load_prod_secrets() {
  local file=".env.prod-secrets" line key value url
  [ -f "$file" ] || die "$file 없음 — ops-setup.sh가 만든 prod 값 파일이 필요하다."
  while IFS= read -r line || [ -n "$line" ]; do
    line="$(trim "${line%$'\r'}")"
    case "$line" in
      '' | '#'*) continue ;;
      *) ;;
    esac
    line="${line#export }"
    [[ "$line" == *=* ]] || continue
    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"
    case "$key" in
      SUPABASE_URL | SUPABASE_SECRET_KEY | SUPABASE_ASSETS_BUCKET | SUPABASE_STAGING_BUCKET | SUPABASE_BACKUPS_BUCKET) ;;
      *) continue ;;
    esac
    if [[ "$value" =~ ^\"([^\"]*)\"([[:space:]]+#.*)?$ ]] || [[ "$value" =~ ^\'([^\']*)\'([[:space:]]+#.*)?$ ]]; then
      value="${BASH_REMATCH[1]}"
    else
      value="$(trim "${value%%[[:space:]]#*}")"
    fi
    export "$key=$value"
  done < "$file"
  [ -n "${SUPABASE_URL:-}" ] || die "$file에 SUPABASE_URL이 없다."
  [ -n "${SUPABASE_SECRET_KEY:-}" ] || die "$file에 SUPABASE_SECRET_KEY가 없다."
  # 헬퍼 스크립트는 .env(dev)로 빈 키를 채운다 — URL이 정확히 prod가 아니면 dev를 prod로 착각한다.
  url="${SUPABASE_URL%/}"
  [ "$url" = "$PROD_URL" ] || die "$file의 SUPABASE_URL이 prod($PROD_URL)가 아니다 — 파일을 확인할 것."
  for key in SUPABASE_ASSETS_BUCKET SUPABASE_STAGING_BUCKET SUPABASE_BACKUPS_BUCKET; do
    [ -n "${!key:-}" ] || warn "$file에 $key가 없다 — 헬퍼가 .env(dev) 값이나 기본값을 쓴다."
  done
}

# prod 값으로 node 헬퍼를 돌린다. 서브셸이라 이 셸의 환경은 오염되지 않는다.
with_prod_env() {
  (
    load_prod_secrets
    "$@"
  )
}

# ---------------------------------------------------------------------------
# 링크 (prod에 걸린 채로 끝나지 않게)
# ---------------------------------------------------------------------------

linked_ref() { cat supabase/.temp/project-ref 2> /dev/null || true; }

link_prod() {
  DB_AUTH=(-p "")
  if [ -e .env.proddbpass ]; then
    [ -s .env.proddbpass ] || die ".env.proddbpass가 비어 있다 — 지우거나 비밀번호를 넣을 것."
    SUPABASE_DB_PASSWORD="$(tr -d '\r\n' < .env.proddbpass)"
    [ -n "$SUPABASE_DB_PASSWORD" ] || die ".env.proddbpass에 값이 없다."
    export SUPABASE_DB_PASSWORD
    DB_AUTH=()
  fi
  LINKED_PROD=1
  if [ "$DRY_RUN" = 1 ]; then
    say "(DRY_RUN) supabase link --project-ref $PROD_REF"
    return 0
  fi
  sb link --project-ref "$PROD_REF" "${DB_AUTH[@]}"
  [ "$(linked_ref)" = "$PROD_REF" ] || die "링크가 prod로 바뀌지 않았다 (지금: '$(linked_ref)')."
}

# prod 링크가 맞는지 다시 확인한 뒤에만 명령을 돌린다.
on_prod() {
  if [ "$DRY_RUN" != 1 ] && [ "$(linked_ref)" != "$PROD_REF" ]; then
    die "링크가 prod가 아니다 (지금: '$(linked_ref)') — 중단."
  fi
  "$@"
}

restore_dev_link() {
  [ "$LINKED_PROD" = 1 ] || return 0
  unset SUPABASE_DB_PASSWORD
  DB_AUTH=(-p "")
  LINKED_PROD=0
  if [ "$DRY_RUN" = 1 ]; then
    say "(DRY_RUN) supabase link --project-ref $DEV_REF"
    return 0
  fi
  if sb link --project-ref "$DEV_REF" -p "" > /dev/null 2>&1 && [ "$(linked_ref)" = "$DEV_REF" ]; then
    say "-- 링크를 dev($DEV_REF)로 되돌렸다."
  else
    # prod를 가리키는 링크를 남기지 않는다 — 다음 로컬 db push가 prod로 가지 않게.
    rm -f supabase/.temp/project-ref
    warn "dev로 다시 링크하지 못해 링크를 지웠다 (dev가 일시정지일 수 있다). 필요하면:"
    warn "    supabase link --project-ref $DEV_REF"
  fi
}

on_exit() {
  local rc=$?
  trap - ERR
  restore_dev_link || true
  if [ -n "$TMP" ]; then rm -rf "$TMP"; fi
  if [ "$rc" -ne 0 ]; then
    warn "중단됨 (단계 $CURRENT_STEP). 원인을 해결한 뒤: bash scripts/ops/release-prod.sh --from $CURRENT_STEP"
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'die "명령 실패 (단계 $CURRENT_STEP, 줄 $LINENO)"' ERR

# ---------------------------------------------------------------------------
# JSON 판독 (CLI 출력 형식이 달라도 모르면 멈춘다)
# ---------------------------------------------------------------------------

# stdin의 CLI 출력에서 JSON을 꺼내, 이름이 $1인 배열을 어디에 있든 찾아 출력한다.
# 최상위가 배열이면(Management API가 행 배열을 그대로 줄 때) 그것을 쓴다.
json_array() {
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const starts = [s.indexOf("{"), s.indexOf("[")].filter((i) => i >= 0);
      if (!starts.length) { console.error("출력에 JSON이 없다"); process.exit(2); }
      const start = Math.min(...starts);
      const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
      let root;
      try { root = JSON.parse(s.slice(start, end + 1)); } catch { console.error("JSON을 읽지 못했다"); process.exit(2); }
      const name = process.argv[1];
      if (Array.isArray(root)) { process.stdout.write(JSON.stringify(root)); return; }
      const find = (v) => {
        if (v && typeof v === "object") {
          if (Array.isArray(v[name])) return v[name];
          for (const x of Object.values(v)) { const r = find(x); if (r) return r; }
        }
        return null;
      };
      const arr = find(root);
      if (!arr) { console.error(JSON.stringify(name) + " 배열이 없다"); process.exit(2); }
      process.stdout.write(JSON.stringify(arr));
    });
  ' "$1"
}

# prod에 걸린 링크로 목록을 읽어 상태를 한 단어로 출력한다:
#   pending  — 예상한 5개가 전부 대기 (적용 전)
#   applied  — 5개가 전부 적용됨
#   partial  — 앞쪽 일부만 적용되고 나머지가 대기 (중간에 끊긴 push)
# 그 밖(원격에만 있는 파일, 예상 밖 대기 파일)은 멈춘다.
migration_state() {
  local out list
  out="$(on_prod sb migration list --linked "${DB_AUTH[@]}" --output-format json)" ||
    die "prod 마이그레이션 목록을 읽지 못했다."
  list="$(printf '%s' "$out" | json_array migrations)" || die "마이그레이션 목록을 해석하지 못했다."
  printf '%s' "$list" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const list = JSON.parse(s);
      const expected = process.argv.slice(1).sort();
      const remoteOnly = list.filter((m) => m.remote && !m.local).map((m) => m.remote);
      const pending = list.filter((m) => m.local && !m.remote).map((m) => m.local).sort();
      const applied = new Set(list.filter((m) => m.local && m.remote).map((m) => m.local));
      if (remoteOnly.length) { console.error("원격에만 있는 마이그레이션:", remoteOnly.join(", ")); process.exit(3); }
      if (pending.some((p) => !expected.includes(p))) { console.error("예상 밖의 대기 파일:", pending.join(", ")); process.exit(3); }
      if (expected.every((e) => applied.has(e))) { console.log("applied"); return; }
      if (JSON.stringify(pending) === JSON.stringify(expected)) { console.log("pending"); return; }
      const k = expected.length - pending.length;
      const suffix = JSON.stringify(expected.slice(k)) === JSON.stringify(pending);
      if (suffix && expected.slice(0, k).every((e) => applied.has(e))) {
        console.error("이미 적용:", expected.slice(0, k).join(", "), "/ 대기:", pending.join(", "));
        console.log("partial");
        return;
      }
      console.error("적용 상태가 예상과 다르다 — 대기:", pending.join(", ") || "(없음)");
      process.exit(3);
    });
  ' "${EXPECTED_MIGRATIONS[@]}" || die "마이그레이션 상태가 예상과 다르다 (--include-all 은 쓰지 않는다 — 목록을 보고 사람이 판단할 것)."
}

# 조회 결과를 판독할 수 있는지 push 전에 시험한다 — 판독기가 처음 도는 때가 배포 뒤가 되지 않게.
probe_query() {
  local out rows
  printf 'select 1 as ok;\n' > "$TMP/probe.sql"
  out="$(on_prod sb db query --linked --output-format json -f "$TMP/probe.sql")" || die "prod 시험 조회 실패."
  rows="$(printf '%s' "$out" | json_array rows)" || die "조회 결과 형식을 읽지 못했다 — 판독기를 고친 뒤 다시."
  printf '%s' "$rows" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const r = JSON.parse(s);
      process.exit(r.length === 1 && String(r[0].ok) === "1" ? 0 : 3);
    });' || die "시험 조회의 결과가 예상과 다르다."
  say "조회 결과 판독: 정상"
}

write_check_sql() {
  cat > "$1" << 'SQL'
select
  (select count(*) from pg_proc where proname like 'flow\_%') as flow_fns,
  (select count(*) from app_tables t, jsonb_array_elements(t.doc->'rows') r
    where t.name = 'seminars' and not r ? 'publicationStatus') as sem_no_status,
  (select count(*) from app_tables t, jsonb_array_elements(t.doc->'rows') r
    where t.name = 'seminars'
      and (jsonb_typeof(r->'kind') not in ('string', 'null') or r->'kind' is null
           or jsonb_typeof(r->'durationMinutes') not in ('number', 'null') or r->'durationMinutes' is null
           or jsonb_typeof(r->'prerequisites') is distinct from 'string'
           or jsonb_typeof(r->'announce') is distinct from 'boolean')) as sem_bad_fields,
  (select count(*) from app_tables t, jsonb_array_elements(t.doc->'rows') r
    where t.name in ('members', 'legacy-members')
      and not r ? 'alumniRevocationReason') as members_no_reason,
  (select has_function_privilege('anon', 'flow_publish_seminar(jsonb)', 'execute')) as anon_can_exec,
  (select public from storage.buckets where id = 'assets') as assets_public;
SQL
}

# 4단계: 세 테이블 전부를 SQL 한 문장(= 한 스냅숏)으로 받아 backups/에 쓴다. CLI 로그인만으로
# 된다(prod 비밀 키 파일 불필요). 출력에는 개인정보가 있어 화면에 찍지 않고 TMP(소유자 전용)를
# 거쳐 권한 600 파일로만 남긴다. 받은 행 수가 같은 문장의 count(*)와 다르면 실패로 친다.
backup_via_cli() {
  local stamp file log rc=0
  cat > "$TMP/backup.sql" << 'SQL'
select json_build_object(
  'takenAt', now(),
  'source', 'release-prod.sh (supabase db query)',
  'counts', json_build_object(
    'app_tables', (select count(*) from app_tables),
    'app_queues', (select count(*) from app_queues),
    'audit_log', (select count(*) from audit_log)),
  'tables', json_build_object(
    'app_tables', (select coalesce(json_agg(t order by t.name), '[]'::json) from app_tables t),
    'app_queues', (select coalesce(json_agg(q order by q.event_id), '[]'::json) from app_queues q),
    'audit_log', (select coalesce(json_agg(a order by a.id), '[]'::json) from audit_log a))
) as snapshot;
SQL
  link_prod
  [ "$(linked_ref)" = "$PROD_REF" ] || die "링크가 prod가 아니다 — 백업 중단."
  log="$TMP/backup.out"
  supabase --workdir "$REPO" db query --linked --output-format json -f "$TMP/backup.sql" \
    < /dev/null > "$log" 2>&1 || rc=$?
  restore_dev_link
  if [ "$rc" -ne 0 ]; then
    grep -iE 'error|login|link' "$log" | head -n 3 >&2 || true
    die "prod 스냅숏 조회 실패."
  fi
  mkdir -p backups
  stamp="$(date -u +%Y-%m-%dT%H-%M-%S)"
  file="backups/supabase-${stamp}.json"
  [ ! -e "$file" ] || die "이미 있는 파일이다: $file"
  (
    umask 077
    node -e '
      const fs = require("fs");
      const [log, file, url] = process.argv.slice(1);
      const s = fs.readFileSync(log, "utf8");
      const start = Math.min(...[s.indexOf("{"), s.indexOf("[")].filter((i) => i >= 0));
      const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
      const root = JSON.parse(s.slice(start, end + 1));
      const find = (v) => {
        if (v && typeof v === "object") {
          if ("snapshot" in v) return v.snapshot;
          for (const x of Object.values(v)) { const r = find(x); if (r !== undefined) return r; }
        }
        return undefined;
      };
      let snap = find(root);
      if (typeof snap === "string") snap = JSON.parse(snap);
      if (!snap || !snap.tables || !snap.counts) { console.error("스냅숏 형식을 읽지 못했다"); process.exit(2); }
      for (const t of ["app_tables", "app_queues", "audit_log"]) {
        const got = (snap.tables[t] ?? []).length, want = Number(snap.counts[t]);
        if (got !== want) { console.error(t + ": 받은 행 " + got + " ≠ " + want); process.exit(3); }
      }
      snap.project = url;
      fs.writeFileSync(file, JSON.stringify(snap, null, 2), { mode: 0o600, flag: "wx" });
      const back = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const t of ["app_tables", "app_queues", "audit_log"]) {
        if (back.tables[t].length !== Number(snap.counts[t])) { console.error("저장본 행 수 불일치: " + t); process.exit(3); }
      }
      console.log("행 수 — app_tables " + snap.counts.app_tables + " · app_queues " + snap.counts.app_queues + " · audit_log " + snap.counts.audit_log);
    ' "$log" "$file" "$PROD_URL"
  ) || die "백업을 저장하지 못했다 (불완전한 파일이 남았다면 지울 것: $file)."
  rm -f "$log"
  state_set backup_file "$file"
  state_set backup_at "$(date +%s)"
  say "백업: $file ($(wc -c < "$file") bytes) — 개인정보 포함, 레포 밖으로 옮기지 말 것."
}

# 9·10단계: 백필 재실행 → 확인 쿼리. 통과하지 않으면 멈춘다.
repair_and_check() {
  local f out rows
  link_prod
  for f in "${BACKFILLS[@]}"; do
    say "-- 백필 $f"
    if [ "$DRY_RUN" = 1 ]; then
      say "(DRY_RUN) supabase db query --linked -f $f"
    else
      on_prod sb db query --linked -f "$f" > /dev/null
    fi
  done
  if [ "$DRY_RUN" = 1 ]; then
    say "(DRY_RUN) 확인 쿼리를 건너뛴다 — 실제 실행에서는 기대값과 대조해 다르면 멈춘다."
    restore_dev_link
    return 0
  fi
  write_check_sql "$TMP/check.sql"
  out="$(on_prod sb db query --linked --output-format json -f "$TMP/check.sql")" || die "prod 확인 쿼리 실패."
  restore_dev_link
  rows="$(printf '%s' "$out" | json_array rows)" || die "확인 쿼리 결과를 해석하지 못했다."
  printf '%s' "$rows" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const rows = JSON.parse(s);
      if (rows.length !== 1) { console.error("행이 1개가 아니다"); process.exit(2); }
      const r = rows[0];
      const want = { flow_fns: 19, sem_no_status: 0, sem_bad_fields: 0, members_no_reason: 0, anon_can_exec: false, assets_public: false };
      console.log("결과:", JSON.stringify(r));
      const bad = Object.entries(want).filter(([k, v]) => String(r[k]) !== String(v));
      if (bad.length) { console.error("기대와 다름:", bad.map(([k, v]) => k + "=" + r[k] + " (기대 " + v + ")").join(", ")); process.exit(3); }
      console.log("확인 쿼리 통과");
    });
  ' || die "prod 상태가 기대와 다르다 — --from 9 로 보정을 다시 돌리거나 OPERATOR-TODO §2-2를 볼 것."
}

# ---------------------------------------------------------------------------
# 인자
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --from)
      [ $# -ge 2 ] || die "--from 뒤에 단계 번호가 필요하다."
      FROM="$2"
      shift 2
      ;;
    -h | --help)
      sed -n '2,50p' "$0"
      exit 0
      ;;
    *) die "모르는 인자: $1" ;;
  esac
done
[[ "$FROM" =~ ^([1-9]|1[0-2])$ ]] || die "--from은 1~12여야 한다: $FROM"
case "$DEPLOY_VIA" in
  git | prebuilt) ;;
  *) die "DEPLOY_VIA는 git 또는 prebuilt: $DEPLOY_VIA" ;;
esac
case "$DRY_RUN" in
  0 | 1) ;;
  *) die "DRY_RUN은 0 또는 1: $DRY_RUN" ;;
esac
case "$SKIP_PREVIEW" in
  0 | 1) ;;
  *) die "SKIP_PREVIEW는 0 또는 1: $SKIP_PREVIEW" ;;
esac
case "$FORCE" in
  0 | 1) ;;
  *) die "FORCE는 0 또는 1: $FORCE" ;;
esac

cd "$(dirname "$0")/../.."
[ -f package.json ] && [ -d supabase/migrations ] || die "레포 루트를 찾지 못했다."
REPO="$(pwd -P)"
STATE="$(git rev-parse --absolute-git-dir)/release-prod.state"
HEAD_SHA="$(git rev-parse HEAD)"
# 배포되는 내용의 지문: 커밋의 트리에서 문서·운영 스크립트·루트 *.md를 뺀 것. 그것만 바뀐 커밋은
# 빌드·테스트 대상이 같으므로 2·3단계 기록을 그대로 쓴다.
APP_KEY="$(git ls-tree -r HEAD | grep -vE $'\t(docs/|scripts/|[^/]+\\.md$)' | git hash-object --stdin)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/release-prod.XXXXXX")"
CURRENT_STEP="$FROM"

run_step() { [ "$1" -ge "$FROM" ]; }

say "release-prod: 대상 prod=$PROD_REF, 배포=$DEPLOY_VIA, 프리뷰 생략=$SKIP_PREVIEW, DRY_RUN=$DRY_RUN, 시작 단계=$FROM"

# ---------------------------------------------------------------------------
# 1 사전 점검
# ---------------------------------------------------------------------------
CURRENT_STEP=1
if run_step 1; then
  step 1 "사전 점검"
  for tool in git node pnpm supabase curl; do
    command -v "$tool" > /dev/null || die "$tool 이 없다."
  done
  if [ "$DEPLOY_VIA" = prebuilt ]; then
    command -v vercel > /dev/null || die "vercel CLI가 없다 (DEPLOY_VIA=prebuilt)."
  fi
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' ||
    die "Node 22 이상이 필요하다."
  [ "$(git rev-parse --abbrev-ref HEAD)" = "$RELEASE_BRANCH" ] ||
    die "브랜치가 $RELEASE_BRANCH 가 아니다."
  [ -z "$(git status --porcelain)" ] || die "작업 트리가 깨끗하지 않다 — 커밋되지 않은 것은 배포되지 않는다."
  for m in "${EXPECTED_MIGRATIONS[@]}"; do
    compgen -G "supabase/migrations/${m}_*.sql" > /dev/null || die "마이그레이션 파일이 없다: $m"
  done
  for f in "${BACKFILLS[@]}"; do
    [ -f "$f" ] || die "백필 파일이 없다: $f"
  done
  sb projects list > "$TMP/projects.txt" || die "supabase 로그인 필요: supabase login"
  grep -q "$PROD_REF" "$TMP/projects.txt" || die "이 계정에서 prod 프로젝트가 보이지 않는다."
  if [ "$(linked_ref)" = "$PROD_REF" ]; then
    warn "이 폴더가 prod에 링크된 채다 (이전 실행이 중간에 끊겼을 수 있다) — dev로 되돌린다."
    LINKED_PROD=1
    restore_dev_link
  fi
  git fetch --quiet origin "$PROD_BRANCH" "$RELEASE_BRANCH" 2> /dev/null ||
    git fetch --quiet origin "$PROD_BRANCH"
  git merge-base --is-ancestor "origin/$PROD_BRANCH" HEAD ||
    die "origin/$PROD_BRANCH 가 이 브랜치의 조상이 아니다 — 빨리감기 불가. main의 새 커밋을 먼저 합칠 것."
  say "배포될 커밋: $(git rev-parse --short HEAD) — origin/$PROD_BRANCH 에서 $(git rev-list --count "origin/$PROD_BRANCH..HEAD")개 앞"
  # main의 보호 규칙이 push를 거부하면 그 거부는 db push 뒤(7단계)에 온다 — 지금 확인한다.
  if command -v gh > /dev/null && gh auth status > /dev/null 2>&1; then
    if gh api "repos/$GITHUB_REPO/branches/$PROD_BRANCH/protection" > /dev/null 2>&1; then
      warn "origin/$PROD_BRANCH 에 보호 규칙이 있다 — 직접 push가 허용되는지 확인할 것."
      confirm "이 계정으로 $PROD_BRANCH 에 직접 push할 수 있다"
    else
      say "origin/$PROD_BRANCH 보호 규칙: 없음 (또는 읽을 권한 없음)"
    fi
  else
    confirm "GitHub에서 $PROD_BRANCH 브랜치 보호 규칙이 이 계정의 직접 push를 막지 않는다 (gh가 없어 확인 못 함)"
  fi
  [ -f .env.prod-secrets ] || say "(참고) .env.prod-secrets 없음 — 11·12단계의 비밀 키 헬퍼는 건너뛴다(필수 아님)."
fi

# ---------------------------------------------------------------------------
# 2 로컬 검증
# ---------------------------------------------------------------------------
CURRENT_STEP=2
if run_step 2; then
  step 2 "로컬 검증 (CI와 같은 검사 + 운영 빌드)"
  if done_for_app validated_key; then
    skip_note "테스트·타입·린트·포맷·운영 빌드가 통과했다 (배포 내용이 같다)"
  else
    pnpm install --frozen-lockfile
    ./node_modules/.bin/svelte-kit sync
    ./node_modules/.bin/vitest run
    ./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json --threshold error
    ./node_modules/.bin/eslint .
    ./node_modules/.bin/prettier --check --ignore-unknown .
    ./node_modules/.bin/vite build
    [ -d .svelte-kit/output/server ] || die "빌드 산출물(.svelte-kit/output/server)이 없다."
    if grep -rlq "pglite" .svelte-kit/output/server; then
      die "서버 번들에 PGlite가 들어 있다 — 운영에 메모리 백엔드가 실린다."
    fi
    [ -z "$(git status --porcelain)" ] || die "검사가 추적 파일을 바꿨다 — 확인 후 커밋할 것."
    state_set validated_key "$APP_KEY"
    say "검증한 커밋: ${HEAD_SHA:0:7}"
  fi
fi

# ---------------------------------------------------------------------------
# 3 프리뷰 확인 (수동)
# ---------------------------------------------------------------------------
CURRENT_STEP=3
if run_step 3; then
  if done_for_app preview_key || done_for_app preview_skipped_key; then
    step 3 "프리뷰 확인"
    skip_note "프리뷰 확인(또는 생략)을 기록했다"
  elif [ "$SKIP_PREVIEW" = 1 ]; then
    step 3 "프리뷰 확인 생략 (SKIP_PREVIEW=1)"
    # (1) 설치 도구: Vercel은 잠금 파일로 패키지 매니저를 고른다 — pnpm 것만 있으면 pnpm이다.
    [ -f pnpm-lock.yaml ] || die "pnpm-lock.yaml 이 없다."
    for lock in package-lock.json yarn.lock bun.lockb; do
      [ ! -e "$lock" ] || die "$lock 가 있다 — Vercel이 pnpm 대신 다른 도구로 설치할 수 있다."
    done
    say "(1) 설치 도구: 잠금 파일이 pnpm-lock.yaml 하나뿐 — Vercel이 pnpm으로 설치한다."
    say "(2) SNU 계정 실로그인은 운영 배포 뒤 바로 확인할 것 — 막히면 코드만 되돌리면 된다(§2-2 4)."
    say "(3) 세미나·출석 흐름은 로컬 실측(scripts/measure)과 dev DB 적용 확인으로 갈음한다."
    say "    운영 빌드가 Vercel에서 실패하면 옛 배포가 그대로 남고, prod는 '옛 코드 + 새 DB' 상태가"
    say "    이어진다(이미지 깨짐·새 필드 벗겨짐). 그때는 빌드를 고쳐 다시 push한 뒤 --from 8."
    confirm_prod "프리뷰 확인 없이 운영에 반영한다"
    state_set preview_skipped_key "$APP_KEY"
  else
    step 3 "프리뷰 배포에서 확인 (OPERATOR-TODO §2-2 '배포 전 확인 3건')"
    say "프리뷰는 dev DB를 본다. 커밋 $(git rev-parse --short HEAD)의 Vercel 프리뷰 배포에서:"
    say "(프리뷰 없이 가려면 중단하고 SKIP_PREVIEW=1 로 다시)"
    confirm "(1) 빌드 로그에서 pnpm으로 설치됐다 (npm이면 Install Command를 'pnpm install --frozen-lockfile'로)"
    confirm "(2) 실제 SNU Google 계정으로 로그인이 통과했다 (hd=snu.ac.kr 검사)"
    confirm "(3) 세미나 신청→승인→일정→게시→취소, 체크인→출석 승인을 한 번씩 해 봤고 500이 없었다"
    state_set preview_key "$APP_KEY"
  fi
fi

# ---------------------------------------------------------------------------
# 4 prod 백업
# ---------------------------------------------------------------------------
CURRENT_STEP=4
if run_step 4; then
  step 4 "prod 백업 (세 테이블 전부 → backups/)"
  last_backup="$(state_get backup_file)"
  last_backup_at="$(state_get backup_at)"
  if [ "$DRY_RUN" = 1 ]; then
    say "(DRY_RUN) prod 스냅숏 SQL을 돌려 backups/supabase-<시각>.json 으로 저장한다."
  elif [ "$FORCE" != 1 ] && [ -n "$last_backup_at" ] && [ -s "$last_backup" ] &&
    [ $(($(date +%s) - last_backup_at)) -le "$BACKUP_MAX_AGE_SECONDS" ]; then
    say "6시간 안의 백업을 다시 쓴다: $last_backup (새로 받으려면 FORCE=1)."
  else
    backup_via_cli
  fi
fi

# ---------------------------------------------------------------------------
# 5 사전 검사
# ---------------------------------------------------------------------------
CURRENT_STEP=5
if run_step 5; then
  step 5 "적용될 마이그레이션과 조회 판독 확인"
  link_prod
  if [ "$DRY_RUN" = 1 ]; then
    say "(DRY_RUN) prod 목록 검사·dry-run·시험 조회를 건너뛴다."
  else
    state="$(migration_state)"
    say "prod 마이그레이션 상태: $state"
    if [ "$state" != applied ]; then
      on_prod sb db push --linked --dry-run "${DB_AUTH[@]}"
    fi
    probe_query
  fi
  restore_dev_link
fi

# ---------------------------------------------------------------------------
# 6 적용
# ---------------------------------------------------------------------------
CURRENT_STEP=6
if run_step 6; then
  step 6 "prod에 마이그레이션 적용"
  if [ "$DRY_RUN" != 1 ]; then
    backup_at="$(state_get backup_at)"
    if [ -z "$backup_at" ] || [ $(($(date +%s) - backup_at)) -gt "$BACKUP_MAX_AGE_SECONDS" ]; then
      warn "최근 6시간 안의 prod 백업 기록이 없다 (4단계)."
      confirm_prod "백업 없이 진행한다"
    else
      say "백업: $(state_get backup_file)"
    fi
  fi
  link_prod
  state="applied"
  if [ "$DRY_RUN" = 1 ]; then
    state="pending"
  else
    state="$(migration_state)"
  fi
  case "$state" in
    applied)
      say "5개 모두 이미 적용돼 있다 — 적용을 건너뛴다."
      ;;
    pending | partial)
      say "적용 직후부터 배포(8단계)가 끝날 때까지:"
      say "  - assets 버킷이 비공개가 되어 옛 코드의 이미지·자료 링크가 깨진다"
      say "  - 옛 코드의 회원·세미나 쓰기가 새 필드를 지운다 (9·10단계가 복구)"
      confirm "관리자·임원에게 알렸고, 지금 세미나 관리·가입 승인 등 쓰기를 하는 사람이 없다"
      [ "$state" = partial ] && warn "앞쪽 일부가 이미 적용된 상태에서 나머지를 적용한다."
      confirm_prod "prod에 남은 마이그레이션을 적용한다"
      if [ "$DRY_RUN" = 1 ]; then
        say "(DRY_RUN) supabase db push --linked --yes"
      else
        on_prod sb db push --linked --yes "${DB_AUTH[@]}"
        [ "$(migration_state)" = applied ] || die "push 뒤에도 적용이 끝나지 않았다 — --from 6 으로 다시."
      fi
      say "적용 완료 ($(date -u +%Y-%m-%dT%H:%M:%SZ)). 바로 7단계로 간다."
      ;;
    *) die "알 수 없는 상태: $state" ;;
  esac
  restore_dev_link
fi

# ---------------------------------------------------------------------------
# 7 배포
# ---------------------------------------------------------------------------
CURRENT_STEP=7
if run_step 7; then
  step 7 "배포 ($DEPLOY_VIA)"
  # --from 7로 바로 와도 전제를 다시 본다: 브랜치, 검증한 그 커밋, prod 적용 완료.
  [ "$(git rev-parse --abbrev-ref HEAD)" = "$RELEASE_BRANCH" ] || die "브랜치가 $RELEASE_BRANCH 가 아니다."
  [ -z "$(git status --porcelain)" ] || die "작업 트리가 깨끗하지 않다."
  if [ "$DRY_RUN" != 1 ]; then
    [ "$(state_get validated_key)" = "$APP_KEY" ] ||
      die "이 배포 내용은 2단계 검증을 거치지 않았다 — --from 2 로 다시 (이미 적용된 마이그레이션은 5·6단계가 건너뛴다)."
    if [ "$(state_get preview_key)" != "$APP_KEY" ] && [ "$(state_get preview_skipped_key)" != "$APP_KEY" ]; then
      warn "3단계 프리뷰 확인이 이 배포 내용으로 기록돼 있지 않다."
      confirm "커밋 $(git rev-parse --short HEAD)의 프리뷰를 확인했다"
    fi
    link_prod
    [ "$(migration_state)" = applied ] ||
      die "prod에 마이그레이션이 다 적용되지 않았다 — 새 코드는 적용 전 DB에서 500이 난다. --from 5 로."
    restore_dev_link
  fi
  git fetch --quiet origin "$PROD_BRANCH"
  git merge-base --is-ancestor "origin/$PROD_BRANCH" HEAD ||
    die "origin/$PROD_BRANCH 가 그새 움직였다 — 빨리감기 불가. main을 이 브랜치에 합치고 커밋한 뒤 --from 2 로 다시 (적용된 마이그레이션은 건너뛴다). 그동안 prod는 옛 코드+새 DB이므로 서두를 것."
  if [ "$(git rev-parse "origin/$PROD_BRANCH")" = "$HEAD_SHA" ]; then
    say "origin/$PROD_BRANCH 가 이미 ${HEAD_SHA:0:7} 이다 — push할 것이 없다."
  else
    confirm_prod "origin/$PROD_BRANCH 를 ${HEAD_SHA:0:7} 로 빨리감기 push 한다 (강제 push 아님)"
    # main이 곧 운영 코드다. prebuilt로도 올리는 경우에도 main을 맞춰 둬야 다음 git 배포가 옛 코드로 되돌리지 않는다.
    mutate git push origin "HEAD:refs/heads/$PROD_BRANCH"
  fi
  if [ "$DEPLOY_VIA" = prebuilt ] && done_for_head prebuilt_sha; then
    skip_note "prebuilt 배포를 올렸다"
  elif [ "$DEPLOY_VIA" = prebuilt ]; then
    # 위 push가 git 연동 배포도 만든다(같은 커밋이라 어느 쪽이 먼저 끝나도 결과는 같다).
    # 깨끗한 트리에서 빌드한 산출물(.vercel/output)만 올라간다. vercel pull이 받는 운영 env 파일은
    # 소유자 전용으로 만들고, 배포 뒤 지운다.
    (
      umask 077
      mutate vercel pull --yes --environment=production
      mutate vercel build --prod
      mutate vercel deploy --prebuilt --prod
    )
    mutate rm -f .vercel/.env.production.local .vercel/.env.preview.local .vercel/.env.development.local
    state_set prebuilt_sha "$HEAD_SHA"
  fi
fi

# ---------------------------------------------------------------------------
# 8 배포 확인
# ---------------------------------------------------------------------------
CURRENT_STEP=8
if run_step 8; then
  step 8 "배포가 Ready 될 때까지"
  if done_for_head deploy_confirmed_sha; then
    skip_note "Production 배포의 커밋을 확인했다"
  else
    say "Vercel 대시보드 → webpage → Deployments 에서 Production 배포가 Ready가 되면, 그 배포의 커밋 SHA를 복사해 넣을 것."
    ask "Ready인 Production 배포의 커밋 SHA(앞 7자리 이상):"
    if [ "$DRY_RUN" != 1 ]; then
      input="$(printf '%s' "$REPLY_TEXT" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
      [[ "$input" =~ ^[0-9a-f]{7,40}$ ]] || die "SHA 형식이 아니다. 배포를 확인한 뒤 --from 8"
      [[ "$(git rev-parse HEAD)" == "$input"* ]] ||
        die "Vercel의 커밋이 이 커밋($(git rev-parse --short HEAD))이 아니다. 배포를 확인한 뒤 --from 8"
      say "배포 커밋 일치."
      state_set deploy_confirmed_sha "$HEAD_SHA"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 9·10 사후 보정과 확인
# ---------------------------------------------------------------------------
CURRENT_STEP=9
if run_step 9; then
  step 9 "백필 재실행 + 확인 (6~8 사이 옛 코드의 쓰기가 지운 키를 되살린다)"
  if done_for_head repaired_sha; then
    skip_note "백필과 확인 쿼리를 통과했다"
  else
    confirm_prod "prod에서 재실행 안전한 백필 3개를 다시 돌리고 확인한다 (없는 키만 채운다)"
    repair_and_check
    state_set repaired_sha "$HEAD_SHA"
  fi
fi

CURRENT_STEP=10
if run_step 10; then
  step 10 "10분 뒤 한 번 더 (물러나던 옛 배포의 늦은 쓰기까지)"
  if done_for_head rechecked_sha; then
    skip_note "10분 뒤 재보정·확인을 마쳤다 (옛 배포가 다시 썼을 수 있으면 FORCE=1 --from 9)"
  else
    say "옛 Production 배포 URL(*.vercel.app)이 아직 prod DB로 요청을 받는다 — Vercel에서 옛 배포를"
    say "보호(Deployment Protection)하거나 지우면 이 위험이 끝난다."
    if [ "$DRY_RUN" = 1 ]; then
      say "(DRY_RUN) ${RECHECK_DELAY_SECONDS}초 기다린 뒤 9단계를 한 번 더."
    else
      say "${RECHECK_DELAY_SECONDS}초 기다린다 (Ctrl-C로 끊으면 나중에 --from 9 로 직접)."
      sleep "$RECHECK_DELAY_SECONDS"
    fi
    repair_and_check
    state_set rechecked_sha "$HEAD_SHA"
  fi
fi

# ---------------------------------------------------------------------------
# 11 공개 스모크
# ---------------------------------------------------------------------------
CURRENT_STEP=11
if run_step 11; then
  step 11 "공개 페이지와 버킷 (읽기 전용)"
  failed=0
  for p in "${PUBLIC_PAGES[@]}"; do
    code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 20 "$SITE$p" || true)"
    say "  ${code:-000}  $p"
    [ "$code" = 200 ] || failed=1
  done
  if [ "$failed" != 0 ]; then
    if [ "$DRY_RUN" = 1 ]; then
      warn "(DRY_RUN) 200이 아닌 페이지가 있다 — 배포 전이면 정상일 수 있다."
    else
      die "공개 페이지 중 200이 아닌 것이 있다 — Vercel 로그를 볼 것. 되돌리기는 코드만 되돌리면 된다(§2-2)."
    fi
  fi
  # 버킷 비공개는 10단계 확인 쿼리(assets_public=false)가 이미 봤다. 서명 URL까지 보는 헬퍼는
  # prod 비밀 키가 있을 때만(.env.prod-secrets) 돌린다.
  if [ -f .env.prod-secrets ]; then
    with_prod_env node scripts/ops/ops-assets-private.mjs
  else
    say "버킷: 10단계에서 비공개 확인됨 (서명 URL 점검은 .env.prod-secrets가 있을 때만)."
  fi
fi

# ---------------------------------------------------------------------------
# 12 3-0 복구 미리보기
# ---------------------------------------------------------------------------
CURRENT_STEP=12
if run_step 12; then
  step 12 "배포 전 쓰기로 사라진 세미나 복구값 (미리보기만 — 아무것도 쓰지 않는다)"
  # 이 미리보기 헬퍼들은 supabase-js로 읽으므로 prod 비밀 키가 필요하다 — 없으면 건너뛰고 알린다.
  if [ -f .env.prod-secrets ]; then
    with_prod_env node scripts/ops/ops-repair-seminar-schedules.mjs
    # 설명(description) 복구는 Notion 값이 필요하다 — 없으면 미리보기를 건너뛴다고 알린다.
    with_prod_env node scripts/ops/ops-notion-backfill-seminars.mjs ||
      warn "Notion 복구 미리보기를 돌리지 못했다 (.env에 Notion 값이 없을 수 있다) — OPERATOR-TODO §3-0을 직접."
    with_prod_env node scripts/ops/ops-migration-audit.mjs --skip-notion
  else
    warn "prod 비밀 키 파일(.env.prod-secrets)이 없어 복구 미리보기를 건너뛴다."
    warn "배포 전(6~8단계)에 세미나 관리 화면에서 쓰기가 있었다면 OPERATOR-TODO §3-0을 따로 볼 것."
  fi
fi

CURRENT_STEP="finished"
say ""
say "==== 완료 ===="
say "- 12단계 미리보기에 채울 값이 있으면 사람이 확인한 뒤 적용할 것:"
say "    ops-repair-seminar-schedules.mjs apply · ops-notion-backfill-seminars.mjs apply (OPERATOR-TODO §3-0)"
say "- 그다음 OPERATOR-TODO §2-2의 3·4를 ✅로. §3-0 절은 적용까지 끝난 뒤에 지운다."
say "- 백업 파일($(state_get backup_file))은 개인정보다 — 보관 기간이 지나면 지울 것."
