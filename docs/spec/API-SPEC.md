# SNUMPS 웹페이지 — API 명세 (v0.6)

> **전제**: [`FUNCTIONAL-SPEC.md`](./FUNCTIONAL-SPEC.md) v0.9.
> 데이터 저장소는 **AWS S3** (D0). 모든 기능 ID(PUB-xx, MEM-xx …)는 기능 명세를 참조한다.
>
> **v0.2**: 완전성·일관성 검토(2026-08-25, 검토 결과는 [`SPEC-REVIEW.md`](./SPEC-REVIEW.md)) 반영 전면 개정.
>
> **형식**: 이 앱은 SvelteKit이다. API는 세 층으로 구성된다.
> 1. **페이지 로드** (`+page.server.ts load`) — 화면 데이터 공급. SSR/prerender/ISR
> 2. **폼 액션** (`+page.server.ts actions`) — 상태 변경. `POST /경로?/액션명`
> 3. **REST 엔드포인트** (`/api/*`) — 크론·폴링·업로드 등 폼 액션이 부적합한 경우만

---

## 1. 공통 규약

### 1-1. 인가 계층

| 가드 | 통과 조건 | 실패 시 |
|---|---|---|
| `public` | 없음 (게스트 허용) | — |
| `ensureSession` | 로그인 세션 존재 | 303 → `/login` |
| `ensureMember` | 세션 + 승인된 회원 (`locals.member` 존재) | 미가입 303 → `/signup`, 미승인 303 → `/wait` |
| `ensurePresenter(eventId)` | 회원 + 해당 이벤트 `presenterIds` 포함 (이벤트를 재조회해 판정 — locals 불신) | 403 `FORBIDDEN` |
| `ensureOrganizer(studyId)` | 회원 + 해당 스터디 `organizerIds` 포함 (재조회 판정) | 403 `FORBIDDEN` |
| `ensureAdmin` | 회원 + `isAdmin: true` (D4) | 404 (존재 은폐) |

- 공개 영역 판정은 접두사 매칭이 아니라 **라우트 그룹/명시 목록** 기반
- 가드 테스트 매트릭스: 전 라우트 × **5역할** {게스트, 신청자, 회원, 발표자/주최자, 관리자} (SYS-07)

### 1-2. 응답·에러 규약

- 폼 액션 성공: `{ success: true, ...데이터 }`. 트랜잭션은 성공했으나 부수 메일이 실패한 경우
  `{ success: true, mailFailed: true }` — `MAIL_FAILED`는 에러 코드가 아니라 성공 페이로드 필드다
- 폼 액션 실패: `fail(status, { error: <코드> })`. 한국어 메시지 매핑은 클라이언트 담당
- REST: 성공 `200 { success: true, ... }`, 실패 `4xx/5xx { error: <코드> }`
- 입력 검증: Zod 단일 스키마 (스키마 정의는 데이터 모델과 같은 모듈에서 공유)

에러 코드:

| 코드 | 의미 |
|---|---|
| `VALIDATION_FAILED` | 입력 형식 오류 (자기 자신 전달 등 의미 오류 포함) |
| `NOT_FOUND` | 대상 레코드 없음 / dangling 참조 |
| `FORBIDDEN` | 권한 없음 |
| `CONFLICT` | 상태 충돌 (이미 처리됨, 중복 제안 등) |
| `WRITE_CONFLICT` | S3 조건부 쓰기 재시도 소진 |
| `EVENT_NOT_OPEN` | 이벤트가 신청·출석 가능 상태 아님 (draft/expired/cancelled/시작 후 신청) |
| `STUDY_NOT_RECRUITING` | 모집 중이 아닌 스터디에 참여 신청 |

### 1-3. S3 데이터 계층 계약 (SYS-01)

```ts
getTable<T>(name: TableName): Promise<T[]>
mutate<T>(name: TableName, fn: (rows: T[]) => T[]): Promise<T[]>
```

- 저장 형식: **`{ "schemaVersion": 1, "rows": [...] }` 봉투** — 필드 형상 변경 시 리더가 버전 분기
- 테이블당 객체 1개 (`tables/<name>.json.gz`), gzip, 버킷 버전 관리
- `mutate`: GET(ETag) → fn → PUT If-Match, 조건 실패 시 재읽기 재시도(지수 백오프) → `WRITE_CONFLICT`.
  **재시도 대상은 412뿐 아니라 409(ConditionalRequestConflict)·If-Match 중 404도 포함.**
  재시도 상한: 일반 테이블 5회, **출석 큐 10회** (동시 체크인 버스트 대상)
- **예외 — 출석 큐는 이벤트당 객체 분할**: `attendance-queue/<eventId>.json`.
  세미나 시작 직후 N명 동시 체크인이 유일한 실동시성 쓰기 부하이므로 경합 범위를 이벤트 단위로 축소
- 다중 테이블 쓰기는 원자적이지 않다 → 부수효과 큰 쓰기를 마지막에, 각 단계 멱등 (§1-6)
- 레코드 id: **시간순 정렬 가능한 128비트 id (ULID 또는 UUIDv7)**. Notion uuid는 이주 시 1회 매핑 후 폐기

