# 백엔드 구현 스펙 (v1.2)

> 기반: [`API-SPEC.md`](./API-SPEC.md) v0.4 · [`BACKEND-TASKS.md`](./BACKEND-TASKS.md) v1.
> 이 문서는 각 Phase의 **구현 계층 디테일** — 파일 배치, 시그니처, 알고리즘, 설정, 테스트 설계 — 를 규정한다.
> 기존 코드 컨벤션(`withCache`/`invalidateCache`, `handleUserAction`/`handleAdminAction` 래퍼,
> Repository 패턴, `$env/dynamic/private`)을 따른다. 별도 세션의 리팩터링 결과와 이름이 충돌하면
> **이 문서의 계약(시그니처·의미)을 유지한 채 배치만 조정**한다.

---

## Phase 0 — 기반

### BE-01 테스트 스크립트

```jsonc
// package.json scripts 추가
"test": "vitest run",
"test:watch": "vitest",
```

- 기존 `vitest.config.ts` 유지. 테스트 파일 규약: 구현 파일 옆 `*.test.ts` (기존 `notion/utils.test.ts` 관례)
- CI: GitHub Actions `.github/workflows/ci.yml` — `lint` + `check` + `test` 3잡. push/PR 트리거

### BE-02 Terraform (`infra/`)

```
infra/
├── main.tf          # provider, backend(s3 state)
├── buckets.tf       # 버킷 2 + 정책 + 수명주기
├── cloudfront.tf    # 배포 + OAC
├── iam.tf           # 역할 2 + 정책
├── monitoring.tf    # 알람 + Budgets + CloudTrail 데이터 이벤트
└── variables.tf
```

리소스 명세 (리전 `ap-northeast-2`):

| 리소스 | 이름 | 핵심 설정 |
|---|---|---|
| `aws_s3_bucket` | `snumps-assets` | 퍼블릭 차단, 버전 관리 on, SSE-S3 |
| `aws_s3_bucket` | `snumps-data-private` | 퍼블릭 차단, 버전 관리 on, **SSE-KMS**(전용 키, **Bucket Keys on** — KMS 요청 비용 절감) |
| lifecycle (공통) | | 비현재 버전 90일 삭제 · 미완료 멀티파트 7일 중단 |
| lifecycle (assets) | | `uploads/pending/` 프리픽스 7일 삭제 (§8-2 고아 정리) |
| `aws_cloudfront_distribution` | | 오리진 `snumps-assets` + OAC, PriceClass_200, 자동 압축 on |
| `aws_iam_role` | `snumps-runtime` | Vercel OIDC federation trust. 권한은 아래 **런타임 권한 인벤토리** 전체 |
| `aws_iam_role` | `snumps-migration` | 사람 실행용. 두 버킷 전권 + `backups/*`. 이주 후 비활성화 |
| `aws_budgets_budget` | | 월 한도 + 이메일 알림 |

**`snumps-runtime` 권한 인벤토리** — 코드가 부르는 S3/KMS API 전수 대응 (누락 시 런타임 403):

| 권한 | 리소스 | 근거 호출 |
|---|---|---|
| `s3:GetObject`, `s3:PutObject` | `snumps-data-private/tables/*` | getTable · mutate (If-Match는 양쪽 다 요구) |
| `s3:PutObject` | `snumps-data-private/audit/*` | audit() — Put만, Get/Delete 없음 |
| `s3:DeleteObject` | `snumps-data-private/tables/attendance-queue/*` | deleteQueue (deleteEvent) |
| **`s3:ListBucket`** | `snumps-data-private` (prefix 조건 `tables/*`) | listPendingQueues의 listKeys. **부수 효과 — 이게 없으면 미존재 키 GetObject가 404 대신 403을 반환**해 mutate의 "404 → 신규 봉투 생성" 부트스트랩이 깨진다 |
| `s3:GetObject`, `s3:PutObject` | `snumps-assets/*` | presign · CopyObject(src/dst) · 파생본 Put · HeadObject 크기 검증 |
| **`s3:DeleteObject`** | `snumps-assets/uploads/pending/*` | 업로드 승격의 Copy+Delete (BE-52) |
| **`kms:Decrypt`, `kms:GenerateDataKey`** | data 버킷 전용 KMS 키 | SSE-KMS 버킷의 모든 Get/Put이 요구 |

위 표 밖의 Delete·정책 변경 권한은 일절 부여하지 않는다.

### BE-03 SDK·환경변수

