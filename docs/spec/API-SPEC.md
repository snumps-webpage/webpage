# SNUMPS 웹페이지 — API 명세 (v0.9)

> **전제**: [`FUNCTIONAL-SPEC.md`](./FUNCTIONAL-SPEC.md) v1.0.
> 데이터 저장소는 **AWS S3** (D0). 모든 기능 ID(PUB-xx, MEM-xx …)는 기능 명세를 참조한다.
>
> **v0.2**: 완전성·일관성 검토(2026-08-25, 검토 결과는 [`SPEC-REVIEW.md`](./SPEC-REVIEW.md)) 반영 전면 개정.
>
> **v0.5**: [`FRONTEND-DECISIONS.md`](./FRONTEND-DECISIONS.md)의 세미나 신청·승인·일정 공개와
> 필드 오류 계약을 반영. 당시 승인 후 추가 메일을 보내지 않는 정책은 v0.9에서 대체됨.
>
> **v0.6**: 스터디 반복 일정·자동 회차 생성을 제거. 주최자가 입력 없는 수동 회차를 만들면
> 서버가 현재 KST 시각의 activity와 active 출석 event를 함께 생성하는 모델로 통일.
>
> **v0.7**: 공개 연락처를 동의 상태가 포함된 구조체로 확정. 현재 학기의 회장·부회장이면서
> `status: granted`인 경우에만 전화번호와 이메일을 공개 DTO로 투영한다.
>
> **v0.8**: `origin/docs/feature-api-spec`의 구현 계층 검토 결과를 v0.7 도메인 결정 위에 재적용.
> S3 409/404 재시도, 출석 큐 복합 키, lazy 만료 판정, 업로드 실측 검증, 탈퇴 유예 인박스와
> REST wire schema를 명시한다. 반복 스터디 일정과 자동 익명화는 계속 제외한다.
>
> **v0.9**: 세미나 메일을 승인 1회 정책에서 수명주기 공지로 변경. 승인 시 `일정 추후 안내`,
> 최초 공개 시 확정 일정, 공개 후 일정 변경·취소 시 변경 공지를 발송한다.
>
> **형식**: 이 앱은 SvelteKit이다. API는 세 층으로 구성된다.
>
> 1. **페이지 로드** (`+page.server.ts load`) — 화면 데이터 공급. SSR/prerender/ISR
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

- 공개 영역 판정은 접두사 매칭이 아니라 **라우트 그룹/명시 목록** 기반
- 가드 테스트 매트릭스: 전 라우트 × **5역할** {게스트, 신청자, 회원, 발표자/주최자, 관리자} (SYS-07)

### 1-2. 응답·에러 규약

- 폼 액션 성공: `{ success: true, ...데이터 }`. 트랜잭션은 성공했으나 부수 메일이 실패한 경우
  `{ success: true, mailFailed: true }` — `MAIL_FAILED`는 에러 코드가 아니라 성공 페이로드 필드다
- 폼 액션 실패: `fail(status, { error: <코드>, issues?, values? })`. 검증 실패는 필드별
  `issues`(폼 전체는 `_form`)와 정규화한 `values`를 반환하고, 권한·존재·서버 오류에는
  둘 다 포함하지 않는다. 한국어 메시지 매핑은 클라이언트 담당
- REST: 성공 `200 { success: true, ... }`, 실패 `4xx/5xx { error: <코드> }`
- 입력 검증: Zod 단일 스키마 (스키마 정의는 데이터 모델과 같은 모듈에서 공유)

에러 코드:

| 코드                   | 의미                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `VALIDATION_FAILED`    | 입력 형식 오류 (자기 자신 전달 등 의미 오류 포함)                        |
| `NOT_FOUND`            | 대상 레코드 없음 / dangling 참조                                         |
| `FORBIDDEN`            | 권한 없음                                                                |
| `CONFLICT`             | 상태 충돌 (이미 처리됨, 중복 제안 등)                                    |
| `WRITE_CONFLICT`       | S3 조건부 쓰기 재시도 소진                                               |
| `SERVICE_UNAVAILABLE`  | 백엔드 의존 서비스 또는 데이터 계층이 아직 준비되지 않음                 |
| `EVENT_NOT_OPEN`       | 이벤트가 신청·출석 가능 상태 아님 (draft/expired/cancelled/시작 후 신청) |
| `STUDY_NOT_RECRUITING` | 모집 중이 아닌 스터디에 참여 신청                                        |

