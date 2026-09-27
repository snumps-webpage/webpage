# `src/lib/server/events.ts`

244줄 · 함수 13개 · 이벤트/출석 도메인 서비스 계층
검토 2026-08-25 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판은 SE-11의 인과가 틀렸고, **`all_events` 캐시를 "제대로 되어 있는 쪽"이라고 면죄**했다.
> 그 자리에 🔴짜리 결함이 있었다. 🔴 3건을 놓쳤다. §개정 이력 참조.

> 판정 기준은 `README.md` §판정 기준. "지금 안 터진다"는 감면 근거가 아니다.
> `.env`에 `NOTION_DB_EVENTS`가 **없어서** 이 기능 전체가 무동작인데,
> 그것으로 감면된 지적은 하나도 없다. env는 배포 상태이지 코드의 성질이 아니다.

---

## 요약

| #         | 지적                                                                                      | 분류      | 심각도 |
| --------- | ----------------------------------------------------------------------------------------- | --------- | ------ |
| **SE-16** | **거부된 출석이 회원을 영구 잠그고, 그 사실을 "이미 출석하셨습니다"로 보고한다**          | 버그      | 🔴     |
| **SE-17** | **과거 날짜 이벤트가 `draft`→`active`→`expired`를 거치며 공개 출석 창을 연다**            | 버그      | 🔴     |
| **SE-15** | **`syncEventStatuses`가 캐시를 지나지 않는 쓰기 경로다 — `all_events`도 관리되지 않는다** | 버그      | 🔴     |
| **SE-3**  | **`attendance_queue` 캐시가 어떤 쓰기에도 무효화되지 않아 중복 방지 가드가 뚫린다**       | 버그      | 🔴     |
| **SE-2**  | **`publishEvent`는 "atomically"라고 문서화됐지만 실패 시 Notion 페이지를 고아로 남긴다**  | 버그      | 🔴     |
| **SE-1**  | **`syncEventStatuses`가 형식이 다른 두 값을 문자열 비교한다 + 주석이 거짓**               | 버그      | 🔴     |
| SE-6      | 이벤트 `date`의 형식 소유자가 없다 — 생산자 3곳이 형식 2가지를 쓴다                       | 설계      | 🟠     |
| SE-7      | `publishEvent`가 있는데 같은 두 단계가 다른 두 곳에 재구현돼 있다                         | 중복      | 🟠     |
| SE-8      | 서비스 계층이 반만 있다 — 라우트가 6곳에서 Notion을 직접 부른다                           | 계층      | 🟠     |
| SE-9      | `deleteEvent`가 가드 없는 통과 함수라 공개 라우트의 GET이 이벤트를 지운다                 | 안전성    | 🟠     |
| SE-4      | `recordAttendance`가 쓰지 않은 값을 쓴 것처럼 반환한다                                    | 버그      | 🟠     |
| SE-5      | KST 벽시계 값에 `Z`가 붙은 채 세 경로로 영속화된다 (9시간 오차)                           | 버그      | 🟠     |
| SE-18     | `:179-183`이 오류 원인을 버리고 두 실패를 같은 문자열로 만든다                            | 오류 처리 | 🟠     |
| SE-13     | `attendCode`가 44비트다 — `.slice(0,12)`가 하이픈을 먹는다                                | 설계      | 🟠     |
| SE-11     | `getEvent`/`getEventByPathId`가 `skipCache`를 전달하지 않는다                             | 일관성    | 🟡     |
| SE-12     | 오류를 `[]`로 삼켜 "장애"와 "없음"을 구분할 수 없다                                       | 오류 처리 | 🟡     |
| SE-20     | `syncEventStatuses`가 상한 없는 직렬 팬아웃이다                                           | 확장성    | 🟡     |
| SE-14     | `id`와 `notionId`가 항상 같은데 필드가 둘이다                                             | 설계      | 🟡     |
| SE-19     | `:219` 로그가 "removed"라고 하는데 코드는 `expired`로 바꾼다                              | 명료성    | 🟡     |
| SE-10     | TTL 매직 넘버 2개                                                                         | 하드코딩  | 🟡     |

**환경 사실**(감면 근거 아님, 검증 방법에만 영향):
`.env`에 `NOTION_DB_EVENTS` · `NOTION_DB_ATTENDANCE_QUEUE` · `CRON_SECRET` · `REDIS_URL`이 없다.
아래 지적은 전부 **코드 판독과 국소 실행**으로 확정했다. 라이브 측정은 불가능하다.

