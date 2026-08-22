# 세미나 이벤트 신청/출석 관리 — 이주 명세

> **성격**: 한시적 작업 문서. 이주가 끝나면 이 파일은 삭제하고, 남길 내용은
> `docs/FEATURES.md`와 `docs/schema.md`에 흡수시킨다. [README](./README.md) 참조.

원본: `seminar` 브랜치, 단일 커밋 `fd7e482` "Add event signup and notifications"
(yoonhero, 2026-02-24, 13파일 +810/−55)
대상: `main` (`899f971`) 기반 신규 브랜치

원본 열람:
```bash
git show fd7e482 --format='' -- <path>      # 파일별 diff
git show fd7e482:<path>                     # 신규 파일 전문
```

---

## 1. 무엇을 이주하는가

`fd7e482`는 하나의 커밋이지만 **독립적인 3개 기능**이 들어있다. 나눠서 이주할 수 있고, 나눠야 한다.

| # | 기능 | 사용자 | 핵심 동작 |
|---|---|---|---|
| **F1** | 활동 참가 신청/취소 | 일반 회원 | 대시보드 활동 테이블에서 시작 전 세미나에 신청·취소 |
| **F2** | 발표자 출석 관리 | 발표자 | 자기 세미나의 신청자 목록에서 실제 출석자 체크 후 일괄 저장 |
| **F3** | 세미나 개설 전체 공지 | 관리자(트리거) | 세미나 승인 시 전 회원에게 안내 메일 |

세 기능의 공통 기반이 **Events DB의 `Applicants` / `Presenters` relation 속성**이다.
F1은 Applicants를 쓰고, F2는 Presenters로 권한을 판정한 뒤 Applicants를 읽어 Activities DB의
`출석` relation을 갱신한다. F3만 Events와 무관하다.

### 기존 출석 기능과의 관계 — 중복 아님

| | `origin/main` 기존 | 이주 대상 |
|---|---|---|
| 출석 주체 | **본인** (`/events/[id]/[type]`에서 attendCode 입력) | **발표자** (신청자 목록 일괄 체크) |
| 함수 | `recordAttendance` (Attendance Queue DB에 기록) | `replaceActivityAttendees` (Activities DB `출석` relation 덮어쓰기) |
| 사전 신청 | ❌ 없음 | ✅ `applyToEvent` / `cancelEventApplication` |

**두 경로가 같은 Notion 속성(`출석` relation)을 건드린다.** §5-A의 방어 로직이 이래서 필수다.

---

## 2. 선행조건 · 데이터 모델

### 2-1. Notion Events DB (`NOTION_DB_EVENTS`)

필요 속성 — **사용자가 존재 확인 완료 (2026-08-22)**:

| 속성명 | 타입 | 용도 |
|---|---|---|
| `Applicants` | Relation → Members DB | 참가 신청자 |
| `Presenters` | Relation → Members DB | 발표자 (F2 권한 판정 기준) |

상수는 `src/lib/constants.ts`의 `NOTION_PROPS`에 `n()` NFC 정규화를 거쳐 추가한다
(Events DB 속성명은 영문이지만 관례를 따른다):

```ts
EVENT_APPLICANTS: n("Applicants"),
EVENT_PRESENTERS: n("Presenters"),
```

> **주의**: `Presenters`는 승인 시점에 자동으로 채워져야 의미가 있다. §4 T5 참조.
> 이미 승인되어 존재하는 이벤트에는 `Presenters`가 비어 있으므로, 기존 세미나는
> F2 화면에 뜨지 않는다. 필요하면 Notion에서 수동 입력해야 한다. **마이그레이션 계획 필요.**

### 2-2. 타입 변경

`src/lib/types.ts`:
```ts
export interface Event {
  // ...기존
  applicantIds?: string[];
  presenterIds?: string[];
}

export interface Activity extends NotionActivity {
  attended: boolean;
  semester: string;
  eventId?: string;           // Activity(Notion page) → Event 역참조
  isApplied?: boolean;        // 본인이 신청했는가
  canApply?: boolean;         // 아직 시작 전이라 신청 가능한가
  pendingAttendance?: boolean; // 신청했고 시작했으나 아직 출석 처리 안 됨
}
```

`src/lib/server/notion/schema.ts` — **원본에는 없는 신규 작업.** `fd7e482` 시점엔 Zod가 없었다:
```ts
export const EventSchema = z.object({
  // ...기존
  applicantIds: z.array(z.string()).optional(),
  presenterIds: z.array(z.string()).optional(),
});
```