### 1-3. S3 데이터 계층 계약 (SYS-01)

```ts
getTable<T>(name: TableName): Promise<T[]>
mutate<T>(name: TableName, fn: (rows: T[]) => T[]): Promise<T[]>
```

- 저장 형식: **`{ "schemaVersion": 1, "rows": [...] }` 봉투** — 필드 형상 변경 시 리더가 버전 분기
- 테이블당 객체 1개 (`tables/<name>.json.gz`), gzip, 버킷 버전 관리
- `mutate`: GET(ETag) → fn → PUT If-Match, 조건 실패 시 재읽기 재시도(지수 백오프) → `WRITE_CONFLICT`.
  재시도 대상은 412뿐 아니라 409(`ConditionalRequestConflict`)와 If-Match 경합 중 404도 포함한다.
  재시도 상한은 일반 테이블 5회, 동시 체크인 버스트가 발생하는 출석 큐 10회다.
- **예외 — 출석 큐는 이벤트당 객체 분할**: `attendance-queue/<eventId>.json`.
  세미나 시작 직후 N명 동시 체크인이 유일한 실동시성 쓰기 부하이므로 경합 범위를 이벤트 단위로 축소
- 다중 테이블 쓰기는 원자적이지 않다 → 부수효과 큰 쓰기를 마지막에, 각 단계 멱등 (§1-6)
- 레코드 id: **시간순 정렬 가능한 128비트 id (ULID 또는 UUIDv7)**. Notion uuid는 이주 시 1회 매핑 후 폐기

### 1-4. 캐시

| 키                           | 내용           | 무효화                                                     |
| ---------------------------- | -------------- | ---------------------------------------------------------- |
| `table_<name>`               | 테이블 전문    | 해당 테이블 `mutate` 성공 시 **자동** (데이터 계층이 수행) |
| `activities_<start>_<end>`   | 기간 조회 파생 | activities 변경 액션이 명시                                |
| `user_activities_<memberId>` | 회원별 이력    | 해당 회원 출석 변경 액션이 명시                            |
| `all_events`                 | 이벤트 목록    | events 변경 액션이 명시                                    |

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
  - 탈퇴 수명주기: `?/requestWithdrawal`·`?/cancelWithdrawal`(본인 행위지만 파기 트리거), `?/holdWithdrawal`·`?/releaseWithdrawalHold`
- **비대상**: 본인이 본인 개인정보를 읽고 고치는 경로(§4), 세션 훅의 회원 매칭 조회 —
  매 요청 발생하는 조회는 감사 대상에서 명시적으로 제외
- 열람: 별도 UI 없음(1차). S3 콘솔/CLI로 조회. 필요 시 `/admin/audit` 추후 신설

### 1-6. 승인 흐름 멱등성 규약

여러 테이블을 쓰는 승인 흐름의 재실행 안전을 위해:

- 승인이 생성하는 모든 레코드에 **`sourceRequestId`** (원 신청/큐 행 id)를 기록한다
- 각 생성 단계는 **check-before-create**: 같은 `sourceRequestId` 레코드가 이미 있으면 생성 생략, 다음 단계 진행
- 이미 최종 상태인 신청에 대한 재승인 요청은 `CONFLICT`
- 중간 실패 시 동일 요청 재실행이 누락 단계만 채운다 — 중복 레코드 0

---

## 2. 데이터 모델 (S3 테이블)

파일 자산은 `s3Key` 문자열 참조. 날짜: `date`(날짜만, `YYYY-MM-DD`)와 `datetime`(ISO 8601, KST 기준 저장)을 필드별로 구분 명시.

### 학기(term) 파생 규칙 — 단일 정의

`"<YY>-<1|2>"`. **3월~~8월 = 해당 연도 1학기, 9월~~익년 2월 = 해당 연도 2학기** (1~2월은 전년도 `-2`).
datetime → term 변환은 이 규칙의 단일 유틸만 사용. `activities`/`events`에는 term을 저장하지 않고 파생한다.

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
  // holdBy 설정 = 보존 표시(ADM-17). previousStatus는 철회 시 복원용
  "isAlumni": false, // 동문 영구 지위
  "alumniRevoked": false, // 유고 박탈 이력 — true면 setStatus 승격이 isAlumni를 되살리지 않는다
  "roles": [{ "term": "26-1", "title": "회장" }],
  "isAdmin": false,
  "publicContact": null, // 아래 PublicContact | null. 관리자가 당사자 확인 후 설정하는 임원용 공개 상태
  "project": null, // { "title": "string", "url": "string?" } | null — 개인 프로젝트 보드 내용
  "sourceRequestId": null, // ULID | null — 가입 승인 원 신청 ID. 이주 회원은 null
}
```

```ts
type PublicContact =
  | {
      status: "granted";
      phone: string;
      email: string;
      changedAt: string;
      changedBy: string; // 관리자 member ULID
    }
  | {
      status: "revoked";
      phone: null;
      email: null;
      changedAt: string;
      changedBy: string;
    };
