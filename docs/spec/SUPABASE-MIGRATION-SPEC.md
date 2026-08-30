# AWS → Supabase 이행 명세 (v0.2 — 검토 2라운드·결정 반영판)

> **확정 결정 (2026-09-01, 검토 32건 반영)**
>
> | # | 결정 |
> |---|---|
> | S1 | 스케줄러: **cron-job.org(주) + Vercel 일1회 크론(최후 심장, 존치) + Healthchecks.io dead-man's switch** |
> | S2 | **Firebase 제외.** 감사 로그는 Supabase 내 Postgres `audit_log` 테이블. FCM이 실제 필요해질 때 Firebase 도입 재론 |
> | S3 | 백업: **private `backups` 버킷 + 외부 사본(private GitHub repo push) + 자산 복구 계층 포함** |
> | S4 | 로컬 개발: **2번째 무료 Supabase 프로젝트 = dev** + 시드 스크립트 (+인메모리 백엔드 env 플래그 보조) |
> | S5 | `/api/health`는 **Bearer 보호** |
> | S6 | 업로드 스테이징은 **private 버킷** |
> | S7 | 기록 학기 형식 **`YY-1\|YY-2\|YY-S\|YY-W`로 확장** (2026-08-30, 이주 실측) — 노션 실데이터에 방학 학기(여름 S·겨울 W)가 실존. 파생 학기(`termOf`)·임원 role term은 정규 학기(1\|2)만 유지 |
> | S8 | private-info **email 선택화(빈 문자열 허용)** (2026-08-30, 이주 실측) — 이메일 미기록 옛 회원 13명 보존. 로그인 매칭·메일 발송은 email 있는 행만 대상 (기존 필터 그대로) |
> | S9 | **학기별 등록제 + 학번 수집 + legacy 아카이브 분리** (2026-08-30) — ① 노션 이주분 members/private-info는 `legacy-members`/`legacy-private-info`(기록 전용, 읽기만)로 이동, 운영 테이블은 빈 상태에서 재가입 승인으로 채움 ② 신청서에 학번 필수 수집 ③ 승인은 `registrations` 행(학기 단위 = 1학기+여름/2학기+겨울 = Term)을 생성 — 자격 행사 권한의 원천 ④ 권한은 원자 capability(`core/capabilities.ts`)로 파생: 등록 회원=전부, 미등록 동문=회원 존 열람+본인 관리, 미등록 준회원=없음(재가입 필요) ⑤ 재가입 승인은 이메일 매칭으로 기존 새-DB 행 재사용, 신규는 legacy 이메일 매칭 시 `legacyMemberId` 연결(과거 기록 표시용) ⑥ 이름 표시 해석은 통합 디렉터리(`data/directory.ts`), 운영 로직은 새 테이블만 |
> | — | 정정 묶음 15건 일괄 반영 (본문에 통합) |
>
> **최상위 원칙: API surface 무손상.**
> ① HTTP 표면 — 라우트·액션·오류 코드 계약 무변경
> ② 내부 계약 — `getTable`/`mutate`/`getQueue`/`mutateQueue`/`audit`/`ensureCreated`/뷰·스키마의
>    시그니처·의미 무변경. 교체는 구현체 아래에서만.
> ③ 단 API-SPEC §1-3의 **저장 형식 절(gzip·S3 키·버킷 버전 관리)은 명시적으로 개정**한다 —
>    이는 계약 개정이지 훼손 은폐가 아니다 (T10).

---

## 0. 무료 플랜 제약 실측

| 항목 | Supabase Free | 영향 |
|---|---|---|
| DB | Postgres 500MB, **프로젝트 2개**(prod/dev 분리에 사용) | 605행 여유. **500MB 초과 시 read-only — 전 mutate 500** (§6 모니터링) |
| 7일 무활동 일시정지 | **DB 쿼리 활동 기준** (Storage 호출 계상은 미문서 — 신뢰 금지) | keep-alive 잡은 전부 실 SELECT 수행 (§5) |
| pause 시 | DB·Storage·**공개 자산 URL 전부 다운**, 복원 가능 1년 | pause 런북 필수 (§5-4, OPERATOR) |
| Storage | 1GB, 파일 50MB. 이미지 변환 유료 → 파생본은 sharp | **산수(§4-4)**: PDF 상한 50MB — 최대 20개로 소진 가능. 이주 시 실측 게이트 + 학기당 점검 수칙 |
| Egress | **uncached 5GB + cached(CDN) 5GB 별도 버킷** (DB API 응답은 uncached 계상) | 여유 — 단 회계 단위 정확히 |
| 백업 | 자동 백업 없음 | §7 자체 백업 |
| 키 체계 | legacy JWT(service_role) **2026년 말 deprecate 예고** | **신 체계 `sb_secret_...` 기준으로 명명·발급** (§6) |