**이 파일 밖으로 보내는 것** (A-f에서 다룰 것, 여기서 재도출 금지):
`admin/events/connect/+page.server.ts:27` `publish` 액션에 **관리자 검사가 없다.**
`load`(`:10`)만 `isAdmin`을 보고, POST 액션은 `locals`조차 받지 않는다.
`hooks.server.ts:32-67`의 `membershipGuard`는 로그인·회원 여부만 보고 관리자는 보지 않는다.
→ **승인된 회원 누구나 이벤트를 발행할 수 있다.** SE-17의 진입점이기도 하다.

---

## SE-16 🔴 거부하면 영구히 잠긴다

`:140-146` 중복 검사의 술어:

```ts
const existing = queue.find(
  (r) => r.eventId === eventId && r.userEmail === user.email,
);
if (existing) return { record: existing, isNew: false };
```

**`status`가 술어에 없다.** 그리고 큐 조회에는 필터가 없다 —
`notion/events.ts:100` `const results = await notionQuery(dbId);` (필터 인자 없음).
거부된 행도 그대로 돌아온다.

`admin/+page.server.ts:198` `rejectAttendance`는 상태만 바꾸고 **행을 남긴다**:

```ts
await updateAttendanceStatus(data.get("id") as string, "rejected");
```

연쇄:

| 단계                                    | 결과                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| 회원이 출석 → 관리자가 거부             | 행이 `rejected`로 남음                                                             |
| 회원이 다시 출석 시도                   | `:141`이 그 행을 찾음 → `isNew: false`                                             |
| `events/[id]/[type]/+page.server.ts:78` | `fail(409, "이미 출석하셨습니다.")`                                                |
| 관리자 대시보드                         | `admin:57` `queue.filter((r) => r.status === "pending")` → **거부된 행은 안 보임** |

**거부가 되돌릴 수 없는 함정이 되고, 스스로를 "중복"이라고 보고한다.**
회원은 출석했다는 말을 듣고, 관리자는 그런 시도가 있었다는 것조차 못 본다.

"이미 출석했는가"와 "이 이벤트에 대한 행이 존재하는가"는 다른 질문인데
코드가 후자로 전자를 답한다. 술어에 `r.status !== "rejected"`가 빠진 것이 아니라,
**애초에 두 질문이 구분되지 않았다.**

---

## SE-17 🔴 과거 날짜 이벤트가 공개 출석 창을 연다

`:233`과 `:239`는 **순차 `if` 두 개**이고, 둘 다 `event.status`를 읽는다.
`:234`가 Notion을 고쳐도 **로컬 `event` 객체는 그대로**이므로 한 번의 순회에서
`draft`가 `expired`까지 가지 않는다.

```ts
if (event.status === "draft" && todayKST >= eventDay) {   // 통과
  await updateEventStatusInNotion(event.id, "active");    // event.status는 여전히 "draft"
}
if (event.status === "active" && todayKST > eventDay) {   // "draft" !== "active" → 건너뜀
```

이제 `admin/events/connect`를 보자. 이 라우트의 **존재 이유가 과거 Notion 활동을
이벤트로 발행하는 것**이다 — `load:14`가 `getAllActivities()`로 기존 활동을 나열하고,
`+page.svelte:87`이 그 활동의 원래 날짜를 hidden으로 실어 보낸다.
`createEvent:58`은 무조건 `status: "draft"`를 준다.

| cron 회차 | 조건                          | 결과         |
| --------- | ----------------------------- | ------------ |
| 1회차     | `todayKST >= 과거날짜` → true | **`active`** |
| 2회차     | `todayKST > 과거날짜` → true  | `expired`    |

**두 회차 사이에 `/events/{pathId}/{attendCode}`가 살아 있다.**
`events/[id]/[type]/+page.server.ts:34`가 `status === "active"`만 보므로
로그인한 회원 누구나 **몇 달 전 행사에 체크인할 수 있다.**

상태 기계에 "이미 지난 날짜 → 곧바로 `expired`" 전이가 없다.
SE-1과 독립이다 — 날짜가 깨끗한 `YYYY-MM-DD`여도 그대로 발생한다.

수정: 두 번째 `if`를 `else if`로 바꾸는 것으로는 부족하다.
**만료 검사를 먼저** 하거나, 활성화 조건을 `todayKST === eventDay.slice(0,10)`로 좁혀야 한다.

---

## SE-15 🔴 `syncEventStatuses`가 캐시 밖에서 쓴다

