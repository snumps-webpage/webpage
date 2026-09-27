# SNUMPS 웹페이지 — API 명세 (v0.7)

> **전제**: [`FUNCTIONAL-SPEC.md`](./FUNCTIONAL-SPEC.md) v0.9.
> 데이터 저장소는 **Supabase** (Postgres 문서 행 + Storage — [`SUPABASE-MIGRATION-SPEC.md`](./SUPABASE-MIGRATION-SPEC.md)). 모든 기능 ID(PUB-xx, MEM-xx …)는 기능 명세를 참조한다.
>
> **v0.2**: 완전성·일관성 검토(2026-08-25, 검토 결과는 [`SPEC-REVIEW.md`](./SPEC-REVIEW.md)) 반영 전면 개정.
>
> **v0.7**: 저장 형식을 S3 객체에서 Supabase 문서 행으로 개정 — 계약 시그니처는 불변 (2026-09-01, §1-3·§1-5·§8-1·§8-2).
>
> **v0.8**: 공개 페이지 캐시 전략을 현행으로 개정 (2026-09-10, §1-4·§3 렌더 열).
> ISR은 2026-09-01 교차 유출 사고로 제거됐고(`9035cad`), 프리렌더는 결정 C-17로 제거됐다.
> §8-1 크론 실패 응답과 §8-2 presign 가드도 코드 현실에 맞춰 기술한다.
>
> **2026-09-27 개정** (코드에 맞춤): 여러 문서를 바꾸는 흐름은 plpgsql 함수 한 트랜잭션
> ([`ATOMIC-FLOWS.md`](./ATOMIC-FLOWS.md) — §1-3·§1-6·§5·§6·§7), 폼 액션 검증 실패 형식(§1-2),
> `seminar-requests.kind`·`closedAs`와 필수 `publicationStatus`(§2), 일정 기반 회차 자동 생성 제거(§6-4·§8-1),
> 전체 공지 수신자(§5-7), presign 본문 검증(§8-2).
>
> **형식**: 이 앱은 SvelteKit이다. API는 세 층으로 구성된다.
>
> 1. **페이지 로드** (`+page.server.ts load`) — 화면 데이터 공급. **전부 SSR** (§1-4)
> 2. **폼 액션** (`+page.server.ts actions`) — 상태 변경. `POST /경로?/액션명`
> 3. **REST 엔드포인트** (`/api/*`) — 크론·폴링·업로드 등 폼 액션이 부적합한 경우만

---

## 1. 공통 규약

### 1-1. 인가 계층

| 가드                       | 통과 조건                                                                     | 실패 시                                      |
| -------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `public`                   | 없음 (게스트 허용)                                                            | —                                            |
| `ensureSession`            | 로그인 세션 존재                                                              | 303 → `/login`                               |
| `ensureMember`             | 세션 + 승인된 회원 (`locals.member` 존재)                                     | 미가입 303 → `/signup`, 미승인 303 → `/wait` |
| `ensurePresenter(eventId)` | 회원 + 해당 이벤트 `presenterIds` 포함 (이벤트를 재조회해 판정 — locals 불신) | 403 `FORBIDDEN`                              |
| `ensureOrganizer(studyId)` | 회원 + 해당 스터디 `organizerIds` 포함 (재조회 판정)                          | 403 `FORBIDDEN`                              |
| `ensureAdmin`              | 회원 + `isAdmin: true` (D4)                                                   | 404 (존재 은폐)                              |
| `requireAdminRest` (/api)  | 위와 같되 REST 응답                                                           | 세션 없음 **401**, 비관리자 **404** (C-19)   |

- 공개 영역 판정은 접두사 매칭이 아니라 **라우트 그룹/명시 목록** 기반
- 가드 테스트 매트릭스: 전 라우트 × **5역할** {게스트, 신청자, 회원, 발표자/주최자, 관리자} (SYS-07)

### 1-2. 응답·에러 규약

- 폼 액션 성공: `{ success: true, ...데이터 }`. 트랜잭션은 성공했으나 부수 메일이 실패한 경우
  `{ success: true, mailFailed: true }` — `MAIL_FAILED`는 에러 코드가 아니라 성공 페이로드 필드다
- 폼 액션 실패: `fail(status, { error: <코드>, message? })`. `message`는 서버가 사용자 문구를 정한 경우
  (예: 흐름 함수의 DETAIL → `userMessage`)에만 오고, 없으면 클라이언트가 코드별 한국어 문구로 바꾼다
  (예: `domain/admin-dashboard.ts`의 `adminActionErrorMessage` — 코드 자체를 화면에 보이지 않는다)
- **입력 검증 실패**: `fail(400, { error: "VALIDATION_FAILED", issues, values })` — `issues`는 필드별 첫 메시지
  (필드 밖·경로 없는 문제는 `_form`), `values`는 폼에 되돌려 줄 입력. 틀린 필드를 **한 번에** 돌려주며,
  쓰기·감사 기록 전에 답한다. 권한 가드가 검증보다 먼저 돈다
- REST: 성공 `200 { success: true, ... }`, 실패 `4xx/5xx { error: <코드> }`
- 입력 검증: Zod 단일 스키마 — 규칙의 원천은 `src/lib/domain/*`의 입력 스키마이고(브라우저 안전, 폼 컴포넌트와
  공유), 액션은 `formText`로 필드를 읽어 그 스키마로 파싱한다(`domain/form-data.ts`). 저장 직전에는
  `src/lib/server/data/schemas/`의 테이블 스키마(쓰기 게이트)가 한 번 더 검증한다

에러 코드:

| 코드                   | 의미                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `VALIDATION_FAILED`    | 입력 형식 오류 (자기 자신 전달 등 의미 오류 포함)                        |
| `UNAUTHORIZED`         | 세션 없음 — 401. 다시 인증하면 해결된다 (`FORBIDDEN`과 구분, C-19)       |
| `NOT_FOUND`            | 대상 레코드 없음 / dangling 참조                                         |
| `FORBIDDEN`            | 권한 없음                                                                |
| `CONFLICT`             | 상태 충돌 (이미 처리됨, 중복 제안 등)                                    |
| `WRITE_CONFLICT`       | 조건부 쓰기(version CAS) 재시도 소진 — **409** (C-21, 구 503)            |
| `EVENT_NOT_OPEN`       | 이벤트가 신청·출석 가능 상태 아님 (draft/expired/cancelled/시작 후 신청) |
| `STUDY_NOT_RECRUITING` | 모집 중이 아닌 스터디에 참여 신청                                        |
| `SERVICE_UNAVAILABLE`  | 데이터 계층이 응답하지 못함 — 503, 재시도 가능                           |

### 1-3. 데이터 계층 계약 (SYS-01)

> **v0.7: 저장 형식을 S3 객체에서 Supabase 문서 행으로 개정 — 계약 시그니처는 불변.**

```ts
getTable<T>(name: TableName): Promise<T[]>
mutate<T>(name: TableName, fn: (rows: T[]) => T[]): Promise<T[]>
```

- 저장 형식: **`{ "schemaVersion": 1, "rows": [...] }` 봉투** — 필드 형상 변경 시 리더가 버전 분기
- 저장: Supabase Postgres `app_tables`/`app_queues` — 테이블당 행 1개, `doc` JSONB에 봉투 그대로(gzip 없음)
  - `version` bigint (CAS 열). 버킷 버전 관리의 롤백 역할은 백업 계층(SUPABASE-MIGRATION-SPEC §7)이 대체
- `mutate`: 읽기(version) → fn → 조건부 쓰기(`WHERE version = expected`), 조건 실패 시 재읽기 재시도(지수 백오프)
  → `WRITE_CONFLICT`. **재시도 의미 동일** — 구 412/409/404 구분은 "조건부 쓰기 실패" 1종으로 수렴
  (재시도 동작에 무영향). 재시도 상한: 일반 테이블 5회, **출석 큐 10회** (동시 체크인 버스트 대상)
- **예외 — 출석 큐는 이벤트당 행 분할**: `app_queues`의 `event_id`당 행 1개.
  세미나 시작 직후 N명 동시 체크인이 유일한 실동시성 쓰기 부하이므로 경합 범위를 이벤트 단위로 축소
- `mutate`는 게이트가 **파싱한** 행(zod 기본값이 채워진 모양)을 저장·캐시한다 — 다른 인스턴스가 디코드하는 모양과 같다
- **다중 문서 쓰기 (2026-09-27)**: 여러 테이블·큐를 함께 바꾸는 흐름은 `mutate`를 이어 부르지 않고
  plpgsql 함수 한 트랜잭션으로 실행한다 — [`ATOMIC-FLOWS.md`](./ATOMIC-FLOWS.md).

  ```ts
  callFlow<T>(fn: `flow_${string}`, args, opts?: { messages?: Record<string, string> }): Promise<T>
  ```

  함수는 필요한 문서를 잠그고(쓰는 표는 이름순 `FOR UPDATE`, 읽기만 하는 표는 `FOR SHARE`) 저장된 현재 상태로
  판정한다. 규칙 위반은 `RAISE EXCEPTION '<에러 코드>'`(사용자 문구가 필요하면 `DETAIL`) → `AppError`,
  트랜잭션 전체 롤백. 결과의 `touched`/`touchedQueues`로 캐시를 무효화한다. id·시각은 TS가 만들어 넘기고,
  메일·Storage 정리는 커밋 **뒤** 호출자가 한다. 단일 문서 쓰기는 그대로 `mutate`(CAS)다