```

`granted` 저장 시 정규화된 phone과 email이 모두 필수다. `revoked` 전환 시 두 값을 `null`로
지운다. `changedAt`·`changedBy`는 운영 필드이며 공개 DTO에 포함하지 않는다.

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
  "sourceRequestId": null, // ULID | null — 가입 승인 원 신청 ID. 이주 회원은 null
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
  "sourceRequestId": "ULID | null", // 실제 원 신청 레코드가 있는 생성에만 사용
  "operationId": "UUIDv7 | null", // 원 신청 없는 다중 쓰기(예: 수동 회차)의 멱등 키
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
  "sessionNo": 3, // 수동 스터디 회차 번호. 해당 studyId의 max+1
  "sourceRequestId": "ULID | null",
  "operationId": "UUIDv7 | null",
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
  "kind": "regular | irregular",
  "title": "string",
  "description": "string",
  "prerequisites": "string",
  "duration": "string",
  "attachmentUrl": "https URL | null",
  "presenterIds": ["ULID"], // 'speakerIds' 아님 — 발표자 명칭 전 테이블 통일
  "requesterId": "ULID",
  "status": "pending | approved | rejected | withdrawn",
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
  "transferHistory": [
    { "from": "ULID", "to": "ULID", "at": "datetime", "byAdmin": false },
  ],
  "photos": ["s3Key"],
  "status": "recruiting | ongoing | finished",
  "sourceRequestId": "ULID | null",
}
```

### `seminars` (기록)

```jsonc
{
  "id": "ULID",
  "kind": "regular | irregular",
  "title": "string",
  "semester": "25-2",
  "note": "string",
  "presenterIds": ["ULID"],
  "externalPresenters": "string",
  "materials": ["s3Key"],
  "photos": ["s3Key"],
  "publicationStatus": "unscheduled | scheduled | published | completed | cancelled",
  "schedule": null, // | { "startsAt": "datetime", "endsAt": "datetime | null", "location": "string" }
  "activityId": "ULID | null", // publish 시 기록 — 아카이브↔활동 연결
  "sourceRequestId": "ULID | null",
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
설정된 공개 연락처 필드로, 임원 연락처 표시(PUB-01·05)에 사용한다. 공개 DTO는 현재 학기의
`회장`·`부회장` 역할과 `publicContact.status === "granted"`를 모두 만족할 때만
`{ name, title, phone, email }`을 반환한다. §10 스냅샷 테스트가 이 제약을 검증.

| 로드                                                                                       | 기능              | 데이터                                                                                                  | 렌더                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /` (게스트 분기)                                                                      | PUB-01            | 정적 소개문 + 현 임원 (`members.roles` 최신 term + `publicContact`)                                     | **세션 없는 분기만 ISR(60s).** 세션 있으면 §4-5 대시보드로 분기 — 회원 응답은 캐시 금지 |
| `GET /about` 계열 (`charter`, `charter/history/[period]`, `elections`, `press`, `finance`) | PUB-02~~04·06~~08 | 레포 마크다운 + S3 자산                                                                                 | prerender                                                                               |
| `GET /about/executives`                                                                    | PUB-05            | `roles` 파생 역대 직책 (임기 내림차순) + `publicContact`                                                | ISR(60s)                                                                                |
| `GET /archive/seminars`, `/[id]`                                                           | PUB-09            | `seminars` 학기 그룹 / 단건 + 자료·사진 CDN URL                                                         | ISR(60s)                                                                                |
| `GET /archive/studies`                                                                     | PUB-10            | `studies` 공개 필드만 (운영 필드 제외)                                                                  | ISR(60s)                                                                                |
| `GET /archive/activities`                                                                  | PUB-11            | `activities` — attendeeIds 제외                                                                         | ISR(60s)                                                                                |
| `GET /archive/gallery`                                                                     | PUB-12            | 3테이블 photos, thumb 파생본                                                                            | ISR(60s)                                                                                |
| `GET /archive/projects`                                                                    | PUB-13            | `members` 중 `project != null` — 이름·학과·project 내용                                                 | ISR(60s)                                                                                |
| `GET /archive/misc` 계열, `/archive/problems`, `/archive/discussions`                      | PUB-14            | 마크다운 + S3 PDF                                                                                       | prerender                                                                               |
| `GET /members`                                                                             | PUB-15            | `status !== withdrawn` 회원의 name·department·joinedAt·roles (D2 범위). 응답에는 status를 포함하지 않음 | ISR(60s)                                                                                |

