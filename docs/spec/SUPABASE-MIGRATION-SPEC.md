# AWS → Supabase·Firebase 이행 명세 (v0.1)

> **결정 (2026-09-01)**: 저장 기반을 AWS(S3+KMS+CloudFront)에서 **Supabase(무료 플랜) + Firebase(Spark)**로
> 변경한다. 결제 수단 등록 없는 무료 운영이 절대 제약. 스케줄러는 **cron-job.org 단독** —
> GitHub Actions의 크론 임무를 전면 이주한다 (CI는 GH Actions 유지 — 크론이 아님).
>
> **최상위 원칙: API surface 무손상.** 여기서 API surface란 두 층 모두다:
> ① HTTP 표면 — 라우트·액션·REST 엔드포인트·오류 코드 계약 (API-SPEC v0.6)
> ② 내부 계약 — `getTable`/`mutate`/`getQueue`/`mutateQueue`/`audit`/`ensureCreated`/뷰·스키마의
>    시그니처와 의미 (IMPLEMENTATION-SPEC의 데이터 계약)
> 서비스 8종·가드·라우트·테스트 137건은 **원칙적으로 무수정**이어야 하고, 교체는 데이터 계약의
> **구현체 아래**에서만 일어난다.

---

## 0. 무료 플랜 제약 실측 (설계의 전제)

| 항목 | Supabase Free | 영향 |
|---|---|---|
| DB | Postgres 500MB, 프로젝트 2개 | 605행 + 성장분에 충분 |
| **7일 무활동 일시정지** | **DB 쿼리 활동 기준** | keep-alive는 실제 SELECT를 유발해야 함 (§5) |
| Storage | 1GB, 파일당 50MB | 자산 90개+파생본 충분. **이미지 변환 API는 유료** → 파생본은 앱에서 sharp로 생성(기존 계획 그대로) |
| Egress | 5GB/월 | 동아리 트래픽 여유 |
| 백업 | 무료 플랜 자동 백업 **없음** | 자체 백업 잡 필요 (§7) |

| 항목 | Firebase Spark | 영향 |
|---|---|---|
| Cloud Functions | **불가 (Blaze 전용)** | 서버 로직은 전부 SvelteKit(Vercel) 유지 |
| **Cloud Storage** | **신규 프로젝트는 Blaze 전용 (2024-10 정책)** | Firebase Storage 사용 불가 — 자산은 Supabase Storage |
| Firestore | 1GiB, 읽기 5만/쓰기 2만/일 | Admin SDK(서비스 계정)로 서버에서 사용 가능, 카드 불요 |
| FCM | 무료 | 장래 푸시 알림용 예비 |

| cron-job.org | 값 |
|---|---|
| 실행 타임아웃 | **30초** — 크론 핸들러는 30초 내 완료 필수 |
| 자동 비활성 | **25회 연속 실패 시** — 실패·비활성 알림 반드시 켬 |
| 응답 요건 | **200 직접 반환** (302 리다이렉트는 실패로 집계) |
| 헤더 | 커스텀 헤더 지원 → `Authorization: Bearer CRON_SECRET` 유지 가능 |

## 1. 역할 분담

| 시스템 | 역할 |
|---|---|
| **Supabase Postgres** | 테이블 저장소 — 기존 S3 JSON 문서 모델의 계약 보존 이식 (§2) |
| **Supabase Storage** | 자산(사진·PDF) — presign→승격 파이프라인 이식 (§4) |
| **Firebase Firestore** | 감사 로그 싱크 — append-only, 메인 DB와 물리 분리 (§3). ⚠️ 결정 필요 D-1 |
| **Firebase FCM** | (예비) 장래 알림 — 이번 범위 아님 |
| SvelteKit(Vercel) | 서버 로직 전부 — 변화 없음 |
| **cron-job.org** | 스케줄러 단독 — 동기화·keep-alive·백업 잡 (§5) |
| GitHub Actions | **CI만** (lint+test). `cron-sync-events.yml` 삭제 |

## 2. 데이터 계층 — 계약 보존 전략