Firebase: **이번 이행에서 제외 (S2).** 근거 기록 — Spark는 Functions 불가, Cloud Storage는 2026-02부로
기존 버킷 포함 전면 차단, Firestore 감사 싱크의 이점은 검토에서 해체(경합 0은 Postgres도 동일,
침해 생존은 동일 env 동거로 과장)되고 쿼터 소진 시 탈퇴 액션이 막히는 역결합만 남았다.

cron-job.org: 30초 타임아웃 · 응답 64KB 상한 · 302는 실패 집계(→ **canonical URL로 정확히 등록**,
`*.vercel.app`→커스텀 도메인 308 함정) · "25회 초과 연속 실패 시 비활성"은 공식 문구상 "in some cases" —
계약이 아닌 지표로 취급, 알림은 필수 on.

## 1. 역할 분담

| 시스템 | 역할 |
|---|---|
| **Supabase Postgres (prod)** | 테이블 문서 저장 (§2) + `audit_log` (§3) |
| **Supabase Storage (prod)** | 버킷 3: `assets`(public) · `staging`(private — 업로드 스테이징, S6) · `backups`(private, S3) |
| **Supabase 프로젝트 #2 (dev)** | 로컬 개발용 — 동일 스키마 + 시드 (S4) |
| SvelteKit(Vercel) | 서버 로직 전부 — 무변경 |
| **cron-job.org** | 주 스케줄러 — 잡 3개 (§5) |
| **Vercel cron (일1회)** | 자동 비활성 없는 최후 심장 — `vercel.json` 존치. CRON_SECRET env 존재 시 Bearer 자동 첨부라 코드 0 (S1) |
| **Healthchecks.io** | dead-man's switch — "크론이 안 돌았음" 자체를 알림화 (S1) |
| GitHub Actions | CI만. `cron-sync-events.yml` 삭제 |
| private GitHub repo (`snumps-backups`) | 주간 DB 덤프의 off-platform 사본 (§7) |

## 2. 데이터 계층

### 2-1. 전략: S1 문서 모델 이식 (관계형 정규화는 별도 마일스톤 S2로 격리)

Postgres를 **버전-CAS JSONB 문서 스토어**로 사용 — 605행 규모에 맞춘 의도적 선택(주석·문서 명기).
정규화는 서비스 8종 재작성 = surface 훼손이므로 하지 않는다.

### 2-2. 스키마 (`supabase/migrations/20260901000000_documents.sql` — 커밋. Storage 버킷 생성·RLS도 SQL에 포함해 콘솔 의존 최소화)

```sql
create table app_tables (
  name    text primary key,
  version bigint not null default 1,
  doc     jsonb  not null              -- { schemaVersion, rows } 봉투 그대로 (gzip 없음 — §1-3 개정)
);
create table app_queues (
  event_id text primary key,
  version  bigint not null default 1,
  doc      jsonb  not null
);
create table audit_log (               -- §3. INSERT 전용
  id        text primary key,
  at        timestamptz not null default now(),
  actor     text not null,
  action    text not null,
  target_tb text not null,
  target_id text not null,
  detail    jsonb
);
-- RLS 전면 활성 + 정책 0 (anon 표면 0). 접근은 서버 secret key 단일 경로.
-- audit_log는 UPDATE/DELETE를 막는 트리거로 append-only 강제(secret key도 오삭제 방지).
```

### 2-3. `data/store.ts` — s3.ts 대체 (시그니처 보존)

```ts
readDoc(kind, key): { doc, version } | null
readVersion(kind, key): number | null        // 조건부 GET 대응: version만 SELECT 후 비교
                                             // — "삭제됨"과 "미변경"을 정확히 구분 (R1-4)
writeDocIf(kind, key, doc, expectedVersion): boolean
  // UPDATE ... SET doc=$d, version=$expected+1 WHERE key=$k AND version=$expected
  // (PostgREST는 version=version+1 표현식 불가 — 클라이언트가 expected+1 기입; 의미 동일)
  // 신규: INSERT ... ON CONFLICT DO NOTHING — 0행 = 경합
listQueues() / deleteQueueDoc(eventId)
```