`DashboardData.profile.background`는 `origin/main`에 **이미 있다** (`+page.server.ts:225`). 불필요.

---

## 3. 왜 그대로 붙일 수 없는가

`origin/main`이 `fd7e482` 이후 2026-03-02와 04-19에 두 차례 대규모 리팩터링을 했다.
원본 패치의 **모든 대상 파일이 이동하거나 재작성**되었다.

| 원본이 수정한 것 | 현재 위치 / 상태 |
|---|---|
| `src/lib/server/notion.ts` (단일 1000줄 파일) | `notion/{client,utils,members,activities,seminars,applications,events}.ts` + `notion/index.ts` 배럴. `notion.ts`는 `export * from "./notion/index"` 호환 셰임만 남음 |
| `src/lib/server/mail.ts` (단일) | `mail/{client,templates}.ts` + `mail.ts` 재노출 |
| `admin/+page.server.ts` `approveSeminar` (`tasks[]` 배열) | `handleAdminAction` 래퍼 + `publishEvent()` + `createSeminarInNotion()` + `getKSTDate()` |
| `+page.server.ts` `load` (동기 반환) | `streamed.dashboard` 스트리밍 (`c7d723b`) |
| `+page.svelte` 인라인 `.attendance-badge` span | `<StatusBadge status={...} />` 컴포넌트 |
| 수동 `locals.auth()` + `throw redirect` | `auth-guards.ts`의 `ensureSession` / `handleUserAction` / `handleAdminAction` |
| Notion 조회 전체 속성 | `filter_properties` 화이트리스트 (`8b1605a`) |

게다가 두 히스토리는 **공통 조상이 0개**라 `git cherry-pick` 자체가 불가능하다.
`git show <sha> | git apply`도 컨텍스트 불일치로 대부분 실패한다. **수동 재작성이 기본이다.**

---

## 4. Task 목록

의존 관계상 T1 → T2 → T3 순으로 기반을 깔고, F1/F2/F3는 그 위에서 병렬 가능.

### 기반 (F1·F2 공통)

#### T1. 상수 · 타입 · 스키마
- **파일**: `src/lib/constants.ts`, `src/lib/types.ts`, `src/lib/server/notion/schema.ts`
- **내용**: §2-1, §2-2 그대로
- **검증**: `pnpm run check` 오류 증가 없음
- **의존**: 없음

#### T2. 🔴 `filter_properties`에 신규 속성 추가
- **파일**: `src/lib/server/notion/events.ts:21`
- **내용**: `getEventsFromNotion`의 화이트리스트에 두 속성 추가
  ```ts
  filter_properties: [
    NOTION_PROPS.EVENT_TITLE, NOTION_PROPS.EVENT_DATE, NOTION_PROPS.EVENT_TYPE,
    NOTION_PROPS.EVENT_STATUS, NOTION_PROPS.EVENT_PATH_ID,
    NOTION_PROPS.EVENT_ATTEND_CODE, NOTION_PROPS.EVENT_NOTION_PAGE_ID,
    NOTION_PROPS.EVENT_APPLICANTS,   // ← 추가
    NOTION_PROPS.EVENT_PRESENTERS,   // ← 추가
  ],
  ```
  이어서 `.map()` 반환 객체에 두 필드 추가 (`Array.isArray(...) ? ... : []` 방어 포함)
- **⚠️ 빠뜨리면**: Notion에 속성이 있어도 **항상 빈 배열**. 에러도 경고도 없이 F1·F2 전체가 무동작.
  원본은 `filter_properties`가 없던 시절이라 이 함정이 존재하지 않았다.
- **검증**: 로컬에서 이벤트 1건에 Applicants를 넣고 `getEvents()` 결과 로그 확인
- **의존**: T1

#### T3. Notion 접근 함수 4개
- **파일**: `src/lib/server/notion/events.ts`, `src/lib/server/notion/activities.ts`
- **내용**:

  `notion/events.ts`:
  ```ts
  export async function updateEventApplicantsInNotion(id: string, applicantIds: string[])
  export async function updateEventPresentersInNotion(id: string, presenterIds: string[])
  ```
  `createEventInNotion`의 `props`에 `applicantIds` / `presenterIds` 분기 추가
  (`Array.isArray(...) && length > 0`일 때만)

  `notion/activities.ts` — `notionRetrieve`, `notionUpdate` 이미 import 되어 있음:
  ```ts
  export async function getActivityAttendeeIds(pageId: string): Promise<string[]>
  export async function replaceActivityAttendees(pageId: string, attendeeIds: string[])
  ```