### 2-1. 단계 원칙: S1 문서 모델 이식 → (선택) S2 관계형 정규화

**S1(이번 작업)**: Postgres를 **버전 있는 JSONB 문서 스토어**로 사용해 현 계약을 그대로 이식한다.
관계형 정규화(S2)는 하지 않는다 — 하면 서비스 8종 전면 재작성 = API surface 훼손이며,
605행 규모에서 당장 이득이 없다. S2는 규모·질의 요구가 임계값(API-SPEC §1-3)에 닿을 때의
별도 마일스톤으로 명시적으로 남긴다. **"Postgres를 문서 스토어로 쓰는 것"은 규모에 맞춘
의도적 선택이지 결함이 아니다** — 이 근거를 코드 주석과 본 문서에 남긴다.

### 2-2. 스키마 (SQL)

```sql
-- 테이블 문서: S3의 tables/<name>.json.gz 1:1 대응
create table app_tables (
  name    text primary key,
  version bigint not null default 1,          -- ETag 대체: 단조 증가 CAS 토큰
  doc     jsonb  not null                     -- { schemaVersion, rows } 봉투 그대로
);

-- 출석 큐: 이벤트당 1행 (기존 이벤트당 객체 1:1 대응 — 버스트 경합 격리 유지)
create table app_queues (
  event_id text primary key,
  version  bigint not null default 1,
  doc      jsonb  not null
);

-- RLS: 전부 활성 + 정책 0개(전면 거부). 접근은 서버의 service_role 키 단일 경로 —
-- PostgREST 익명 노출 원천 차단. anon 키는 배포하지 않는다.
alter table app_tables enable row level security;
alter table app_queues enable row level security;
```

### 2-3. `data/store.ts` — s3.ts의 대체 (시그니처 보존)

`tables.ts`의 알고리즘(재시도·봉투 검증·**쓰기 스키마 게이트**·no-op 스킵·캐시 연동)은
**무수정**. 바뀌는 것은 저수준 모듈 하나:

```ts
// s3.ts의 getObjectWithEtag/putObjectConditional 대응
readDoc(kind: "table"|"queue", key): { doc, version } | null
writeDocIf(kind, key, doc, expectedVersion): boolean
//  UPDATE ... SET doc=$1, version=version+1 WHERE key=$2 AND version=$3
//  → 영향 행 0 = 조건 실패 = 기존 ConditionalWriteError와 동일 의미론
//  신규 생성: INSERT ... ON CONFLICT DO NOTHING → 삽입 0행 = 경합
listQueues(): event_id[]        // SELECT event_id FROM app_queues
deleteQueueDoc(eventId)
```

- gzip 제거 — Postgres가 TOAST로 압축. 봉투 `{schemaVersion, rows}`는 유지(리더 분기 계약)
- If-None-Match 최적화 대응: `version`을 캐시에 보관, `WHERE version > $cached` 조건 조회로 동등 효과
- 클라이언트: `@supabase/supabase-js` service role — **`data/store.ts` 밖 사용 금지** (기존 s3.ts 규칙 승계)
- **테스트**: `s3-memory.ts` → `store-memory.ts` 동일 표면. 기존 137테스트는 목 경로 교체 외 무수정이
  성립해야 하며, 이것이 "API surface 무손상"의 검증 그 자체다

### 2-4. 삭제·보존 목록

| 대상 | 처분 |
|---|---|
| `data/s3.ts`, AWS SDK 3종, `@vercel/functions` | 삭제 (스토리지 함수는 §4의 storage.ts로 대체) |
| `infra/*.tf` 전체 | 삭제 — Supabase/Firebase는 콘솔 셋업(OPERATOR-TODO로 절차화). IaC 부재는 트레이드오프로 명기 |
| `mutate`의 재시도·백오프 로직 | **보존** — Postgres CAS도 경합 시 재시도 필요 (의미 동일) |
| 출석 큐 분리 저장 | **보존** — 행 단위 잠금이라 이론상 불필요해 보여도, 계약·테스트·버스트 격리 의미론 유지(콩팥) |
| audit "mutate 밖" 원칙 | **보존** — §3 |