의존성: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@vercel/functions`(OIDC — `awsCredentialsProvider`).
🔴 **`@sveltejs/adapter-vercel` ≥ 6.3.2로 잠금** — 이전 버전에 ISR 캐시 기만 취약점(SvelteSpill).
lockfile 실제 해석 버전 확인이 Phase 0 완료 조건.

```bash
# .env.example 추가분
AWS_REGION=ap-northeast-2
S3_DATA_BUCKET=snumps-data-private
S3_ASSETS_BUCKET=snumps-assets
ASSETS_CDN_URL=https://<cloudfront-domain>
CRON_SECRET=
# OIDC면 키 불요. 키 방식 폴백: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
```

`docs/SETUP.md` 갱신 동반 (기존 `NOTION_DB_EVENTS`·`ATTENDANCE_QUEUE` 누락 이슈의 재발 방지 —
**env를 추가하는 커밋이 SETUP.md를 같이 고치지 않으면 리뷰에서 반려**).

### BE-05 공통 모듈

```
src/lib/server/core/
├── errors.ts     # 에러 코드 상수 + AppError
├── id.ts         # newId()
└── semester.ts   # termOf(), currentTerm(), termRange()
```

```ts
// errors.ts
export const ERR = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  WRITE_CONFLICT: "WRITE_CONFLICT",
  EVENT_NOT_OPEN: "EVENT_NOT_OPEN",
  STUDY_NOT_RECRUITING: "STUDY_NOT_RECRUITING",
} as const;
export type ErrCode = keyof typeof ERR;
export class AppError extends Error {
  constructor(public code: ErrCode, public status = 400) { super(code); }
}
// 액션 래퍼(handleUserAction/handleAdminAction)가 AppError를 잡아 fail(status, {error: code})로 변환

// id.ts — ulid 패키지 (또는 uuidv7). 계약: 시간순 정렬, 26자/36자 문자열
export function newId(): string;

// semester.ts — API-SPEC §2 단일 정의
export function termOf(d: Date): string;          // 3~8월 → "YY-1", 9~익2월 → "YY-2"
export function currentTerm(now?: Date): string;
export function termRange(term: string): { start: Date; end: Date };
```

전화번호 정규화·KST 유틸은 기존 것 재사용 (`getKSTDate` 등 — 위치는 리팩터링 결과 따름).

---

## Phase 1 — S3 데이터 계층

### 파일 배치

```
src/lib/server/data/
├── s3.ts             # 저수준 S3 클라이언트 (이 파일 밖에서 SDK 직접 사용 금지)
├── tables.ts         # getTable / mutate / 큐 분할
├── schemas/
│   ├── index.ts      # TableName 유니온, TABLES 레지스트리
│   ├── member.ts     # MemberSchema + type Member (테이블당 1파일)
│   └── ...           # privateInfo, activity, event, application, seminarRequest,
│                     #   studyRequest, study, seminar, galleryDinner, attendanceRecord
├── audit.ts          # 감사 로그
└── idempotency.ts    # ensureCreated 헬퍼
```

### BE-10 스키마

```ts
// schemas/index.ts
export const TABLES = {
  members: MemberSchema,
  "private-info": PrivateInfoSchema,
  activities: ActivitySchema,
  events: EventSchema,
  applications: ApplicationSchema,
  "seminar-requests": SeminarRequestSchema,
  "study-requests": StudyRequestSchema,
  studies: StudySchema,
  seminars: SeminarSchema,
  "gallery-dinner": GalleryDinnerSchema,
} as const;
export type TableName = keyof typeof TABLES;
export type RowOf<N extends TableName> = z.infer<(typeof TABLES)[N]>;

export const envelope = <S extends z.ZodTypeAny>(row: S) =>
  z.object({ schemaVersion: z.literal(1), rows: z.array(row) });
```

- 필드는 API-SPEC §2 그대로. `datetime`은 `z.string().datetime({ offset: true })` — **KST 오프셋 포함 저장**.
  `date`는 `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
- enum은 `z.enum([...])` 닫힌 집합. `activities.type`과 `events.type`은 **같은 상수 배열 공유**
- 프론트 노출용 파생 타입(공개 필드 subset)은 `MemberSchema.pick(...)`으로 스키마에서 유도 —
  공개 필드 목록을 손으로 두 번 쓰지 않는다 (§3 공개 제약의 단일 원천)

### BE-11 `s3.ts` + `tables.ts`

```ts
// s3.ts — 내부 전용
export async function getObjectWithEtag(bucket: string, key: string, ifNoneMatch?: string):
  Promise<{ status: 200; body: Uint8Array; etag: string } | { status: 304 } | { status: 404 }>;
export async function putObjectIfMatch(bucket: string, key: string, body: Uint8Array,
  opts: { ifMatch?: string; ifNoneMatch?: "*"; contentType: string; contentEncoding?: string }):
  Promise<{ etag: string }>;   // 412 → PreconditionFailedError throw
export async function deleteObject(bucket: string, key: string): Promise<void>;
export async function listKeys(bucket: string, prefix: string): Promise<string[]>;
```