- **배럴 재노출 불필요**: `notion/index.ts`가 `export *` 이므로 자동 반영
- **의존**: T1

---

### F1 — 참가 신청/취소

#### T4. 서비스 계층
- **파일**: `src/lib/server/events.ts`
- **내용**: 원본 그대로 이식 가능한 부분
  ```ts
  function getEventStartTimestamp(date: string): number | null
  function isEventOpenForApplication(event: Event): boolean   // 시작 시각 > now
  export async function applyToEvent(eventId, memberId)          // { changed: boolean }
  export async function cancelEventApplication(eventId, memberId)
  ```
  에러는 `throw new Error("EVENT_NOT_FOUND" | "EVENT_NOT_OPEN")` 문자열 코드 방식 유지
- **❌ 채택하지 않을 것**: 원본이 `createEvent`/`updateEventStatus`/`deleteEvent`/`applyToEvent` 안에
  직접 넣은 `invalidateCache("all_events")` 호출 6곳.
  `origin/main`은 액션 래퍼의 `{ invalidate: [...] }` 옵션으로 처리한다 (T6 참조)
- **✅ 이미 존재**: `getEvents(skipCache = false)` — 독립적으로 도입됨. 손대지 말 것
- **의존**: T2, T3

#### T5. 승인 시 `Presenters` 기록
- **파일**: `src/routes/admin/+page.server.ts` (`approveSeminar`), `src/lib/server/events.ts` (`publishEvent`), `src/lib/server/notion/events.ts`
- **문제**: 현재 `publishEvent`는 `attendeeIds`만 받는다. `presenterIds`를 관통시켜야 한다.
  ```
  approveSeminar
    └ publishEvent({ title, date, type, attendeeIds })        ← presenterIds 파라미터 신설
        ├ createActivityPage({ ..., attendeeIds })            ← 그대로 (Activities DB 출석)
        └ createEvent({ title, date, type, notionPageId })    ← presenterIds 전달
            └ createEventInNotion(data)                       ← props에 Presenters 반영 (T3)
  ```
- **현재 코드 형태** (참고 — 원본 패치와 완전히 다름):
  ```ts
  approveSeminar: async ({ request, locals }) => {
    return handleAdminAction(locals, async () => {
      const seminar = ...;
      const todayKST = getKSTDate(undefined, true);
      await publishEvent({ title, date: todayKST, type: "Seminar",
                           attendeeIds: seminar.speakerIds });
      await createSeminarInNotion({ ... });
      // 메일 알림
      await updateSeminarRequestStatus(id, "approved");
    }, { invalidate: ["all_seminar_requests", "all_events"] });
  }
  ```
  → `attendeeIds`와 `presenterIds` 둘 다 `seminar.speakerIds`가 된다. 의미가 다르므로 둘 다 명시.
- **의존**: T3

#### T6. 대시보드 로더 + 액션
- **파일**: `src/routes/+page.server.ts`
- **로더**: `dashboardPromise` 내부 `Promise.all`에 `getEvents(skipCache)` 추가 →
  `notionPageId → Event` 맵 구성 → `currentActivities` `.map()`에 4필드 부착
  ```ts
  const eventByNotionPageId = new Map(
    allEvents.filter((e) => !!e.notionPageId).map((e) => [e.notionPageId!, e]),
  );
  ```
  `pendingAttendance` 판정: 이벤트 시작됨 && 신청함 && `act.attendees`에 없음 && 세미나 타입
- **액션**: `applyActivity`, `cancelActivity`
  - 원본은 `locals.auth()` 수동 + `fail()` 반환. **`handleUserAction`으로 교체**
  - `dev` 프리뷰 분기(`resolveDevPreviewRole`)는 기존 `updateProfile`/`updateSeminar` 관례대로 유지
  - `{ invalidate: "all_events" }` 지정
  - `EVENT_NOT_FOUND` / `EVENT_NOT_OPEN` → 한국어 메시지 매핑
- **주의**: `getMemberByEmail(session.user.email)` 대신 **`event.locals.member`** 사용 가능.
  `hooks.server.ts`의 `membershipGuard`가 이미 조회해서 넣어둔다 (`{ memberId, privateInfoId }`).
  Notion 왕복 1회 절약