- `tables.ts` 알고리즘(재시도·백오프, **쓰기 스키마 게이트**, no-op 스킵, 봉투 검증) 무수정 —
  `ConditionalWriteError` 의미론은 "writeDocIf false" 1종으로 수렴 (412/409/404 구분은 재시도 동작에 무영향)
- 압축 없음. (참고 정정: TOAST pglz는 2KB 초과에만 ~2.5×이고 egress를 줄이지 않음 — 압축은 근거가 아님)
- 클라이언트: `@supabase/supabase-js` + **`sb_secret` 키** — `data/store.ts`·`data/storage.ts` 밖 사용 금지

### 2-4. 테스트 전환 — 정직한 스코프 (R1-11)

"137 무수정"이 아니라 **"계약 표면 테스트 무수정 + 열거된 기계 수정만"**:

| 수정 부류 | 대상 | 성격 |
|---|---|---|
| 목 경로 교체 | 12파일의 `vi.mock("./s3" …)` → `./store` | 기계적 |
| 포이즌 픽스처 재작성 | `tables.test.ts` 2건 (바이트+키 직주입 → `__putRawDoc(name, doc)` 헬퍼로) | 표면 변경 반영 — 의미 동일 |
| 감사 계수 교체 | `__keys().filter(audit/)` 3건 → `store-memory`의 `__auditRows()` | 표면 변경 반영 |
| 신규 | store-memory·storage-memory (기존 s3-memory 분해), maintenance·백업 라이터 테스트 | 추가 |

그 외 서비스·가드·공개 스위트는 무수정 통과가 게이트.

## 3. 감사 로그 — Postgres `audit_log` (S2)

- `data/audit.ts` 시그니처·대상·비대상·**"탈퇴 계열 실패 시 액션 실패"** 정책 무수정 — 내부만 INSERT로
- append-only는 DB 트리거로 강제 (§2-2) — 기존 "건당 객체" 의미론의 등가물
- 같은 DB 동거의 함의: DB 쿼터 소진 시 감사도 함께 막히지만, 그때는 **mutate 자체가 read-only로 막히므로**
  탈퇴 흐름 전체가 어차피 정지 — 외부 쿼터에 따로 결합됐던 Firestore 안보다 실패 모드가 단순

## 4. 자산 — Supabase Storage

### 4-1. 버킷 3개 (전부 SQL로 생성)

| 버킷 | 공개성 | 용도 |
|---|---|---|
| `assets` | public read | 승격 완료 자산 + sharp 파생본 |
| `staging` | **private** | `pending/<purpose>/…` 업로드 스테이징 (S6 — 승격 전 공개 서빙 차단) |
| `backups` | **private** | §7 백업 (PII 포함 — public 동거 금지) |

### 4-2. 파이프라인 매핑

| 기존 | 대체 | 주의 |
|---|---|---|
| presigned PUT 10분 | `createSignedUploadUrl` | **만료 고정 2시간**(단축 불가 — 계약 문서 갱신), 기존 경로 재발급 400, upsert는 발급 시 서명 |
| Content-Type 서명 | **미지원** | 승격 검증이 유일 방어선 — 이미 그렇게 설계돼 있음(HeadObject 대응). API-SPEC §8-2 문구 개정 |
| HeadObject | `info()` (size·mimetype — typed) | `list()`는 100행 페이지네이션 주의 |
| Copy+Delete | `move()` — staging→assets **크로스 버킷** | 원자적이라는 주장은 하지 않음. 실패 잔여물은 정리 잡이 처리 |
| 수명주기 7일 | 잡 3이 staging 열거·7일 초과 삭제 | |
| CloudFront | `assets` 공개 URL 베이스 → `ASSETS_CDN_URL` 값 교체 (`assetUrl()` 무수정) | |

### 4-3. 🔴 T3 착수 게이트: signed-upload 실측 테스트

실 dev 프로젝트에서 검증 후 진행: ① 브라우저 업로드 방식(`uploadToSignedUrl` 토큰 동반 여부 —
클라이언트 코드 변경 범위 확정) ② 버킷 `file_size_limit`/`allowed_mime_types`가 signed 경로에
강제되는지 ③ 2h 만료 실측.

### 4-4. 1GB 산수 (R2-5)

이주 자산 90개 실측치는 MIG-1에서 확보(추정 수백 MB). 상한 시나리오: 세미나 PDF 50MB × 20 = 1GB 소진.
수칙: ① 이주 직후 실측치·잔여율 기록 ② 학기말 점검(OPERATOR) ③ 80% 도달 시 PDF 상한 하향 또는 정리.