`sitemap.xml`·`robots.txt` 정적 (PUB-16).

---

## 4. MEM — 가입·프로필

### 4-1. `GET /signup` + `POST` (default) — MEM-01

- 가드: `ensureSession` (이미 회원 → 303 `/`)
- GET: 기존 pending 신청 있으면 303 `/signup/edit`
- POST 입력: `name`, `department`, `phone`(정규화 후 검증), `background`. 이메일은 **세션에서 유도** (폼 값 불신)
- 처리: `mutate(applications)` 신규 행 → 관리자 알림 메일 (실패 시 `mailFailed`)
- 에러: `VALIDATION_FAILED`, `CONFLICT`(동일 이메일 신청 행 존재)

### 4-2. `GET /signup/edit` + `POST ?/updateApplication` — MEM-02

- 가드: `ensureSession` + 본인 pending 신청 존재
- GET: 기존 신청 값 프리필
- **POST `?/updateApplication`**: 해당 행 갱신. `?/withdrawApplication`과 공존하므로 SvelteKit 제약상 default 액션을 사용하지 않는다. 에러: `NOT_FOUND`, `CONFLICT`(이미 처리됨)

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
  2. 2단계: 데이터 처리 고지 확인 (`ackDataPolicy: true`) — 1개월 유예와 유예 후 처리 정책 보류 상태 고지
  3. 3단계: **본인 이름 정확 입력** (`confirmName === members.name`)
  - 하나라도 결여 → `VALIDATION_FAILED`. 클라이언트 단계 UI와 무관하게 서버는 원자적으로 3요소 검증
- 처리:
  1. `mutate(members)`: `status: withdrawn`,
     `withdrawal: { requestedAt: now, previousStatus: <직전 status>, holdBy: null, holdAt: null }`
  2. **현 회장단 통지 메일** — 최신 term 회장·부회장의 `private-info.email` 대상 + 관리자 대시보드 표시
  3. 감사 로그 (본인 행위지만 파기 트리거이므로 기록 ✅)
- 효과: **즉시 회원 영역 접근 상실** — 가드가 `withdrawn`(유예 중)을 감지하면 전 회원 라우트에서
  303 → **`/withdraw/pending`** ("탈퇴 처리 중" 안내 페이지)
- **`GET /withdraw/pending` + `POST ?/cancelWithdrawal`** — 본인 철회 (확정):
  - 가드: `ensureSession` + 본인 status `withdrawn`
  - GET: 탈퇴 처리 중 안내 + 유예 종료일 + **하단 철회 버튼**
  - POST: `withdrawal.previousStatus`로 status 복원, `withdrawal: null` → 303 `/`
  - 에러: `NOT_FOUND`(이미 철회·처리됨)

**보류 — 유예 후 익명화 계약:** 1개월 유예 자체는 확정이지만, 탈퇴 후 이름·학과 공개 여부,
내부 활동 통계 보존 범위, `attendeeIds`·`presenterIds`의 회원 ID 유지/익명 ID 교체, 임원 이력
보존 여부가 확정되지 않았다. 결정 전에는 크론 자동 익명화, 공개 DTO 변경, 재가입 연결 규칙을
구현하지 않는다. 확정 후 이 절과 §8-1, §10을 함께 갱신한다.

---

## 5. SEM · EVT · PRES

### 5-1. `GET /seminar/apply` + `POST` (default) — SEM-01

- 가드: `ensureMember`
- **GET: 발표자 피커용 회원 목록 반환** — `{ id, name, department }` 전체 (231행, 클라이언트 필터로 충분)
- POST 입력: `kind`, `title`, `description`, `prerequisites`, `duration`, `attachmentUrl`, `presenterIds[]`
- `kind`: `regular | irregular` 필수. `attachmentUrl`: 빈 값 또는 HTTPS URL
- 신청 단계에서 날짜·시간·장소는 받지 않음
- 처리: `mutate(seminar-requests)` 신규(pending) → 관리자 알림 메일