- **의존**: T4

#### T7. 대시보드 UI
- **파일**: `src/routes/+page.svelte`, `src/lib/components/StatusBadge.svelte`
- **❌ 원본 CSS 전량 폐기**: 원본이 추가한 `.attendance-badge.applied`, `.attendance-badge.pending`은
  의미 없다. `origin/main`은 `:424`에서 `<StatusBadge status={activity.attended ? 'attended' : 'absent'} />`를 쓴다
- **대신**: `StatusBadge.svelte`의 `statusMap`에 항목 추가
  ```ts
  applied: { label: 'Applied', class: 'pending' },   // 또는 전용 class
  ```
  `pending`은 이미 존재(`{ label: 'Pending', class: 'pending' }`) → "출석 확인 대기"에 재사용 가능
- **테이블 셀 로직** (원본 구조 유지, 컴포넌트로 치환):
  ```
  attended                      → <StatusBadge status="attended" />
  canApply && eventId && !isApplied → [신청] 버튼 (form ?/applyActivity)
  canApply && eventId && isApplied  → <StatusBadge status="applied" /> + [취소] 버튼
  pendingAttendance             → <StatusBadge status="pending" />
  그 외                          → <StatusBadge status="absent" />
  ```
- **버튼**: 원본의 `.attendance-action-btn` 대신 기존 `ActionButton.svelte` 검토.
  단 `ActionButton`은 form 제출 컴포넌트이므로 표 셀 안에서 크기가 맞는지 확인 필요
- **레이아웃**: 원본은 마지막 컬럼 폭을 `6.2rem → 9.6rem`으로 넓혔다. 동일 조정 필요
- **의존**: T6

---

### F2 — 발표자 출석 관리

#### T8. 라우트 신설
- **경로 결정**: **`/events/manage` 유지 권장**
  - `events/[id]/manage`는 기존 `events/[id]/[type]`와 헷갈린다 (`/events/abc/manage`가
    `[type]="manage"`로도 읽힘). 정적 세그먼트가 우선하므로 실제 충돌은 아니지만 혼동 유발
  - `/events/manage`는 단일 세그먼트라 `[id]/[type]`(2세그먼트)와 매칭 자체가 겹치지 않는다
  - `admin/` 하위는 부적절 — 발표자는 관리자가 아니다
- **파일**: `src/routes/events/manage/+page.server.ts`, `+page.svelte`
- **원본**: `git show fd7e482:src/routes/events/manage/+page.server.ts` (156줄),
  `+page.svelte` (173줄)

#### T9. `load` 재작성
- **인증**: 원본의 `locals.auth()` + `throw redirect(302, "/login?...")` →
  **`ensureSession(locals, url)`** (`auth-guards.ts:16`). 동작 동일, 관례 일치
- **회원 조회**: `getMemberByEmail` 대신 `locals.member` 사용 (T6과 동일 이유)
- **로직**:
  ```
  events = getEvents()  ─┐
  members = getAllMembers() ─┴ Promise.all
  → isSeminarType(type) && presenterIds.includes(myMemberId) 로 필터
  → applicantIds를 memberMap으로 {id, name, department} 해석 (미해결 시 "Unknown")
  → notionPageId 있으면 getActivityAttendeeIds() 로 현재 출석자 조회,
    applicantIds와 교집합 = checkedApplicantIds (체크박스 초기값)
  → date 오름차순 정렬
  ```
- **N+1 주의**: 관리 대상 이벤트마다 `getActivityAttendeeIds`가 `notionRetrieve` 1회.
  발표자 1인이 담당하는 세미나 수는 보통 한 자릿수라 허용 범위. 원본도 `Promise.all` 병렬.
  실패는 `try/catch`로 삼켜 빈 배열 처리 — 페이지 전체를 죽이지 않는 설계 유지
- **`forbidden` 플래그**: 원본은 회원 아닐 때 `{ managedEvents: [], forbidden: true }` 반환.
  단 `membershipGuard`가 이미 비회원을 `/signup`·`/wait`로 리다이렉트하므로 도달 가능성 낮음.
  방어적으로 유지해도 무해