`:222`·`:234`·`:240`이 `updateEventStatusInNotion`을 **직접** 부른다 —
같은 파일의 래퍼 `updateEventStatus`(`:97`)도 아니고, 액션 래퍼도 아니다.

무효화가 일어나는 유일한 장소를 전수 확인했다:

```
$ grep -rn "invalidateCache" --include=*.ts src/
src/lib/server/cache.ts:125      ← 정의
src/lib/server/auth-guards.ts:105,109
src/lib/server/auth-guards.ts:164,168
```

`invalidateCache`는 **`handleAdminAction`/`handleUserAction`의 `invalidate` 옵션을 통해서만**
호출된다. `syncEventStatuses`는 cron 라우트(`api/cron/sync-events/+server.ts:15`)에서
직접 불리므로 그 훅을 지나지 않는다. **`events.ts` 안에서는 `invalidateCache`가 한 번도 안 불린다.**

결과: cron이 이벤트 상태를 바꾼 뒤 최대 60초간 `getEvents`가 이전 상태를 낸다.
같은 순회 안에서 `getEvents()`(`:210`)로 읽은 값을 근거로 판단하므로,
**직전 회차의 결과를 못 본 채 다시 판단할 수도 있다** (`skipCache` 미전달, SE-11·SE-20).

두 번째 무효화 없는 쓰기 경로가 `events/[id]/[type]/+page.server.ts:29`에 있다 —
`load` 안의 `deleteEvent`다. `load`는 액션이 아니라 `invalidate` 훅 자체가 없다 (SE-9).

> **초판 정정**: 초판은 "`all_events`는 무효화가 4곳 걸려 있으니 제대로 되어 있는 쪽"이라고
> **면죄부를 줬다.** 4곳(`admin:141,153,165,270`)은 전부 관리자 액션이고,
> 쓰기 경로 중 **cron과 공개 라우트 두 개가 빠져 있다.** SE-3과 같은 결함이
> 같은 파일에서 다른 키에 대해 벌어지고 있는데, 한쪽을 정상이라고 적었다.
> 놓친 것이 아니라 **틀린 것을 적었다** — 그쪽이 더 나쁘다.

---

## SE-3 🔴 중복 방지 가드가 자기가 안 지우는 캐시를 읽는다

`:114-116` 출석 큐를 30초 캐시한다. `:140-146` 중복 검사는 **그 캐시를 읽는다**.
`:152` 통과하면 Notion에 쓴다. **쓰고 나서 캐시를 지우지 않는다.**

`invalidate: "attendance_queue"`는 코드베이스에 **0건**이다:

```
$ grep -rn "attendance_queue" --include=*.ts src/
src/lib/server/events.ts:115        ← 정의부. 이게 전부다
```

| 쓰기 함수                | 줄     | 캐시 무효화 |
| ------------------------ | ------ | ----------- |
| `recordAttendance`       | `:136` | ❌          |
| `updateAttendanceRecord` | `:186` | ❌          |
| `updateAttendanceStatus` | `:194` | ❌          |
| `removeAttendanceRecord` | `:201` | ❌          |

호출부도 마찬가지다 — `admin:191`은 `user_activities_${userEmail}`만 지우고,
`:198`·`:221`은 무효화 옵션이 없다.

**결과 두 가지.** ① 30초 안의 재요청이 중복 레코드를 만든다 —
`:144`의 가드가 자기가 방금 만든 레코드를 못 본다.
② 승인/거부/삭제 후 30초간 관리자 화면이 옛 상태다.

> **무효화만으로는 안 고쳐진다.** `REDIS_URL`이 없으므로 `withCache`는
> 람다별 `Map`이고(`cache.ts:16`), `invalidateCache`(`:125`)는 그 인스턴스의 `Map`만 지운다.
> 게다가 무효화가 완벽해도 **읽고-확인하고-쓰는 구조 자체가 TOCTOU**이고
> Notion에는 유일성 제약이 없다. 캐시는 창을 30초로 늘릴 뿐이다.
> (Redis 부재는 **지적을 감면하는 근거가 아니다** — 제안한 수정을 기각하는 근거다.)

근본 수정은 Notion 쪽 제약이거나, 쓰기 전 `skipCache: true` 재확인 + 사후 정리다.
`CROSS-CUTTING.md` X-3의 네 번째(SE-15까지 세면 다섯 번째) 사례다 —
국소적 실수가 아니라 **구조적 습관**이다.

---

## SE-2 🔴 `publishEvent`는 원자적이지 않다

`:70-73` JSDoc이 `atomically`라고 말한다. `:80-92` 본문에는 `try`도 보상도 없다:

```ts
const notionPage = await createActivityPage({...});   // 1단계
const event = await createEvent({...});               // 2단계 — 실패하면?
```

`createEvent`(`:64-65`)는 실패 시 던진다.
호출 경로를 추적했다 — `publishEvent` throw → `handleAdminAction`의 catch
(`auth-guards.ts:175-189`) → `fail(500)`. `admin/+page.server.ts:246`
`createSeminarInNotion`과 `:267` `updateSeminarRequestStatus`는 **도달하지 않는다.**

|                        | 상태                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| Notion Activity 페이지 | **생성됨. 고아.**                                                   |
| Event 레코드           | 없음                                                                |
| 세미나 신청            | **pending 그대로**                                                  |
| 재승인 시              | `:239`가 `createActivityPage`를 무조건 다시 부름 → **고아 하나 더** |

`createEventInNotion`이 `null`을 주는 조건은 `notion/events.ts:51` `if (!dbId) return null`뿐이다
(`notionCreate`는 `client.ts:142-151`에서 `!ok`에 던진다). 즉 지금 환경에서는 **매번** 이 경로다.

> env 이야기가 아니라 **오류 처리 이야기**다. env가 채워져도 Notion 4xx는
> `if (!id)`가 아니라 throw로 오지만, 1단계가 이미 커밋됐다는 결론은 동일하다.
> 주석이 원자성을 약속하는 것이 별도의 결함이다 — 읽는 사람이 방어를 안 짜게 만든다.

`publishEvent`가 성공하고 `admin:246`이 실패하면 Activity + Event가 둘 다 중복된다.
`admin:239-267`은 **보상 없는 순차 Notion 쓰기 5개**다 (그쪽은 A-f 몫).

---

## SE-1 🔴 형식이 다른 두 문자열을 비교한다

`:209-243`:

```ts
const todayKST = getKSTDate(undefined, true);   // "2026-08-25"

// event.date is stored in YYYY-MM-DD format (already KST based from creation)
const eventDay = event.date;

if (event.status === "draft" && todayKST >= eventDay) { ... }
if (event.status === "active" && todayKST > eventDay) { ... }
```

`:228`의 주석이 **거짓**이다. 생산자 세 곳 중 하나만 `YYYY-MM-DD`다:

| 생산자                                                                                                                               | 형식                |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `admin/events/new/+page.svelte:26` `<input type="datetime-local">` → `+page.server.ts:45` (`// YYYY-MM-DDTHH:mm` 주석까지 붙어 있다) | 날짜+시각           |
| `admin/events/connect/+page.svelte:87` hidden, Notion 원본                                                                           | 날짜 또는 날짜+시각 |
| `admin/+page.server.ts:237` `getKSTDate(undefined, true)` → `publishEvent`                                                           | `YYYY-MM-DD`        |

**첫 번째 경우의 비교** (실행 확인):

```
getKSTDate(undefined, true)                        →  "2026-08-25"
"2026-08-25" >= "2026-08-25T15:00"                 →  false
"2026-08-25" >= "2026-08-25T15:00:00.000+09:00"    →  false
"2026-08-26" >= "2026-08-25T15:00:00.000+09:00"    →  true
```

**이 결론은 Notion의 정규화 형식과 무관하다.** 시각이 붙은 어떤 표현이든
길이가 10자를 넘고 11번째 문자가 `T`인데, `"T"`(0x54)는 모든 숫자(0x30–0x39)보다 크다.
따라서 `todayKST`가 항상 사전순으로 작다.

| 시점         | `draft → active`                                             | 출석 체크인                                       |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------- |
| 행사 당일    | 일어나지 않음                                                | **403** (`events/[id]/[type]/+page.server.ts:34`) |
| 다음 날      | true → 활성화 _(추정. Notion이 날짜 부분을 보존한다는 가정)_ | 가능                                              |
| 그 다음 cron | `>` 도 true → `expired`                                      | 403                                               |

**행사 당일에는 절대 체크인이 안 되고, 하루 늦게 하루만 열린다.**

> 2행은 측정이 아니라 추정이다. Notion이 시간대 없는 datetime을 UTC로 해석해
> `+09:00`으로 재출력하면 날짜가 하루 밀려 활성화가 D+2로 간다.
> `NOTION_DB_EVENTS`가 없어 확인 불가. **1행은 형식과 무관하게 확정이다.**

최소 수정 `event.date.slice(0, 10)`. 근본 수정은 SE-6.

---