### 1-4. 캐시

| 키 | 내용 | 무효화 |
|---|---|---|
| `table_<name>` | 테이블 전문 | 해당 테이블 `mutate` 성공 시 **자동** (데이터 계층이 수행) |
| `activities_<start>_<end>` | 기간 조회 파생 | activities 변경 액션이 명시 |
| `user_activities_<memberId>` | 회원별 이력 | 해당 회원 출석 변경 액션이 명시 |
| `all_events` | 이벤트 목록 | events 변경 액션이 명시 |

- 원칙: **`mutate(t)` → `table_t` 무효화는 자동.** 아래 액션 명세의 "캐시:" 표기는 파생 키만 적는다
- **ISR 재검증**: 공개 페이지(§3)는 태그 기반 재검증이 없으므로 **TTL 방식** — 정적(prerender) 제외
  전 공개 페이지 `revalidate: 60`(초). 회원 편집 직후 공개 페이지 반영은 최대 60초 지연 허용

### 1-5. 감사 로그 (SYS-06)

`getTable/mutate` 계약 **밖의** 전용 채널. 테이블 JSON에 넣지 않는다 (append 경합·PII 혼입 방지).

- 저장: 비공개 버킷 `audit/<yyyy-mm-dd>/<id>.json` — **건당 객체 1개** (S3는 append 불가, 객체 생성 = append-only)
- 스키마: `{ id, at, actorMemberId, action, targetTable, targetId, detail? }`
- 기록 대상 (전부 관리자 액션):
  - `private-info` **관리자 열람** (§7-3 GET) 및 `?/updatePrivateInfo`
  - `?/setStatus`, `?/setRoles`, `?/setAdmin`, `?/revokeAlumni` — 지위·권한 변경 전부
  - `?/setOrganizer` (직권 전달)
  - 탈퇴 수명주기: `?/requestWithdrawal`·`?/cancelWithdrawal`(본인 행위지만 파기 트리거), `?/holdWithdrawal`·`?/releaseWithdrawalHold`, 크론 자동 익명화
- **비대상**: 본인이 본인 개인정보를 읽고 고치는 경로(§4), 세션 훅의 회원 매칭 조회 —
  매 요청 발생하는 조회는 감사 대상에서 명시적으로 제외
- 열람: 별도 UI 없음(1차). S3 콘솔/CLI로 조회. 필요 시 `/admin/audit` 추후 신설

### 1-6. 승인 흐름 멱등성 규약

여러 테이블을 쓰는 승인 흐름의 재실행 안전을 위해:

- 승인이 생성하는 모든 레코드에 **`sourceRequestId`** 를 기록한다. 타입은 `string | null` — 형식 2종:
  ① 원 신청/큐 행의 id, ② 스터디 회차의 복합 근거 키 `"<studyId>:<date>"`
- 각 생성 단계는 **check-before-create**: 같은 `sourceRequestId` 레코드가 이미 있으면 생성 생략, 다음 단계 진행
- 이미 최종 상태인 신청에 대한 재승인 요청은 `CONFLICT`
- 중간 실패 시 동일 요청 재실행이 누락 단계만 채운다 — 중복 레코드 0

---

## 2. 데이터 모델 (S3 테이블)

파일 자산은 `s3Key` 문자열 참조. 날짜: `date`(날짜만, `YYYY-MM-DD`)와 `datetime`(ISO 8601, KST 기준 저장)을 필드별로 구분 명시.

### 학기(term) 파생 규칙 — 단일 정의

`"<YY>-<1|2>"`. **3월~8월 = 해당 연도 1학기, 9월~익년 2월 = 해당 연도 2학기** (1~2월은 전년도 `-2`).
datetime → term 변환은 이 규칙의 단일 유틸만 사용. `activities`/`events`에는 term을 저장하지 않고 파생한다.

### `members`

```jsonc
{
  "id": "ULID",
  "name": "string",
  "department": "string",
  "joinedAt": "date",
  "status": "associate | regular | withdrawn",   // 준회원 | 정회원 | 탈퇴 (MEM-07)
  "statusChangedAt": "datetime",
  "withdrawal": null,                   // { "requestedAt": "datetime", "previousStatus": "associate | regular",
                                        //   "holdBy": "ULID | null", "holdAt": "datetime | null" } | null
                                        // holdBy 설정 = 보존 집행(ADM-17) — 자동 삭제 중단. previousStatus는 철회 시 복원용
  "isAlumni": false,                    // 동문 영구 지위
  "alumniRevoked": false,               // 유고 박탈 이력 — true면 setStatus 승격이 isAlumni를 되살리지 않는다
  "roles": [ { "term": "26-1", "title": "회장" } ],
  "isAdmin": false,
  "publicContact": null,                // string | null. 본인 동의 하에 공개되는 연락처 (임원용). §3 공개 금지의 유일한 예외
  "project": null,                      // { "title": "string", "url": "string?" } | null — 개인 프로젝트 보드 내용
  "sourceRequestId": null               // string | null — 가입 승인 멱등(§1-6)의 실체. 이주 회원은 null
}
```