### 5-2. `GET /seminar/edit/[id]` + 액션 — SEM-02·03

- 가드: `ensureMember` + `requesterId` 본인 (관리자 예외)
- GET: 신청 값 프리필 + 피커용 회원 목록 + 포스터 렌더 데이터 (SEM-03 — 렌더는 클라이언트)
- `POST ?/update`: §5-1과 동일 입력. `POST ?/withdraw`: 본인 pending 신청 철회 → `withdrawn`
- 에러: `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`(이미 처리됨)

### 5-3. `POST /?/applyActivity` · `?/cancelActivity` — EVT-02

- 가드: `ensureMember`. 입력: `eventId`
- 검증: 존재 · `effectiveStatus(event) === active` · `date.start` 미도래
- 처리: `applicantIds` 추가/제거. 멱등
- 에러: `NOT_FOUND`, `EVENT_NOT_OPEN`. 캐시: `all_events`

### 5-4. `GET /events/[pathId]/[attendCode]` + `POST ?/attend` — EVT-01, SEM-05, STU-03

- 가드: `ensureMember`
- GET: `pathId`+`attendCode` 이중 매칭 (불일치 404). 타입별 컨텍스트 (세미나: 발표자 / 스터디: 회차)
- POST 검증: `effectiveStatus(event) === active` — 아니면 `EVENT_NOT_OPEN`
- 처리: `mutate(attendance-queue/<eventId>)` — 기존 행 있으면 `endTime` 기록, 없으면 신규(pending).
  원클릭 완료 시 start=end=now. 완료 시 관리자 알림 메일
- 에러: `NOT_FOUND`, `EVENT_NOT_OPEN`, `CONFLICT`(이미 완료)

### 5-5. `GET /events/manage` — PRES-01·03·04

- 가드: `ensureMember`. **의도된 설계**: 페이지 자체는 회원 접근 가능하되 본인이 발표자인 이벤트만
  반환(비발표자는 빈 목록) — 데이터 필터가 인가 경계이고, 네비 숨김(PRES-03)은 UX일 뿐이다
- 대상은 본인이 `presenterIds`에 포함된 **세미나 타입 이벤트**다. 스터디 회차는 STU-05에서 관리한다.
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
5. 세미나 발송 시점:
   - 승인 성공: `approval` — 일정 미정 개설 공지
   - 최초 공개 성공: `schedule-confirmed` — 확정된 날짜·시간·장소 공지
   - 공개 후 실제 일정 변경: `schedule-changed` — 변경 전·후 값을 함께 공지
   - 공개된 세미나 취소: `cancelled` — 취소 공지
6. 비공개 `scheduleSeminar`, 동일 값 재저장, 이미 완료된 상태 전이 재시도에는 발송하지 않는다.
   상태 쓰기를 먼저 완료한 뒤 메일을 보내므로 응답 유실 후 재시도도 새 상태 전이가 없으면 중복 발송하지 않는다.

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
- 반환: 신청 대기, 참여자, 수동 회차 목록, 전달 상태, 스터디 상태와 각 허용 액션