```ts
// tables.ts
const keyOf = (name: TableName) => `tables/${name}.json.gz`;
const queueKeyOf = (eventId: string) => `tables/attendance-queue/${eventId}.json.gz`;

export async function getTable<N extends TableName>(name: N): Promise<RowOf<N>[]>;
export async function mutate<N extends TableName>(
  name: N, fn: (rows: RowOf<N>[]) => RowOf<N>[] | Promise<RowOf<N>[]>,
): Promise<RowOf<N>[]>;

// 출석 큐 (이벤트당 객체 — TableName 밖 별도 API)
export async function getQueue(eventId: string): Promise<AttendanceRecord[]>;
export async function mutateQueue(eventId: string,
  fn: (rows: AttendanceRecord[]) => AttendanceRecord[]): Promise<AttendanceRecord[]>;
export async function deleteQueue(eventId: string): Promise<void>;   // deleteEvent 전용
export async function listPendingQueues(): Promise<{ eventId: string; rows: AttendanceRecord[] }[]>;
// ^ /admin 대시보드용: listKeys("tables/attendance-queue/") → 병렬 getQueue → pending 필터
```

**`mutate` 알고리즘** (getQueue/mutateQueue 동일):

```
maxAttempts = 테이블 5 | 출석 큐 10                 # 큐는 동시 체크인 버스트 대상
for attempt in 0..maxAttempts-1:
  {body, etag} = getObjectWithEtag(key)          # 404면 { schemaVersion:1, rows:[] } + ifNoneMatch:"*" 생성 경로
  env = envelope.parse(gunzip(body))              # schemaVersion 분기 지점
  next = await fn(structuredClone(env.rows))
  if deepEqual(next, env.rows): return next       # no-op 쓰기 생략 (멱등 액션 최적화)
  try:
    putObjectIfMatch(key, gzip({schemaVersion:1, rows:next}), {ifMatch: etag})
    invalidateCache(`table_${name}`)              # BE-12: 자체 키 자동 무효화
    return next
  except PreconditionFailed(412)
       | ConditionalRequestConflict(409)          # S3는 동시 조건부 PUT에 409도 반환한다
       | NotFound(404, If-Match 경합 중 삭제):
    sleep(50ms * 2^attempt + jitter(0~50ms))      # 지수 백오프
throw new AppError("WRITE_CONFLICT", 503)
```

- **읽기 캐시**: `getTable` = `withCache("table_" + name, TTL_TABLE, fetcher)`. `TTL_TABLE = 300s`(Redis).
  **단 `table_*` 키의 로컬 메모리 TTL은 15s로 캡** — `invalidateCache`는 자기 인스턴스의 로컬 캐시만 비우므로,
  다른 warm 인스턴스가 최대 5분 옛 상태를 보여주는 것(승인 직후 목록 미갱신)을 15초로 줄인다.
  정확성은 무관 — mutate는 캐시 우회 + If-Match라 중복 승인은 `CONFLICT`로 막힌다
  페처는 로컬 ETag 보관 시 `ifNoneMatch` 조건부 GET → 304면 캐시 유지
- `mutate`는 **캐시를 우회**하고 항상 S3에서 직접 읽는다 (ETag 일관성)
- gzip: Node `zlib` (`gzipSync`/`gunzipSync`). `Content-Encoding: gzip`, `Content-Type: application/json`

### BE-13 `audit.ts`

```ts
export type AuditAction =
  | "private-info.read" | "private-info.update"
  | "member.set-status" | "member.set-roles" | "member.set-admin" | "member.revoke-alumni"
  | "study.set-organizer"
  | "withdrawal.request" | "withdrawal.cancel" | "withdrawal.hold" | "withdrawal.release-hold"
  | "withdrawal.auto-anonymize";

export async function audit(entry: {
  actorMemberId: string | "system";   // 크론 = "system"
  action: AuditAction;
  targetTable: TableName | "attendance-queue";
  targetId: string;
  detail?: Record<string, unknown>;    // PII 원문 금지 — 변경 필드명만
}): Promise<void>;
// 구현: putObject(`audit/${yyyy-mm-dd}/${newId()}.json`) — If 조건 불요 (키 유일)
// 실패 시: 본 트랜잭션을 깨지 않되 console.error — 단 withdrawal.* 계열은 실패 시 본 액션도 실패 (파기 추적 필수)
```

### BE-14 `idempotency.ts`

```ts
// §1-6: check-before-create
export async function ensureCreated<N extends TableName>(
  name: N, sourceRequestId: string, build: () => RowOf<N>,
): Promise<RowOf<N>> {
  return 기존 = rows.find(r => r.sourceRequestId === sourceRequestId) ?? mutate로 build() 추가;
}
```

승인 흐름은 `ensureCreated`를 단계 순서대로 나열 — 각 단계가 자체 재실행 안전.

### BE-15 검증 (테스트 설계)