`privateInfoId` 없음 — 연결 방향은 `private-info.memberId` **단방향 단일 원천**.

### `private-info` 🔒

```jsonc
{
  "id": "ULID",
  "memberId": "ULID",
  "email": "string",                    // 로그인 매칭 키 (유일)
  "phone": "010-XXXX-XXXX",
  "background": "string",
  "mailPrefs": { "announcements": true },  // 유형별 수신 설정. 현재 키 1개, 유형 추가 시 키 추가
  "sourceRequestId": null                  // string | null — §1-6
}
```

### `activities`

```jsonc
{
  "id": "ULID",
  "title": "string",
  "date": { "start": "datetime", "end": "datetime | null" },
  "type": "세미나 | 스터디 | 회의 | 회식 | 기타",   // 닫힌 집합. 'Seminar' 폐기 확정
  "attendeeIds": ["ULID"],
  "sourceRequestId": "string | null"      // §1-6. 승인·회차 생성이 만든 경우 원 신청/회차 근거
}
```

### `events` (출석 세션)

```jsonc
{
  "id": "ULID",
  "title": "string",
  "date": { "start": "datetime", "end": "datetime | null" },
  "type": "세미나 | 스터디 | 회의 | 회식 | 기타",   // activities.type과 동일 집합
  "status": "draft | active | expired | cancelled",  // cancelled는 재활성화 불가 (expired만 재활성화 허용)
  "pathId": "string",
  "attendCode": "string",
  "activityId": "ULID",                 // 필수 — 출석이 반영될 활동. null 불허 (생성 시 활동 동시 생성)
  "applicantIds": ["ULID"],
  "presenterIds": ["ULID"],
  "studyId": "ULID | null",
  "sessionNo": 3,                        // 스터디 회차 번호 (수동·자동 공통: 해당 studyId의 max+1)
  "autoGenerated": false,
  "sourceRequestId": "string | null"
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
  "status": "pending | approved | rejected"
}
```

### `applications` 🔒

```jsonc
{
  "id": "ULID", "name": "string", "email": "string", "phone": "string",
  "department": "string", "background": "string",
  "createdAt": "datetime"
}
```

**미처리 신청만 존재하는 테이블** — `status` 필드 없음. 승인 시 내용이 `members`/`private-info`로
**전환**되고 행이 제거되며, 거절·철회 시에도 행이 제거된다(전환 대상 없음). 처리 완료 건은 잔존하지 않는다.

### `seminar-requests` 🔒

```jsonc
{
  "id": "ULID", "title": "string", "description": "string",
  "prerequisites": "string", "duration": "string",
  "presenterIds": ["ULID"],             // 'speakerIds' 아님 — 발표자 명칭 전 테이블 통일
  "attachment": "string",               // 자료 외부 링크 (현행 기능 보존 — 업로드 경로는 SYS-03에서)
  "requesterId": "ULID",
  "status": "pending | approved | rejected | withdrawn",
  "createdAt": "datetime"
}
```

### `study-requests` 🔒

```jsonc
{
  "id": "ULID", "title": "string", "textbook": "string",
  "description": "string", "semester": "26-1",
  "requesterId": "ULID",
  "status": "pending | approved | rejected | withdrawn",
  "createdAt": "datetime"
}
```

### `studies`

```jsonc
{
  "id": "ULID", "title": "string", "semester": "26-1",
  "textbook": "string", "description": "string", "note": "string",
  "organizerIds": ["ULID"],             // 배열. 현재 불변식은 1명 — 공동 주최 확장 대비
  "participantIds": ["ULID"],
  "pendingParticipantIds": ["ULID"],
  "pendingTransfer": { "toMemberId": "ULID", "requestedAt": "datetime" },  // | null
  "schedule": [ { "date": "datetime", "generatedEventId": "ULID | null" } ],
  "transferHistory": [ { "from": "ULID", "to": "ULID", "at": "datetime", "byAdmin": false } ],
  "photos": ["s3Key"],
  "status": "recruiting | ongoing | finished",
  "sourceRequestId": "string | null"
}
```

`schedule[].generatedEventId` ↔ `events.studyId`는 크론의 비원자 쓰기 쌍 — **events 생성 먼저,
schedule 기록 나중** (실패 시 재실행이 events의 `sourceRequestId`+일정으로 중복을 감지).

### `seminars` (기록)

```jsonc
{
  "id": "ULID", "title": "string", "semester": "25-2", "note": "string",
  "presenterIds": ["ULID"], "externalPresenters": "string",
  "materials": ["s3Key"], "photos": ["s3Key"],
  "activityId": "ULID | null",          // 승인 생성 시 기록 — 아카이브↔활동 연결
  "sourceRequestId": "string | null"
}
```

### `gallery-dinner`

