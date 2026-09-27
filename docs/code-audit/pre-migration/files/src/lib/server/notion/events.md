# `src/lib/server/notion/events.ts`

160줄 · 함수 8개(+별칭 2) · 이벤트(Events) / 출석 큐(Attendance Queue) 두 DB + 범용 스키마 조회
검토 2026-08-24 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판은 함수 개수를 틀렸고, EV-1의 연쇄 시나리오가 **코드상 불가능**했으며,
> EV-5에서 **`client.md`에 내가 직접 쓴 사실과 모순되는 문장**을 썼다.
> 그리고 이 파일 주변에서 **가장 확실한 버그(날짜 비교)를 놓쳤다.** §개정 이력 참조.

---

## 요약

| #           | 지적                                                               | 분류   | 심각도 |
| ----------- | ------------------------------------------------------------------ | ------ | ------ |
| **EV-9**    | **날짜 비교가 깨져 이벤트가 당일에 절대 `active`가 되지 않는다**   | 버그   | 🔴🔴   |
| **EV-1**    | **일반 회원이 GET 한 번으로 이벤트를 아카이브시킬 수 있다**        | 버그   | 🔴     |
| EV-10       | 날짜 없는 이벤트가 일정과 무관하게 즉시 활성화된다                 | 버그   | 🟠     |
| EV-2        | 출석 큐 속성명 7개가 `NOTION_PROPS` 밖 리터럴                      | 확장성 | 🟠     |
| EV-3        | 쓰기 함수 3개의 입력이 전부 `any`                                  | 타입   | 🟠     |
| EV-5        | `notionArchive` 별칭 2개가 DB 검사 없이 아무 페이지나 아카이브한다 | 안전성 | 🟠     |
| EV-6        | 출석 큐 조회만 캐시·`filter_properties`·상태 필터가 없다           | 일관성 | 🟡     |
| EV-4        | `status`가 `string`이라 타입이 도메인보다 넓다                     | 타입   | 🟠     |
| EV-7 · EV-8 | `getDatabaseSchema` 배치 · 기본값 하드코딩                         | 메모   | 🟡     |

> **검증 제약**: `NOTION_DB_EVENTS`·`NOTION_DB_ATTENDANCE_QUEUE`가 `.env`에 **없다.**
> 두 DB 스키마를 API로 대조하지 못했고, **측정 가능한 환경에서는 `getEventsFromNotion:19`이
> `[]`를 반환해 이벤트 기능 전체가 무동작이다.** 프로덕션 env 확보 후 재검토 필요.
> 아래 EV-9·EV-10은 코드 논리로 확정한 것이며 실 데이터 왕복은 못 했다.

---

## EV-9 🔴🔴 이벤트가 당일에 절대 활성화되지 않는다

`lib/server/events.ts:211` · `:228-241`

```ts
const todayKST = getKSTDate(undefined, true);   // "2026-08-24"  ← 날짜만
...
// event.date is stored in YYYY-MM-DD format (already KST based from creation)   ← 주석이 거짓
const eventDay = event.date;

if (event.status === "draft" && todayKST >= eventDay)  { ... "active" }
if (event.status === "active" && todayKST >  eventDay) { ... "expired" }
```

**`event.date`는 `YYYY-MM-DD`가 아니다.**

```
admin/events/new/+page.svelte:26   <input type="datetime-local" name="date" required>
                                    → "2026-08-24T15:00"
admin/events/new/+page.server.ts:45,56   그대로 createEvent 로 전달
notion/events.ts:66                 { date: { start: data.date } }
notion/events.ts:35                 Notion 이 되돌려주는 값은 오프셋 포함 ISO 전체
```

문자열 비교 실측:

```
'2026-08-24' >= '2026-08-24T15:00:00.000+09:00'   →  false
'2026-08-24' >= '2026-08-24'                       →  true
```

짧은 쪽이 접두사라 더 작게 정렬된다. 결과:

| 시점          | 상태                        | 출석 체크인                       |
| ------------- | --------------------------- | --------------------------------- |
| **행사 당일** | `draft` 유지 (`>=`가 false) | **403** (`events/[id]/[type]:34`) |
| 다음 날       | `active`로 전환             | 가능                              |
| 그 이후 cron  | `expired`                   | 403                               |

**정확히 행사가 열리는 날에만 체크인이 막힌다.** 그리고 cron이 격일(`0 15 */2 * *`)이라
활성 구간이 더 어긋난다.

`:228`의 주석 `"event.date is stored in YYYY-MM-DD format"`은 **사실이 아니고**,
비교문이 그 잘못된 전제 위에 쓰였다.