- 레코드 id: **시간순 정렬 가능한 128비트 id (ULID 또는 UUIDv7)**. Notion uuid는 이주 시 1회 매핑 후 폐기

### 1-4. 캐시

| 키                                 | 내용                 | 무효화                                                     |
| ---------------------------------- | -------------------- | ---------------------------------------------------------- |
| `table_<name>`                     | 테이블 전문          | 해당 테이블 `mutate` 성공 시 **자동** (데이터 계층이 수행) |
| `table_attendance-queue_<eventId>` | 이벤트별 출석 대기열 | `mutateQueue` 성공 시 **자동**                             |

- 원칙: **`mutate(t)` → `table_t` 무효화는 자동.** 캐시되는 키는 이 둘뿐이다. 흐름 함수(§1-3)가 바꾼 표·큐는
  `callFlow`가 함수의 `touched`/`touchedQueues`를 보고 무효화한다(큐 삭제도 흐름 안에서만 일어난다)
- **파생 캐시는 없다.** 회원별 이력·기간 조회·이벤트 목록은 캐시된 테이블을 메모리에서 거른 결과이지
  별도 캐시 항목이 아니다 — `getActivitiesOf`·`getActivitiesBetween`(`data/repos.ts`) 참조.
  테이블 캐시가 최신이면 파생 결과도 최신이므로 따로 무효화할 것이 없다

  > **2026-09-14 정정.** 이 표에는 `activities_<start>_<end>` · `user_activities_<memberId>` · `all_events`
  > 세 행이 있었다. 셋 다 노션 시절의 캐시다 — `user_activities_*`는 회원별 Notion API 페이지네이션
  > 쿼리를(`40f0111`), `all_events`는 이벤트 DB 조회를 감쌌다. 이관(`ea91528`)이 그 원격 쿼리를
  > 테이블 전문 + 메모리 필터로 바꾸면서 캐시는 사라졌지만 **무효화 호출만 남아 있었다.**
  > 존재하지 않는 키를 지우는 호출이었다. 코드에서 제거하고(감사 W-4) 표를 코드에 맞췄다.
  > `activities_<start>_<end>`는 무효화 호출조차 없던 완전한 유령이다.

- **HTTP 캐시: 전면 금지 (v0.8).** 공개 페이지를 포함한 **모든 SSR 응답**에 최외곽 훅이
  `cache-control: private, no-store` + `vercel-cdn-cache-control: no-store`를 부여한다
  (`hooks.server.ts` cacheShield). 따라서 회원 편집은 **다음 요청에 즉시 반영**된다 — 지연 없음.

  |                        | 이전 규약                           | 현재     | 근거                                                                                                         |
  | ---------------------- | ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
  | ISR (`revalidate: 60`) | 전 공개 페이지                      | **없음** | 2026-09-01 실사고 — 엣지가 경로 단위로 SSR 응답을 재생해 개인화 페이지가 교차 유출됐다 (`dea9879`·`9035cad`) |
  | prerender              | `/about` 계열, `/archive` 공지 계열 | **없음** | 결정 C-17 (2026-09-10) — 아카이브 레이아웃 스냅샷이 정적 HTML·`__data.json`에 구워져 캐시 실드 밖에 남았다   |

  **데이터 계층 캐시는 별개다** — `getTable`의 `withCache`(Redis 300초 / 로컬 15초)는 그대로다.
  HTTP 캐시가 아니라 서버 내부 캐시이고 `mutate`가 무효화한다.

  **이미지는 예외** — `/_vercel/image` 최적화 응답은 플랫폼이 처리해 훅을 타지 않으며
  24시간 엣지 캐시를 유지한다 (`svelte.config.js` adapter `images`의 `minimumCacheTTL` — 자산 접근을
  회수해도 파생본이 남는 기간이라 30일에서 줄였다).

  **가드의 거부·리디렉션도 `no-store`** — 존 가드는 404·403·500·303을 throw하지 않고 헤더를 붙인 응답을
  직접 만든다. handle에서 throw하면 Kit의 치명 오류 경로로 나가 cacheShield를 건너뛰기 때문이다(감사 W-23).

### 1-5. 감사 로그 (SYS-06)

`getTable/mutate` 계약 **밖의** 전용 채널. 테이블 JSON에 넣지 않는다 (append 경합·PII 혼입 방지).

- 저장: Postgres `audit_log` **행** (건당 INSERT) — **UPDATE/DELETE 차단 트리거로 append-only 강제**
  (구 "건당 객체 1개" 의미론의 등가물 — v0.7 개정)
- 스키마: `{ id, at, actorMemberId, action, targetTable, targetId, detail? }`
- 기록 대상 (전부 관리자 액션):
  - `private-info` **관리자 열람** (§7-3 GET) 및 `?/updatePrivateInfo`
  - `?/setStatus`, `?/setRoles`, `?/setAdmin`, `?/revokeAlumni` — 지위·권한 변경 전부
  - `?/setOrganizer` (직권 전달)
  - 탈퇴 수명주기: `?/requestWithdrawal`·`?/cancelWithdrawal`(본인 행위지만 파기 트리거), `?/holdWithdrawal`·`?/releaseWithdrawalHold`, 크론 자동 익명화
- 탈퇴 수명주기 항목(`withdrawal.*`)은 파기 증거라 **상태 변경과 같은 트랜잭션**에서 흐름 함수가 삽입한다
  (`app_audit`) — 감사 실패는 액션 실패다. 그 밖의 항목은 TS `audit()`가 변경 뒤에 남긴다
- **비대상**: 본인이 본인 개인정보를 읽고 고치는 경로(§4), 세션 훅의 회원 매칭 조회 —
  매 요청 발생하는 조회는 감사 대상에서 명시적으로 제외
- 열람: 별도 UI 없음(1차). SQL로 조회 (Supabase SQL Editor). 필요 시 `/admin/audit` 추후 신설

### 1-6. 승인 흐름 멱등성 규약

여러 테이블을 쓰는 승인 흐름의 재실행 안전을 위해:

- 승인이 생성하는 모든 레코드에 **`sourceRequestId`** 를 기록한다. 타입은 `string | null` — 형식 2종:
  ① 원 신청/큐 행의 id, ② 스터디 회차의 복합 근거 키 `"<studyId>:<date>"`
- 각 생성 단계는 **check-before-create**: 같은 `sourceRequestId` 레코드가 이미 있으면 생성 생략, 다음 단계 진행.
  이 검사는 흐름 함수(§1-3) 안에서 **같은 잠금 아래** 한다 — 동시에 들어온 두 요청이 둘 다 "없음"을 보는 틈이 없다
- 신청의 상태는 **지금 저장된 행**으로 판정한다(페이지가 읽은 캐시가 아니라). 이미 최종 상태인 신청에 대한
  재승인은 `CONFLICT`, 사라진 행(철회·반려됨)은 `NOT_FOUND`
- 흐름이 한 트랜잭션이므로 "중간 실패"는 전부 롤백이다 — 재실행은 처음부터 다시 하고, 앵커는 흐름 함수
  도입 전에 반쯤 끝난 실행이 남긴 기록을 재사용하게 한다. 중복 레코드 0
- 세미나 공개의 활동·이벤트 앵커는 `seminar:<seminarId>`다

---

## 2. 데이터 모델 (문서 테이블)

파일 자산은 `s3Key` 문자열 참조. 날짜: `date`(날짜만, `YYYY-MM-DD`)와 `datetime`(ISO 8601, KST 기준 저장)을 필드별로 구분 명시.

### 학기(term) 파생 규칙 — 단일 정의

`"<YY>-<1|2>"`. **3월~~8월 = 해당 연도 1학기, 9월~~익년 2월 = 해당 연도 2학기** (1~2월은 전년도 `-2`).
datetime → term 변환은 이 규칙의 단일 유틸만 사용 — `$lib/domain/term.ts`의 `termOf`(브라우저 안전, 페이지·서버·
스크립트 공용. 경계는 KST). SQL 흐름의 미러 `app_term_of`는 `flow-rules.test.ts`가 경계값에서 대조한다.
`activities`/`events`에는 term을 저장하지 않고 파생한다.

### `members`

```jsonc
{
  "id": "ULID",
  "name": "string",
  "department": "string",
  "joinedAt": "date",
  "status": "associate | regular | withdrawn", // 준회원 | 정회원 | 탈퇴 (MEM-07)
  "statusChangedAt": "datetime",
  "withdrawal": null, // { "requestedAt": "datetime", "previousStatus": "associate | regular",
  //   "holdBy": "ULID | null", "holdAt": "datetime | null" } | null
  // holdBy 설정 = 보존 집행(ADM-17) — 자동 삭제 중단. previousStatus는 철회 시 복원용
  "isAlumni": false, // 동문 영구 지위
  "alumniRevoked": false, // 유고 박탈 이력 — true면 setStatus 승격이 isAlumni를 되살리지 않는다
  "roles": [{ "term": "26-1", "title": "회장" }],
  "isAdmin": false,
  "publicContact": null, // string | null. 본인 동의 하에 공개되는 연락처 (임원용). §3 공개 금지의 유일한 예외
  "project": null, // { "title": "string", "url": "string?" } | null — 개인 프로젝트 보드 내용
  "sourceRequestId": null, // string | null — 가입 승인 멱등(§1-6)의 실체. 이주 회원은 null
}
```