## SE-6 🟠 `date`의 형식을 소유하는 자리가 없다

생산자 셋, 형식 둘. 중간의 `createEvent`(`:56`)는 `date: data.date || ""`로
**무엇이든 통과시킨다.** 빈 문자열이면 `:233`의 `todayKST >= ""`가 항상 참이라
날짜 없는 이벤트가 즉시 활성화된다. 타입도 막지 못한다 — `types.ts:55`는 `string`이다.

이 도메인에는 "이벤트 날짜"라는 개념이 하나인데, 그것을 표현하는 자리가 코드에 없다.
문자열이 세 곳에서 각자의 규약으로 만들어지고 한 곳에서 하나의 규약으로 읽힌다.

제안: `parseEventDate(raw): { day: string; at?: string }`를 `createEvent` 입구에 두고
소비자는 `.day`만 본다. SE-1·SE-17이 발생할 수 없는 종류의 버그가 된다.

---

## SE-7 🟠 같은 두 단계가 세 곳에 있다

`publishEvent`(`:74-95`)의 전부는 `createActivityPage` → `createEvent`다.

| 위치                                            | 형태                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `events.ts:80-92` `publishEvent`                | 원본                                                                           |
| `admin/events/new/+page.server.ts:53-66`        | **동일한 두 호출을 인라인 재구현** (`:5`에서 `createActivityPage` 직접 import) |
| `admin/+page.server.ts:130-135` `activateEvent` | `createActivityPage` → `updateEventStatus`. 클론은 아니지만 **같은 고아 위험** |

- SE-2의 고아 문제가 **세 곳에** 있다. 한 곳을 고쳐도 나머지가 남는다
- `publishEvent`에는 `attendeeIds`가 있는데 `events/new`에는 없다 — 이미 갈라졌다

---

## SE-8 🟠 계층이 반만 있다

이 파일의 목적은 라우트를 Notion에서 떼어놓는 것이고, 그 목적 자체는 옳다.
문제는 **경계가 뚫려 있다**는 것이다:

| 라우트                                      | 직접 부르는 Notion 함수                      |
| ------------------------------------------- | -------------------------------------------- |
| `events/[id]/[type]/+page.server.ts:10,24`  | `checkPageExists`                            |
| `admin/events/new/+page.server.ts:5,54`     | `createActivityPage`                         |
| `admin/events/new/+page.server.ts:6,24`     | `getDatabaseSchema`                          |
| `admin/events/connect/+page.server.ts:2,14` | `getAllActivities` ← SE-1 표 2행의 날짜 출처 |
| `admin/+page.server.ts:6,130`               | `createActivityPage`                         |
| `admin/+page.server.ts:7,186`               | `addAttendeeToActivity`                      |

반대편에는 이름만 바꾼 통과 함수 5개(`deleteEvent`, `updateEventStatus`,
`updateAttendanceRecord`, `updateAttendanceStatus`, `removeAttendanceRecord`)가 있다.

> **얇다는 것 자체는 지적이 아니다.** 계층 경계는 지금 한 줄이어도 있는 것이 옳다 —
> 캐시 무효화(SE-3·SE-15)와 가드(SE-9)가 들어갈 자리가 바로 거기다.
> 지적은 **어떤 연산은 그 자리를 지나고 어떤 연산은 지나지 않는다**는 비일관성이다.
> 그래서 SE-3·SE-15가 가능했다: 쓰기 일부가 계층 밖이라 무효화를 걸 곳이 없었다.

---

## SE-9 🟠 `deleteEvent`에 가드가 없다

```ts
export async function deleteEvent(id: string) {
  await deleteEventInNotion(id);
}
```

| 호출부                                  | 게이트                                                       |
| --------------------------------------- | ------------------------------------------------------------ |
| `admin/+page.server.ts:162`             | 관리자 ✅                                                    |
| `events/[id]/[type]/+page.server.ts:29` | **`ensureSession`뿐 — 로그인한 회원 누구나, `load` 안(GET)** |

`deleteEventInNotion`은 `notionArchive`의 별칭이다(`notion/events.ts:95`) —
`CROSS-CUTTING.md` X-4가 이미 정리했듯 **DB 소속 검사가 들어갈 자리를 지운 형태**다.
`:105`는 `admin:162`의 `data.get("id") as string`을 검증 없이 그대로 넘긴다.

**이 파일의 몫**: 계층 함수에 최소한의 게이트(호출자 역할, 또는 대상 DB 확인)가 없어서
라우트가 파괴적 연산을 도메인 연산처럼 부를 수 있다. `:105`가 한 줄이라 아무도 여기에
가드를 넣을 생각을 안 했다 — SE-8과 같은 뿌리다.