**수정**: 비교 전에 양쪽을 같은 단위로 맞춘다 — `event.date.slice(0, 10)`으로 날짜만 떼거나,
저장 시점에 날짜와 시각을 분리한다. 주석도 함께 고친다.

> 이 결함이 초판의 EV-1(레이트 리밋 연쇄로 이벤트가 만료됨)보다 **훨씬 확실하고 상시적**이다.
> 초판은 일어나지 않는 만료 시나리오에 🔴를 쓰면서, **매번 일어나는 미활성화**를
> 두 파일 건너에 두고도 보지 못했다.

---

## EV-1 🔴 일반 회원이 GET 한 번으로 이벤트를 아카이브시킨다

`:138-145`의 `checkPageExists`가 **모든 실패를 "페이지 없음"으로 접는다** —
404·429·5xx·네트워크 오류, 그리고 `client.ts`가 `ok`보다 `json()`을 먼저 부르는 탓에
HTML 오류 페이지가 오면 나는 `SyntaxError`까지(`client.md` N-1).

### 진짜 위험한 호출부는 cron이 아니라 공개 라우트다

`routes/events/[id]/[type]/+page.server.ts`

```
:17   const session = await ensureSession(locals, url);   ← 유일한 관문. 로그인만 하면 통과
:24   const exists = await checkPageExists(event.notionPageId);
:29     await deleteEvent(event.id);                      ← 아카이브
:34   if (event.status !== "active") throw error(403)     ← 이 뒤
:37   if (params.type !== event.attendCode)               ← 이 뒤
```

> 🔴 **초판이 "현재 호출부는 관리자 게이트 뒤"라고 쓴 것은 틀렸다.**
> `ensureSession`(`auth-guards.ts:16-28`)은 **로그인 세션만** 요구한다. 관리자 게이트가 아니다.
> 더 나쁜 건, **같은 사실을 내가 `client.md`에 이미 정확히 써 놓고**
> 이 문서에서 반대로 적었다는 것이다. 두 문서가 서로 모순됐다.

즉 **회원 누구나** 체크인 링크를 여는 것만으로, Notion이 한 번 삐끗하면
그 이벤트를 모두에게서 아카이브시킨다. 인증코드 검사보다도 먼저다.
cron도 필요 없고, 반복 트리거도 가능하다.

### cron 경로 — 연쇄는 일어나지 않는다

`lib/server/events.ts:216`이 전체 이벤트를 순차 루프로 돌며 `checkPageExists`를 부른다.

> **초판 정정**: 초판은 "429가 나면 남은 전부가 `expired`로 바뀐다"고 썼다. **불가능하다.**
> `updateEventStatusInNotion` → `notionUpdate`는 실패 시 던지고(`client.ts:171-180`),
> **루프에 `try/catch`가 하나도 없다**(실측 0건). 예외가 `for`를 뚫고 나가
> `api/cron/sync-events/+server.ts:17`의 500으로 끝난다.
> 즉 GET이 429면 이어지는 PATCH도 429라 **cron 전체가 중단된다.**
> "모든 GET이 실패하면서 모든 PATCH가 성공"해야 하는데 양립 불가다.
> 현실 최악은 **운 나쁜 실행 1회당 이벤트 1건 오만료**다.

다만 별건으로 **cron 엔드포인트가 열려 있다**: `+server.ts:9`가
`if (env.CRON_SECRET && ...)`인데 `CRON_SECRET`이 `.env`에 없다 → 검사 생략 →
`GET /api/cron/sync-events`를 **누구나 호출**할 수 있다. 이 루프를 실제로 몰아붙일
유일한 현실적 경로가 이것이다.

경고 로그 문구(`events.ts:219`)도 `"removed because ... is missing or archived"`라
**원인을 오도한다** — 실제로는 "확인 실패"다.

**수정**

1. `checkPageExists`가 **404일 때만** `false`, 나머지는 다시 던진다 (`client.md` C-1 선행)
2. **공개 라우트의 `load`에서 파괴적 분기를 제거한다** — 한 줄. 최우선
3. `syncEventStatuses`는 확인 실패 시 만료가 아니라 건너뛴다
4. `CRON_SECRET` 설정

---

## EV-10 🟠 날짜 없는 이벤트가 즉시 활성화된다

`admin/events/connect/+page.server.ts:31,36`은 `date`를 검증 없이 넘긴다
(`new` 라우트는 `required`+`:48` 검사가 있으나 `connect`는 `notionPageId`만 본다).

`lib/server/events.ts:56`이 `date: data.date || ""`로 받고,
`notion/events.ts:65`는 falsy면 Date 속성을 **아예 안 쓴다.**

그러면 비교가 `"2026-08-24" >= ""` → **true**(실측) → **일정과 무관하게 즉시 `active`**,
다음 cron에 `expired`.