```jsonc
{ "id": "ULID", "year": "string", "photos": ["s3Key"], "activityId": "ULID | null" }
```

---

## 3. PUB — 공개 읽기

전부 `public` 가드, 상태 변경 없음.

**공개 응답 제약**: `private-info` 전 필드, `isAdmin`, `pendingParticipantIds`·`pendingTransfer` 등
운영 필드는 어떤 공개 로드에도 포함 금지. **유일한 예외: `members.publicContact`** — 본인 동의로
설정된 공개 연락처 필드로, 임원 연락처 표시(PUB-01·05)에 사용한다. §10 스냅샷 테스트가 이 제약을 검증.

| 로드 | 기능 | 데이터 | 렌더 |
|---|---|---|---|
| `GET /` (게스트 분기) | PUB-01 | 정적 소개문 + 현 임원 (`members.roles` 최신 term + `publicContact`) | **세션 없는 분기만 ISR(60s).** 세션 있으면 §4-5 대시보드로 분기 — 회원 응답은 캐시 금지 |
| `GET /about` 계열 (`charter`, `charter/history/[period]`, `elections`, `press`, `finance`) | PUB-02~04·06~08 | 레포 마크다운 + S3 자산 | prerender |
| `GET /about/executives` | PUB-05 | `roles` 파생 역대 직책 (임기 내림차순) + `publicContact` | ISR(60s) |
| `GET /archive/seminars`, `/[id]` | PUB-09 | `seminars` 학기 그룹 / 단건 + 자료·사진 CDN URL | ISR(60s) |
| `GET /archive/studies` | PUB-10 | `studies` 공개 필드만 (운영 필드 제외) | ISR(60s) |
| `GET /archive/activities` | PUB-11 | `activities` — attendeeIds 제외 | ISR(60s) |
| `GET /archive/gallery` | PUB-12 | 3테이블 photos, thumb 파생본 | ISR(60s) |
| `GET /archive/projects` | PUB-13 | `members` 중 `project != null` — 이름·학과·project 내용 | ISR(60s) |
| `GET /archive/misc` 계열, `/archive/problems`, `/archive/discussions` | PUB-14 | 마크다운 + S3 PDF | prerender |
| `GET /members` | PUB-15 | name·department·joinedAt·roles (D2 범위). **`status: withdrawn` 제외** | ISR(60s) |

`sitemap.xml`·`robots.txt` 정적 (PUB-16).

---

## 4. MEM — 가입·프로필

### 4-1. `GET /signup` + `POST` (default) — MEM-01

- 가드: `ensureSession` (이미 회원 → 303 `/`)
- GET: 기존 pending 신청 있으면 303 `/signup/edit`
- POST 입력: `name`, `department`, `phone`(정규화 후 검증), `background`. 이메일은 **세션에서 유도** (폼 값 불신)
- 처리: `mutate(applications)` 신규 행 → 관리자 알림 메일 (실패 시 `mailFailed`)
- 에러: `VALIDATION_FAILED`, `CONFLICT`(동일 이메일 신청 행 존재)

### 4-2. `GET /signup/edit` + `POST` (default) — MEM-02

- 가드: `ensureSession` + 본인 pending 신청 존재
- GET: 기존 신청 값 프리필
- POST: 해당 행 갱신. 에러: `NOT_FOUND`, `CONFLICT`(이미 처리됨)

### 4-3. `GET /wait` + `POST ?/withdrawApplication` — MEM-03

- 가드: `ensureSession`
- GET: "신청 처리 중" 안내 + 본인 신청 내용. 신청 행이 없으면(승인 전환/거절/철회됨):
  회원이면 303 `/`, 아니면 303 `/signup`
- **POST `?/withdrawApplication`** — 가입 신청 본인 철회 (페이지 하단 버튼):
  본인 pending 신청 행 **삭제** (PII 즉시 제거) → 303 `/`. 에러: `NOT_FOUND`(이미 처리·철회됨)

### 4-4. `POST /?/updateProfile` — MEM-04

- 가드: `ensureMember`
- 입력: `phone`, `background` — 본인 행만 (id는 세션 유도). **본인 접근은 감사 로그 비대상** (§1-5)

### 4-5. `GET /` (세션 있는 분기 — 대시보드) — MEM-04·05, EVT-02·03

- 가드: `ensureMember` (세션 없으면 §3의 게스트 분기)
- 조회 파라미터: `?semester=<term>` — 미지정 시 현재 학기. 학기 필터 목록과 함께 해당 학기 활동·이력 반환
- 반환 (스트리밍 허용):
  - `profile` (본인 공개+개인 정보)
  - `activities` (선택 학기) + 이벤트 연결 활동의 `isApplied`·`canApply`·`pendingAttendance`
  - `myRequests`: 본인 세미나·스터디 개설 신청 목록 + 상태 — `/seminar/edit/[id]` 진입점
  - `myStudies`: 참여·주최 스터디 요약
  - `pendingTransfer`: 본인 대상 주최자 전달 제안 (§6-5 진입점)