라우트 쪽 결함은 `notion/client.md` C-1, `notion/events.md` EV-1에 이미 있다.
A-f에서 **재도출 말고 역참조할 것.**

---

## SE-4 🟠 쓰지 않은 값을 쓴 것처럼 반환한다

`:160-177`:

```ts
updateAttendanceRecordInNotion(notionId, { endTime: nowKST }).catch(console.error);
//  ^ await 없음
const newRecord: AttendanceRecord = { ..., endTime: nowKST, status: "pending" };
return { record: newRecord, isNew: true };
```

fire-and-forget인데 반환 객체는 성공을 가정한다. 두 번째 쓰기가 실패하면
Notion에는 `endTime`이 없고 사용자 화면에는 있다.

`:152`와 `:162`를 하나의 생성 요청으로 합치면 두 번째 요청 자체가 사라진다.
단, `createAttendanceRecordInNotion`(`notion/events.ts:116-123`)에 `EndTime` 속성이
없으므로 **그쪽도 함께 고쳐야 한다** — 한 파일 수정이 아니다.

---

## SE-5 🟠 KST 벽시계에 `Z`가 붙은 채 저장된다

`utils.ts:82`:

```ts
return `${yyyymmdd}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}.000Z`;
```

`timeZone: "Asia/Seoul"`로 **KST 벽시계**를 뽑고 **`Z`(UTC)를 붙인다.**
실행 확인 — 09:51 KST에 `2026-08-25T09:51:38.000Z` (실제 UTC는 `00:51:38Z`). **9시간 미래.**

이 파일을 지나는 영속화 경로 **세 개**:

| 경로                                                                                              | 줄         |
| ------------------------------------------------------------------------------------------------- | ---------- |
| `createAttendanceRecordInNotion({ startTime: nowKST })`                                           | `:157`     |
| `updateAttendanceRecordInNotion(notionId, { endTime: nowKST })`                                   | `:162`     |
| `updateAttendanceRecord(recordId, updates)` ← `admin:211-212`가 `getKSTDate(new Date(startTime))` | `:186-191` |

세 번째가 가장 나쁘다. `admin`이 `datetime-local` 문자열을 `new Date()`로 파싱하는데
서버 로컬 존(Vercel = UTC)으로 해석되고, 그 결과를 다시 KST 벽시계+`Z`로 재표기한다.
**두 번 오염된다.**

> 결함의 정의는 `utils.ts`(A-d)에 있지만 **영속화하는 곳은 여기**다. 도달 시 역참조할 것.
> `:174`의 `endTime`은 반환 객체의 필드일 뿐 쓰기가 아니다 (초판이 잘못 인용했다).

---

## SE-18 🟠 오류 원인을 버린다

`:179-183`:

```ts
} catch (e) {
  console.error("Notion attendance write failed:", e);
}
throw new Error("Failed to record attendance in Notion");
```

잡은 `e`를 로그로만 쓰고 버린다. `cause`도 없다.
같은 `throw`가 **`notionId == null`인 경로도 담당**하므로,
"Notion 호출이 던졌다"와 "id를 못 받았다"가 경계에서 구분되지 않는다.

그 문자열이 `handleUserAction`을 통해 사용자에게 그대로 나간다.
SE-12(`return []`)와 다른 형태의 오류 삼킴이다.

---

## SE-13 🟠 `attendCode`가 44비트다

`:59-60`:

```ts
pathId: crypto.randomUUID().slice(0, 8),
attendCode: crypto.randomUUID().slice(0, 12),
```

`crypto.randomUUID()`는 `xxxxxxxx-xxxx-...` 형태다.
**`.slice(0, 12)`는 항상 `8 hex + "-" + 3 hex` = hex 11자리**다. 실행 확인:

```
500회 생성, 하이픈 포함 비율 100%.  예: "edd17bc1-a26"  → hex 11자리 = 44비트
```

의도가 48비트였다면 **한 글자를 구분자에 쓰고 있다.**
`attendCode`는 출석을 여는 **유일한 비밀**이다 (`events/[id]/[type]:37,54`).

`pathId`(hex 8 = 32비트)에는 생성 후 유일성 검사가 없다.
낮은 충돌 확률과 검사 부재는 다른 문제다 — 절단 길이 8·12에 근거도 없다.