## 5. 스케줄러 (S1 확정 구성)

### 5-1. cron-job.org 잡 3개

| # | 잡 | 스케줄 | 대상 |
|---|---|---|---|
| 1 | sync-events | 매시 17분 | `GET /api/cron/sync-events` + Bearer |
| 2 | health | 매일 09:00 KST | `GET /api/health` + **Bearer (S5)** — 1행 SELECT 후 200 |
| 3 | maintenance | 매일 04:00 KST | `GET /api/cron/maintenance` + Bearer — staging 7일 정리 + **1행 SELECT(keep-alive 자격 확보, R1-12)** + 일요일 분기: 백업(§7) |

운영 수칙: 실패+자동비활성 알림 on(공용 메일), canonical URL 등록, 응답 200 직접.

### 5-2. Vercel cron — 최후 심장

`vercel.json` `"0 15 * * *"` 존치. 자동 비활성 없는 유일 스케줄러. CRON_SECRET env 존재 시
Vercel이 Bearer 자동 첨부 — 코드 0. cron-job.org 3잡이 공통 모드(배포 사고)로 전멸해도 일1회 생존.

### 5-3. Healthchecks.io — dead-man's switch

- 각 크론 핸들러(sync-events·maintenance)가 **성공 시** `fetch(env.HEALTHCHECKS_PING_URL)` 1줄 (실패 무시)
- Healthchecks 체크 grace 48h — 이틀간 성공 핑이 없으면(스케줄러 전멸·배포 사고·pause 포함 **모든 침묵 모드**) 공용 메일로 경보
- 무료 20체크·카드 불요

### 5-4. pause 런북 (OPERATOR-TODO 신설 절)

증상(사이트·사진 전면 다운) → 대시보드 Resume → **cron-job.org 잡 3개 재활성화**(자동 비활성됐을 것) →
Healthchecks 체크 정상 복귀 확인. 복원 가능 기간 1년.

## 6. 환경 변수·보안·모니터링

```bash
# 제거: AWS_* 5종, FIREBASE_* (미도입)
# 추가 (prod / dev 프로젝트별)
SUPABASE_URL=
SUPABASE_SECRET_KEY=              # sb_secret_... (신 체계). 서버 전용
SUPABASE_ASSETS_BUCKET=assets
SUPABASE_STAGING_BUCKET=staging
SUPABASE_BACKUPS_BUCKET=backups
HEALTHCHECKS_PING_URL=
GITHUB_BACKUP_REPO=snumps-webpage/snumps-backups   # §7
GITHUB_BACKUP_TOKEN=              # fine-grained PAT, 해당 repo contents:write 한정
DATA_BACKEND=supabase             # supabase | memory (S4 보조 — dev 오프라인용)
# 유지: ASSETS_CDN_URL(값 교체), CRON_SECRET, PUBLIC_SITE_ORIGIN, REDIS_URL
```

**명시적 보안 트레이드오프 (구 설계 대비 후퇴 — 수용 기록):**
- IAM 최소권한 → secret key 전권 (완화: RLS 거부 + 단일 사용처 + audit_log 트리거 보호)
- **SSE-KMS 전용 키 → 공유 at-rest 암호화** (무료 플랜 CMK 불가 — PII 암호화 등급 하락)
- **CloudTrail 데이터 이벤트 → 상실** (무료 로그 보존 1일 — 인프라 레벨 접근 감사 불능. 앱 레벨 audit_log만 잔존)

**모니터링·알림 맵 (R2-7):**

| 신호 | 수신 | 경로 |
|---|---|---|
| 크론 실패/자동 비활성 | 공용 메일 | cron-job.org 알림 |
| 크론 침묵(전멸·pause 포함) | 공용 메일 | Healthchecks grace 초과 |
| Supabase 쿼터 접근·pause 예고 | **공용 계정 소유의 org** 메일 | Supabase 자동 메일 — 계정 공용화가 전제 (§9 T7) |
| DB 500MB read-only | 사전: 학기말 점검 수칙 / 사후: 전 mutate 500 → Healthchecks | |

**계정 규율 (R2-8)**: Supabase org·cron-job.org·Healthchecks·GitHub·Vercel 전부 공용 메일 소유 + MFA.
자격증명 인벤토리(보유자·복구 경로)를 OPERATOR-TODO에 표로.

## 7. 백업 (S3 결정 반영)