### 4-6. `GET /settings/notifications` + `POST ?/setMailPref` — MEM-06

- 가드: `ensureMember`
- POST 입력: `{ type: "announcements", enabled: boolean }` — 유형별 키 (확장 대비)
- 비로그인 옵트아웃 링크 클릭 → `/login` 경유 복귀

### 4-7. 회원 탈퇴 — MEM-07

`POST /settings/withdraw?/requestWithdrawal` (마이페이지 설정 하위)

- 가드: `ensureMember` (주최 중 스터디 있으면 `CONFLICT` — 전달(STU-07) 또는 관리자 처리 선행)
- **삼중 확인 — 서버가 3단계 모두 검증**:
  1. 1단계: 탈퇴 안내 확인 (`ackInfo: true`)
  2. 2단계: 데이터 처리 고지 확인 (`ackDataPolicy: true`) — 1개월 유지·자동 삭제·기록 잔존 범위 고지
  3. 3단계: **본인 이름 정확 입력** (`confirmName === members.name`)
  - 하나라도 결여 → `VALIDATION_FAILED`. 클라이언트 단계 UI와 무관하게 서버는 원자적으로 3요소 검증
- 처리:
  1. `mutate(members)`: `status: withdrawn`,
     `withdrawal: { requestedAt: now, previousStatus: <직전 status>, holdBy: null, holdAt: null }`
  2. **현 회장단 통지 메일** — 최신 term 회장·부회장의 **`private-info.email`** 대상 + 관리자 대시보드 표시(§7-1)
  3. 감사 로그 (본인 행위지만 파기 트리거이므로 기록 ✅)
- 효과: **즉시 회원 영역 접근 상실** — 가드가 `withdrawn`(유예 중)을 감지하면 전 회원 라우트에서
  303 → **`/withdraw/pending`** ("탈퇴 처리 중" 안내 페이지)
- **`GET /withdraw/pending` + `POST ?/cancelWithdrawal`** — 본인 철회 (확정):
  - 가드: `ensureSession` + 본인 status `withdrawn` ∧ 미익명화
  - GET: 탈퇴 처리 중 안내 + 삭제 예정일 + **하단 철회 버튼**
  - POST: `withdrawal.previousStatus`로 status 복원, `withdrawal: null` → 303 `/`
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
- **GET: 발표자 피커용 회원 목록 반환** — `{ id, name, department }` 전체 (231행, 클라이언트 필터로 충분)
- POST 입력: `title`, `description`, `prerequisites`, `duration`, `presenterIds[]`
- 처리: `mutate(seminar-requests)` 신규(pending) → 관리자 알림 메일

### 5-2. `GET /seminar/edit/[id]` + 액션 — SEM-02·03

- 가드: `ensureMember` + `requesterId` 본인 (관리자 예외)
- GET: 신청 값 프리필 + 피커용 회원 목록 + 포스터 렌더 데이터 (SEM-03 — 렌더는 클라이언트)
- `POST ?/update`: §5-1과 동일 입력. `POST ?/withdraw`: 본인 pending 신청 철회 → `withdrawn`
- 에러: `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`(이미 처리됨)

### 5-3. `POST /?/applyActivity` · `?/cancelActivity` — EVT-02

- 가드: `ensureMember`. 입력: `eventId`
- 검증: 존재 · `active` · `date.start` 미도래
- 처리: `applicantIds` 추가/제거. 멱등
- 에러: `NOT_FOUND`, `EVENT_NOT_OPEN`. 캐시: `all_events`

### 5-4. `GET /events/[pathId]/[attendCode]` + `POST ?/attend` — EVT-01, SEM-05, STU-03

- 가드: `ensureMember`
- GET: `pathId`+`attendCode` 이중 매칭 (불일치 404). 타입별 컨텍스트 (세미나: 발표자 / 스터디: 회차)
- POST 검증: `status: active` — 아니면 `EVENT_NOT_OPEN`
- 처리: `mutate(attendance-queue/<eventId>)` — 기존 행 있으면 `endTime` 기록, 없으면 신규(pending).
  원클릭 완료 시 start=end=now. 완료 시 관리자 알림 메일
- 에러: `NOT_FOUND`, `EVENT_NOT_OPEN`, `CONFLICT`(이미 완료)

### 5-5. `GET /events/manage` — PRES-01·03·04

- 가드: `ensureMember`. **의도된 설계**: 페이지 자체는 회원 접근 가능하되 본인이 발표자인 이벤트만
  반환(비발표자는 빈 목록) — 데이터 필터가 인가 경계이고, 네비 숨김(PRES-03)은 UX일 뿐이다
- 대상 필터: 본인이 `presenterIds`에 포함 ∧ **세미나 타입** — 스터디 회차는 STU-05가 담당하므로 제외
- 반환: 이벤트별 신청자 명단(해석), 현재 출석 교집합(체크 초기값), 출석 링크 전문 (PRES-04)

### 5-6. `POST /events/manage?/saveAttendance` — PRES-02