#### T10. 🔴 `saveAttendance` 액션 — 방어 로직 필수
- **검증 순서** (원본 그대로, 전부 유지):
  1. 세션 → `handleUserAction`으로 대체
  2. `eventId` 존재
  3. 이벤트 존재 / 세미나 타입 / `notionPageId` 존재
  4. **`presenterIds.includes(myMemberId)`** — 본인이 발표자인 세미나만
  5. **`selectedApplicantIds ⊆ applicantIds`** — 신청자 밖 인원 출석 처리 차단
- **🔒 절대 빠뜨리면 안 되는 병합 로직**:
  ```ts
  const currentAttendees = await getActivityAttendeeIds(event.notionPageId);
  const attendeesOutsideApplicants = currentAttendees.filter((id) => !applicantIdSet.has(id));
  const finalAttendees = Array.from(
    new Set([...attendeesOutsideApplicants, ...selectedApplicantIds]),
  );
  await replaceActivityAttendees(event.notionPageId, finalAttendees);
  ```
  `replaceActivityAttendees`는 relation을 **통째로 덮어쓴다.** 이 필터가 없으면
  `/events/[id]/[type]`에서 attendCode로 직접 출석한 사람이 발표자가 저장 버튼 누를 때마다 전멸한다.
- **캐시 무효화**:
  ```ts
  for (const memberId of new Set([...currentAttendees, ...finalAttendees])) {
    invalidateCache(`user_activities_${memberId}`);   // 원본에 있음
  }
  ```
  **⚠️ 원본이 놓친 것**: 대시보드의 현재 학기 활동은 `getActivities(start, end)`에서 오고,
  그 캐시 키는 `activities_${startDate}_${endDate}` (TTL 5분)다. `attended` 판정이
  `act.attendees.includes(memberId)`이므로 **이 키도 무효화해야** 출석 저장이 즉시 반영된다.
  안 하면 최대 5분간 옛 상태가 보인다

#### T11. `+page.svelte` 재작성
- 원본은 자체 CSS 100여 줄. `manuscript.css`의 `paper-*` 클래스를 이미 쓰고 있어
  (`paper-document`, `paper-btn`, `paper-status-note`, `paper-form-note`) 상당 부분 그대로 통한다
- 검토: `SectionHeader`, `StatusBadge`, `Pagination` 재사용 여부
- 폼 제출 중 상태(`processingEventId`)는 원본 방식 유지 또는 `ActionButton`의 로딩 스피너 활용

#### T12. 진입 링크
- **파일**: `src/routes/+layout.svelte:102`(데스크톱), `:137`(모바일)
- 구조가 원본과 **동일**하다. 2줄 추가만 하면 된다:
  ```svelte
  <a href="/events/manage" class="paper-nav-link desktop-only">Manage</a>
  <a href="/events/manage" class="mobile-link">세미나 출석 관리</a>
  ```
- 원본은 대시보드 세미나 섹션(`+page.svelte:191` 부근)에도 버튼을 넣었다. 선택 사항
- **개선 여지**: 발표자가 아닌 회원에게도 항상 보인다. `page.data`에 발표자 여부를 실어
  조건부 노출하는 편이 낫지만, 원본은 하지 않았다. 판단 필요

---

### F3 — 세미나 개설 전체 공지

#### T13. 메일 템플릿
- **파일**: `src/lib/server/mail/templates.ts` (원본은 단일 `mail.ts`)
- **내용**: `sendSeminarAnnouncementToMembers(recipients: string[], seminarTitle: string)`.
  기존 `sendSeminarStatusNotification`(`:71`)과 동일한 구조 —
  `getAdminAccessToken()` → subject/body 구성 → `dispatchEmail()` → `try/catch`로 삼킴
- `mail.ts`는 `export * from "./mail/templates"`라 재노출 자동

#### T14. 🔴 수신자 처리 — 원본 방식 그대로 쓰면 안 됨
- **문제 1 — 이메일 상호 노출**: `mail/client.ts:60`의 `dispatchEmail`은
  ```ts
  `To: ${recipients.join(", ")}`
  ```
  전 수신자를 `To:` 헤더에 나열한다. 전 회원 공지에 쓰면 **모든 회원의 이메일 주소가
  모든 회원에게 노출된다.** 개인정보 사고다.
  → `dispatchEmail`에 `Bcc` 지원을 추가하거나, 공지 전용 발송 함수를 만들어야 한다.
  기존 호출부(4곳)는 전부 소수 수신자라 영향 없으므로, 옵션 파라미터 추가가 안전하다