| 액션                                          | 기능          | 처리                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?/acceptParticipant` / `?/removeParticipant` | STU-04        | pending→participants / 제거. 멱등                                                                                                                                                                                                                                                  |
| `?/setStudyStatus`                            | STU 상태 전이 | `recruiting ↔ ongoing → finished`. finished 전이는 확인 요구                                                                                                                                                                                                                       |
| `?/createSession`                             | STU-06 수동   | 입력은 숨은 `operationId`뿐. 검증: `status != finished`. 서버가 `sessionNo = max+1`, 제목 `${sessionNo}회차`, 현재 KST 시각을 결정하고 ① `activities` 생성(type 스터디) ② `events` 생성(`studyId`, `sessionNo`, `activityId` 연결, active). 둘 모두 `operationId`로 §1-6 멱등 처리 |
| `?/updateSession` / `?/cancelSession`         | STU-06        | 오입력 정정용 제목·일시 수정 / **`status: cancelled`** (expired와 구분 — 재활성화 불가). 연결된 activity/event를 같은 작업에서 함께 변경                                                                                                                                           |
| `?/proposeTransfer`                           | STU-07        | 검증: 대상이 회원 ∧ **본인 아님**(`VALIDATION_FAILED`) ∧ 기존 제안 없음(`CONFLICT`)                                                                                                                                                                                                |
| `?/cancelTransfer`                            | STU-07        | `pendingTransfer = null`                                                                                                                                                                                                                                                           |

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

가입 신청 전량, 세미나·스터디 개설 신청(pending), 출석 큐(pending), 이벤트 전 상태와
**탈퇴 유예 회원 목록** `{ memberId, name, requestedAt, graceEndsAt, holdBy }`를 반환한다.
이벤트 상세에서는 해당 이벤트 큐의 전 상태 행(approved 포함)을 조회해 역반영 작업에 사용한다.

### 7-2. `/admin` 액션

| 액션                                                   | 기능      | 처리                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?/approve`                                            | ADM-01    | ① `private-info` 생성(신청 내용 **전환**) ② `members` 생성(status **associate**) ③ **신청 행 제거**. ①②는 `sourceRequestId` check-before-create — ③ 실패 후 재실행은 기존 레코드를 감지하고 행 제거만 수행. 행이 이미 없으면 `NOT_FOUND` |
| `?/reject`                                             | ADM-01    | 거절 알림 메일 후 **신청 행 제거** (전환 대상 없음)                                                                                                                                                                                      |
| `?/approveSeminar`                                     | ADM-02    | `seminars`(`unscheduled`, request의 `kind`·`presenterIds`, `sourceRequestId`) 멱등 생성 → request `approved` → `일정 추후 안내` 전 회원 공지. activity/event는 아직 생성하지 않음                                                        |
| `?/scheduleSeminar` / `?/publishSeminar`               | ADM-02    | schedule 저장(`scheduled`, 비공개이므로 메일 없음) / activity+active event 멱등 생성(`published`) 후 확정 일정 전 회원 공지. 이미 published면 `CONFLICT`로 중복 공지 방지                                                                |
| `?/updateSeminarSchedule`                              | ADM-02    | 최신 일정을 seminar에 저장. published 상태면 연결된 activity/event도 같은 작업으로 갱신한 뒤 변경 전·후 일정 공지. 공개 전 수정과 동일 값 재저장은 메일 없음                                                                             |
| `?/cancelSeminar`                                      | ADM-02    | published 세미나와 연결 event를 `cancelled`로 전이한 뒤 취소 공지. 이미 cancelled인 요청은 `CONFLICT`로 중복 공지 방지                                                                                                                   |
| `?/rejectSeminar` / `?/approveStudy` / `?/rejectStudy` | ADM-02·16 | 스터디 승인: `studies` 생성(`organizerIds = [requesterId]`, recruiting, `sourceRequestId`) → request `approved` → 알림 메일                                                                                                              |
| `?/activateEvent` / `?/expireEvent` / `?/deleteEvent`  | ADM-04    | 전이 draft↔active↔expired (cancelled는 불가). **deleteEvent**: 해당 `attendance-queue/<eventId>`에 pending 있으면 `CONFLICT`(먼저 처리 요구), 없으면 큐 객체 함께 삭제                                                                   |
| `?/updateEvent`                                        | ADM-04    | 제목·일시·타입 수정 (오입력 정정)                                                                                                                                                                                                        |
| `?/approveAttendance`                                  | ADM-03    | 입력 `(eventId, queueId)`. 이벤트별 큐 객체이므로 두 ID 모두 필수. 이벤트·활동 실재 검증 후 `activities.attendeeIds` 추가 → queue `approved`. 캐시: `activities_*`, `user_activities_<memberId>`                                         |
| `?/rejectAttendance` / `?/deleteAttendanceRecord`      | ADM-03    | 입력 `(eventId, queueId)`. **approved 행에 적용 시 역반영** — `attendeeIds`에서 제거 후 상태 변경/삭제. 캐시 동일                                                                                                                        |
| `?/updateAttendanceTime`                               | ADM-03    | 입력 `(eventId, queueId, startTime, endTime)`. 시각 수정                                                                                                                                                                                 |

### 7-3. 회원 편집 — ADM-07·12

`GET /admin/members` — 목록·검색 (이름/학과/status/직책).
`GET /admin/members/[id]` — 공개 필드 + 개인정보. **열람 자체가 감사 로그** (§1-5).