- 가드: `ensureMember` → `ensurePresenter(eventId)`
- 입력: `eventId`, `attendeeIds[]`. 검증: `attendeeIds ⊆ applicantIds`
- 처리 — 🔴 병합 규칙:
  ```
  outside = activities[activityId].attendeeIds − applicantIds
  final   = outside ∪ attendeeIds
  ```
- 캐시: `activities_*`, 영향 회원 전원 `user_activities_<id>`
- 에러: `FORBIDDEN`, `VALIDATION_FAILED`, `NOT_FOUND`

### 5-7. 공지 메일 (내부 계약) — SEM-04, SYS-05

1. 수신자: `private-info` 중 `email` 존재 ∧ `mailPrefs.announcements !== false`
2. **Bcc 전용**, 배치 분할
3. 본문 하단 옵트아웃 링크 → `/settings/notifications`
4. 실패: 배치별 로그, 트랜잭션 비전파 — 액션 응답에 `mailFailed: true`

---

## 6. STU — 스터디

### 6-1. `GET /study` — 목록. `ensureMember`. 모집중 우선 + 본인 상태

### 6-2. `GET /study/apply` + `POST` (default) — STU-01

- 가드: `ensureMember`. 입력: `title`, `textbook`, `description`, `semester`
- 신규(pending) → 관리자 알림 메일. `POST ?/withdraw` (본인 pending 철회) 지원 — 세미나와 대칭

### 6-3. `GET /study/[id]` + `POST ?/join` · `?/leave` — STU-02

- 가드: `ensureMember`
- `join` 검증: **`status: recruiting`** — 아니면 `STUDY_NOT_RECRUITING`. `pendingParticipantIds` 추가, 멱등
- `leave`: pending/participants 제거, 멱등. 주최자는 불가(`CONFLICT` — 전달 먼저)

### 6-4. `GET /study/[id]/manage` — STU-04·06·07

- 가드: `ensureOrganizer`
- 반환: 신청 대기, 참여자, 회차 목록(자동 생성 표시), 일정, 전달 상태, 스터디 상태

| 액션 | 기능 | 처리 |
|---|---|---|
| `?/acceptParticipant` / `?/removeParticipant` | STU-04 | pending→participants / 제거. 멱등 |
| `?/setStudyStatus` | STU 상태 전이 | `recruiting ↔ ongoing → finished`. finished 전이는 확인 요구 |
| `?/createSession` | STU-06 수동 | 검증: `status != finished`. ① `activities` 생성(type 스터디, `sourceRequestId` = 회차 근거) ② `events` 생성(`studyId`, `sessionNo` = 해당 스터디 max+1, `activityId` 연결, active) — §1-6 멱등 |
| `?/registerSchedule` | STU-06 자동 | `schedule` 등록. 생성은 크론(§8-1). `status: finished`면 거부 |
| `?/updateSession` / `?/cancelSession` | STU-06 | 제목·일시 수정 / **`status: cancelled`** (expired와 구분 — 재활성화 불가) + 일정 항목 해제 |
| `?/proposeTransfer` | STU-07 | 검증: 대상이 회원 ∧ **본인 아님**(`VALIDATION_FAILED`) ∧ 기존 제안 없음(`CONFLICT`) |
| `?/cancelTransfer` | STU-07 | `pendingTransfer = null` |

캐시: 회차 변경 시 `all_events`, `activities_*`.

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

전부 `ensureAdmin`. 승인·거절은 §1-6 멱등 규약 적용.

### 7-1. `GET /admin`

반환: 가입 신청(전량 — 테이블이 미처리만 보유), 세미나·스터디 개설 신청(pending), 출석 큐(pending),
이벤트 전 상태, **탈퇴 유예 회원 목록**(이름·requestedAt·삭제 예정일·hold 상태 — ADM-17 진입점).
이벤트 상세 뷰에서는 해당 이벤트 큐의 **전 상태 행**(approved 포함 — 역반영 작업 대상) 조회 가능.

### 7-2. `/admin` 액션