- **문제 2 — Gmail 수신자 한도**: 1통당 수신자 수와 일일 발송량에 제한이 있다.
  회원 수가 늘면 배치 분할이 필요하다. 최소한 실패 시 로그가 남아야 한다
- **수신자 수집**: `getAllPrivateInfo()` (`notion/members.ts:235`) 사용.
  bulk 조회라 `phone: ""`이지만 `email`/`name`/`memberId`는 채워진다.
  원본대로 `info.memberId && info.email` 필터 + `Set` 중복 제거
  - `PrivateInfoSchema`는 `email`을 필수로 보지만, `validateNotionResponse`
    (`notion/utils.ts:21`)는 검증 실패 시 **로그만 남기고 raw를 그대로 반환**한다.
    크래시는 안 나지만 빈 이메일이 통과할 수 있으므로 필터가 실제로 필요하다

#### T15. 승인 액션에 연결
- **파일**: `src/routes/admin/+page.server.ts` `approveSeminar`
- 원본은 `tasks.push((async () => {...})())` 패턴이었으나 현재 코드에는 `tasks[]`가 없다.
  `handleAdminAction` 콜백 안에서 순차 `await` + 자체 `try/catch`로 감싼다
  (메일 실패가 승인 자체를 실패시키면 안 된다 — 원본 주석의 의도 유지)
- T5와 같은 함수를 건드리므로 **T5와 함께 처리하는 편이 낫다**

---

### 문서 (별도 커밋)

#### T16. `docs/schema.md`
- **⚠️ 현재 Events DB 절이 아예 없다.** 1~6절이 Members / Private Info / Activities /
  Applications / Seminar Requests / Attendance Queue뿐이다.
  `NOTION_DB_EVENTS`는 코드에서만 쓰이고 문서화된 적이 없다
- → Events DB 절을 **신설**하고 그 안에 `Applicants` / `Presenters`를 포함해 작성

#### T17. `docs/FEATURES.md`
- `## 📅 Event & Attendance System` 절에 F1·F2 항목 추가

#### T18. `docs/SETUP.md` · `.env.example`
- `NOTION_DB_EVENTS`, `NOTION_DB_ATTENDANCE_QUEUE` **둘 다 누락되어 있다**
  (SETUP.md `:39-45`에 없음). 이번 기회에 보강

---

## 5. 함정 요약

| # | 함정 | 결과 | 대응 |
|---|---|---|---|
| A | `replaceActivityAttendees`가 relation 통째 덮어쓰기 | 코드 출석자 전멸 | T10 병합 로직 필수 |
| B | `filter_properties` 화이트리스트 | 조용한 빈 배열, 기능 전체 무동작 | T2 |
| C | `dispatchEmail`이 `To:`에 전원 나열 | 회원 이메일 상호 노출 | T14, Bcc 전환 |
| D | `activities_*` 캐시 미무효화 | 출석 저장 후 최대 5분 미반영 | T10 |
| E | `publishEvent`에 `presenterIds` 통로 없음 | F2가 아무 이벤트도 못 찾음 | T5 |
| F | 기존 승인 이벤트에 `Presenters` 없음 | 기존 세미나가 F2에 안 뜸 | §2-1, 데이터 마이그레이션 |
| G | `approveSeminar` 전면 재작성됨 | 원본 패치 적용 불가 | T5·T15 수동 재작성 |

---

## 6. 이번 조사에서 새로 드러난 선행 이슈

이주와 직접 관련은 없지만 같은 코드 경로에 있다.

1. **`/login` 라우트가 존재하지 않는다.**
   `src/auth.ts:37-38`이 `pages.signIn`/`pages.error`를 `/login`으로 지정하고,
   `auth-guards.ts:23`의 `ensureSession`도 거기로 리다이렉트한다.
   그런데 `src/routes/` 아래에 `login/`이 없다 → **404**.
   T9에서 `ensureSession`을 쓰면 이 문제를 그대로 물려받는다.
   실제로는 `membershipGuard`가 먼저 `/`로 보내서 잘 안 드러나지만, 고쳐두는 편이 낫다.

2. **`membershipGuard`가 이미 세션·회원 검증을 한다.**
   `hooks.server.ts:32~69`. `event.locals.member`에 `{ memberId, privateInfoId }`가 들어있다.
   원본의 라우트별 `getMemberByEmail` 재호출은 불필요한 Notion 왕복이다 (T6, T9).