`privateInfoId` 없음 — 연결 방향은 `private-info.memberId` **단방향 단일 원천**.

### `private-info` 🔒

```jsonc
{
  "id": "ULID",
  "memberId": "ULID",
  "email": "string", // 로그인 매칭 키 (유일)
  "phone": "010-XXXX-XXXX",
  "background": "string",
  "mailPrefs": { "announcements": true }, // 유형별 수신 설정. 현재 키 1개, 유형 추가 시 키 추가
  "sourceRequestId": null, // string | null — §1-6
}
```

### `activities`

```jsonc
{
  "id": "ULID",
  "title": "string",
  "date": { "start": "datetime", "end": "datetime | null" },
  "type": "세미나 | 스터디 | 회의 | 회식 | 기타", // 닫힌 집합. 'Seminar' 폐기 확정
  "attendeeIds": ["ULID"],
  "sourceRequestId": "string | null", // §1-6. 승인·회차 생성이 만든 경우 원 신청/회차 근거
}
```

### `events` (출석 세션)

```jsonc
{
  "id": "ULID",
  "title": "string",
  "date": { "start": "datetime", "end": "datetime | null" },
  "type": "세미나 | 스터디 | 회의 | 회식 | 기타", // activities.type과 동일 집합
  "status": "draft | active | expired | cancelled", // cancelled는 재활성화 불가 (expired만 재활성화 허용)
  "pathId": "string",
  "attendCode": "string",
  "activityId": "ULID", // 필수 — 출석이 반영될 활동. null 불허 (생성 시 활동 동시 생성)
  "applicantIds": ["ULID"],
  "presenterIds": ["ULID"],
  "studyId": "ULID | null",
  "sessionNo": 3, // 스터디 회차 번호: 해당 studyId의 max+1 (흐름 함수가 events 잠금 아래서 계산)
  "autoGenerated": false, // 일정 기반 자동 생성이 없어진 뒤로 새 행은 항상 false
  "sourceRequestId": "string | null",
}
```

**만료 판정 규칙** (크론 §8-1): `end ?? (start의 당일 24:00 KST)` 경과 시 `expired`.

### `attendance-queue/<eventId>` (이벤트당 객체)

```jsonc
{
  "id": "ULID",
  "memberId": "ULID",
  "eventId": "ULID",
  "startTime": "datetime",
  "endTime": "datetime | null",
  "status": "pending | approved | rejected",
}
```

### `applications` 🔒

```jsonc
{
  "id": "ULID",
  "name": "string",
  "email": "string",
  "phone": "string",
  "department": "string",
  "background": "string",
  "createdAt": "datetime",
}
```

**미처리 신청만 존재하는 테이블** — `status` 필드 없음. 승인 시 내용이 `members`/`private-info`로
**전환**되고 행이 제거되며, 거절·철회 시에도 행이 제거된다(전환 대상 없음). 처리 완료 건은 잔존하지 않는다.

### `seminar-requests` 🔒

```jsonc
{
  "id": "ULID",
  "title": "string",
  "description": "string",
  "prerequisites": "string",
  "duration": "string",
  "preferredTiming": "string", // SEMINAR_TIMING_OPTIONS 중 하나 또는 "" (미선택)
  "presenterIds": ["ULID"], // 'speakerIds' 아님 — 발표자 명칭 전 테이블 통일
  "attachment": "string", // 자료 외부 링크 (현행 기능 보존 — 업로드 경로는 SYS-03에서)
  "posterKey": "s3Key | \"\"", // 직접 업로드 포스터. 빈 값이면 자동 생성
  "kind": "regular | irregular | null", // 정기/비정기. 폼은 항상 묻는다. 저장 전 옛 행은 null
  "requesterId": "ULID",
  "status": "pending | approved | rejected | withdrawn",
  // 이 신청으로 만든 세미나가 취소·삭제됐다는 표시 (결정 2026-09-27). status는 심사 결과(approved)를
  // 그대로 두고 행은 이력으로 남는다 — 발표자 대시보드가 "취소됨"으로 보인다
  "closedAs": "cancelled | deleted | null",
  "createdAt": "datetime",
}
```

### `study-requests` 🔒

```jsonc
{
  "id": "ULID",
  "title": "string",
  "textbook": "string",
  "description": "string",
  "semester": "26-1",
  "requesterId": "ULID",
  "status": "pending | approved | rejected | withdrawn",
  "createdAt": "datetime",
}
```

### `studies`

```jsonc
{
  "id": "ULID",
  "title": "string",
  "semester": "26-1",
  "textbook": "string",
  "description": "string",
  "note": "string",
  "organizerIds": ["ULID"], // 배열. 현재 불변식은 1명 — 공동 주최 확장 대비
  "participantIds": ["ULID"],
  "pendingParticipantIds": ["ULID"],
  "pendingTransfer": { "toMemberId": "ULID", "requestedAt": "datetime" }, // | null
  // 폐기 (2026-09-27) — 일정 기반 회차 자동 생성이 없어졌다. 기존 문서가 검증을 통과하도록 필드만 남았고
  // 아무도 읽지 않는다. 제거는 별도 축소 마이그레이션에서
  "schedule": [{ "date": "datetime", "generatedEventId": "ULID | null" }],
  "transferHistory": [
    { "from": "ULID", "to": "ULID", "at": "datetime", "byAdmin": false },
  ],
  "photos": ["s3Key"],
  "status": "recruiting | ongoing | finished",
  "sourceRequestId": "string | null",
}
```

회차는 주최자가 직접 만든다(§6-4 `?/createSession`). 회차의 활동·이벤트는 `"<studyId>:<date>"` 앵커로
흐름 함수 한 트랜잭션에서 함께 생긴다.

### `seminars` (기록)

```jsonc
{
  "id": "ULID",
  "title": "string",
  "semester": "25-2",
  "note": "string",
  "presenterIds": ["ULID"],
  "externalPresenters": "string",
  "materials": ["s3Key"],
  "photos": ["s3Key"],
  "posterKey": "s3Key | \"\"", // 직접 업로드 포스터. 빈 값이면 자동 생성
  "preferredTiming": "string", // 신청서의 선호 시점 (조율 참고 기록)
  // 소개글. `note`(비고)와 다른 글이다 — 공개 상세의 "1. 개요"가 이것이다.
  // 승인 시 신청서에서 복사되고, 이주분은 노션 페이지 본문에서 복구했다.
  "description": "string",
  // 승인 → 일정 미정 → 확정 → 공개 (FRONTEND-DECISIONS §3-1).
  // **필수, 기본값 없음** (2026-09-27). 필드가 없던 옛 행("published" — 승인이 곧 공개이던 시절의
  // 기록)은 마이그레이션 20260928000100이 디스크에 한 번 적었다. 코드보다 먼저 적용해야 한다.
  // `completed`는 **없다** — 지나간 세미나도 `published`다(도메인 enum이 진실).
  "publicationStatus": "unscheduled | scheduled | published | cancelled",
  // 확정 전에는 null. *의도된 일정*의 원천이며, 공개가 이 값을 event·activity로
  // 복사한다 (events.date는 *출석 창*의 원천). 장소는 여기에만 있다.
  "schedule": {
    "startsAt": "ISO",
    // 시작 **시각** "HH:mm"(KST). `null`은 **모른다**는 뜻이다 — 이주분의 원본에는
    // 날짜만 적혀 있었다. 화면은 null이면 날짜만 그린다(자정을 시각으로 말하지 않는다).
    // 값이 있으면 `startsAt`의 KST 시각과 반드시 일치한다(저장 스키마가 강제).
    "startTime": "HH:mm | null",
    "endsAt": "ISO | null",
    "location": "string",
  },
  "activityId": "ULID | null", // 공개 시 기록 — 아카이브↔활동 연결
  "sourceRequestId": "string | null",
}
```

### `gallery-dinner`

```jsonc
{
  "id": "ULID",
  "year": "string",
  "photos": ["s3Key"],
  "activityId": "ULID | null",
}
```

---

## 3. PUB — 공개 읽기

전부 `public` 가드, 상태 변경 없음.

**공개 응답 제약**: `private-info` 전 필드, `isAdmin`, `pendingParticipantIds`·`pendingTransfer` 등
운영 필드는 어떤 공개 로드에도 포함 금지. **유일한 예외: `members.publicContact`** — 본인 동의로
설정된 공개 연락처 필드로, 임원 연락처 표시(PUB-01·05)에 사용한다. §10 스냅샷 테스트가 이 제약을 검증.