| 액션 | 기능 | 처리 |
|---|---|---|
| `?/approve` | ADM-01 | ① `private-info` 생성(신청 내용 **전환**) ② `members` 생성(status **associate**) ③ **신청 행 제거**. ①②는 `sourceRequestId` check-before-create — ③ 실패 후 재실행은 기존 레코드를 감지하고 행 제거만 수행. 행이 이미 없으면 `NOT_FOUND` |
| `?/reject` | ADM-01 | 거절 알림 메일 후 **신청 행 제거** (전환 대상 없음) |
| `?/approveSeminar` | ADM-02 | ① `activities` ② `events`(active, `presenterIds` = request의 presenterIds, `activityId` 연결) ③ `seminars`(`activityId`·`presenterIds` 기록) ④ request `approved` ⑤ 공지 메일(비전파). 전 단계 `sourceRequestId` |
| `?/rejectSeminar` / `?/approveStudy` / `?/rejectStudy` | ADM-02·16 | 스터디 승인: `studies` 생성(`organizerIds = [requesterId]`, recruiting, `sourceRequestId`) → request `approved` → 알림 메일 |
| `?/activateEvent` / `?/expireEvent` / `?/deleteEvent` | ADM-04 | 전이 draft↔active↔expired (cancelled는 불가). **deleteEvent**: 해당 `attendance-queue/<eventId>`에 pending 있으면 `CONFLICT`(먼저 처리 요구), 없으면 큐 객체 함께 삭제 |
| `?/updateEvent` | ADM-04 | 제목·일시·타입 수정 (오입력 정정) |
| `?/approveAttendance` | ADM-03 | 입력: **`(eventId, queueId)`** — 저장이 이벤트당 객체라 둘 다 필수 (큐 액션 4종 공통). 검증: 이벤트·활동 실재 (dangling → `NOT_FOUND`). `activities.attendeeIds` 추가 → queue `approved`. 캐시: `activities_*`, `user_activities_<memberId>` |
| `?/rejectAttendance` / `?/deleteAttendanceRecord` | ADM-03 | 입력 `(eventId, queueId)`. **approved 행에 적용 시 역반영** — `attendeeIds`에서 제거 후 상태 변경/삭제. 캐시 동일 |
| `?/updateAttendanceTime` | ADM-03 | 입력 `(eventId, queueId, start, end)`. 시각 수정 |
| `?/holdWithdrawal` / `?/releaseWithdrawalHold` | ADM-17 | §7-3 표 참조 — 진입은 이 대시보드의 탈퇴 유예 목록 |

### 7-3. 회원 편집 — ADM-07·12

`GET /admin/members` — 목록·검색 (이름/학과/status/직책).
`GET /admin/members/[id]` — 공개 필드 + 개인정보. **열람 자체가 감사 로그** (§1-5).

| 액션 | 처리 | 감사 로그 |
|---|---|---|
| `?/updateMember` | name·department·joinedAt·project·**publicContact** | — |
| `?/setStatus` | associate↔regular. regular 승격 시 `isAlumni: true` — 단 **`alumniRevoked: true`면 자동 부여 안 함** | ✅ |
| `?/revokeAlumni` | `isAlumni: false` + `alumniRevoked: true`. 사유 필수 | ✅ |
| `?/setRoles` | 직책 축 갱신 | ✅ |
| `?/setAdmin` | 부여/회수. 본인 회수 불가 | ✅ |
| `?/updatePrivateInfo` | phone·background·email | ✅ |
| `?/holdWithdrawal` | ADM-17 — 탈퇴 유예 중 보존 집행: `withdrawal.holdBy = 본인`, 자동 삭제 중단. 이미 익명화됐으면 `CONFLICT` | ✅ |
| `?/releaseWithdrawalHold` | 보존 해제 — 해제 시점부터 1개월 재기산 (`requestedAt` 갱신) | ✅ |

캐시: 공개 페이지 반영은 ISR TTL(§1-4).

### 7-4. 레코드 편집 — ADM-08~11

각 라우트 `GET` 로드: 대상 테이블 목록 + 편집 폼 현재값 + (필요 시) 회원 피커 목록.

| 라우트 | 액션 |
|---|---|
| `/admin/activities` | `?/create`, `?/update`, `?/delete`, `?/setAttendees` (관리자 전권 덮어쓰기 — 병합 미적용 **명시적 예외**, 확인 다이얼로그) |
| `/admin/seminars` | `?/create`, `?/update`, `?/delete`, `?/addFile`, `?/removeFile` |
| `/admin/studies` | `?/create`, `?/update`, `?/delete`, `?/setOrganizer` (직권 전달 — **진행 중 `pendingTransfer` 자동 해제**, `transferHistory`에 `byAdmin: true`, 감사 로그 ✅), `?/addFile`, `?/removeFile` |
| `/admin/gallery` | `?/create`, `?/update`, `?/delete`, `?/addPhoto`, `?/removePhoto` |

`?/delete`는 참조 무결성 검증 — 참조하는 이벤트·큐가 있으면 `CONFLICT`.

### 7-5. 이벤트 생성·연결 — ADM-04·05

- `POST /admin/events/new` (default): `title`, `date`, `type` → **활동 + 이벤트(draft)** 동시 생성 (`activityId` 연결)
- `POST /admin/events/connect?/publish`: `activityId` 지정 → **활동의 title·date·type을 복사**해 출석 세션 생성(active)

---

## 8. REST 엔드포인트

### 8-1. `GET /api/cron/sync-events` — ADM-06, STU-06 자동 생성

- 인증: `Bearer <CRON_SECRET>`. **미설정 시 501 (fail-closed)**
- **만료는 lazy 판정이 1차 방어**: 신청·출석 검증(§5-3·5-4)은 저장된 `status`가 아니라
  읽기 시점의 `expiryOf(event)` 계산으로 판정한다 — 크론 지연(호스팅 플랜에 따라 최대 1일)이
  출석 링크를 살려두지 않도록. 크론의 expire는 상태 정리(표시용)다