| 계층 | 내용 | 주기 | 대비 대상 |
|---|---|---|---|
| B1 | 전 `app_tables`+`audit_log` JSON 덤프 → `backups` 버킷(private) | 주 1회 (잡 3 일요일 분기) | 오염된 쓰기 롤백 (RPO ≤7일) |
| B2 | 같은 덤프를 **private GitHub repo에 push** (contents API, PAT) | 주 1회 (B1 직후) | 프로젝트 단위 소멸 (off-platform) |
| B3 | 자산: 승격 시 `backups/assets-mirror/`에 사본 1부 동시 기록 | 실시간 | 오삭제 복구 (구 S3 버전 관리 대체) |
| B4 | 자산 전량 로컬 아카이브 | 이주 시 1회 + 분기 수칙 | 프로젝트 소멸 시 자산 |

보관: B1 8주 순환, B3는 원본 삭제 후 90일 정리(잡 3). 복구 절차는 OPERATOR-TODO 문서화(T7).
주의: 무료 플랜 직결 pg_dump는 IPv6-only 함정 — 복구·덤프는 앱 경유 JSON 방식으로 통일.

## 8. MIG(데이터 이주) 트랙 — 개정 미니 목록

| # | 항목 |
|---|---|
| M-1 | 자격증명: `snumps-migration` IAM 참조 전부 제거 → 로컬 실행 스크립트가 prod `sb_secret` 키 사용 (실행자 한정 전달·완료 후 회전) |
| M-2 | P0-2 원본 덤프 목적지: `backups` 버킷(private) + 로컬 사본 |
| M-3 | 업로더: `app_tables` UPSERT는 **Zod 봉투 파싱 통과 후** + `version=1` 초기화 — 쓰기 게이트 우회 금지 |
| M-4 | 자산 파이프라인 목적지 `assets` + B3 미러 동시 기록, sha256 멱등·매니페스트 계약 유지, **용량 실측 → §4-4 산수 기록** |
| M-5 | 검증(행 수·dangling 0·자산 90) 무변경 |

## 9. 작업 목록 (개정)

| # | 작업 | 게이트·비고 |
|---|---|---|
| T1 | SQL 마이그레이션 — §2-2 전체(테이블·audit_log·트리거·버킷·RLS) | 콘솔 의존 최소화 |
| T2 | `data/store.ts` + `store-memory.ts` + `DATA_BACKEND` 플래그 | §2-4 스코프대로 테스트 전환 |
| T3 | `data/storage.ts` + `uploads.ts` 내부 교체 | **§4-3 실측 게이트 선행** |
| T4 | `data/audit.ts` 내부 교체 (audit_log INSERT) | 정책 무변경 |
| T5 | 라우트: `/api/health`(Bearer)·`/api/cron/maintenance` + **maintenance 서비스**(staging 정리·keep-alive SELECT·백업 라이터 B1/B2/B3-정리) + Healthchecks 핑 삽입 + 가드 레지스트리 | R2-9 해소 |
| T6 | AWS 제거 — s3.ts·SDK·infra/·`cron-sync-events.yml` 삭제. `vercel.json` **존치**(사유 주석). env·SETUP.md 개정 + **로컬 개발 절**(dev 프로젝트·시드·memory 플래그) | |
| T7 | OPERATOR-TODO 재작성 — Supabase prod/dev 생성·SQL 실행·버킷 확인·cron-job.org 잡3+알림·Healthchecks·백업 repo+PAT·**pause 런북**·복구 절차·계정 규율+자격증명 인벤토리·학기말 점검 | |
| T8 | dev 시드 스크립트 (`scripts/seed-dev.ts`) | S4 |
| T9 | MIG 스크립트 개정 (§8 M-1~5) | AWS→Supabase 목적지 |
| T10 | 문서 정합 — API-SPEC §1-3 저장 형식 절 개정 선언, §1-5·§8-2 문구, IMPLEMENTATION-SPEC **명시 목록**: BE-02·03 표, BE-35 "크론 확정(2026-08-28)" 표 대체, 부록 금지 1항(AWS SDK→supabase-js), Phase 7 "S3 목" 문구, CODE-REVIEW 잔여의 TF state 항목 폐기 처리 | R2-10·11 해소 |

## 10. 결정 기록

S1~S6 + 정정 묶음: 상단 표 (2026-09-01, 사용자 확정). 구 D-1/D-2/D-3은 각각 S2/S1/S3로 해소.
잔존 미결: 없음.