| 테스트 | 방법 |
|---|---|
| `tables.test.ts` 경합 | S3 목(in-memory, ETag 시뮬레이션) 위에서 `Promise.all([mutate A, mutate B])` — 두 변경 모두 잔존 |
| 큐 버스트 | mutateQueue 20개 동시 — 20행 전부 존재, WRITE_CONFLICT 0 |
| 봉투 | `schemaVersion: 2` 객체 파싱 시 명시 에러 (조용한 손상 금지) |
| 재시도 소진 | put이 항상 412 → 5회 후 `WRITE_CONFLICT` |

S3 목: `s3.ts`와 동일 시그니처의 `s3.mock.ts` (Map 기반, ETag = 내용 해시). vitest에서 모듈 목킹.

---

## Phase 2 — 인증·가드

### BE-20 가드 재작성

라우트 그룹 채택 + **`route.id` 기반 판정** (경로 문자열 접두사 매칭 폐지):

```
src/routes/
├── (public)/          # /, /about/*, /archive/*, /members, /login
├── (applicant)/       # /signup, /signup/edit, /wait
├── (member)/          # 대시보드 분기, /settings/*, /seminar/*, /study/*, /events/*, /withdraw/pending
└── (admin)/admin/*
```

```ts
// hooks.server.ts — membershipGuard 대체
if (event.route.id === null) return resolve(event);  // 미매칭 URL — SvelteKit 404에 위임 (500 오염 금지)
const zone = event.route.id.split("/")[1];   // "(public)" | "(applicant)" | "(member)" | "(admin)" | "api"
switch (zone) {
  case "(public)":
    // 예외: "/"는 하이브리드 — 세션 있으면 member 해석 + withdrawn 리디렉트 후 대시보드 분기.
    // 그 외 공개 라우트는 세션 해석 생략 (BE-23, prerender 보장)
    return resolve(event);
  case "(applicant)":
    ensureSession 수준;
    if (locals.member?.status === "withdrawn") → 303 /withdraw/pending;   // 유예 중 /signup 재신청 차단
    if (locals.member && status !== "withdrawn") → 303 /;                  // 기존 회원의 /signup 진입
  case "(member)":
    locals.member 주입 (BE-21);
    if (!member) → 신청 유무 따라 /signup | /wait;
    if (member.status === "withdrawn") → route.id가 withdraw/pending이 아니면 303 /withdraw/pending;
  case "(admin)": member?.isAdmin || throw error(404);
  case "api": return resolve(event);   // 인증은 엔드포인트별 — cron: Bearer, uploads·admin: 핸들러 내 ensureAdmin
  default: throw error(500, "route without zone");   // id는 있는데 그룹이 없는 라우트 = 실수. fail-closed
}
```

- `/api/*`는 라우트 그룹에 넣지 않는다 (URL에 그룹이 안 남아 무의미) — zone `"api"`로 훅 통과,
  **각 핸들러가 첫 줄에서 자체 인증** (`ensureAdmin` / Bearer 검사). 가드 매트릭스에 `/api/*`도 포함
- withdrawn 익명화 이후에는 `resolveMember`가 null (private-info 삭제) → 자연히 게스트/신청자 취급 —
  "재가입은 신규 회원" 경로와 일치

- `/` 이중 모드: `(public)/+page.server.ts`가 세션 존재 시 `(member)` 대시보드 데이터로 분기 —
  구현은 **동일 라우트 내 조건 분기가 아니라** `(public)/+page` = 게스트 전용, 세션 있으면 303 `/dashboard`…는
  URL 확정(§9)과 충돌하므로 **분기 방식 채택**: `+page.server.ts`에서 세션 검사 후 게스트/대시보드 데이터 분기,
  ISR 설정은 걸지 않고 게스트 분기 응답에만 `cache-control` 수동 부여. §Phase 5 참조
- `ensureAdmin`: 기존 `admin.ts`의 이메일 명단 → **`locals.member.isAdmin`** (D4). `admin.ts` 삭제
- `ensurePresenter(eventId)` / `ensureOrganizer(studyId)`: 액션 내부 헬퍼 —
  `getTable("events"/"studies")`에서 재조회 후 포함 검사. locals 캐시 불신

```ts
// app.d.ts
interface Locals {
  auth(): Promise<Session | null>;
  member: { memberId: string; isAdmin: boolean; status: MemberStatus; name: string } | null;
}
```

### BE-21 세션 훅 회원 매칭

```ts
// 이메일 → memberId 해석. private-info 전량을 withCache("table_private-info")로 받아 메모리 매칭
// (240행 — 인덱스 불요). 감사 비대상 (§1-5)
async function resolveMember(email: string): Promise<Locals["member"]>;
```

### BE-24 가드 매트릭스 테스트

```ts
// src/hooks.guard.test.ts — 테이블 주도
const MATRIX: Array<[routeId: string, role: Role, expect: "ok" | `redirect:${string}` | "404"]> = [
  ["/(public)/about/charter", "guest", "ok"],
  ["/(member)/study/[id]/manage", "guest", "redirect:/login"],
  ["/(admin)/admin/members", "member", "404"],
  // ... 전 라우트 × 5역할. 라우트 목록은 glob으로 수집해 MATRIX 누락 시 테스트 실패
];
```