- 처리:
  1. 만료: §2 만료 판정 규칙에 따라 active → expired
  2. 회차 자동 생성: `studies.schedule` 중 도래 일정 → **§6-4 `?/createSession`과 동일 규칙**
     (activities+events 생성, `sessionNo` = max+1, `autoGenerated: true`). **events 생성 후 schedule에
     `generatedEventId` 기록** — 재실행 시 `generatedEventId` 존재 또는 동일 근거 이벤트 존재로 멱등
  3. 🔶 **탈퇴 익명화 집행 — 구현 보류** (§4-7 보류 블록 참조). 크론에 이 단계를 탑재하지 않는다
- 응답: `{ success: true, expired: n, generated: n }`

### 8-2. 업로드 — SYS-03

- `POST /api/uploads/presign` — 가드 `ensureAdmin`
- 입력: `{ purpose, filename, contentType, size }`. purpose별 타입·크기 상한 (이미지 10MB, PDF 50MB)
- 응답: `{ uploadUrl, s3Key }` (presigned PUT 10분, Content-Type 서명 포함, 키에 해시 포함)
- **크기 상한 강제는 등록(승격) 시점** — presigned PUT은 크기를 서버측 강제할 수 없다
  (`content-length-range`는 POST policy 전용). 등록 액션이 `HeadObject`로 실측 크기·타입을 검증하고
  초과 시 승격 거부 (pending 객체는 수명주기 7일 정리에 맡김)
- 등록은 편집 액션(`?/addFile` 등) 경유. 이미지 purpose는 등록 시 파생본 생성. 미등록 키 7일 후 정리

### 8-3. 관리자 폴링 — `GET /api/admin/{applications, seminar-requests, study-requests}`. 전부 `ensureAdmin`

### 8-4. 폐지 — `/diag`, `/notion`, `/api/posters/seminar/png`

---

## 9. 이주 시 데이터 변환 규칙

| 필드 | 초기값 규칙 |
|---|---|
| `members.status` | 전원 `associate`. **정회원·동문 간주 금지.** 활동 기록 DB 이주 완료 + 신규 회칙 제공 후 회칙 기준 일괄 재분류 |
| `members.isAlumni` / `alumniRevoked` | 전원 `false` — 재분류 작업에서 부여 |
| (경과 조치) | 재분류 전까지 status 축은 접근 권한에 영향 없음 — 회원 판정은 레코드 존재 여부 |
| `members.roles` | Notion `임원` multi_select 파싱 → `{term, title}` |
| `members.isAdmin` | 현행 하드코딩 명단 → `true` |
| `members.publicContact` | 현 임원 중 기존 공개 연락처 보유자만 이전 (동의 재확인 후), 그 외 `null` |
| `members.project` | `개인 프로젝트` checkbox → 임시 `{ title: "" }` 또는 null — 내용은 추후 입력 |
| `private-info.mailPrefs` | `{ announcements: true }` |
| `activities.type` / `events.type` | `Seminar` → `세미나` 통일 |
| `studies` | `organizerIds` = Notion 주최자 relation, `participantIds: []`, 과거 학기 `finished` |
| `events.applicantIds/presenterIds` | `[]` — 기존 `Presenters` 백필 보류 |
| `applications` | **이주 대상 아님** — 기존 9건 전부 처리 완료 상태이므로 전환 방식(§2)에 따라 잔존시키지 않는다. 승인 1건 미연결 이상(정합성 이슈)은 이주 전 정리에서 해소 |
| 전 테이블 | `{ schemaVersion: 1, rows }` 봉투로 기록 |

---

## 10. 검증 요구

- **가드 매트릭스**: 전 라우트 × 5역할 (게스트/신청자/회원/발표자·주최자/관리자) — CI 필수
- **병합 규칙**: §5-6·§6-6 — 외부 출석 보존, 부분집합 검증. §7-4 `setAttendees` 예외 동작
- **mutate 경합**: 동시 쓰기 유실 0. **출석 큐 버스트**: 동시 체크인 N건 → 전원 성공 (이벤트당 분할 검증)
- **멱등성**: 전 승인 액션 — 중간 실패 후 재실행 시 누락 단계만 수행, 중복 레코드 0 (`sourceRequestId` 검증)
- **메일**: Bcc 헤더 검증, `mailPrefs` 제외 확인
- **공개 응답 감사**: §3 전 로드 — PII·운영 필드 부재 스냅샷. `publicContact` 외 연락처 부재.
  `/members`에 `withdrawn` 부재. **`/` 세션 분기: 게스트 캐시에 회원 데이터 미혼입**
- **감사 로그**: §1-5 대상 액션 전부 로그 생성 확인
- **탈퇴 수명주기**: 삼중 확인 결여 시 거부 · 신청 즉시 접근 상실 · 보존 집행 시 삭제 중단 ·
  1개월 경과 자동 익명화(이름·학과·roles 외 소거, private-info 완전 삭제) · 참여 기록 해석이 이름·학과로 유지