| 로드                                                                                       | 기능              | 데이터                                                                 | 렌더                                             |
| ------------------------------------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `GET /` (게스트 분기)                                                                      | PUB-01            | 정적 소개문 + 현 임원 (`members.roles` 최신 term + `publicContact`)    | SSR · no-store. 세션 있으면 §4-5 대시보드로 분기 |
| `GET /about` 계열 (`charter`, `charter/history/[period]`, `elections`, `press`, `finance`) | PUB-02~~04·06~~08 | 레포 마크다운 + Storage 자산                                           | SSR · no-store (C-17 이전 prerender)             |
| `GET /about/executives`                                                                    | PUB-05            | `roles` 파생 역대 직책 (임기 내림차순) + `publicContact`               | SSR · no-store                                   |
| `GET /archive/seminars`, `/[id]`                                                           | PUB-09            | `seminars` 학기 그룹 / 단건 + 자료·사진 CDN URL                        | SSR · no-store                                   |
| `GET /archive/studies`                                                                     | PUB-10            | `studies` 공개 필드만 (운영 필드 제외)                                 | SSR · no-store                                   |
| `GET /archive/activities`                                                                  | PUB-11            | `activities` — attendeeIds 제외                                        | SSR · no-store                                   |
| `GET /archive/gallery`                                                                     | PUB-12            | 3테이블 photos, thumb 파생본                                           | SSR · no-store                                   |
| `GET /archive/projects`                                                                    | PUB-13            | `members` 중 `project != null` — 이름·학과·project 내용                | SSR · no-store                                   |
| `GET /archive/misc` 계열, `/archive/problems`, `/archive/discussions`                      | PUB-14            | 마크다운 + Storage PDF                                                 | SSR · no-store (C-17 이전 prerender)             |
| `GET /members`                                                                             | PUB-15            | name·department·joinedAt·roles (D2 범위). **`status: withdrawn` 제외** | SSR · no-store                                   |

`sitemap.xml`·`robots.txt` 정적 (PUB-16).

---

## 4. MEM — 가입·프로필

### 4-1. `GET /signup` + `POST` (default) — MEM-01

- 가드: `ensureSession` (이미 회원 → 303 `/`)
- GET: 기존 pending 신청 있으면 303 `/signup/edit`
- POST 입력: `phone`(정규화 후 검증), `studentId`(`2024-12345` 형식), `background`(2,000자 이하),
  `agreement`(개인정보 동의). 이메일은 **세션에서 유도** (폼 값 불신), 이름·학과는 Google 계정 표시 이름
  (`"이름 / 신분 / 학과"`)에서 유도. 검증은 `membershipApplicationInputSchema` (§1-2 실패 형식)
- 처리: `mutate(applications)` 신규 행 → 관리자 알림 메일 (실패 시 `mailFailed`)
- 에러: `VALIDATION_FAILED`, `CONFLICT`(동일 이메일 신청 행 존재)

### 4-2. `GET /signup/edit` + `POST` (default) — MEM-02

- 가드: `ensureSession` + 본인 pending 신청 존재
- GET: 기존 신청 값 프리필
- POST: 해당 행 갱신 (`membershipApplicationUpdateSchema` — §4-1에서 동의 항목만 뺀 것). 에러: `NOT_FOUND`, `CONFLICT`(이미 처리됨)

### 4-3. `GET /wait` + `POST ?/withdrawApplication` — MEM-03

- 가드: `ensureSession`
- GET: "신청 처리 중" 안내 + 본인 신청 내용. 신청 행이 없으면(승인 전환/거절/철회됨):
  회원이면 303 `/`, 아니면 303 `/signup`
- **POST `?/withdrawApplication`** — 가입 신청 본인 철회 (페이지 하단 버튼):
  본인 pending 신청 행 **삭제** (PII 즉시 제거) → 303 `/`. 에러: `NOT_FOUND`(이미 처리·철회됨)

### 4-4. `POST /?/updateProfile` — MEM-04

- 가드: `ensureMember` + `MANAGE_SELF` capability — `/`는 공개 존이라 존 가드의 회원 POST 게이트가 돌지 않으므로
  `/`의 액션은 각자 capability를 확인한다 (참가 신청·취소·인계 수락/거절은 `PARTICIPATE`)
- 입력: `phone`, `background` — 본인 행만 (id는 세션 유도), `dashboardProfileInputSchema`로 검증.
  응답은 저장된 필드(`{ operation: "profileUpdated", profile }`) — 패널이 이것으로 화면을 바꾼다.
  **본인 접근은 감사 로그 비대상** (§1-5)

### 4-5. `GET /` (세션 있는 분기 — 대시보드) — MEM-04·05, EVT-02·03

- 가드: `ensureMember` (세션 없으면 §3의 게스트 분기)
- 조회 파라미터: `?semester=<term>` — 미지정 시 현재 학기. 학기 필터 목록과 함께 해당 학기 활동·이력 반환
- 반환 (스트리밍 허용):
  - `profile` (본인 공개+개인 정보)
  - `activities` (선택 학기) + 이벤트 연결 활동의 `isApplied`·`canApply`·`pendingAttendance`
  - `myRequests`: 본인 세미나·스터디 개설 신청 목록 + 상태 — `/seminar/edit/[id]` 진입점.
    세미나가 취소됐거나(세미나 행의 `cancelled` 또는 신청의 `closedAs`) 삭제된 신청은 걸러 내지 않고 **"취소됨"**으로 보인다
  - `myStudies`: 참여·주최 스터디 요약
  - `pendingTransfer`: 본인 대상 주최자 전달 제안 (§6-5 진입점)

### 4-6. `GET /settings/notifications` + `POST ?/setMailPref` — MEM-06

- 가드: `ensureMember`
- POST 입력: `{ type: "announcements", enabled: "true" | "false" }` — 유형별 키 (확장 대비).
  `validateMailPreferenceForm`으로 검증 — 그 밖의 값은 `VALIDATION_FAILED`(예전처럼 "false"로 읽어 수신을 끊지 않는다)
- 비로그인 옵트아웃 링크 클릭 → `/login` 경유 복귀

### 4-7. 회원 탈퇴 — MEM-07

`POST /settings/withdraw?/requestWithdrawal` (마이페이지 설정 하위)

- 가드: `ensureMember` (주최 중 스터디 있으면 `CONFLICT` — 전달(STU-07) 또는 관리자 처리 선행)
- **삼중 확인 — 서버가 3단계 모두 검증**:
  1. 1단계: 탈퇴 안내 확인 (`ackInfo: true`)
  2. 2단계: 데이터 처리 고지 확인 (`ackDataPolicy: true`) — 1개월 유지·자동 삭제·기록 잔존 범위 고지
  3. 3단계: **본인 이름 정확 입력** (`confirmName === members.name`)
  - 하나라도 결여 → `VALIDATION_FAILED`. 클라이언트 단계 UI와 무관하게 서버는 원자적으로 3요소 검증.
    액션이 먼저 `validateWithdrawalRequestForm`으로 틀린 확인 항목을 한 번에 돌려주고(§1-2 형식, 이름은 앞뒤 공백을
    빼고 비교·200자 이하), 흐름 함수가 저장된 회원 행으로 한 번 더 검증한다
  - 주최 중인(종료되지 않은) 스터디가 있으면 `CONFLICT` — 화면은 로드가 다시 읽은 `organizedStudies`를 보여 준다
- 처리 — `flow_request_withdrawal` 한 트랜잭션 (스터디는 공유 잠금으로 읽어, 그 사이 수락된 인계가 끼어들지 못한다):
  1. `members`: `status: withdrawn`,
     `withdrawal: { requestedAt: now, previousStatus: <직전 status>, holdBy: null, holdAt: null }`
  2. 감사 로그 (본인 행위지만 파기 트리거이므로 기록 ✅) — 1과 **같은 트랜잭션** (§1-5)
  3. 커밋 뒤 **현 회장단 통지 메일** — 최신 term 회장·부회장의 **`private-info.email`** 대상 + 관리자 대시보드 표시(§7-1)
- 효과: **즉시 회원 영역 접근 상실** — 가드가 `withdrawn`(유예 중)을 감지하면 전 회원 라우트에서
  303 → **`/withdraw/pending`** ("탈퇴 처리 중" 안내 페이지)
- **`GET /withdraw/pending` + `POST ?/cancelWithdrawal`** — 본인 철회 (확정):
  - 가드: `ensureSession` + 본인 status `withdrawn` ∧ 미익명화
  - GET: 탈퇴 처리 중 안내 + 삭제 예정일 + **하단 철회 버튼**
  - POST: `withdrawal.previousStatus`로 status 복원, `withdrawal: null` → 303 `/`
    (`flow_member_withdrawal`의 `cancel` — 변경과 감사 로그가 한 트랜잭션)
  - 에러: `NOT_FOUND`(유예 종료·익명화 완료 — 재가입은 `/signup`)

**자동 삭제(익명화) 규칙** — 크론(§8-1)이 집행:

> 🔶 **구현 보류 (2026-08-28)** — 추가 검토 사항 발견으로 아래 규칙의 **집행 코드는 만들지 않는다.**
> 명세는 향후 계약으로 유지. 보류 중: 유예 기한 경과 후에도 레코드 유지·회원 영역 차단 지속·
> 본인 철회 가능(§4-7 `NOT_FOUND` 케이스는 발생하지 않음). 보류 해제 시 소급 집행 여부 결정.