## 3. 감사 로그 — Firestore 싱크

- 컬렉션 `audit/{yyyy-mm-dd}/entries/{id}` — 기존 "건당 객체 append-only" 의미론 1:1
- `data/audit.ts` 시그니처·기록 대상·비대상·"탈퇴 계열 실패 시 액션 실패" 정책 전부 무수정 —
  내부 putObject 호출만 Firestore `add()`로 교체
- 접근: `firebase-admin` 서비스 계정(JSON을 env `FIREBASE_SERVICE_ACCOUNT_B64`로) — 서버 전용
- 근거: 감사 로그를 메인 DB 밖 별도 시스템에 두면 ① DB 침해 시 감사 추적 생존 ② 메인 테이블과
  쓰기 경합 0 ③ Firebase에 실재하는 역할 부여. **⚠️ D-1**: Postgres `audit_log` 테이블(단순)로도
  가능 — Firebase 채택 여부는 결정 항목

## 4. 자산 — Supabase Storage

버킷 2개: `assets`(public read), 업로드 스테이징은 같은 버킷의 `uploads/pending/` 프리픽스 유지.

| 기존 (S3) | 대체 (Supabase Storage) |
|---|---|
| presigned PUT (10분) | `createSignedUploadUrl(path)` — 서버 발급, 브라우저 직접 업로드 |
| HeadObject 실측 검증 | `list()`/`info()`의 size·mimetype 메타데이터로 동일 검증 |
| CopyObject+Delete 승격 | `move(pendingPath, finalPath)` — 원자적 이동이라 오히려 단순 |
| 수명주기 7일 고아 정리 | **네이티브 수명주기 없음** → 크론 잡이 `uploads/pending/` 열거·7일 초과 삭제 (§5 잡 3) |
| CloudFront URL | `getPublicUrl()` 베이스 — env `ASSETS_CDN_URL` 교체로 `assetUrl()` 무수정 |
| 파생본 (미구현 잔여) | 승격 시 sharp 생성 — 계획 그대로, Supabase 변환 API는 유료라 불사용 |

`uploads.ts`의 purpose 검증·슬러그·해시 키·승격 강제 지점 계약 전부 무수정. `uploads.test.ts`는
`store-memory`의 스토리지 목으로 그대로 통과해야 한다.

## 5. cron-job.org 잡 명세

| # | 잡 | 스케줄 | 대상 | 역할 |
|---|---|---|---|---|
| 1 | sync-events | 매시 17분 | `GET /api/cron/sync-events` + `Authorization: Bearer` | 만료 정리·회차 자동 생성. **DB를 치므로 keep-alive 겸함** |
| 2 | health/keep-alive | 매일 09:00 KST | `GET /api/health` (공개, 무인증) | 1행 SELECT 후 `200 {"ok":true}` — 잡 1과 독립된 두 번째 심장 |
| 3 | maintenance | 매일 04:00 KST | `GET /api/cron/maintenance` + Bearer | ① pending 업로드 7일 초과 삭제 (§4) ② 주 1회(일요일 분기) 전 테이블 JSON 덤프를 Storage `backups/`에 적재 (§7) |

- 신규 라우트 2개: `/api/health` (public — 존 `api`, 무인증 공개 read-only), `/api/cron/maintenance` (Bearer)
- 전 잡 30초 내 완료 보장 — 현 크론 스텝은 수백 ms 수준. maintenance 백업도 605행 JSON이라 여유
- **알림 설정(운영 수칙)**: 실패 알림 + **자동 비활성 알림** 필수 on, 수신은 동아리 공용 메일
- 응답은 200 직접 (기존 크론 엔드포인트가 이미 JSON 200 — 충족)
- 25연속 실패 = 잡 비활성: 잡 1이 죽어도 잡 2·3이 keep-alive 유지 (상호 백업).
  **⚠️ D-2**: Vercel 일1회 크론(vercel.json)을 제4의 백업으로 존치할지 — 결정 항목