역할 주입: 기존 `dev-preview.ts` 세션 빌더 재사용 + `withdrawn`/발표자 목 데이터.
**glob 수집 → MATRIX에 없는 라우트 발견 시 실패** — 신규 라우트가 조용히 미분류되는 것을 차단.

---

## Phase 3 — 저장소 전환

### BE-30 Repository 전환

기존 `repositories/` 패턴 유지, 내부만 교체:

```
src/lib/server/repositories/
├── MemberRepository.ts      # findByEmail → private-info 매칭, findAll, pickers()
├── ActivityRepository.ts    # byTerm(term), all, addAttendees/removeAttendees(병합 유틸 사용)
├── EventRepository.ts       # byPath(pathId, code), active(), byStudy(studyId)
├── SeminarRepository.ts / StudyRepository.ts / RequestRepositories.ts
└── QueueRepository.ts       # getQueue 래핑
```

- 모든 조회는 `getTable` + 메모리 필터. **인덱스·쿼리 계층 만들지 않는다** (605행 — API-SPEC §1-3 임계값 주석을 코드에 남김)
- `getLatestExecutives`류: `members.roles`에서 `currentTerm()` 매칭 + `publicContact` — private-info 접근 제거

### BE-31 쓰기 호출부 매핑

| 라우트 | 기존 호출 | 대체 |
|---|---|---|
| `signup`, `signup/edit` | `createApplication`/`updateApplication` | `mutate(applications)` |
| `seminar/apply`, `seminar/edit/[id]` | seminar-request CRUD | `mutate(seminar-requests)` |
| `events/[id]/[type]` | `recordAttendance` | `mutateQueue(eventId)` |
| `admin` 11개 액션 | notion 함수 군 | §7-2 알고리즘 (아래) |
| `admin/events/new`, `connect` | `createEvent`/`publishEvent` | `mutate(activities)`+`mutate(events)` |
| `api/cron/sync-events` | `syncEventStatuses` | BE-35 |
| `+page` `updateProfile` | `updatePrivateInfo` | `mutate(private-info)` |

### BE-32~33 승인 흐름 알고리즘 (대표: `approveSeminar`)

```ts
handleAdminAction(locals, async () => {
  const req = (await getTable("seminar-requests")).find(r => r.id === id);
  if (!req) throw new AppError("NOT_FOUND", 404);
  if (req.status !== "pending") throw new AppError("CONFLICT", 409);

  const activity = await ensureCreated("activities", req.id, () => ({
    id: newId(), title: req.title, date: { start: todayKST, end: null },
    type: "세미나", attendeeIds: [...req.presenterIds], sourceRequestId: req.id }));
  const event = await ensureCreated("events", req.id, () => ({
    id: newId(), ..., status: "active", activityId: activity.id,
    presenterIds: req.presenterIds, applicantIds: [],
    pathId: randomToken(8), attendCode: randomToken(8), sourceRequestId: req.id }));
  await ensureCreated("seminars", req.id, () => ({ ..., activityId: activity.id }));
  await mutate("seminar-requests", rows => setStatus(rows, id, "approved"));
  const mailFailed = !(await sendSeminarAnnouncement(...));
  // ^ Phase 3(BE-33) 시점에는 no-op 스텁(항상 true 반환·로그만). 실제 발송은 BE-45(M4)가 구현을 채운다 —
  //   M3가 M4 코드에 의존하지 않기 위한 명시적 순서 결정. 실패는 어차피 비전파
  return { mailFailed };
}, { invalidate: ["all_events"] });
```

`approve`(가입)는 마지막 단계가 **행 제거**: `mutate(applications, rows => rows.filter(r => r.id !== id))`.
재실행: 행 없음 + `sourceRequestId` 레코드 존재 → `CONFLICT`(이미 완료) 반환.

### BE-34 출석 병합 유틸 (공용 — BE-44·51·§7-2가 공유)

```ts
// src/lib/server/attendance.ts — 순수 함수 (단위 테스트 대상)
export function mergeAttendees(current: string[], allowedPool: string[], selected: string[]): string[] {
  if (!selected.every(id => allowedPool.includes(id))) throw new AppError("VALIDATION_FAILED");
  const outside = current.filter(id => !allowedPool.includes(id));
  return [...new Set([...outside, ...selected])];
}
export function invalidateAttendanceCaches(activityDate: DateRange, memberIds: string[]): void;
// activities_${termRange} + user_activities_${id} 전부
```

### BE-35 크론