3. **`docs/CACHE.md:41`이 Redis 도입 전 내용이다** — "no external dependencies
   (Redis/Memcached)". 실제로는 `cache.ts`가 Redis 하이브리드(`84f4b2a`).
   T10에서 캐시 키를 다루므로 같이 손보면 좋다.

---

## 7. 검증 계획

### 자동
```bash
./node_modules/.bin/vitest run                                   # 20/20 유지 + 신규
./node_modules/.bin/eslint .                                     # clean 유지
./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json      # 40 errors 초과 금지
```
> `pnpm run check` / `pnpm test`는 pnpm이 `pnpm install`을 먼저 돌리다
> `[ERR_PNPM_IGNORED_BUILDS] esbuild` 로 실패한다. 위처럼 바이너리 직접 호출할 것.

**단위 테스트 추가 권장 대상** (순수 함수라 저렴):
- `isEventOpenForApplication` — 시작 전/후/날짜 없음/잘못된 날짜
- `isSeminarType` — `"Seminar"` / `"세미나"` / 그 외
- T10의 출석자 병합 — 신청자 밖 인원 보존, 중복 제거
  (액션에서 순수 함수로 분리해야 테스트 가능)

### 수동 (Notion 워크스페이스 필요)
1. 관리자로 세미나 승인 → Events DB에 `Presenters`가 speakerIds로 채워지는지
2. 승인 시 전 회원 메일 발송 → **`To:`가 아닌 `Bcc:`인지 헤더 확인**
3. 일반 회원 대시보드 → 시작 전 세미나에 [신청] → `Applicants`에 추가되는지
4. 다시 [취소] → 제거되는지
5. 시작 시각 이후 신청 시도 → `EVENT_NOT_OPEN` 메시지
6. 발표자 계정으로 `/events/manage` → 자기 세미나만 보이는지
7. 신청자 일부 체크 후 저장 → Activities DB `출석` relation 반영
8. **🔴 회귀 시나리오**: 신청 안 한 회원 X가 `/events/[id]/[type]`로 직접 출석 →
   발표자가 `/events/manage`에서 저장 → **X의 출석이 유지되는지**
9. 저장 직후 해당 회원 대시보드에서 즉시 '출석'으로 보이는지 (캐시 무효화, 함정 D)

---

## 8. 권장 진행 순서와 커밋 분할

```
커밋 1  feat(events): add Applicants/Presenters to the event model      T1 T2 T3
커밋 2  feat(events): let members apply to and cancel seminar sign-ups   T4 T6
커밋 3  feat(admin): record presenters when a seminar is approved        T5
커밋 4  feat(dashboard): surface sign-up state in the activity table     T7
커밋 5  feat(events): add presenter-side attendance management           T8 T9 T10 T11 T12
커밋 6  feat(mail): announce newly approved seminars to all members      T13 T14 T15
커밋 7  docs: document the events database and sign-up flow              T16 T17 T18
```

- 커밋 1은 전체 선행. 이후 F1(2·3·4) / F2(5) / F3(6)은 서로 독립
- **커밋 3이 커밋 5보다 먼저**여야 한다 — `Presenters`가 채워지지 않으면 F2를 테스트할 수 없다
- 커밋 6의 T14(Bcc)는 `dispatchEmail` 공용 함수를 건드리므로 기존 4개 호출부 회귀 확인 필요

---

## 9. 결정 필요 사항

1. **기존 승인 세미나의 `Presenters` 백필** — 수동 입력? 일회성 스크립트? 아니면 신규 세미나부터만 적용?
2. **`dispatchEmail` Bcc 전환 방식** — 옵션 파라미터 추가 vs 공지 전용 함수 신설
3. **`/events/manage` 링크 노출 조건** — 전 회원 vs 발표자만
4. **F3 범위** — "전 회원"이 맞나? 옵트아웃 수단이 없다
5. **`/login` 404 수정** — 이번 범위에 포함할지

---

## 10. 참조

```bash
# 원본 전체 diff
git show fd7e482 --stat
git show fd7e482 --format='' -- src/lib/server/events.ts
git show fd7e482:src/routes/events/manage/+page.server.ts

# 현재 대상 파일
sed -n '17,45p' src/lib/server/notion/events.ts       # filter_properties
sed -n '69,135p' src/lib/server/auth-guards.ts        # handleUserAction
grep -n 'approveSeminar' -A45 src/routes/admin/+page.server.ts
sed -n '156,240p' src/routes/+page.server.ts          # streamed dashboard
```