EV-8이 지적한 `|| "draft"`·`|| "pending"`은 무해한 기본값이었고,
**실제로 위험한 빈 문자열은 여기 있었다.**

---

## EV-2 🟠 출석 큐 속성명이 상수 밖 리터럴이다

`:103-109`(읽기) · `:117-122`(생성) · `:129-132`(수정)에서 **7개 속성명이 리터럴**이다:
`EventId` · `UserEmail` · `UserName` · `UserDept` · `StartTime` · `EndTime` · `Status`.

`constants.ts`에 출석 큐 항목이 **하나도 없다**
(`EVENT_STATUS: n("Status")`는 이벤트 DB용이다). `docs/schema.md:73-79`와는 이름·타입이 일치한다.

읽기와 쓰기 두 곳에 흩어져 있어 Notion에서 이름을 바꾸면 둘 다 조용히 깨진다.
`n()` NFC 정규화도 안 거친다(영문이라 현재 무해).

**제안**: `NOTION_PROPS.ATTENDANCE_QUEUE.*` — `seminars.md` S-12의 DB별 중첩과 같은 방향.

---

## EV-3 🟠 쓰기 함수 입력이 전부 `any`

`:49` `createEventInNotion(data: any)` · `:113` `createAttendanceRecordInNotion(data: any)` ·
`:127` `updateAttendanceRecordInNotion(id, updates: any)`

`data.pathId`가 빠지면 `{ text: { content: undefined } }`가 만들어져 Notion 400으로만 드러난다.
같은 계층 `createActivityPage`(`activities.ts:125`)는 제대로 된 시그니처를 갖는다.
파일 전체 `any` 허용은 Notion **응답**이 비정형이라 정당하지만
**우리가 만드는 입력 객체까지 면제할 이유는 없다.**

---

## EV-5 🟠 아카이브 별칭 2개가 무엇이든 지운다

`:95` `deleteEventInNotion = notionArchive` · `:136` `removeAttendanceRecordInNotion = notionArchive`

DB 소속 검사가 없다. 이벤트 id 자리에 회원 페이지 id가 오면 회원을 아카이브한다.
**별칭이 검사를 넣을 수 있는 유일한 자리를 지운다.**

호출부 게이트 (초판의 오류 정정):

| 별칭                             | 호출부                                  | 게이트                                 |
| -------------------------------- | --------------------------------------- | -------------------------------------- |
| `deleteEventInNotion`            | `admin/+page.server.ts:162`             | 관리자 ✅                              |
| 〃                               | `events/[id]/[type]/+page.server.ts:29` | **`ensureSession`뿐 — 회원 누구나** 🔴 |
| `removeAttendanceRecordInNotion` | `admin/+page.server.ts:221`             | 관리자 ✅                              |

이름도 `delete`/`remove`인데 동작은 복구 가능한 **아카이브**다.
`client.md` 개정 때 내가 "영구 삭제"로 오해했던 출처가 여기다.

---

## EV-6 🟡 출석 큐 조회만 아무 옵션이 없다

`:100` `notionQuery(dbId)` — `filter_properties`도, `sorts`도, `withCache`도,
**상태 필터도 없어 처리 완료된 행까지 전부 가져온다.**
같은 파일 `getEventsFromNotion:21`은 `filter_properties`가 있다.

**제안**: `Status = pending` 필터를 서버로 내린다.

---

## EV-4 🟠 `status` 타입이 도메인보다 넓다

`:81` `status: string` → `:85` `{ select: { name: status } }`.
`types.ts:57`은 `"draft" | "active" | "expired"`다.