**BE-35의 범위는 크론 골격 + expire 단계 + lazy 판정 유틸까지다.** 회차 생성(2)은 BE-49가,
익명화(3)는 BE-41이 각각 크론에 **단계를 추가**한다 — Phase 3의 BE-35가 Phase 4 코드를 참조하지 않는다
(단계 레지스트리: `cronSteps: Array<() => Promise<Record<string, number>>>`에 각 태스크가 등록).

```ts
// syncEvents() — 각 단계 독립 try/catch, 결과 카운트 수집
1. expire (BE-35):  mutate(events, rows => rows.map(e =>
     e.status === "active" && expiryOf(e) < now ? { ...e, status: "expired" } : e))
   // expiryOf(e) = e.date.end ?? endOfDayKST(e.date.start)
2. generate (BE-49가 등록): studies.schedule 중 date <= now && !generatedEventId
   → createStudySession(study, entry.date, { autoGenerated: true })
   → mutate(studies)로 generatedEventId 기록 (events 먼저, schedule 나중 — §2)
3. anonymize — 🔶 구현 보류 (BE-41 비고 참조. 보류 해제 시 이 단계로 등록)
```

🔴 **lazy 판정이 1차 방어** (API-SPEC §8-1): 신청·출석 검증은 `event.status` 저장값이 아니라
`expiryOf(e) < now` 계산을 쓴다 — `EventRepository`가 `effectiveStatus(e)`를 제공하고 가드·액션은 그것만 참조.
크론의 expire는 표시용 상태 정리다.

**크론 주기 — 플랜 제약**: Vercel Hobby는 **일 1회**가 상한(시간당은 Pro 전용).
- Hobby: 현행 `0 15 */2 * *` → `"0 15 * * *"`(일 1회)로. lazy 판정 덕에 정확성 문제 없음.
  회차 자동 생성 최대 1일 지연이 수용 불가하면 GitHub Actions cron이 `Bearer CRON_SECRET`으로
  `/api/cron/sync-events`를 시간당 호출 (엔드포인트 인증 모델이 이미 이를 지원)
- Pro: `"0 * * * *"` 직접 설정

---

## Phase 4 — 신규 기능

### BE-41 탈퇴 수명주기

```ts
// src/lib/server/withdrawal.ts
export async function requestWithdrawal(memberId: string,
  ack: { info: boolean; dataPolicy: boolean; confirmName: string }): Promise<void>;
// 1) 3요소 검증 (confirmName === member.name — trim 후 완전 일치)
// 2) 주최 스터디 검사: studies.some(s => s.organizerIds.includes(memberId) && s.status !== "finished") → CONFLICT
// 3) mutate(members): status="withdrawn", withdrawal={requestedAt, previousStatus, holdBy:null, holdAt:null}
// 4) audit("withdrawal.request")  — 실패 시 전체 실패
// 5) notifyExecutives(member) — 최신 term 회장·부회장의 private-info email로. 실패 → mailFailed

export async function cancelWithdrawal(memberId: string): Promise<void>;
export async function holdWithdrawal(targetId: string, adminId: string): Promise<void>;
export async function releaseHold(targetId: string, adminId: string): Promise<void>;  // requestedAt = now 재기산

// 🔶 구현 보류 (2026-08-28, API-SPEC §4-7 보류 블록) — 아래 함수는 작성하지 않는다.
//    크론에 익명화 단계 미탑재. 유예 경과 후에도 상태 유지, 철회 계속 가능.
//    설계는 보류 해제 시의 계약으로 남긴다.
export async function anonymizeExpiredWithdrawals(now: Date): Promise<number> {
  // 대상: withdrawn && !holdBy && requestedAt + 30일 < now && 미익명화(private-info 행 존재로 판정)
  // 순서(각 단계 멱등):
  //   a. mutate(private-info): 해당 행 filter 제거          ← PII 소거가 최우선
  //   b. mutate(members): joinedAt/publicContact/project → null, statusChangedAt 갱신
  //      (name/department/status/roles/isAlumni 유지)
  //   c. audit("withdrawal.auto-anonymize", actor: "system")
}
```

라우트: `(member)/settings/withdraw/+page.server.ts` (GET 안내 + `?/requestWithdrawal`),
`(member)/withdraw/pending/+page.server.ts` (GET: 삭제 예정일 = requestedAt+30일, `?/cancelWithdrawal`).
가드 특례: `withdrawn` 리디렉트 대상에서 `/withdraw/pending` 제외 (BE-20).

### BE-43~44 이벤트 신청·발표자 관리

- `applyActivity`: `mutate(events, ...)` — 검증 `status==="active" && now < date.start`, `applicantIds` Set 추가. no-op 시 mutate가 쓰기 생략
- `/events/manage` load:
  ```
  events = EventRepository.all() 중 presenterIds ∋ me && isSeminarType
  members = MemberRepository.pickers()
  각 이벤트: currentAttendees = activities에서, checked = applicantIds ∩ currentAttendees
  attendUrl = `${origin}/events/${pathId}/${attendCode}`
  ```
