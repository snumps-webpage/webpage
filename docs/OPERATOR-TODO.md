# 운영자 작업 목록 (Operator TODO)

> **이 문서의 성격**: 코드가 아니라 **사람(운영자)이 직접 해야 하는 셋업·운영 작업**의 살아있는 목록.
> 구현이 진행되며 새 작업이 생기면 여기에 추가되고, 완료하면 체크한다.
> 각 작업은 "왜 필요한지 + 정확히 어떻게 하는지"를 함께 적는다.
>
> **2026-09-01 전면 재작성**: AWS → Supabase 전환([`SUPABASE-MIGRATION-SPEC.md`](./spec/SUPABASE-MIGRATION-SPEC.md)) 반영.
> 기존 AWS 작업(계정 생성·Terraform·OIDC)은 [완료된 작업](#완료된-작업) 절에 **폐기**로 이관 기록.

## 상태 요약

| #   | 작업                                                                    | 상태                                                                                                          | 막고 있는 것                        |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | 공용 계정 준비 (콘솔 5종 공용화 + MFA + 자격증명 인벤토리)              | ⬜ 미완                                                                                                       | 이하 전부 — 알림 수신·소유권의 전제 |
| 2   | Supabase 프로젝트 2개 생성 (prod/dev) + SQL 실행 + sb_secret 키 발급    | ✅ 완료 (CLI, 2026-08-30) — org 공용화(1절)만 잔여                                                            | 데이터 계층·자산·이주 전부          |
| 3   | Vercel env 등록                                                         | 🟡 CLI로 10종 등록 완료 (2026-08-30) — `HEALTHCHECKS_PING_URL`(5절)·`GITHUB_BACKUP_TOKEN`(6절)만 발급 후 추가 | 런타임 동작 전부                    |
| 4   | cron-job.org 잡 3개 등록 + 알림 설정                                    | ⬜ 미완 (3 선행)                                                                                              | 만료 처리·keep-alive·주간 백업      |
| 5   | Healthchecks.io 체크 생성                                               | ⬜ 미완 (1·3 선행)                                                                                            | 크론 침묵 감지 (dead-man's switch)  |
| 6   | 백업 repo (`snumps-backups`) + fine-grained PAT                         | 🟡 repo 생성 완료 (2026-08-30) — **PAT 발급·등록만 남음**                                                     | off-platform 백업 (B2)              |
| 7   | 🔴 pause 런북 숙지                                                      | 상시                                                                                                          | — (장애 시 대응 속도)               |
| 8   | 복구 절차 숙지                                                          | 상시                                                                                                          | —                                   |
| 9   | 정기 수칙 (학기말·분기)                                                 | 🔁 반복                                                                                                       | —                                   |
| 10  | Gmail 발신 계정 확인                                                    | ⬜ 미완                                                                                                       | 전 회원 공지 메일 (M4)              |
| 11  | 🔴 원자적 흐름 마이그레이션 적용 (dev → prod, **코드 배포 전**) — 2-2절 | ⬜ 미완 (dev 프로젝트 일시정지 중)                                                                            | `chore/code-audit-v2` 배포 전부     |
| 12  | 배포 전 확인 3건 (프리뷰 배포) — 2-2절                                  | ⬜ 미완                                                                                                       | 운영 배포                           |

---

## 1. 공용 계정 준비

**왜**: Supabase의 쿼터 접근·pause 예고 메일, cron-job.org의 실패·자동 비활성 알림, Healthchecks의
경보가 전부 **계정 소유 메일**로 온다. 개인 계정이면 그 사람이 졸업하는 순간 알림·소유권·복구 경로가
같이 사라진다. 기존 문서의 규율 승계: **개인 계정 금지.**

1. 다음 콘솔 전부를 **동아리 공용 이메일**(예: snumps0@gmail.com) 소유로 생성/이전하고 **MFA 활성화**:
   - Supabase org
   - cron-job.org
   - Healthchecks.io
   - GitHub org (`snumps-webpage`)
   - Vercel
2. MFA 복구 코드는 계정별로 발급 직후 안전한 공용 보관소(예: 회장단 인수인계 금고 문서)에 저장.
3. **자격증명 인벤토리**를 아래 표 형식으로 유지 — 항목이 늘 때마다 갱신 (9절 정기 수칙):

| 자격증명                                                                               | 보유자 | 보관 위치 | 복구 경로                                           |
| -------------------------------------------------------------------------------------- | ------ | --------- | --------------------------------------------------- |
| `SUPABASE_SECRET_KEY` (prod)                                                           |        |           | Supabase 콘솔에서 재발급 (구 키 폐기)               |
| `SUPABASE_SECRET_KEY` (dev)                                                            |        |           | 〃                                                  |
| `CRON_SECRET`                                                                          |        |           | 재생성 → Vercel env + cron-job.org 잡 3개 동시 교체 |
| `HEALTHCHECKS_PING_URL`                                                                |        |           | Healthchecks 콘솔에서 확인/재발급                   |
| `GITHUB_BACKUP_TOKEN` (fine-grained PAT — `snumps-backups` repo `contents:write` 한정) |        |           | GitHub 콘솔에서 재발급                              |
| Supabase org 로그인                                                                    |        |           | 공용 메일 비밀번호 재설정 + MFA 복구 코드           |
| cron-job.org 로그인                                                                    |        |           | 〃                                                  |
| Healthchecks.io 로그인                                                                 |        |           | 〃                                                  |
| GitHub org 로그인                                                                      |        |           | 〃                                                  |
| Vercel 로그인                                                                          |        |           | 〃                                                  |

## 2. Supabase 프로젝트 2개 생성 (prod / dev)

**왜**: 데이터(Postgres 문서 테이블)·자산(Storage)·감사 로그·백업이 전부 Supabase 위에 만들어진다.
무료 플랜의 프로젝트 2개 한도를 **prod / dev 분리**에 쓴다 (S4 — 로컬 개발은 dev 프로젝트를 향한다).

> **2026-08-30 CLI로 대부분 완료** — 아래는 실제 상태. 원래 절차 중 남은 것은 ⬜ 표시 항목뿐.
>
> - ✅ prod = 기존 org `snumps`의 **`webpage`** 프로젝트 (ref `rwlvnttpaqkhpebtebif`).
>   ⚠️ Region이 **Tokyo(ap-northeast-1)** 다 — 서울 아님. 기존 프로젝트라 리전 변경 불가(이전하려면
>   신규 프로젝트 + 데이터 이사). 도쿄↔서울 지연 차이는 이 규모에서 체감 미미 — **그대로 쓰는 것을 권장**.
> - ✅ dev = **`snumps-dev`** CLI 생성 (ref `gcahkryexewswzvtfltj`, Tokyo). DB 비밀번호는
>   레포의 `.env.devdbpass` (gitignored) — 인벤토리(1절)에 옮겨 기록할 것.
> - ✅ dev 마이그레이션 적용 (`supabase db push`, `20260901000000_documents.sql`) — 테이블 3종 +
>   append-only 트리거 + 버킷 3개(공개성 실측 확인) + RLS.
> - ✅ dev 시드 주입 (`scripts/seed-dev.ts`, 10테이블) + **T3 실측 게이트 5/5 통과**
>   (signed-upload Content-Type 미서명 → `info()` 검사 유일 강제선 성립, cross-bucket move 동작,
>   동일 경로 재발급 거부 확인 — `scripts/ops/ops-t3-gate.mjs`).
> - ✅ sb_secret 키 발급·수집: dev 키 → 로컬 `.env` 조립 완료. prod 키 포함 Vercel용 값 일체 →
>   **`.env.prod-secrets`** (gitignored) — 3절에서 그대로 복사해 넣으면 된다.
> - ✅ **prod 마이그레이션 적용** (2026-08-30, `scripts/ops/ops-push-prod.sh`) — prod 버킷 3개
>   존재·공개성 실측 확인 (`ops-check-buckets-prod.sh`).
> - ✅ **보안 경계 실측** (dev): audit_log append-only 트리거가 UPDATE/DELETE 거부
>   (`ops-check-audit-trigger.sh`), publishable 키의 테이블 읽기/쓰기·private 버킷 열람 전부 거부 —
>   RLS deny-all 성립 (`ops-check-rls.sh`).
> - ⬜ 프로젝트 소유 org를 공용 계정으로 이전 (1절).

## 2-1. S9 학기별 등록제 운영 수칙 (2026-08-30 도입)

**왜**: 회원 자격의 행사 권한은 학기(1학기+여름 / 2학기+겨울) 단위 등록에서 나온다.
노션 이주분은 legacy 아카이브(기록 전용)이고, 운영 회원 DB는 재가입 승인으로만 채워진다.

- 매 학기 시작: 전 회원이 `/signup`에서 재가입 신청 → 관리자가 `/admin`에서 승인.
  승인이 그 학기 `registrations` 행을 만든다 (승인 시점의 학기 기준).
- 승인 안내: 미등록 상태의 접근 수준 — 동문은 회원 존 열람만, 준회원 이력만 있으면 접근 불가.
- 정회원 승격·동문 부여는 회칙 재분류 후 관리자 화면에서 (지위 축 — 기존 절차 유지).
- 데이터 이관 스크립트: `bash scripts/ops/ops-legacy-split.sh dev|prod` (멱등 —
  legacy-members 존재 시 아무것도 안 함). dev는 2026-08-30 실행 완료, **prod는 S9 코드
  배포와 동시에 실행할 것** (코드가 legacy 테이블을 기대한다).

## 2-2. 🔴 원자적 흐름 마이그레이션 적용 — **코드 배포 전에** (2026-09-28 추가)

**왜**: `chore/code-audit-v2`의 코드는 여러 문서를 함께 바꾸는 흐름(세미나 게시·취소·삭제, 출석 결정,
가입·신청 승인, 탈퇴 등)을 Postgres 함수로 실행한다([ATOMIC-FLOWS.md](./spec/ATOMIC-FLOWS.md)). 함수가
DB에 없으면 그 기능이 전부 500이 된다. 또 세미나 스키마가 `publicationStatus`를 필수로 바꿨으므로, 보정
마이그레이션 없이 배포하면 **세미나 표 읽기 자체가 실패한다.** 앞의 두 파일은 확장만(expand-only)이라
지금 운영 중인 코드와 함께 있어도 무해하다 — 그래서 **먼저 적용하고, 그다음 배포**한다.

| 파일                                                                | 하는 일                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `supabase/migrations/20260928000000_atomic_flows.sql`               | 헬퍼·흐름 함수 18개(백업 스냅숏 포함), `service_role` 전용 권한       |
| `supabase/migrations/20260928000100_seminar_publication_status.sql` | `publicationStatus` 없는 세미나 행에 `"published"` 명시 (재실행 안전) |
| `supabase/migrations/20260928000200_assets_bucket_private.sql`      | `assets` 버킷을 비공개로 (C-22, 3-1절과 같은 전환 — 재실행 안전)      |

> ⚠️ **세 번째 파일은 옛 코드와 함께 있으면 무해하지 않다.** 지금 운영 중인 `main`은 자산을 공개 버킷
> URL로 직접 링크한다(`/media` 프록시가 없다). `db push`는 세 파일을 한꺼번에 적용하므로, prod에서는
> **push 직후 바로 새 코드를 배포**해 포스터·사진이 깨지는 구간을 배포 시간으로 줄인다. 새 코드는
> 기본 설정(`ASSETS_ACCESS` 미등록)에서 `/media`로 서빙하므로 비공개 버킷과 맞는다. dev·새 환경은
> 이 순서와 무관하다.

1. ⬜ **dev** — `snumps-dev`가 **일시정지(INACTIVE)** 상태다(2026-09-27 확인). 대시보드에서 Restore한 뒤:
   ```bash
   supabase link --project-ref gcahkryexewswzvtfltj -p "$(tr -d '\n' < .env.devdbpass)"
   supabase db push -p "$(tr -d '\n' < .env.devdbpass)"
   ```
   dev에는 CLI 이력이 있으므로(2절, `db push`로 적용) 새 세 파일만 적용된다.
2. ⬜ **dev 확인** (SQL Editor):
   ```sql
   select count(*) from pg_proc where proname like 'flow\_%';          -- 18
   select count(*) from app_tables t, jsonb_array_elements(t.doc->'rows') r
    where t.name = 'seminars' and not r ? 'publicationStatus';          -- 0
   select has_function_privilege('anon', 'flow_publish_seminar(jsonb)', 'execute'); -- false
   select public from storage.buckets where id = 'assets';             -- false
   ```
3. ⬜ **prod** — 배포 직전에 `bash scripts/ops/ops-push-prod.sh` (`.env.proddbpass` 필요, 스크립트가
   끝나면 링크를 dev로 되돌린다). 2의 확인 쿼리를 prod에서 다시 실행.
4. ⬜ 그다음 코드 배포. 되돌릴 때는 코드만 되돌리면 된다(옛 코드는 함수를 부르지 않는다).

**배포 전 확인 3건 (프리뷰 배포에서)**

- ⬜ **패키지 매니저**: 레포가 pnpm으로 바뀌었다(`pnpm-lock.yaml`, `packageManager` 필드). Vercel 프리뷰
  빌드 로그에서 pnpm(corepack)으로 설치되는지 확인. npm으로 설치되면 프로젝트 설정의 Install Command를
  `pnpm install --frozen-lockfile`로.
- ⬜ **로그인 검사 강화**: 로그인이 이제 Google `email_verified`와 `hd=snu.ac.kr`까지 확인한다. 실제 SNU
  계정으로 한 번 로그인해 통과하는지 확인(`hd`가 없는 계정이면 거부된다 — 결정 대기 항목).
- ⬜ **세미나 흐름 스모크**: 프리뷰(dev DB)에서 세미나 신청 → 승인 → 일정 → 게시 → 취소, 체크인 → 출석 승인을
  한 번씩. 함수 권한이 빠졌으면 여기서 500이 난다.

## 3. Vercel env 등록

**왜**: 런타임의 Supabase 접근·크론 인증·백업 push가 전부 env로 주입된다. **prod 값만 Vercel에**,
dev 값은 로컬 `.env`로 (스펙 §6).

> **2026-08-30 CLI로 등록 완료** (`scripts/ops/ops-vercel-env.sh`): 아래 표에서
> `HEALTHCHECKS_PING_URL`(5절 발급 후)·`GITHUB_BACKUP_TOKEN`(6절 발급 후) **2종만 남음** —
> 발급되면 스크립트 재실행 대신 `vercel env add <NAME> production` 으로 개별 추가.
> `CRON_SECRET`은 생성돼 레포의 `.env.cronsecret`(gitignored)에 보관 — **cron-job.org 잡 3개의
> `Authorization: Bearer` 값으로 이 파일 내용을 그대로 복사**할 것. AWS_* 잔존 env 없음(확인).
> ⚠️ env는 **다음 배포부터** 적용된다.

Vercel → `snumps` 프로젝트 → Settings → Environment Variables (Production):

| env                         | 값                                                                                          | 비고                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPABASE_URL`              | prod 프로젝트 URL                                                                           | 콘솔 → Project Settings → API                                                                                                                                            |
| `SUPABASE_SECRET_KEY`       | `sb_secret_...` (2절에서 발급)                                                              | 서버 전용 — 클라이언트 노출 금지                                                                                                                                         |
| `SUPABASE_ASSETS_BUCKET`    | `assets`                                                                                    |                                                                                                                                                                          |
| `SUPABASE_STAGING_BUCKET`   | `staging`                                                                                   |                                                                                                                                                                          |
| `SUPABASE_BACKUPS_BUCKET`   | `backups`                                                                                   |                                                                                                                                                                          |
| `HEALTHCHECKS_PING_URL`     | 5절에서 발급                                                                                |                                                                                                                                                                          |
| `GITHUB_BACKUP_REPO`        | `snumps-webpage/snumps-backups`                                                             |                                                                                                                                                                          |
| `GITHUB_BACKUP_TOKEN`       | 6절에서 발급한 PAT                                                                          |                                                                                                                                                                          |
| `DATA_BACKEND`              | `supabase`                                                                                  | `memory`는 dev 오프라인 보조 플래그                                                                                                                                      |
| `CRON_SECRET`               | `openssl rand -base64 32`로 생성                                                            | **유지** — cron-job.org 잡 헤더(4절)와 동일 값. Vercel cron은 이 env 존재 시 Bearer 자동 첨부                                                                            |
| `ASSETS_CDN_URL`            | `assets` 버킷 공개 URL 베이스 (값 교체)                                                     | **`ASSETS_ACCESS=public`일 때만 쓰인다.** 기본 모드에서는 읽히지 않는다                                                                                                  |
| `ASSETS_ACCESS`             | **등록하지 않는다**(기본값 = `/media` 프록시)                                               | 옛 동작(공개 버킷 직접 링크)으로 되돌려야 할 때만 `public`을 넣는다. 버킷이 비공개면 이 값은 화면을 깨뜨린다                                                             |
| `SITE_ORIGIN` / `REDIS_URL` | `SITE_ORIGIN`은 **신규 등록**(값은 `https://snumps.vercel.app`), `REDIS_URL`은 기존 값 유지 | 구 `PUBLIC_SITE_ORIGIN`은 **코드가 한 번도 읽지 못했다**(SvelteKit이 private env에서 `PUBLIC_` 키를 제거). 새 이름 등록 후 옛 키는 삭제해도 된다 — 삭제 전후 동작은 같다 |

- **제거**: `AWS_*` 5종 (남아 있으면 삭제).
- dev 프로젝트의 `SUPABASE_URL`/`SUPABASE_SECRET_KEY`는 로컬 `.env`에만 등록 (`docs/SETUP.md` 로컬 개발 절 참조).

## 3-0. 🔴 배포 전까지 **세미나 관리 화면을 쓰지 말 것** (기한부)

**왜**: 운영 DB에는 이미 이주 복구분이 들어가 있다 — 세미나 24건의 일정(`schedule`),
21건의 설명(`description`), 외부 발표자 1건. 그런데 **지금 배포돼 있는 코드(`main`)는
그 필드들을 모른다.** 저장 스키마가 모르는 키는 읽는 순간 벗겨지므로, 배포 전에 라이브
사이트에서 세미나 표에 쓰기가 일어나면 **복구한 값이 그 행에서 사라진다.**

실측으로 확인했다 — `main`의 `SeminarSchema`에는 `publicationStatus`·`schedule`·
`announcedAt`·`semesterPinned`·`description`이 **하나도 없다**.

쓰기를 일으키는 동작(배포 전까지 피할 것):

- 관리자 → 세미나 기록 편집(생성·수정·삭제), 파일 추가·제거
- 세미나 개설 신청 **승인**

**되돌릴 수 있다.** 복구 스크립트는 값이 있는 행을 건드리지 않으므로 배포 후 다시 돌리면
사라진 것만 다시 채운다:

```bash
node scripts/ops/ops-repair-seminar-schedules.mjs        # 미리보기 → apply
node scripts/ops/ops-notion-backfill-seminars.mjs        # 미리보기 → apply
node scripts/ops/ops-migration-audit.mjs --skip-notion   # 확인
```

배포가 끝나면 이 절은 **삭제해도 된다** — 새 코드는 그 필드들을 알고 있다.

## 3-1. `assets` 버킷을 **비공개로 전환** (C-22)

**왜**: 지금까지 `assets`는 공개 버킷이었고, 그래서 "URL을 아는 것"이 곧 권한이었다.
세미나를 취소해도 이미 나간 절대 URL은 포스터·자료를 계속 내려 줬다. 코드는 이미
앱 경로(`/media/<key>`)로만 링크하고 요청마다 권한을 판정하지만, **버킷이 공개로 남아
있으면 예전 URL이 그대로 살아 있다.** 이 전환이 차단을 실제로 만든다.

**스크립트가 전환과 확인을 한 번에 한다** (콘솔 토글도 되지만, 확인까지 묶여 있는 쪽을 쓴다):

```bash
node scripts/ops/ops-assets-private.mjs           # 현재 상태만 본다 (아무것도 바꾸지 않음)
node scripts/ops/ops-assets-private.mjs --apply   # 비공개로 전환 + 확인
```

`.env`에 `SUPABASE_URL`·`SUPABASE_SECRET_KEY`(**prod**)가 있으면 자동으로 읽는다. 없으면
앞에 붙여 실행한다: `SUPABASE_URL=... SUPABASE_SECRET_KEY=sb_secret_... node ...`.

`--apply`는 전환 후 **두 방향으로** 확인한다 — 공개 URL이 거부되는지(차단의 증거),
서명 URL이 200인지(사이트가 살아 있다는 증거). 둘 중 하나라도 어긋나면 0이 아닌 코드로
끝난다. 되돌리려면 `--public`.

수동 경로: Supabase 콘솔 → Storage → `assets` → **Make private**.

- 전환 후 공개 페이지에서 이미지·PDF가 그려지는지 눈으로도 확인한다. 깨진다면
  `ASSETS_ACCESS`가 `public`으로 남아 있는지부터 본다(등록하지 않는 것이 정답이다).
- `staging`·`backups`는 원래 비공개다. 바꾸지 않는다.

> **되돌리기**: 버킷을 다시 공개로 돌리고 `ASSETS_ACCESS=public` + `ASSETS_CDN_URL`을
> 등록하면 옛 동작으로 복귀한다. 그 상태에서는 취소된 세미나의 파일도 다시 공개된다.

> **이미 유출된 URL은 이 전환으로 끝난다** — 공개 URL이 죽기 때문이다. 다만 Vercel
> 이미지 최적화가 만든 파생본은 최대 24시간(`minimumCacheTTL`) 남을 수 있다 — 회수가
> 그만큼 늦게 듣는다는 뜻이라 30일에서 줄였다.

## 4. cron-job.org 잡 3개 등록

**왜**: Vercel Hobby는 크론이 일 1회뿐 — 주 스케줄러는 cron-job.org가 맡는다 (S1).
잡 3개가 만료 처리·keep-alive(7일 무활동 pause 방지)·주간 백업을 전부 굴린다. (스터디 회차 자동 생성은
2026-09-27 제거됐다 — 회차는 개설자가 직접 만든다.)

스펙 §5-1 표 그대로 등록:

| #   | 잡 이름     | 스케줄 (KST) | URL                                                  |
| --- | ----------- | ------------ | ---------------------------------------------------- |
| 1   | sync-events | 매시 17분    | `GET https://snumps.vercel.app/api/cron/sync-events` |
| 2   | health      | 매일 09:00   | `GET https://snumps.vercel.app/api/health`           |
| 3   | maintenance | 매일 04:00   | `GET https://snumps.vercel.app/api/cron/maintenance` |

절차 (잡마다 반복):

1. cron-job.org → Create cronjob → URL 입력. ⚠️ **canonical URL `https://snumps.vercel.app`을 정확히** —
   cron-job.org는 **302/308 리디렉션을 실패로 집계**한다. 다른 도메인 별칭·http·후행 슬래시 변형 금지.
2. 타임존을 **Asia/Seoul**로 설정 후 스케줄 입력.
3. **Advanced → Headers**: `Authorization` = `Bearer <CRON_SECRET>` (3절과 동일 값. URL 쿼리 전달 금지).
4. **알림 설정**: ① 실행 실패 알림 on ② **연속 실패로 잡이 자동 비활성될 때의 알림 on** — 수신은 공용 메일.
   (cron-job.org는 장기 연속 실패 시 잡을 꺼버릴 수 있다 — 알림 없이는 조용히 죽는다.)
5. 저장 후 **수동 실행(Test run)으로 응답 200 직접 확인**. **401이면 `CRON_SECRET`이 헤더와 다르거나 배포에 설정되지 않은 것**이다
   — 둘을 상태 코드로 구분하지 않는다(결정 C-20). 인증 전에 설정 여부를 알려 주지 않기 위해서다.
   Vercel 환경변수와 3절의 값을 대조할 것.

## 5. Healthchecks.io

**왜**: cron-job.org의 알림은 "실행했는데 실패"만 잡는다. **"아예 아무도 실행하지 않았음"**(스케줄러 전멸·
배포 사고·프로젝트 pause — 모든 침묵 모드)은 dead-man's switch가 잡는다 (S1). 크론 핸들러가 성공할 때마다
핑을 보내고, 핑이 끊기면 Healthchecks가 경보한다.

1. https://healthchecks.io → 공용 계정 → **체크 1개** 생성 (이름 예: `snumps-cron`).
2. **Grace time 48시간**으로 설정 — 이틀간 성공 핑이 없으면 경보.
3. 알림 대상(Integrations)을 **공용 메일**로 설정.
4. 체크의 **ping URL** 복사 → Vercel env `HEALTHCHECKS_PING_URL`로 등록 (3절 표).

무료 플랜 20체크·카드 등록 불요.

## 6. 백업 repo (`snumps-backups`)

**왜**: Supabase 무료 플랜은 자동 백업이 없고, 프로젝트 단위 소멸(계정 사고·1년 경과 미복원)에 대비한
**off-platform 사본**(B2)이 필요하다. 주간 덤프를 private GitHub repo로 push한다 (스펙 §7).

1. ✅ GitHub org에 **private repo** `snumps-webpage/snumps-backups` 생성 (2026-08-30, gh CLI — README만 포함).
2. **fine-grained PAT 발급**: GitHub → Settings → Developer settings → Fine-grained tokens →
   - Resource owner: `snumps-webpage` / Repository access: **`snumps-backups` 단일 repo만**
   - Permissions: **Contents — Read and write** 만. 그 외 전부 No access.
   - 만료일을 정했으면 갱신 예정일을 자격증명 인벤토리(1절)에 기록.
3. 토큰 → Vercel env `GITHUB_BACKUP_TOKEN` (3절 표).

## 7. 🔴 pause 런북 (스펙 §5-4)

**왜**: Supabase 무료 프로젝트는 7일 무활동 시 일시정지된다. keep-alive 잡(4절 잡 3)이 막아주지만,
잡이 전멸한 채 7일이 지나면 **DB·Storage·공개 자산 URL이 전부 다운**된다. 이때의 복구 순서:

1. **증상**: 사이트·사진 전면 다운 (또는 Healthchecks "down" 경보).
2. Supabase 대시보드 → 해당 프로젝트 → **Resume** (복원에 수 분 소요).
3. **cron-job.org 잡 3개 재활성화** — pause 동안 연속 실패로 자동 비활성됐을 것이다. 잡별로 Enable 후 수동 실행 1회.
4. Healthchecks 체크가 정상(up)으로 복귀했는지 확인.
5. ⚠️ **복원 가능 기간은 pause 후 1년** — 그 이후는 프로젝트가 소멸하고 백업(8절)이 유일한 복구 수단이다.

## 8. 복구 절차 (스펙 §7)

**왜**: 오염된 쓰기 롤백(B1)·프로젝트 소멸(B2)·자산 오삭제(B3)의 세 실패 모드에 각각 대응 경로가 있다.

- **B1/B2 — 테이블 복원**: `backups` 버킷의 주간 JSON 덤프(B1) 또는 `snumps-backups` repo 사본(B2)에서
  복원할 시점의 덤프를 내려받아, **`app_tables`(및 `audit_log`)를 수동 upsert** — Supabase SQL Editor에서
  덤프 JSON을 값으로 한 upsert 문 실행. (전용 복구 스크립트는 추후 제공 — 그 전까지는 이 수동 절차가 공식 경로.)
  주의: 무료 플랜 직결 `pg_dump`/`psql` 복원은 IPv6-only 함정 — **앱 경유 JSON 방식으로 통일** (스펙 §7).
- **B3 — 자산 개별 복원**: `backups/assets-mirror/`에 승격 시점 사본이 1부씩 있다. 오삭제된 파일을
  콘솔에서 내려받아 `assets` 버킷의 원래 경로로 재업로드.
- 복원 후: 사이트 표시 확인 + 잡 3개 정상 실행 확인.

## 9. 정기 수칙

**왜**: 무료 플랜의 상한(Storage 1GB, DB 500MB)과 계정 위생은 자동으로 관리되지 않는다 — 학기 단위 점검이 방어선.

**학기말마다**:

1. **Storage 사용량 점검** (스펙 §4-4 산수): 상한 1GB — 세미나 PDF 50MB × 20개면 소진된다.
   콘솔 → Storage 사용량 확인, **80% 도달 시 PDF 상한 하향 또는 오래된 자산 정리**. 실측치를 기록.
2. **콘솔 로그인 점검** (계정 위생): Supabase 두 프로젝트(prod·dev)를 포함한 콘솔 5종에 공용 계정으로
   로그인해 접근 가능 여부·경고 메일 유무 확인 — 접근 상실을 조기에 발견한다.
3. **자격증명 인벤토리 갱신** (1절 표): 보유자·보관 위치·PAT 만료일 최신화.

**분기마다**: 자산 전량 로컬 아카이브 갱신 (B4 — 프로젝트 소멸 대비 최후 사본).

## 10. Gmail 발신 계정 확인

**왜**: 전 회원 공지(M4)는 하루 수신자 한도가 관건 — 소비자 gmail.com은 **일 500명**(공지 2회로 소진),
Google Workspace는 일 2,000명.

- 현재 발신에 쓰는 계정이 Workspace인지 확인. 소비자 계정이면: 공지 발송 빈도를 하루 1회로 제한하거나 Workspace 전환 검토.
- 확인 결과를 이 문서에 기록할 것.

---

## 완료된 작업

- ~~AWS 계정 생성~~ · ~~Terraform 설치·적용~~ · ~~Vercel OIDC 활성화~~ — **폐기 (2026-09-01 Supabase 전환)**.
  AWS 리소스는 만들지 않는다 (이미 만들었다면 해지·정리). 절차 이력은 git 이력의 이전 판 참조.
- ~~`CRON_SECRET` GitHub Actions Secret 등록~~ — **폐기** (`cron-sync-events.yml` 삭제).
  `CRON_SECRET` 자체는 유지 — 생성·등록은 3절(Vercel env)·4절(cron-job.org 헤더)로 이관.

## 이후 추가될 작업 (예고)

- **M3 데이터 이주 직전**: 프로덕션 Vercel env 사본 전달 (`NOTION_DB_EVENTS`·`NOTION_DB_ATTENDANCE_QUEUE` 실측용), Notion 원본 백업 실행 입회. 이주 스크립트 실행자에게 prod `sb_secret` 키 한정 전달 → **이주 완료 후 키 회전** (스펙 §8 M-1)
- **M3**: 정합성 이상 데이터 처리 결정 (주인 없는 개인정보 5건 등 — 동아리 확인 필요)
- **M8 컷오버**: Notion 읽기 전용 전환 시점 결정, `robots.txt` 개방 승인