Notion은 select에 없는 이름을 주면 **옵션을 자동 생성한다**
([Page property values](https://developers.notion.com/reference/page-property-values) —
초판은 이걸 근거 없이 단정했다. 사실이지만 확인하고 썼어야 했다).

> **초판 정정**: 초판은 "실질 피해가 있다"고 썼다. 그 인과는 틀렸다 —
> 호출부는 **전부 리터럴이거나 이미 좁혀져 있다**(`events.ts:102`는 `Event["status"]`로
> 좁힘, `:222`/`:234`/`:240`은 리터럴, `admin/+page.server.ts:135,137,150`도 리터럴).
>
> 2차는 그 사실로 🟡까지 내렸는데, **그건 기준을 잘못 잡은 것이다.** 타입의 역할은
> 도메인의 모양을 선언하는 것이다. 도메인이 값 셋이고 선언이 `string`이면
> **선언이 거짓**이고, 오늘 그 거짓을 이용하는 호출부가 없다는 사실은 선언을 참으로
> 만들어주지 않는다. 좁은 타입의 값어치는 바로 그 "아직 없는 호출부"를 막는 것이므로,
> 호출부가 전부 안전하다는 관찰로 타입 결함을 감면하면 **순환 논증**이 된다. **🟠 복귀.**

같은 결함이 `:132` `updateAttendanceRecordInNotion`의
`props.Status = { select: { name: updates.status } }`에도 있고,
**이쪽은 `updates: any`라 아무것도 좁히지 않아 더 나쁘다.** 초판은 이 인스턴스를 놓쳤다.

---

## EV-7 · EV-8 🟡 메모

- **EV-7** `getDatabaseSchema`(`:147-160`)는 임의 DB의 스키마를 읽는 범용 함수인데
  이벤트 모듈에 있다. 호출부는 `admin/events/new/+page.server.ts:24` 하나다(확인).
  `notion/client.ts`가 맞는 자리다
- **EV-8** `:38` `|| "draft"` · `:109` `|| "pending"` — 도메인 규칙이 매핑 표현식 안에 숨어 있다.
  **다만 위험한 기본값은 이쪽이 아니라 EV-10의 `date: ""`였다**

---

## 지적하지 않은 것

- **`getEventsFromNotion`에 캐시가 없는 것**: 상위 `events.ts:19` `getEvents`가 감싼다. 계층 분리가 맞다
- **`filter_properties` 이벤트 7속성**: 이름 기반 지정이 유효함을 `members.md`에서 실측했다.
  "속성 추가 시 여기 안 넣으면 조용히 사라진다"는 함정은 유효
- **빈 JSDoc**(`:2-3`): 이 디렉터리 8개 모듈 중 4개가 동일하다
  (activities · applications · events · seminars). 템플릿 잔재
- **`createEventInNotion`이 `null`을 반환할 수 있는 것**: `events.ts:64-65`가
  `if (!id) throw`로 받아낸다. **문제 없다**
- **출석 큐 조회의 페이지네이션**: `notionQuery`가 `client.ts:65-98`에서 커서 루프를 돈다. **문제 없다**

---

## 우선순위

1. **EV-9** — 행사 당일에 체크인이 막힌다. 상시 발생. 비교 전 `slice(0,10)` 수준의 수정
2. **EV-1 ②** — 공개 라우트 `load`에서 파괴적 분기 제거. **한 줄, 회귀면 없음**
3. **EV-10** — `connect` 라우트의 `date` 검증. EV-9와 같은 비교문이 원인
4. **EV-1 ①③④** — `checkPageExists` 오류 타입(`client.md` C-1 선행), cron 건너뛰기, `CRON_SECRET`
5. **EV-2 / EV-3 / EV-5** — 상수화, 시그니처, 별칭
6. **EV-6 / EV-4 / EV-7 / EV-8** — 이후

> **선행 과제**: 프로덕션 env로 두 DB 스키마 실측. `seminars.md` S-1이 그 대조에서 나왔다.

---

## 개정 이력

| 변경               | 내용                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **EV-9 신설 🔴🔴** | `datetime-local` 값과 날짜만인 `todayKST`의 문자열 비교 → 당일 미활성화. 주석도 거짓                  |
| **EV-10 신설 🟠**  | `date: ""`이면 `>= ""`가 true → 즉시 활성화                                                           |
| **EV-1 재구성**    | 위험한 호출부가 cron이 아니라 **공개 라우트**. 🔴 유지하되 근거 교체                                  |
| EV-1 연쇄 철회     | 루프에 `try/catch`가 없어 예외가 cron을 중단시킨다 → 일괄 만료 **불가능**                             |
| EV-1 보강          | `CRON_SECRET` 미설정 → cron 엔드포인트 공개                                                           |
| **EV-5 모순 정정** | "관리자 게이트 뒤"는 **거짓**. `ensureSession`은 로그인만 본다. `client.md`에 내가 쓴 사실과 모순됐다 |
| EV-4 강등 🟠→🟡    | 살아 있는 오염 경로 없음. Notion 동작은 문서로 확인. `:132` 인스턴스 추가                             |
| 함수 개수 정정     | "7개" → **8개**                                                                                       |
| 우선순위 재배치    | 일어나지 않는 cron 연쇄 1순위 → **상시 발생하는 날짜 버그 1순위**                                     |

### 3차 — 판정 기준 정정 (2026-08-25)

| 변경                | 내용                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **EV-4 승격 🟡→🟠** | 2차는 "오염을 일으킬 살아 있는 경로가 없다"로 감면했다. 좁은 타입의 값어치가 바로 **아직 없는 호출부를 막는 것**이므로, 호출부가 전부 안전하다는 관찰로 타입 결함을 감면하면 순환 논증이다. `string` 선언은 도메인이 값 셋인 이상 거짓이다 |