| 액션                      | 처리                                                                                                           | 감사 로그 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| `?/updateMember`          | name·department·joinedAt·project·**publicContact**                                                             | —         |
| `?/setStatus`             | associate↔regular. regular 승격 시 `isAlumni: true` — 단 **`alumniRevoked: true`면 자동 부여 안 함**           | ✅        |
| `?/revokeAlumni`          | `isAlumni: false` + `alumniRevoked: true`. 사유 필수                                                           | ✅        |
| `?/setRoles`              | 직책 축 갱신                                                                                                   | ✅        |
| `?/setAdmin`              | 부여/회수. 본인 회수 불가                                                                                      | ✅        |
| `?/updatePrivateInfo`     | phone·background·email                                                                                         | ✅        |
| `?/holdWithdrawal`        | ADM-17 — 탈퇴 유예 중 보존 표시: `withdrawal.holdBy = 본인`. 유예 후 정책 확정 시 자동 처리 제외 조건으로 사용 | ✅        |
| `?/releaseWithdrawalHold` | 보존 해제 — 해제 시점부터 1개월 재기산 (`requestedAt` 갱신)                                                    | ✅        |

캐시: 공개 페이지 반영은 ISR TTL(§1-4).

### 7-4. 레코드 편집 — ADM-08~11

각 라우트 `GET` 로드: 대상 테이블 목록 + 편집 폼 현재값 + (필요 시) 회원 피커 목록.