- `saveAttendance`: `ensurePresenter` → `mergeAttendees(current, applicantIds, selected)` →
  `mutate(activities)` → `invalidateAttendanceCaches`

### BE-45 메일

```ts
// mail/client.ts 확장 — 기존 4개 호출부 시그니처 불변 (opts 옵셔널)
export async function dispatchEmail(recipients: string[], subject: string, body: string,
  opts?: { bcc?: boolean }): Promise<void>;
// bcc: true → To: 발신 계정, Bcc: recipients. 헤더 조립부만 분기

// mail/templates.ts 추가
export async function sendSeminarAnnouncement(seminar): Promise<boolean> {
  const infos = await getTable("private-info");
  const recips = [...new Set(infos
    .filter(i => i.email && i.mailPrefs.announcements !== false).map(i => i.email))];
  for (const batch of chunk(recips, 80))            // Gmail 수신자 한도 여유값
    await dispatchEmail(batch, subject, bodyWithOptoutLink, { bcc: true });
  // ⚠️ 발신 계정 전제: Google Workspace(일 2,000 수신자). 소비자 gmail.com은 일 500 —
  //   230명 공지 2회로 소진 + 대량 Bcc가 정지 트리거. 계정 유형을 SETUP.md에 명기
  // 배치 실패: 로그 + false 반환 (부분 실패도 false). 재시도 없음 — 승인 재실행이 재발송하지 않도록
  //   ensureCreated 이후 단계이므로 재실행 시 메일 단계 도달 전 CONFLICT
}
export async function notifyExecutives(...);        // BE-41
export async function sendStudyRequestNotification(...);
```

옵트아웃 링크: `${origin}/settings/notifications` 고정 URL (토큰 없음 — 로그인 요구가 사양).

### BE-47~51 스터디

```ts
// src/lib/server/studies.ts
export async function createStudySession(study: Study, date: string,
  opts: { title?: string; autoGenerated: boolean }): Promise<Event> {
  if (study.status === "finished") throw new AppError("CONFLICT");
  const sessionNo = max(existingSessions(study.id).map(e => e.sessionNo), 0) + 1;
  const activity = await ensureCreated("activities", `${study.id}:${date}`, ...);  // 회차 근거 키
  const event = await ensureCreated("events", `${study.id}:${date}`, () => ({
    ..., type: "스터디", studyId: study.id, sessionNo, activityId: activity.id, status: "active" }));
  return event;
}
```

- `sourceRequestId`에 **`${studyId}:${date}` 복합 키** — 크론·수동 중복 생성 차단의 실체
- `proposeTransfer`: `toMemberId === me → VALIDATION_FAILED`, `pendingTransfer != null → CONFLICT`
- `acceptTransfer`: `mutate(studies)` 단일 호출 안에서 organizerIds 교체 + history push + pendingTransfer 해제 + participants 보장 — 원자적
- `setOrganizer`(관리자): 동일 + `pendingTransfer = null` + `byAdmin: true` + `audit("study.set-organizer")`

### BE-52 업로드

```ts
// /api/uploads/presign/+server.ts
const PURPOSES = {
  "seminar-material": { prefix: "seminars", types: ["application/pdf"], max: 50_000_000 },
  "seminar-photo":    { prefix: "seminars", types: IMG, max: 10_000_000 },
  "study-photo":      { prefix: "studies",  types: IMG, max: 10_000_000 },
  "gallery-photo":    { prefix: "gallery",  types: IMG, max: 10_000_000 },
};
// s3Key = `uploads/pending/${purpose}/${newId()}-${slug(filename)}.${ext}`   ← lifecycle 7일 대상
// presigned PUT 600s, Content-Type·Content-Length 조건 서명에 포함
```

등록(`?/addFile` 등) 시:
1. 🔴 **`HeadObject`로 실측 검증** — Content-Length가 purpose 상한 초과 또는 Content-Type 불일치 →
   `VALIDATION_FAILED`, 승격 중단 (pending 객체는 수명주기 7일 정리).
   presigned PUT은 크기를 서버측 강제하지 못하므로 **이 단계가 실제 상한 강제 지점**이다
2. `uploads/pending/...` → 정식 키 `${prefix}/${recordId}/${hash8}-${slug}.${ext}`로 **CopyObject + Delete**
   (pending Delete 권한은 BE-02 인벤토리에 포함)
3. 이미지면 파생본 생성: `sharp`로 thumb(400w)/display(1200w) webp — Vercel 함수 내 처리 (1에서 상한 검증됨)
4. `mutate`로 레코드 file 배열에 정식 키 추가

### BE-53~55 관리자 편집