> 초판은 여기서 `.find()`가 "다중 일치를 전제한다"고 썼다. **철회한다.**
> `.find()`는 유일 조회의 통상 관용구이고 충돌에 대해 아무것도 증명하지 않는다.

---

## SE-11 🟡 `skipCache`가 전달되지 않는다

`:37`·`:44`가 `getEvents()`를 인자 없이 부른다. `getEvents`에는 매개변수가 있는데도.

> **초판 정정**: 초판은 피해자를 "관리자가 방금 `active`로 바꾼 경우"로 들었다. **틀렸다.**
> `admin/+page.server.ts:141`이 `{ invalidate: "all_events" }`를 넘기고
> `auth-guards.ts:163-169`가 실제로 지운다. 관리자 경로는 정상이다.

실제 피해자는 **cron**이다. `syncEventStatuses:210`도 `getEvents()`를 인자 없이 부르고,
그쪽은 무효화하는 주체가 아무도 없다(SE-15). 상태를 바꾸는 배치 작업이
**읽기 캐시로 판단한다.**

선형 탐색(`:38`, `:45`)은 이벤트 수가 작으므로 지적하지 않는다.

---

## SE-12 🟡 장애와 부재를 구분할 수 없다

`:27-30`, `:124-127` 둘 다 `catch → console.error → return []`.
`getEvent`가 `undefined`를 주고 라우트가 404를 낸다.
Notion이 죽어 있을 때 관리자는 "이벤트가 하나도 없다"를 본다.
`members.md` M-8과 같은 패턴 — `CROSS-CUTTING.md`에 오류 표현 방식으로 묶을 것.

---

## SE-20 🟡 상한 없는 직렬 팬아웃

`:213-243`의 루프는 이벤트당 `checkPageExists` 왕복 1회 + 갱신 최대 1회를
**순차로** 돈다. 배치도, 상한도, 부분 진행 기록도 없다.

Vercel cron에는 벽시계 예산이 있다. 이벤트 *k*에서 시간이 끝나면
*k+1..n*은 조용히 동기화되지 않고, 다음 회차는 처음부터 다시 시작한다.
어디까지 처리했는지 남는 것이 없다.

---

## SE-14 🟡 `id`와 `notionId`가 항상 같다

생산 경로 두 곳 모두 같은 값을 넣는다 — `:120-123`의 `notionId: r.id`,
`:167-168`의 `id: notionId, notionId`.

`types.ts:63` 주석은 "often matches Notion ID if synced"라고 하지만
**실제로는 언제나 같다.** 로컬 저장소가 있던 시절의 잔재다.
`updateAttendanceRecord`의 주석(`:190`) "recordId is assumed to be Notion ID"가
그 불확실성을 문서로만 처리하고 있다.

`members.md` M-12(`id`/`memberId` 동일)와 같은 형태다.

---

## SE-19 🟡 로그가 동작과 모순된다

`:218-223`:

```ts
console.warn(
  `Event '${event.title}' ... removed because Notion page ... is missing or archived.`,
);
if (event.status !== "expired") {
  await updateEventStatusInNotion(event.id, "expired"); // removed가 아니라 expired
}
```

로그로 디버깅하는 사람이 일어나지 않은 삭제를 찾게 된다.

---

## SE-10 🟡 TTL 매직 넘버

`:23` `60000`, `:116` `30000`. 두 값이 다른 이유가 코드에 없다.
전역 12곳 패턴 — `members.md` M-3.
(`CROSS-CUTTING.md`에는 TTL 항목이 없다. 초판이 잘못 참조했다.)

---

## 지적하지 않은 것

- **함수 13개에 244줄** — 도메인이 둘(이벤트·출석)이지만 실제로 얽혀 있다
  (`recordAttendance`가 이벤트를 참조). 분리 이득 없음
- **`updateEventStatus`의 `notionPageId?` 선택 인자** — 호출부 3곳 중 1곳만 넘긴다.
  `notion/events.ts:87`에서 분기하므로 계층 자체는 정합적이다
- **`createEvent`의 `as Event` 단언** — `status: "draft"`가 리터럴이 아니라 `string`으로
  추론되는 것을 덮는 단언이다. `notion/events.md` EV-4와 같은 뿌리이므로 거기서 다룬다

> 초판에는 여기에 **"`getEvents`의 1분 TTL은 제대로 되어 있는 쪽"**이 있었다.
> 삭제했다 — SE-15가 그 자리의 결함이다.

---

## 수정 순서