- `cron-sync-events.yml` 삭제. **`ci.yml`은 존치** — CI는 크론이 아니며 이주 대상 아님

## 6. 환경 변수·비밀

```bash
# 제거
AWS_REGION, S3_DATA_BUCKET, S3_ASSETS_BUCKET, AWS_ROLE_ARN, AWS_ACCESS_KEY_ID/SECRET

# 추가
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # 서버 전용. 클라이언트 번들 유입 금지 ($env/dynamic/private)
SUPABASE_ASSETS_BUCKET=assets
FIREBASE_SERVICE_ACCOUNT_B64=     # D-1 채택 시. base64(서비스 계정 JSON)
# 유지
ASSETS_CDN_URL=                   # Supabase 공개 URL 베이스로 값만 교체
CRON_SECRET=                      # cron-job.org 헤더로 계속 사용 (fail-closed 유지)
```

보안 노트: service role 키는 RLS를 우회하는 전권 키 — 기존 IAM 최소권한 대비 **후퇴**다.
완화: RLS 전면 거부로 anon 표면 0 + 키는 Vercel env에만 + `data/store.ts` 단일 사용처.
이 트레이드오프를 문서·주석에 명기.

## 7. 백업 (AWS 버전 관리의 대체)

S3 버킷 버전 관리가 주던 "잘못된 쓰기 롤백"이 사라진다. 대체:
- 잡 3이 주 1회 전 `app_tables`를 JSON으로 Storage `backups/<date>/`에 적재 (Storage 1GB 내 순환 8주 보관)
- 복구 절차를 OPERATOR-TODO에 문서화 (수동 — 규모상 충분)
- **⚠️ D-3**: 백업 주기(주1 vs 일1)와 보관 기간 — 결정 항목

## 8. MIG(데이터 이주) 트랙 영향

- 익스포터(Notion→테이블 JSON) 로직 무변경 — 업로더 목적지만 S3→`app_tables` UPSERT로
- 자산 파이프라인 목적지 Supabase Storage로. sha256 멱등·매니페스트 계약 유지
- `snumps-migration` IAM 역할 → Supabase service role 키 로컬 사용으로 대체
- 검증 항목(행 수·dangling 0·자산 90) 무변경

## 9. 작업 목록

| # | 작업 | 비고 |
|---|---|---|
| T1 | SQL 마이그레이션 파일 (`supabase/migrations/0001_documents.sql`) — §2-2 | 레포에 커밋 (콘솔 클릭 최소화) |
| T2 | `data/store.ts` + `store-memory.ts` — s3.ts/s3-memory.ts 대체 | 기존 테스트 무수정 통과가 게이트 |
| T3 | `data/storage.ts` — presign/승격/공개 URL (§4) + `uploads.ts` 내부 교체 | uploads.test 무수정 통과 |
| T4 | `data/audit.ts` 내부 교체 (D-1 결정에 따름) | 정책·시그니처 무변경 |
| T5 | `/api/health` + `/api/cron/maintenance` 신설, 가드 레지스트리 등록 | |
| T6 | AWS 제거 — s3.ts·SDK 의존성·infra/·`cron-sync-events.yml` 삭제, env·SETUP.md·OPERATOR-TODO 개정 | |
| T7 | OPERATOR-TODO 재작성 — Supabase 프로젝트 생성·SQL 실행·버킷·(Firebase)·cron-job.org 잡 3개+알림 절차 | |
| T8 | 문서 정합 — IMPLEMENTATION-SPEC·BACKEND-TASKS·CODE-REVIEW 잔여 항목에 기반 변경 반영 | |

## 10. 결정 필요 (검토 후 일괄)

- **D-1** Firebase 역할: Firestore 감사 싱크 채택 vs Postgres `audit_log` 테이블(시스템 1개 감소, 분리 이점 포기)
- **D-2** Vercel 일1회 크론 존치 여부 (4중 백업 vs 단순화)
- **D-3** 백업 주기·보관 기간