- 대상: `status: withdrawn` ∧ `withdrawal.holdBy == null` ∧ `requestedAt + 1개월` 경과
- 집행 내용 — **명시적 keep/null 목록**:
  - `private-info` 해당 행 **완전 삭제** (이메일·전화·배경지식·mailPrefs)
  - `members` 행 — **유지**: `id`, `name`, `department`, `status`, `statusChangedAt`, `roles`(공개 임원 이력),
    `isAlumni`, `alumniRevoked`, `withdrawal`(파기 근거 기록으로 보존).
    **null 처리**: `joinedAt`, `publicContact`, `project`, `sourceRequestId`
  - 참여 기록(`activities.attendeeIds`, `seminars.presenterIds` 등)의 id 참조는 유지 —
    해석 결과가 이름·학과 수준으로만 나옴 (매핑된 구체 인적사항은 소거됨)
  - 감사 로그 기록 (`action: auto-anonymize`)
- 익명화 후 재가입: 동일 인물이 다시 가입하면 **신규 회원**으로 취급 (과거 레코드와 연결하지 않음)

---

## 5. SEM · EVT · PRES

### 5-1. `GET /seminar/apply` + `POST` (default) — SEM-01

- 가드: `ensureMember`
- **GET: 발표자 피커용 회원 목록 반환** — `{ id, name, department }` 전체 (231행, 클라이언트 필터로 충분).
  `initialPresenters`로 **신청자 본인이 처음부터 발표자로 선택된** 상태를 준다(뺄 수 있다)
- POST 입력 (폼의 필드명): `kind`(`regular`|`irregular`, 필수), `title`, `description`, `prerequisites`, `duration`(필수),
  `preferredTiming`, `attachment`(HTTPS URL 또는 빈 값, 2,048자 이하), `speakerIds`(쉼표 구분 — 1명 이상 20명 이하),
  `posterPendingKey`. 검증은 `validateSeminarRequestForm`(`seminarRequestInputSchema`, §1-2 실패 형식) — 발표자가
  비어 있으면 `presenterIds` 항목으로 거부한다(예전처럼 신청자를 몰래 발표자로 넣지 않는다). 입력은 다듬어(trim) 저장
- 처리: `mutate(seminar-requests)` 신규(pending, `kind` 저장) → 관리자 알림 메일

### 5-2. `GET /seminar/edit/[id]` + 액션 — SEM-02·03

- 가드: `ensureMember` + `requesterId` 본인 (관리자 예외)
- GET: 신청 값 프리필(`kind`·`preferredTiming` 포함 — 없으면 수정 저장이 저장된 선호 시기를 지웠다) + 피커용
  회원 목록 + 포스터 렌더 데이터 (SEM-03 — 렌더는 클라이언트). `kind`가 null인 옛 행은 수정 때 다시 고른다
- `POST ?/update`: §5-1과 동일 입력. `POST ?/withdraw`: 본인 pending 신청 철회 → `withdrawn`
- 에러: `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`(이미 처리됨)

### 5-3. `POST /?/applyActivity` · `?/cancelActivity` — EVT-02

- 가드: `ensureMember` + `PARTICIPATE` capability(§4-4). 입력: `eventId` — 읽기 전에 `dashboardEventIdSchema`로 검증
- 검증: 회원에게 보이는 이벤트이고 활동이 실재 (취소된 이벤트·숨겨진 세미나의 이벤트는 회원에게 없는 것 —
  `NOT_FOUND`, 쓰기 없음) · `active` · `date.start` 미도래
- 처리: `applicantIds` 추가/제거. 멱등. 응답은 갱신된 원장 행(`{ operation, activity }`)
- 에러: `VALIDATION_FAILED`, `NOT_FOUND`, `EVENT_NOT_OPEN`. 화면은 코드별 이유를 보여 준다
  (`dashboardActivityErrorMessage`). 캐시: 자동 (`table_events`)

### 5-4. `GET /events/[pathId]/[attendCode]` + `POST ?/attend` — EVT-01, SEM-05, STU-03

- 가드: `ensureMember`
- GET: `pathId`+`attendCode` 이중 매칭 (불일치 404). 타입별 컨텍스트 (세미나: 발표자 / 스터디: 회차)
- POST — `flow_check_in` 한 트랜잭션: 이벤트를 **공유 잠금**으로 다시 읽어(페이지가 읽은 캐시를 믿지 않는다)
  존재·체크인 가능(`app_event_open` = `effectiveStatus`의 미러) 판정 → 큐에 행 추가. 체크인끼리는 서로 기다리지
  않고, 그 사이 이벤트 삭제·취소는 커밋될 수 없다
- 처리: 원클릭 완료 — 새 행(pending)에 `startTime = endTime = now`. 같은 회원의 행이 이미 있으면 `CONFLICT`.
  완료 시 관리자 알림 메일
- 에러: `NOT_FOUND`, `EVENT_NOT_OPEN`, `CONFLICT`(이미 체크인함)

### 5-5. `GET /events/manage` — PRES-01·03·04

- 가드: `ensureMember`. **의도된 설계**: 페이지 자체는 회원 접근 가능하되 본인이 발표자인 이벤트만
  반환(비발표자는 빈 목록) — 데이터 필터가 인가 경계이고, 네비 숨김(PRES-03)은 UX일 뿐이다
- 대상 필터: 본인이 `presenterIds`에 포함 ∧ **세미나 타입** — 스터디 회차는 STU-05가 담당하므로 제외
- 반환: 이벤트별 신청자 명단(해석), 현재 출석 교집합(체크 초기값), 출석 링크 전문 (PRES-04)

### 5-6. `POST /events/manage?/saveAttendance` — PRES-02

- 가드: `ensureMember` → `ensurePresenter(eventId)`
- 입력: `eventId`, `attendeeIds[]`. 검증: `eventId`(와 세미나 취소의 `seminarId`)는 `managedEventIdSchema`로 먼저 —
  빈 값·과도한 길이는 `VALIDATION_FAILED`. `attendeeIds ⊆ applicantIds`
- 처리 — 🔴 병합 규칙:
  ```
  outside = activities[activityId].attendeeIds − applicantIds
  final   = outside ∪ attendeeIds
  ```
- 캐시: 자동 (`table_activities`) — 영향 회원별로 지울 파생 키는 없다 (§1-4)
- 에러: `FORBIDDEN`, `VALIDATION_FAILED`, `NOT_FOUND`

### 5-7. 공지 메일 (내부 계약) — SEM-04, SYS-05

1. 수신자 (결정 2026-09-27): **이번 학기 등록 회원 ∪ 동문** 중 `status != withdrawn`(탈퇴 유예 중 제외)이고,
   그 `private-info`에 `email`이 있으며 `mailPrefs.announcements !== false`인 사람. 미등록 비동문은 동의 여부와
   무관하게 받지 않는다. 주소 중복 제거
2. **Bcc 전용**, 배치 분할
3. 본문 하단 옵트아웃 링크 → `/settings/notifications`
4. 실패: 배치별 로그, 트랜잭션 비전파 — 액션 응답에 `mailFailed: true`

---

## 6. STU — 스터디

### 6-1. `GET /study` — 목록. `ensureMember`. 모집중 우선 + 본인 상태

### 6-2. `GET /study/apply` + `POST` (default) — STU-01

- 가드: `ensureMember`. 입력: `title`, `textbook`, `description`, `semester` — `validateStudyRequestForm`
  (`studyRequestInputSchema`, 길이 상한 포함)으로 검증, 다듬어(trim) 저장
- 신규(pending) → 관리자 알림 메일. `POST ?/withdraw` (본인 pending 철회) 지원 — 세미나와 대칭

### 6-3. `GET /study/[id]` + `POST ?/join` · `?/leave` — STU-02

- 가드: `ensureMember`
- `join` 검증: **`status: recruiting`** — 아니면 `STUDY_NOT_RECRUITING`. `pendingParticipantIds` 추가, 멱등
- `leave`: pending/participants 제거, 멱등. 주최자는 불가(`CONFLICT` — 전달 먼저)

### 6-4. `GET /study/[id]/manage` — STU-04·06·07

- 가드: `ensureOrganizer`
- 반환: 신청 대기, 참여자, 회차 목록, 전달 상태, 스터디 상태
- 모든 액션은 주최자 가드가 먼저 돌고, 입력을 `domain/studies`의 스키마로 검증한다(§1-2 형식, 쓰기 전).
  숨은 id(`memberId`·`eventId`·`toMemberId`)도 `studyTargetIdSchema`로 거른다

