# 운영자 작업 목록 (Operator TODO)

> **이 문서의 성격**: 코드가 아니라 **사람(운영자)이 직접 해야 하는 셋업·운영 작업**의 살아있는 목록.
> 구현이 진행되며 새 작업이 생기면 여기에 추가되고, 완료하면 체크한다.
> 각 작업은 "왜 필요한지 + 정확히 어떻게 하는지"를 함께 적는다.
>
> **2026-09-01 전면 재작성**: AWS → Supabase 전환([`SUPABASE-MIGRATION-SPEC.md`](./spec/SUPABASE-MIGRATION-SPEC.md)) 반영.
> 기존 AWS 작업(계정 생성·Terraform·OIDC)은 [완료된 작업](#완료된-작업) 절에 **폐기**로 이관 기록.

## 상태 요약

| # | 작업 | 상태 | 막고 있는 것 |
|---|---|---|---|
| 1 | 공용 계정 준비 (콘솔 5종 공용화 + MFA + 자격증명 인벤토리) | ⬜ 미완 | 이하 전부 — 알림 수신·소유권의 전제 |
| 2 | Supabase 프로젝트 2개 생성 (prod/dev) + SQL 실행 + sb_secret 키 발급 | ✅ 완료 (CLI, 2026-08-30) — org 공용화(1절)만 잔여 | 데이터 계층·자산·이주 전부 |
| 3 | Vercel env 등록 | 🟡 CLI로 10종 등록 완료 (2026-08-30) — `HEALTHCHECKS_PING_URL`(5절)·`GITHUB_BACKUP_TOKEN`(6절)만 발급 후 추가 | 런타임 동작 전부 |
| 4 | cron-job.org 잡 3개 등록 + 알림 설정 | ⬜ 미완 (3 선행) | 만료 처리·회차 생성·keep-alive·주간 백업 |
| 5 | Healthchecks.io 체크 생성 | ⬜ 미완 (1·3 선행) | 크론 침묵 감지 (dead-man's switch) |
| 6 | 백업 repo (`snumps-backups`) + fine-grained PAT | 🟡 repo 생성 완료 (2026-08-30) — **PAT 발급·등록만 남음** | off-platform 백업 (B2) |
| 7 | 🔴 pause 런북 숙지 | 상시 | — (장애 시 대응 속도) |
| 8 | 복구 절차 숙지 | 상시 | — |
| 9 | 정기 수칙 (학기말·분기) | 🔁 반복 | — |
| 10 | Gmail 발신 계정 확인 | ⬜ 미완 | 전 회원 공지 메일 (M4) |

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

| 자격증명 | 보유자 | 보관 위치 | 복구 경로 |
|---|---|---|---|
| `SUPABASE_SECRET_KEY` (prod) | | | Supabase 콘솔에서 재발급 (구 키 폐기) |
| `SUPABASE_SECRET_KEY` (dev) | | | 〃 |
| `CRON_SECRET` | | | 재생성 → Vercel env + cron-job.org 잡 3개 동시 교체 |
| `HEALTHCHECKS_PING_URL` | | | Healthchecks 콘솔에서 확인/재발급 |
| `GITHUB_BACKUP_TOKEN` (fine-grained PAT — `snumps-backups` repo `contents:write` 한정) | | | GitHub 콘솔에서 재발급 |
| Supabase org 로그인 | | | 공용 메일 비밀번호 재설정 + MFA 복구 코드 |
| cron-job.org 로그인 | | | 〃 |
| Healthchecks.io 로그인 | | | 〃 |
| GitHub org 로그인 | | | 〃 |
| Vercel 로그인 | | | 〃 |

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

| env | 값 | 비고 |
|---|---|---|
| `SUPABASE_URL` | prod 프로젝트 URL | 콘솔 → Project Settings → API |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` (2절에서 발급) | 서버 전용 — 클라이언트 노출 금지 |
| `SUPABASE_ASSETS_BUCKET` | `assets` | |
| `SUPABASE_STAGING_BUCKET` | `staging` | |
| `SUPABASE_BACKUPS_BUCKET` | `backups` | |
| `HEALTHCHECKS_PING_URL` | 5절에서 발급 | |
| `GITHUB_BACKUP_REPO` | `snumps-webpage/snumps-backups` | |
| `GITHUB_BACKUP_TOKEN` | 6절에서 발급한 PAT | |
| `DATA_BACKEND` | `supabase` | `memory`는 dev 오프라인 보조 플래그 |
| `CRON_SECRET` | `openssl rand -base64 32`로 생성 | **유지** — cron-job.org 잡 헤더(4절)와 동일 값. Vercel cron은 이 env 존재 시 Bearer 자동 첨부 |
| `ASSETS_CDN_URL` | `assets` 버킷 공개 URL 베이스 (값 교체) | 예: `https://<prod-ref>.supabase.co/storage/v1/object/public/assets` |
| `PUBLIC_SITE_ORIGIN` / `REDIS_URL` | 기존 값 유지 | |

- **제거**: `AWS_*` 5종 (남아 있으면 삭제).
- dev 프로젝트의 `SUPABASE_URL`/`SUPABASE_SECRET_KEY`는 로컬 `.env`에만 등록 (`docs/SETUP.md` 로컬 개발 절 참조).

## 4. cron-job.org 잡 3개 등록

**왜**: Vercel Hobby는 크론이 일 1회뿐 — 주 스케줄러는 cron-job.org가 맡는다 (S1).
잡 3개가 만료 처리·회차 생성·keep-alive(7일 무활동 pause 방지)·주간 백업을 전부 굴린다.

스펙 §5-1 표 그대로 등록:

| # | 잡 이름 | 스케줄 (KST) | URL |
|---|---|---|---|
| 1 | sync-events | 매시 17분 | `GET https://snumps.vercel.app/api/cron/sync-events` |
| 2 | health | 매일 09:00 | `GET https://snumps.vercel.app/api/health` |
| 3 | maintenance | 매일 04:00 | `GET https://snumps.vercel.app/api/cron/maintenance` |

절차 (잡마다 반복):

1. cron-job.org → Create cronjob → URL 입력. ⚠️ **canonical URL `https://snumps.vercel.app`을 정확히** —
   cron-job.org는 **302/308 리디렉션을 실패로 집계**한다. 다른 도메인 별칭·http·후행 슬래시 변형 금지.
2. 타임존을 **Asia/Seoul**로 설정 후 스케줄 입력.
3. **Advanced → Headers**: `Authorization` = `Bearer <CRON_SECRET>` (3절과 동일 값. URL 쿼리 전달 금지).
4. **알림 설정**: ① 실행 실패 알림 on ② **연속 실패로 잡이 자동 비활성될 때의 알림 on** — 수신은 공용 메일.
   (cron-job.org는 장기 연속 실패 시 잡을 꺼버릴 수 있다 — 알림 없이는 조용히 죽는다.)
5. 저장 후 **수동 실행(Test run)으로 응답 200 직접 확인**. 401/501이면 `CRON_SECRET` 불일치/미설정.

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