| 라우트              | 액션                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/admin/activities` | `?/create`, `?/update`, `?/delete`, `?/setAttendees` (관리자 전권 덮어쓰기 — 병합 미적용 **명시적 예외**, 확인 다이얼로그)                                                                 |
| `/admin/seminars`   | `?/create`, `?/update`, `?/delete`, `?/addFile`, `?/removeFile`                                                                                                                            |
| `/admin/studies`    | `?/create`, `?/update`, `?/delete`, `?/setOrganizer` (직권 전달 — **진행 중 `pendingTransfer` 자동 해제**, `transferHistory`에 `byAdmin: true`, 감사 로그 ✅), `?/addFile`, `?/removeFile` |
| `/admin/gallery`    | `?/create`, `?/update`, `?/delete`, `?/addPhoto`, `?/removePhoto`                                                                                                                          |

`?/delete`는 참조 무결성 검증 — 참조하는 이벤트·큐가 있으면 `CONFLICT`.

### 7-5. 이벤트 생성·연결 — ADM-04·05

- `POST /admin/events/new` (default): `title`, `date`, `type` → **활동 + 이벤트(draft)** 동시 생성 (`activityId` 연결)
- `POST /admin/events/connect?/publish`: `activityId` 지정 → **활동의 title·date·type을 복사**해 출석 세션 생성(active)

---

## 8. REST 엔드포인트

### 8-1. `GET /api/cron/sync-events` — ADM-06

- 인증: `Bearer <CRON_SECRET>`. **미설정 시 501 (fail-closed)**
- 만료 여부는 저장된 `status`만 믿지 않는다. 신청·출석 검증은 `expiryOf(event)`를 계산한
  `effectiveStatus`를 사용하고, 크론은 표시용 상태를 정리한다.
- 처리: §2 만료 판정 규칙에 따라 active → expired
- 응답: `{ success: true, expired: n }`
- 탈퇴 익명화는 §4-7 정책 보류로 이 크론에 포함하지 않는다.

### 8-2. 업로드 — SYS-03

- `POST /api/uploads/presign` — 가드 `ensureAdmin`
- 입력: `{ operationId, purpose, filename, contentType, size }`. purpose별 타입·크기 상한
  (이미지 10MB, PDF 50MB)
- 응답: `{ success, upload: { url, method: "PUT", headers, expiresAt }, file: { operationId, s3Key, purpose, filename, contentType, size } }`
- presigned PUT은 `Content-Type`을 서명하지만 크기 상한을 서버에서 강제하지 못한다. 등록 액션은
  `HeadObject`로 실제 `Content-Length`와 `Content-Type`을 다시 검증하고, 초과·불일치면 승격을 거부한다.
- 등록은 편집 액션(`?/addFile` 등) 경유한다. 이미지 purpose는 등록 시 파생본을 만들고,
  미등록 키는 7일 후 정리한다.

### 8-3. 관리자 폴링 — `GET /api/admin/{applications, seminar-requests, study-requests}`. 전부 `ensureAdmin`

세 엔드포인트는 `{ success: true, items: T[], generatedAt: datetime }` 봉투를 공유한다.
REST 오류는 `{ error: string }`이다. 이 wire 계약의 실행 시점 스키마는
`src/lib/domain/api.ts`가 소유한다. 페이지 load와 SvelteKit form action은 OpenAPI 대상이 아니며,
각 도메인 모듈의 Zod 입력 스키마와 `PageData`/`ActionData` 생성 타입을 사용한다.

### 8-4. 폐지 — `/diag`, `/notion`, `/api/posters/seminar/png`

---

## 9. 이주 시 데이터 변환 규칙

| 필드                                 | 초기값 규칙                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `members.status`                     | 전원 `associate`. **정회원·동문 간주 금지.** 활동 기록 DB 이주 완료 + 신규 회칙 제공 후 회칙 기준 일괄 재분류                                                          |
| `members.isAlumni` / `alumniRevoked` | 전원 `false` — 재분류 작업에서 부여                                                                                                                                    |
| (경과 조치)                          | 재분류 전까지 status 축은 접근 권한에 영향 없음 — 회원 판정은 레코드 존재 여부                                                                                         |
| `members.roles`                      | Notion `임원` multi_select 파싱 → `{term, title}`                                                                                                                      |
| `members.isAdmin`                    | 현행 하드코딩 명단 → `true`                                                                                                                                            |
| `members.publicContact`              | 기존 값은 자동 승인으로 간주하지 않는다. 관리자가 당사자 동의를 재확인한 현 임원만 `{status:"granted", phone, email, changedAt, changedBy}`로 설정하고, 그 외는 `null` |
| `members.project`                    | `개인 프로젝트` checkbox → 임시 `{ title: "" }` 또는 null — 내용은 추후 입력                                                                                           |
| `members.sourceRequestId`            | 이주 회원은 `null`. 신규 가입 승인 시 applications 원 ID                                                                                                               |
| `private-info.mailPrefs`             | `{ announcements: true }`                                                                                                                                              |
| `private-info.sourceRequestId`       | 이주 개인정보는 `null`. 신규 가입 승인 시 applications 원 ID                                                                                                           |
| `activities.type` / `events.type`    | `Seminar` → `세미나` 통일                                                                                                                                              |
| `studies`                            | `organizerIds` = Notion 주최자 relation, `participantIds: []`, 과거 학기 `finished`                                                                                    |
| `events.applicantIds/presenterIds`   | `[]` — 기존 `Presenters` 백필 보류                                                                                                                                     |
| `applications`                       | **이주 대상 아님** — 기존 9건 전부 처리 완료 상태이므로 전환 방식(§2)에 따라 잔존시키지 않는다. 승인 1건 미연결 이상(정합성 이슈)은 이주 전 정리에서 해소              |
| 전 테이블                            | `{ schemaVersion: 1, rows }` 봉투로 기록                                                                                                                               |

---

## 10. 검증 요구

- **가드 매트릭스**: 전 라우트 × 5역할 (게스트/신청자/회원/발표자·주최자/관리자) — CI 필수
- **병합 규칙**: §5-6·§6-6 — 외부 출석 보존, 부분집합 검증. §7-4 `setAttendees` 예외 동작
- **mutate 경합**: 동시 쓰기 유실 0. **출석 큐 버스트**: 동시 체크인 N건 → 전원 성공 (이벤트당 분할 검증)
- **S3 조건부 쓰기**: 412·409·If-Match 중 404 재시도, 일반 5회·큐 10회 상한 검증
- **멱등성**: 전 승인 액션 — 중간 실패 후 재실행 시 누락 단계만 수행, 중복 레코드 0 (`sourceRequestId` 검증)
- **메일**: Bcc 헤더 검증, `mailPrefs` 제외 확인
- **공개 응답 감사**: §3 전 로드 — PII·운영 필드 부재 스냅샷. `publicContact` 외 연락처와
  `/members`의 withdrawn 회원 부재. **`/` 세션 분기: 게스트 캐시에 회원 데이터 미혼입**
- **감사 로그**: §1-5 대상 액션 전부 로그 생성 확인
- **탈퇴 수명주기**: 삼중 확인 결여 시 거부 · 신청 즉시 접근 상실 · 보존 표시·철회 검증.
  1개월 경과 후 익명화와 활동 이력 해석 테스트는 §4-7 정책 확정 전 추가하지 않는다.