| 액션                                          | 기능          | 처리                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?/acceptParticipant` / `?/removeParticipant` | STU-04        | pending→participants / 제거. 멱등                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `?/setStudyStatus`                            | STU 상태 전이 | `recruiting ↔ ongoing → finished`. finished 전이는 확인 요구. 알 수 없는 상태는 `VALIDATION_FAILED`                                                                                                                                                                                                                                                                                                                                                                    |
| `?/createSession`                             | STU-06 수동   | 입력 `date`(KST `YYYY-MM-DDTHH:mm`, 실재하는 일시 — 폼은 제출 시각을 보낸다), `title?`. `flow_create_study_session` 한 트랜잭션: 저장된 스터디로 `status != finished` 검증 → ① `activities`(type 스터디) ② `events`(`studyId`, `sessionNo` = events 잠금 아래 max+1, `activityId` 연결, active). 앵커 `"<studyId>:<date>"` — 반복 클릭은 같은 회차를 돌려주고, **취소된 회차와 같은 일시는 `CONFLICT`**(DETAIL `session-slot-cancelled` → "다른 일시를 선택해 주세요") |
| `?/updateSession` / `?/cancelSession`         | STU-06        | 제목·일시 정정 — 제목 필수. 이벤트와 활동이 한 트랜잭션에서 함께 옮겨 간다(`flow_update_study_session`; 앵커는 원래 일시를 유지 — 옛 자리는 소비된 채 남는다) / **`status: cancelled`** (expired와 구분 — 재활성화 불가)                                                                                                                                                                                                                                               |
| `?/proposeTransfer`                           | STU-07        | 검증: 대상이 회원 ∧ **본인 아님**(`VALIDATION_FAILED`) ∧ 기존 제안 없음(`CONFLICT`)                                                                                                                                                                                                                                                                                                                                                                                    |
| `?/cancelTransfer`                            | STU-07        | `pendingTransfer = null`                                                                                                                                                                                                                                                                                                                                                                                                                                               |

회차는 주최자가 직접 만든다 — 일정 기반 자동 생성(`?/registerSchedule`·크론 단계)은 2026-09-27에 제거됐다
(FRONTEND-DECISIONS §3-2). 캐시: 회차 변경 시 자동 (`table_events` · `table_activities`).

### 6-5. `POST /?/acceptTransfer` · `?/declineTransfer` — STU-07 대상자 측

- 가드: `ensureMember` + 본인 = `pendingTransfer.toMemberId`
- accept: `organizerIds = [본인]`(교체), `transferHistory` 추가, `pendingTransfer = null`, participants 포함 보장
- 에러: `NOT_FOUND`(철회됨), `FORBIDDEN`

### 6-6. `GET /study/[id]/attendance` + `POST ?/saveAttendance` — STU-05

- 가드: `ensureOrganizer`
- 검증: `event.studyId === study.id`, `attendeeIds ⊆ participantIds`
- 처리: §5-6과 동일 병합 규칙. 캐시 동일

---

## 7. ADM — 관리자

전부 `ensureAdmin`. 승인·거절은 §1-6 멱등 규약 적용. id를 받는 대시보드 액션(승인·거절, 이벤트 수명주기,
출석, 세미나·스터디 심사)은 읽기 전에 id를 `adminDashboardIdSchema`로 검증한다 — 잘못된 id는 `VALIDATION_FAILED`,
형식은 맞지만 없는 id는 `NOT_FOUND`. 거부된 액션의 알림은 코드가 아니라 이유를 보인다(§1-2).

### 7-1. `GET /admin`

반환: 가입 신청(전량 — 테이블이 미처리만 보유), 세미나·스터디 개설 신청(pending), 출석 큐(pending),
이벤트 전 상태, **탈퇴 유예 회원 목록**(이름·requestedAt·삭제 예정일·hold 상태 — ADM-17 진입점).
이벤트 상세 뷰에서는 해당 이벤트 큐의 **전 상태 행**(approved 포함 — 역반영 작업 대상) 조회 가능.

### 7-2. `/admin` 액션

| 액션                                                   | 기능      | 처리                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?/approve`                                            | ADM-01    | `flow_approve_application` 한 트랜잭션, **지금 저장된 신청 행**으로 판정: 신규 신청자는 ① `private-info` 생성(신청 내용 **전환**) ② `members` 생성(status **associate** — 같은 이메일의 `legacy-*` 기록에서 가입일·임원 이력·프로젝트를 이어받고 `legacyMemberId` 연결, 부트스트랩 관리자면 `isAdmin` 스탬프), 재가입 회원은 기존 행을 유지하고 연락처만 갱신 ③ 이번 학기 `registrations` ④ **신청 행 제거**. 생성 단계는 `sourceRequestId` 앵커로 반복하지 않는다. 행이 이미 없으면(반려·철회가 먼저 커밋) `NOT_FOUND` — 반려된 신청자가 회원으로 남는 일이 없다. 환영 메일은 커밋 뒤 |
| `?/reject`                                             | ADM-01    | 거절 알림 메일 후 **신청 행 제거** (전환 대상 없음)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `?/approveSeminar`                                     | ADM-02    | `flow_approve_seminar_request` 한 트랜잭션, 지금 저장된 신청으로 판정: ① `seminars` 생성(`publicationStatus: unscheduled`, `schedule: null`, `activityId: null`, 신청의 포스터 이관) ② request `approved`. 그 뒤 ③ 신청자 알림 메일. **활동·이벤트·전 회원 공지는 만들지 않는다** — 그것은 공개(`?/publishSeminar`)의 일이다. 멱등 앵커는 `sourceRequestId`. 이미 처리된(철회·반려) 신청은 `CONFLICT`, 사라진 신청은 `NOT_FOUND` — 세미나를 만들지 않는다                                                                                                                              |
| `?/rejectSeminar` / `?/approveStudy` / `?/rejectStudy` | ADM-02·16 | 스터디 승인: `flow_approve_study_request` — `studies` 생성(`organizerIds = [requesterId]`, recruiting, `sourceRequestId`)과 request `approved`가 한 트랜잭션 → 알림 메일. 반려는 단일 문서 CAS                                                                                                                                                                                                                                                                                                                                                                                         |
| `?/activateEvent` / `?/expireEvent` / `?/deleteEvent`  | ADM-04    | 전이 draft↔active↔expired (cancelled는 불가). **deleteEvent**: `flow_delete_event` — 해당 `attendance-queue/<eventId>`에 pending 있으면 `CONFLICT`(먼저 처리 요구), 없으면 큐 문서 함께 삭제. 판정과 삭제가 같은 잠금 아래라 그 사이 체크인이 끼어들지 못한다                                                                                                                                                                                                                                                                                                                          |
| `?/updateEvent`                                        | ADM-04    | 제목·일시·타입 수정 (오입력 정정). `adminEventInputSchema`로 검증 — 타입은 저장 가능한 활동 종류(`RECORD_ACTIVITY_TYPES`)만, 종료는 시작보다 뒤. 실패는 `startsAtLocal`/`endsAtLocal` 등 필드별 `issues`                                                                                                                                                                                                                                                                                                                                                                               |
| `?/approveAttendance`                                  | ADM-03    | 입력: **`(eventId, queueId)`** — 저장이 이벤트당 객체라 둘 다 필수 (큐 액션 4종 공통). `flow_decide_attendance`: 이벤트·활동 실재 검증 (dangling → `NOT_FOUND`), `activities.attendeeIds` 추가와 queue `approved`가 한 트랜잭션. 캐시: `touched`로 무효화 (`table_activities` · `table_attendance-queue_<eventId>`)                                                                                                                                                                                                                                                                    |
| `?/rejectAttendance` / `?/deleteAttendanceRecord`      | ADM-03    | 입력 `(eventId, queueId)`. **approved 행에 적용 시 역반영** — `attendeeIds`에서 제거와 상태 변경/삭제가 같은 흐름(`flow_decide_attendance`) 안. 승인 ∥ 거절이 겹쳐도 "거절됐는데 출석 인정" 상태가 남지 않는다                                                                                                                                                                                                                                                                                                                                                                         |
| `?/updateAttendanceTime`                               | ADM-03    | 입력 `(eventId, queueId, startTime, endTime)` (KST 로컬 일시) — `adminAttendanceTimeInputSchema`(종료는 시작보다 뒤, 실패 issues 키는 `startTimeLocal`/`endTimeLocal`). 시각 수정                                                                                                                                                                                                                                                                                                                                                                                                      |
| `?/holdWithdrawal` / `?/releaseWithdrawalHold`         | ADM-17    | §7-3 표 참조 — 진입은 이 대시보드의 탈퇴 유예 목록                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### 7-2-1. `/admin/seminars` 액션 — ADM-02·18

승인과 공개가 갈라진 뒤 생긴 화면이다. 승인은 일정을 만들지 않으므로, 일시·장소를
정하고 공개하는 일이 여기에 산다.