- 각 라우트 load: `getTable` 전량 + 피커 목록. 페이지네이션은 기존 `Pagination` 컴포넌트/클라이언트 측 — 서버 페이징 없음 (605행)
- `?/delete` 참조 검증: activities ← events.activityId·gallery.activityId / studies ← events.studyId. 참조 존재 → `CONFLICT`
- `deleteEvent`: `getQueue(eventId)`에 pending 존재 → `CONFLICT`; 없으면 `mutate(events)` 제거 + `deleteQueue(eventId)`
- `setStatus` 승격 로직: `status: "regular"` && `!alumniRevoked` → `isAlumni = true`. `statusChangedAt = now`

---

## Phase 5 — 공개 영역

### 렌더 전략 구현 (Vercel 어댑터)

```ts
// (public)/about/... 등 정적 페이지
export const prerender = true;

// (public)/archive/..., /members — ISR
export const config = { isr: { expiration: 60 } };   // adapter-vercel ISR

// `/` — ISR 걸지 않음 (세션 분기). 게스트 분기 응답은 짧은 CDN 캐시도 걸지 않는다 (쿠키 분기 안전 우선)
```

- 공개 로드는 `MemberSchema.pick` 파생 타입만 반환 — **로드 반환부에 원시 row 전달 금지** (lint 규칙 또는 리뷰 체크)
- BE-64 스냅샷: 각 공개 load를 직접 호출해 `JSON.stringify` 결과에
  `phone|email|background|isAdmin|pendingParticipantIds|pendingTransfer|withdrawal` 키 부재 assert
- mdsvex: `svelte.config.js` `extensions: [".svelte", ".svx"]` — 단독 커밋, 기존 페이지 빌드 회귀 확인
- 콘텐츠 배치: `src/content/about/*.svx` → `(public)/about/*` 라우트가 import

---

## Phase 6 — 이주 스크립트

```
scripts/migration/          # tsx로 로컬 실행, snumps-migration 역할 사용
├── 00-dump.ts              # 전 Notion DB 원본 JSON → backups/<timestamp>/
├── 10-assets.ts            # 열거(토글 재귀) → 다운로드 → sha256 dedupe → 정규화 → 업로드 → 파생본
│                           #   산출: assets-manifest.json (레포 커밋)
├── 20-export-tables.ts     # Notion → tables/*.json.gz — §9 변환 규칙 전부
│                           #   id-map.json (notionId → newId) 산출, file 속성 → manifest 경유 s3Key
├── 30-verify.ts            # 행수/dangling 0/자산 90/HEAD 200 — API-SPEC §10 + db-to-s3 §7
└── lib/                    # notion fetch(서명 재발급), slug, 공용
```

- 전 스크립트 **멱등** (재실행 안전): 업로드는 sha256 스킵, 익스포트는 전체 재생성(덮어쓰기)
- `20`의 검증: 산출 JSON을 **BE-10 Zod 스키마로 파싱 통과**해야 업로드 — 스키마가 이주 게이트
- 변환 세칙: `임원` multi_select `"25-2 회장"` → `{term:"25-2", title:"회장"}` 정규식 `^(\d{2}-[12WS])\s+(.+)$`,
  매칭 실패 항목은 리포트로 출력하고 중단 (조용한 드롭 금지)

---

## Phase 7 — 검증 스위트 배치

| 파일 | 내용 |
|---|---|
| `src/lib/server/data/tables.test.ts` | BE-15 전 항목 |
| `src/lib/server/attendance.test.ts` | mergeAttendees — 외부 보존/부분집합/중복/빈 입력 |
| `src/hooks.guard.test.ts` | BE-24 매트릭스 |
| `src/lib/server/withdrawal.test.ts` | 상태 머신: 신청→보존→해제(재기산)→익명화, 철회 복원, 삼중 확인 결여 |
| `src/lib/server/approvals.test.ts` | 각 승인 흐름 — 단계별 실패 주입 후 재실행, 중복 0 |
| `src/lib/server/mail/templates.test.ts` | Bcc 헤더, 옵트아웃 제외, 배치 분할 |
| `src/routes/(public)/public-loads.test.ts` | BE-64 스냅샷 |
| `src/lib/server/core/semester.test.ts` | 경계: 2/28, 3/1, 8/31, 9/1, 연말연시 |

전부 S3 목 위에서 실행 — 실 AWS 불요. 통합(실 버킷) 검증은 이주 리허설(30-verify)로 갈음.

---

## 부록 — 구현 중 금지 사항 (리뷰 체크리스트)

1. `data/s3.ts` 밖에서 AWS SDK 직접 호출
2. `mutate` 밖에서 테이블 객체 PUT
3. 공개 로드에서 원시 row 반환 (pick 파생 타입 강제)
4. 경로 문자열 `startsWith` 가드 판정
5. `attendeeIds` 통째 대입 (`mergeAttendees` 미경유) — 유일 예외 `admin setAttendees`
6. env 추가 시 `SETUP.md`·`.env.example` 미갱신
7. 새 라우트를 가드 매트릭스에 미등록 (glob 수집이 잡지만, PR에서 확인)