1. **SE-16** — 술어에 상태를 넣거나 두 질문을 분리. 잠긴 회원이 지금도 있을 수 있다
2. **SE-17** — 만료 검사를 먼저, 또는 활성화를 당일로 좁히기. 공개 출석 창을 닫는다
3. **SE-1** — `event.date.slice(0, 10)`. 한 줄. 당일 체크인이 살아난다
4. **SE-15 / SE-3** — cron·`load` 경로에 무효화를 넣되, **SE-3은 그것만으로 안 고쳐진다**.
   중복 방지는 별도 설계가 필요하다 (§SE-3 말미)
5. **SE-2 + SE-7** — 되감기를 넣고 세 곳을 하나로. 함께 해야 의미가 있다
6. **SE-13** — `.slice(0,12)` → `.replace(/-/g,"").slice(0,12)`. 44 → 48비트
7. **SE-5** — `utils.ts:82`의 `Z` 제거. 저장된 값 마이그레이션 필요
8. **SE-9** — 가드 추가. 라우트 수정(A-f)과 함께
9. **SE-6** — `parseEventDate` 도입. SE-1·SE-17의 근본 수정
10. **SE-4 / SE-8 / SE-18** — 쓰기 통합, 계층 경계, 오류 전파
11. **SE-10~14 / SE-19 / SE-20** — 정리 단계

---

## 개정 이력

| 변경                             | 내용                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **SE-16 신설 🔴**                | 거부된 출석이 영구 잠금 + "이미 출석하셨습니다"로 오보. 관리자 화면에서도 안 보임                                                       |
| **SE-17 신설 🔴**                | 순차 `if` 두 개 + 낡은 `event.status` → 과거 날짜 이벤트가 cron 두 회차 사이에 공개 출석 창을 연다. `connect` 라우트의 주 용도가 진입점 |
| **SE-15 신설 🔴**                | `syncEventStatuses`가 `invalidateCache`를 지나지 않는다. `events.ts`에서 무효화는 0회                                                   |
| **면죄부 철회**                  | 초판이 "`all_events`는 제대로 되어 있는 쪽"이라고 **적었다.** 그 자리가 SE-15다. 놓친 것보다 나쁘다                                     |
| **SE-18 신설 🟠**                | `:179-183`이 원인을 버리고 두 실패를 같은 문자열로 만든다                                                                               |
| **SE-19 · SE-20 신설 🟡**        | 로그가 동작과 모순 / 상한 없는 직렬 팬아웃                                                                                              |
| **SE-11 인과 정정**              | "관리자가 방금 바꾼 경우"는 **거짓** — `admin:141`이 무효화한다. 실제 피해자는 cron                                                     |
| **SE-13 승격 🟡→🟠 + 근거 교체** | `.slice(0,12)`가 하이픈을 먹어 **44비트**. 실행 확인. `.find()` 논거는 패딩이라 철회                                                    |
| SE-3 수정안 보강                 | 무효화만으로 안 고쳐진다 — Redis 부재 + TOCTOU. **감면이 아니라 수정안 기각**                                                           |
| SE-5 인용 정정                   | `:174`는 쓰기가 아니다 → `:157`·`:162`. 세 번째 경로(`admin:211`, 이중 오염) 추가                                                       |
| SE-7 확대                        | 고아 발생 지점 2곳 → **3곳** (`admin:130-135` 추가)                                                                                     |
| SE-8 확대                        | 계층 우회 4곳 → **6곳** (`getDatabaseSchema`, `getAllActivities` 추가)                                                                  |
| SE-1 논거 강화                   | Notion 정규화 형식과 **무관**함을 증명(`"T"` > 모든 숫자). 2행은 추정으로 명시                                                          |
| SE-2 추적 보강                   | 실패 시 세미나가 pending에 남고 재시도가 고아를 더한다는 것을 호출 경로로 확인                                                          |
| SE-4 · SE-9 보강                 | 수정의 선행 조건(`EndTime` 속성 부재) / X-4 연결                                                                                        |
| 줄번호 정정 5건                  | `admin:238`→`237`/`239`, `events/[id]/[type]:33`→`34`, `notion/events.ts:85`→`87`, SE-5 `:174`→`:162`                                   |
| 잘못된 상호참조 삭제             | SE-10의 `CROSS-CUTTING.md` TTL 참조 — 그런 항목 없음                                                                                    |
| SE-14 정정                       | "생산 경로가 하나뿐"과 `:167-168` 인용이 모순. 둘이다                                                                                   |
| 라우트 결함 격리                 | `connect` `publish` 액션에 관리자 검사 없음 — A-f로 보냄, 여기서 재도출 금지                                                            |