| 액션                | 기능   | 처리                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?/scheduleSeminar` | ADM-02 | 입력 `(seminarId, startsAtLocal, endsAtLocal?, location)` — KST 입력을 ISO로 바꿔 `seminars.schedule`에 저장하고 `scheduled`로 전이. 검증 실패는 `fail(400)`으로 필드 오류를 돌려준다. 이미 `published`인 행은 `flow_update_seminar_schedule`로 가 세미나·활동·이벤트가 한 트랜잭션에서 함께 옮겨 가고(학기도 고정이 아니면 새 일정을 따른다), 실제로 바뀌었고 미래 일정이면 커밋 뒤 변경 공지                                                                                    |
| `?/publishSeminar`  | ADM-02 | `flow_publish_seminar` 한 트랜잭션: `published` 전이(학기는 확정된 일정에서 도출하되 `semesterPinned`면 관리자 값이 우선), 활동·이벤트를 앵커(`seminar:<id>`)로 없으면 생성·연결, 공지를 보낸 적 없으면 `announcedAt` **선점**. 커밋 뒤 선점한 쪽만 공지하고, 전송이 실패하면 선점을 푼다(다음 재실행이 재시도) — 정확히 한 번, 지난 일정이면 보내지 않는다. 취소와 같은 잠금을 쓰므로 "공개 도중 취소"는 일어나지 않는다(어느 한쪽이 먼저 커밋되고 다른 쪽은 그 상태로 판정한다) |
| `?/cancelSeminar`   | ADM-18 | 입력 `(seminarId, acknowledgeStarted?)`. `flow_cancel_seminar`: 세미나와 연결 이벤트를 한 트랜잭션에서 `cancelled`로(활동·출석 기록은 남기고 읽는 쪽이 가린다). 이미 시작된 일정은 `acknowledgeStarted=yes` 없이는 `CONFLICT`. 권한·시작 여부 판정은 잠근 행으로 한다. 멱등. 이미 공지된 세미나만 커밋 뒤 취소 공지                                                                                                                                                               |

회원 구역에도 같은 이름의 액션이 하나 있다 — `(member)/events/manage`의 `?/cancelSeminar`.
주체는 폼이 아니라 세션에서 오고, 개설자는 **열리기 전까지만** 자기 세미나를 취소할 수 있다
(이후에는 `FORBIDDEN`). 화면은 그 경우 버튼 자체를 그리지 않는다.

### 7-3. 회원 편집 — ADM-07·12

`GET /admin/members` — 목록·검색 (이름/학과/status/직책).
`GET /admin/members/[id]` — 공개 필드 + 개인정보. **열람 자체가 감사 로그** (§1-5).

입력은 `$lib/domain/members`의 스키마로 검증한다(§1-2 형식, 쓰기·감사 기록 전): 학기는 `Term` 형식(`YY-1|2`),
직책은 한 줄에 하나(`parseRoleLines`), `isAdmin`은 `"true"|"false"`, 프로젝트 URL은 http(s)·200자 이하,
이메일은 다듬은 뒤 형식 검사·200자 이하, 개인정보 수정에서 빈 이메일·전화는 저장된 값 유지(옛 행 대비).
`publicContact`는 저장 형식이 문자열 하나(`"전화 · 이메일"`)이고, 검증 때만 둘로 나눠 **둘 다** 있어야 통과한다.

| 액션                      | 처리                                                                                                      | 감사 로그 |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| `?/updateMember`          | name·department·joinedAt·project·**publicContact**                                                        | —         |
| `?/setStatus`             | associate↔regular. regular 승격 시 `isAlumni: true` — 단 **`alumniRevoked: true`면 자동 부여 안 함**      | ✅        |
| `?/revokeAlumni`          | `isAlumni: false` + `alumniRevoked: true`. 사유 필수                                                      | ✅        |
| `?/setRoles`              | 직책 축 갱신                                                                                              | ✅        |
| `?/setAdmin`              | 부여/회수. 본인 회수 불가                                                                                 | ✅        |
| `?/updatePrivateInfo`     | phone·background·email                                                                                    | ✅        |
| `?/holdWithdrawal`        | ADM-17 — 탈퇴 유예 중 보존 집행: `withdrawal.holdBy = 본인`, 자동 삭제 중단. 이미 익명화됐으면 `CONFLICT` | ✅        |
| `?/releaseWithdrawalHold` | 보존 해제 — 해제 시점부터 1개월 재기산 (`requestedAt` 갱신)                                               | ✅        |

캐시: 공개 페이지는 캐시하지 않으므로 **다음 요청에 즉시 반영**된다 (§1-4).

### 7-4. 레코드 편집 — ADM-08~11

각 라우트 `GET` 로드: 대상 테이블 목록 + 편집 폼 현재값 + (필요 시) 회원 피커 목록.

| 라우트              | 액션                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/admin/activities` | `?/create`, `?/update`, `?/delete`, `?/setAttendees` (관리자 전권 덮어쓰기 — 병합 미적용 **명시적 예외**, 확인 다이얼로그)                                                                 |
| `/admin/seminars`   | `?/create`, `?/update`, `?/delete`, `?/addFile`, `?/removeFile`                                                                                                                            |
| `/admin/studies`    | `?/create`, `?/update`, `?/delete`, `?/setOrganizer` (직권 전달 — **진행 중 `pendingTransfer` 자동 해제**, `transferHistory`에 `byAdmin: true`, 감사 로그 ✅), `?/addFile`, `?/removeFile` |
| `/admin/gallery`    | `?/create`, `?/update`, `?/delete`, `?/addPhoto`, `?/removePhoto`                                                                                                                          |

`?/create`·`?/update`는 편집기가 실제로 보내는 필드를 `adminActivityRecordSchema`·`adminSeminarRecordSchema`·
`adminStudyRecordSchema`·`adminGalleryRecordSchema`로 검증한다(§1-2 형식 — 세미나·스터디 편집기는 `scope`/`id`를
함께 돌려 어느 폼의 오류인지 표시). 자유 텍스트 상한: 제목 160, 설명·비고 2,400, 자료·외부 발표자 500, 연도 20.
소개·자료는 필수가 아니다(이주분에는 없는 경우가 많다). 활동 종류는 저장 가능한 `RECORD_ACTIVITY_TYPES`만.

`?/delete`는 참조 무결성 검증 — 검사와 삭제가 같은 잠금 아래다(흐름 함수):

- 활동 (`flow_delete_activity`): 이벤트·갤러리·세미나가 가리키면 `CONFLICT`
- 스터디 (`flow_delete_study`): 회차가 있으면 `CONFLICT`. 사진은 커밋 뒤 정리
- 세미나 (`flow_delete_seminar`): 공개된 세미나는 기록만 지우고 활동은 아카이브에 남는다. 취소·미공개 세미나는
  그것이 가리던 활동을 회차·큐와 함께 정리한다(다시 드러나지 않도록) — 단 출석 증거(발표자 자동 출석 밖의
  출석자, 대기·승인 체크인)나 다른 참조(다른 세미나·갤러리·스터디 회차)가 남아 있으면 `CONFLICT`.
  원 신청은 지우지 않고 `closedAs: "deleted"`로 표시하고 포스터 참조를 비운다(다른 세미나가 그 신청 위에 있으면 그대로).
  파일은 커밋 뒤 정리
- 갤러리: 단일 문서 삭제, 사진은 다른 기록이 참조하지 않을 때만 정리

### 7-5. 이벤트 생성·연결 — ADM-04·05

- `POST /admin/events/new` (default): `title`, `date`(KST 로컬 일시), `type` → `adminEventInputSchema`로 검증
  (관리자 가드 **안에서** — 권한 없는 요청은 검증 결과를 보지 못한다) → **활동 + 이벤트(draft)** 생성
  (`activityId` 연결) → **303** `/admin` (POST를 GET으로 바꾸는 상태 — 감사 W-26)
- `POST /admin/events/connect?/publish`: `activityId`(`adminDashboardIdSchema`) 지정 → **활동의 title·date·type을 복사**해
  출석 세션 생성(active) → 303 `/admin`. 실패는 코드가 아니라 메시지로 보인다

---

## 7-5. `GET /media/<key>` — 자산 읽기 (C-22)

비공개 `assets` 버킷의 **유일한** 읽기 통로다. 예전에는 버킷이 공개였고 그래서 "URL을
아는 것"이 곧 권한이었다 — 세미나를 취소해도 이미 나간 절대 URL이 파일을 계속 내려 줬다.

| 항목 | 내용                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 경로 | `/media/<s3Key>` (앱 경로. `assetUrl()`이 만들어 페이로드에 싣는다)                                         |
| 응답 | **302** → 수명 5분 서명 URL. 바이트는 이 함수를 통과하지 않는다                                             |
| 거절 | **전부 404.** 403은 "그 파일은 존재한다"를 알려 주므로 쓰지 않는다                                          |
| 캐시 | `private, no-store` + `vercel-cdn-cache-control: no-store` — 라우트가 직접 붙인다(응답이 요청자마다 다르다) |

권한 판정은 **요청마다** `services/asset-access.ts`가 한다. 규칙은 화면과 같다:

- **공개**: 공개된(`published`) 세미나의 자료·사진·포스터, 스터디·회식 사진
- **관리자 전용**: 미공개·취소된 세미나의 자산, 심사 중인 신청의 포스터
- **거절**: 어느 기록에도 속하지 않는 키 (지워진 기록의 잔여 파일·추측 경로)

한 키를 여러 기록이 가리키면 **가장 엄격한** 답을 고른다. 관리자 삭제(`asset-cleanup.ts`)는
그 기록이 실제로 가진 키만, 그리고 **다른 기록이 참조하지 않을 때만** 지운다. 백업 미러
(`assets-mirror/`)는 남긴다 — 실수를 되돌릴 유일한 길이다.

> 운영: 이 통로가 실제로 통제가 되려면 버킷이 **비공개**여야 한다 —
> `docs/OPERATOR-TODO.md` §3-1 (`scripts/ops/ops-assets-private.mjs --apply`).

## 8. REST 엔드포인트

### 8-1. `GET /api/cron/sync-events` — ADM-06

- 인증: `Bearer <CRON_SECRET>`. **미설정·불일치 모두 401** (C-20 — fail-closed는 유지된다. 시크릿이 없으면 무엇도 통과하지 못한다).
  구 규정은 미설정을 501로 갈랐는데, 그것이 인증 전에 설정 여부를 노출했다(`CS-4`)
- 호출 주체: **cron-job.org 매시(주 스케줄러) + Vercel cron 일 1회(최후 심장)** — SUPABASE-MIGRATION-SPEC §5
- **만료는 lazy 판정이 1차 방어**: 신청·출석 검증(§5-3·5-4)은 저장된 `status`가 아니라
  읽기 시점의 `expiryOf(event)` 계산으로 판정한다 — 크론 지연(최후 심장 단독 생존 시 최대 1일)이
  출석 링크를 살려두지 않도록. 크론의 expire는 상태 정리(표시용)다
- 처리:
  1. 만료: §2 만료 판정 규칙에 따라 active → expired — 현재 크론의 **유일한 단계**
  2. ~~회차 자동 생성~~ — **제거 (2026-09-27)**. 제품 결정은 수동 회차뿐이다(FRONTEND-DECISIONS §3-2).
     `studies.schedule`은 기존 문서 검증용으로만 남았다
  3. 🔶 **탈퇴 익명화 집행 — 구현 보류** (§4-7 보류 블록 참조). 크론에 이 단계를 탑재하지 않는다
- 응답 (v0.8):
  - **성공** — `200 { success: true, steps_total: 1, expired: n }`.
    이때만 dead-man's switch에 ping한다 (`SUPABASE-MIGRATION-SPEC` §5-3)
  - **실패** — `500 { success: false, failures: [키…], …결과 }`. **ping하지 않는다**
  - 실패 판정은 결과 맵의 세 표기를 본다: `<스텝>_failed`(스텝이 던짐) ·
    `<단계>_errors`(스텝이 항목별 실패를 내부에서 삼키고 센 수) · `keptAlive: false`.
    `services/cron-status.ts`의 `cronFailures()`가 유일한 판정자다
  - **왜 명시하는가**: `runCron`/`runMaintenance`는 스텝별로 격리해 **던지지 않는다.**
    따라서 라우트의 try/catch로는 실패를 알 수 없고, 이 규약이 없으면 전 스텝이 실패한 실행도
    `200 success`로 보고되며 heartbeat까지 눌린다 — 실제로 그랬다 (감사 `CS-5`·`CM-4`)
  - 같은 규약이 `GET /api/cron/maintenance`에 적용된다 (`backup_push_failed` 포함)

### 8-2. 업로드 — SYS-03

- `POST /api/uploads/presign` — 가드 **기본 `ensureAdmin`, 단 `purpose === "seminar-poster"`는
  `PARTICIPATE` capability 보유 회원에게도 허용** (v0.8이 기술을 코드에 맞춤 — 회원 경로 자체는
  2026-09-02 세미나 포스터 직접 업로드 기능 `b448463`에서 열렸다)
  - **api 존은 존 가드가 `locals.member`를 해석하지 않는다.** 따라서 이 판정은 핸들러가
    `requireCapabilityAction`으로 **직접 해석**해야 한다 — `locals.member`를 읽으면 언제나
    `undefined`라 회원 경로가 통째로 403이 된다 (감사 `UP-1`·`XC-6`)
  - 스테이징은 private이고 승격 시 `stagedInfo`가 크기·타입을 재검증하므로 서명 URL만으로는 오염 불가
- 입력: `{ purpose, filename, contentType, size }`. purpose별 타입·크기 상한 (이미지 10MB, PDF 50MB).
  회원 경로를 가르는 `purpose`는 `uploadPurposeSchema`로 읽고, 권한 확인 **뒤** 본문 전체를 `presignBodySchema`
  (도메인 `presignRequestSchema`에서 클라이언트 전용 `operationId`를 뺀 것 — `filename` 200자, `contentType`
  100자 상한)로 검증한다. JSON이 아니거나 어긋나면 서명 없이 `400 { error: "VALIDATION_FAILED" }`
  (예전에는 `null` 본문이 500이었다). purpose별 타입·크기 검사는 서비스가 계속 한다
- 응답: `{ uploadUrl, s3Key }` (Supabase signed upload URL — **만료 2시간 고정**(단축 불가), 키에 해시 포함.
  **Content-Type 미서명** — v0.7 개정)
- **크기·타입 강제는 등록(승격) 시점이 유일 강제 지점** — signed upload URL은 크기·Content-Type을
  서명으로 강제하지 않는다. 등록 액션이 `info()`(실측 size·mimetype)로 검증하고
  초과 시 승격 거부 (staging의 pending 객체는 7일 정리 잡에 맡김)
- 등록은 편집 액션(`?/addFile` 등) 경유. 이미지 purpose는 등록 시 파생본 생성. 미등록 키 7일 후 정리

### 8-3. 관리자 폴링 — `GET /api/admin/{applications, seminar-requests, study-requests}`. 전부 `ensureAdmin`

### 8-4. 폐지 — `/diag`, `/notion`, `/api/posters/seminar/png`

---

## 9. 이주 시 데이터 변환 규칙

| 필드                                 | 초기값 규칙                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `members.status`                     | 전원 `associate`. **정회원·동문 간주 금지.** 활동 기록 DB 이주 완료 + 신규 회칙 제공 후 회칙 기준 일괄 재분류                                             |
| `members.isAlumni` / `alumniRevoked` | 전원 `false` — 재분류 작업에서 부여                                                                                                                       |
| (경과 조치)                          | 재분류 전까지 status 축은 접근 권한에 영향 없음 — 회원 판정은 레코드 존재 여부                                                                            |
| `members.roles`                      | Notion `임원` multi_select 파싱 → `{term, title}`                                                                                                         |
| `members.isAdmin`                    | 현행 하드코딩 명단 → `true`                                                                                                                               |
| `members.publicContact`              | 현 임원 중 기존 공개 연락처 보유자만 이전 (동의 재확인 후), 그 외 `null`                                                                                  |
| `members.project`                    | `개인 프로젝트` checkbox → 임시 `{ title: "" }` 또는 null — 내용은 추후 입력                                                                              |
| `private-info.mailPrefs`             | `{ announcements: true }`                                                                                                                                 |
| `activities.type` / `events.type`    | `Seminar` → `세미나` 통일                                                                                                                                 |
| `studies`                            | `organizerIds` = Notion 주최자 relation, `participantIds: []`, 과거 학기 `finished`                                                                       |
| `events.applicantIds/presenterIds`   | `[]` — 기존 `Presenters` 백필 보류                                                                                                                        |
| `applications`                       | **이주 대상 아님** — 기존 9건 전부 처리 완료 상태이므로 전환 방식(§2)에 따라 잔존시키지 않는다. 승인 1건 미연결 이상(정합성 이슈)은 이주 전 정리에서 해소 |
| 전 테이블                            | `{ schemaVersion: 1, rows }` 봉투로 기록                                                                                                                  |

---

## 10. 검증 요구

- **가드 매트릭스**: 전 라우트 × 5역할 (게스트/신청자/회원/발표자·주최자/관리자) — CI 필수
- **병합 규칙**: §5-6·§6-6 — 외부 출석 보존, 부분집합 검증. §7-4 `setAttendees` 예외 동작
- **mutate 경합**: 동시 쓰기 유실 0. **출석 큐 버스트**: 동시 체크인 N건 → 전원 성공 (이벤트당 분할 검증)
- **멱등성**: 전 승인 액션 — 재실행 시 중복 레코드 0 (`sourceRequestId` 검증)
- **원자성**: 흐름 함수(§1-3)는 경합 쌍(승인 ∥ 반려·철회, 게시 ∥ 취소·삭제, 체크인 ∥ 이벤트 삭제, 출석 승인 ∥ 거절,
  회차 동시 생성)을 실제로 동시에 실행해 불변식을 확인하고, 매 케이스 뒤 `expectTablesValid()`로 저장된 문서를
  엄격히 재디코드한다(모르는 키·기본값에 기댄 행 거부). 테스트는 PGlite 위에서 운영과 같은 마이그레이션으로 돈다
- **입력 검증**: 폼 액션마다 도메인 스키마 실패 시 `VALIDATION_FAILED` + 필드별 `issues`, 쓰기 0
- **메일**: Bcc 헤더 검증, `mailPrefs` 제외 확인, 공지 수신자 범위(이번 학기 등록 ∪ 동문, 탈퇴 유예 제외 — §5-7)
- **공개 응답 감사**: §3 전 로드 — PII·운영 필드 부재 스냅샷. `publicContact` 외 연락처 부재.
  `/members`에 `withdrawn` 부재. **`/` 세션 분기: 게스트 캐시에 회원 데이터 미혼입**
- **감사 로그**: §1-5 대상 액션 전부 로그 생성 확인
- **탈퇴 수명주기**: 삼중 확인 결여 시 거부 · 신청 즉시 접근 상실 · 보존 집행 시 삭제 중단 ·
  1개월 경과 자동 익명화(이름·학과·roles 외 소거, private-info 완전 삭제) · 참여 기록 해석이 이름·학과로 유지
