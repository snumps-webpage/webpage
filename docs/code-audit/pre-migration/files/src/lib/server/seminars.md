# `src/lib/server/seminars.ts`

131줄 · export 7개 · 세미나 신청 도메인 서비스
검토 2026-08-28 · 기준 `cd916f6`

> `CROSS-CUTTING.md` X-10이 이 파일을 "폴백 3 + 재전파 4"로 지목했다. 그 판정의 정본이다.

> **초판 정정.** SM-11의 후반이 **거짓**이었고(반환 타입을 선언해도 SM-5·SM-6은 안 드러난다),
> 그 때문에 수정 순서가 틀렸다. 더 큰 것 — **`notion/seminars.md` S-1+S-2를 인용하지 않아
> 수정 순서 1번이 지킬 수 없는 약속**이 됐다. 그리고 🔴짜리 IDOR를 놓쳤다. §개정 이력 참조.

> 판정 기준은 `README.md` §판정 기준. "지금 그렇게 부르는 호출부가 없다"는 감면 근거가 아니다.

---

## 요약

| # | 지적 | 분류 | 심각도 |
|---|---|---|---|
| **SM-12** | **`updateSeminarRequest`가 소유권 인자를 안 받고, 유일한 호출부에 검사가 없다 (IDOR)** | 보안 | 🔴 |
| **SM-1** | **장식 데이터 조회 실패가 본체를 통째로 버린다** | 버그 | 🔴 |
| **SM-2** | **타입은 상태 셋을 선언하는데 저장소는 둘만 담고, 셋째는 삭제로 구현돼 있다** | 설계 | 🔴 |
| SM-13 | 같은 조인이 라우트에 복제돼 있고 **정렬과 오류 처리가 반대다** | 중복 | 🟠 |
| SM-14 | `SeminarRequestSchema`가 죽어 있다 — 살아 있었다면 SM-4를 잡았다 | 정합성 | 🟠 |
| SM-3 | 반려 메일이 삭제보다 먼저 나간다 — 실패하면 "반려됨"을 통보받고 대기열에 남는다 | 버그 | 🟠 |
| SM-4 | `parseSpeakerIds`가 `JSON.parse` 결과를 검증 없이 `string[]`이라 단언한다 | 타입 | 🟠 |
| SM-5 | `createSeminarRequest`가 `status`·`submittedAt` **둘 다** 지어낸다 | 정합성 | 🟠 |
| SM-6 | 쓰기 세 함수가 Notion 상태가 아니라 **입력을 되돌려준다** | 정합성 | 🟠 |
| SM-7 | `catch → log → rethrow` 4곳이 로그만 중복시키고, 두 곳은 **문구가 같다** | 오류 처리 | 🟡 |
| SM-11 | 반환 타입 미선언 5개 — `status`가 유니온이 아니라 `string`으로 추론된다 | 타입 | 🟡 |
| SM-10 | `"Unknown"`이 두 가지 원인을 뭉갠다 | 도메인 | 🟡 |
| SM-8 | `:110`만 동적 import — 같은 모듈을 `:2-8`에서 정적으로 가져온다 | 일관성 | 🟡 |
| SM-9 | `members.find()`가 `map` 안에 있다 | 성능 | 🟡 |
| SM-15 | `:58`의 오류 문구가 가장 흔한 원인을 오귀속한다 | 명료성 | 🟡 |

**호출부 실측**:

```
getSeminarRequests  5   parseSpeakerIds 2   getPendingSeminarRequests 1
createSeminarRequest 1  updateSeminarRequest 1  updateSeminarRequestStatus 1  deleteSeminarRequest 1
```

---

## SM-12 🔴 소유권 검사가 어디에도 없다 (IDOR)

```ts
// :72-82
export async function updateSeminarRequest(
  id: string,
  data: { title?; description?; prerequisites?; duration?; speakerIds?; attachment? },
)
```

**누가 고치는지를 받지 않는다.** 그리고 유일한 호출부에 검사가 없다.

`seminar/edit/[id]/+page.server.ts:78-110`:

```ts
default: async ({ request, locals, params }) => {
  return handleUserAction(locals, async (session) => {
    …
    const requestId = params.id;              // ← URL에서 그대로
    …
    await updateSeminarRequest(requestId, { title, description, … , speakerIds, attachment });
  }, { invalidate: "all_seminar_requests" });
}
```

`handleUserAction`(`auth-guards.ts:81-89`)은 **세션이 있는지만** 본다.
`session`을 인자로 받아 놓고 `requestId`와 대조하지 않는다.

`load`(`:17-40`)도 소유권을 안 본다 — 검사하는 것은 셋뿐이다:
세션 존재(`:18`), 신청 존재(`:33`), `status === "pending"`(`:38`).
**`speakerIds`에 요청자가 들어 있는지 확인하지 않는다.**

그리고 **폼 POST는 `load`를 거치지 않는다.** 액션이 직접 호출되므로
`load`의 세 검사 중 어느 것도 적용되지 않는다.

| 공격자 | 가능한 것 |
|---|---|
| 승인된 회원 아무나 | `/seminar/edit/{임의 id}`로 POST |
| | 제목·설명·선수과목·기간·첨부 **덮어쓰기** |
| | `speakerIds` 교체 → **발표자 명의 탈취** |
| | `load`의 pending 검사도 안 거치므로 **승인된 신청도 수정 가능** |

`hooks.server.ts`의 `membershipGuard`는 회원 여부만 보고 소유권과 무관하다.

**이 파일의 몫**: SM-2에서 지적한 것과 같은 형태다 —
**시그니처가 막아야 할 호출부를 오히려 초대한다.**
`updateSeminarRequest(id, data)`가 `id`만 받으므로 호출부가 소유권을 생각할 이유가 없다.

```ts
export async function updateSeminarRequest(id: string, requesterId: string, data: {…}) {
  const req = (await getSeminarRequests()).find((r) => r.id === id);
  if (!req) throw new Error("not found");
  if (!req.speakerIds.includes(requesterId)) throw new Error("forbidden");
  …
}
```

라우트 쪽 수정은 A-f `seminar/edit/[id]/+page.server.ts`에서 다룬다.
**여기서 재도출하지 말고 역참조할 것.**

---

## SM-1 🔴 장식 실패가 본체를 버린다

`:108-131`:

```ts
export async function getPendingSeminarRequests(skipCache = false) {
  try {
    const { getAllMembers } = await import("./notion");
    const [requests, members] = await Promise.all([
      getSeminarRequests(skipCache),      // ← 자체 try/catch로 []를 반환한다(:31-34)
      getAllMembers(skipCache),           // ← 던진다(members.ts:109·111·122)
    ]);
    return requests.filter(…).map(…);
  } catch (e) {
    console.error("Failed to fetch pending seminar requests:", e);
    return [];                            // ← 신청 목록 전체를 버린다
  }
}
```

`getSeminarRequests`는 **이미 자기 catch에서 `[]`를 돌려준다**(`:31-34`).
따라서 이 바깥 catch가 실제로 잡는 것은 **`getAllMembers`의 실패뿐이다.**

`getAllMembers`가 하는 일은 `:120-125`에서 **발표자 이름을 붙이는 것**이다.
이름은 화면 장식이고, 신청 자체(제목·설명·기간·상태)는 `requests`에 이미 다 있다.

**장식을 못 가져왔다는 이유로 본체를 통째로 버린다.**

호출부는 관리자 대시보드다 — `admin/+page.server.ts:59`
`seminarRequests: getPendingSeminarRequests(skipCache)`.
회원 DB 조회가 실패하면 관리자는 **"대기 중인 세미나 신청 0건"**을 본다.
장애와 부재가 구별되지 않고(`X-10`), 승인해야 할 신청이 화면에서 사라진다.

`speakerNames`를 못 만들면 `"Unknown"`으로 두면 된다 — `:123`에 이미 그 폴백이 있다.
바깥 catch는 **그 폴백을 무의미하게 만든다.**

```ts
const members = await getAllMembers(skipCache).catch(() => []);
```
한 줄이면 이름만 `"Unknown"`이 되고 목록은 살아난다.

> **그러나 그것만으로 대기열이 살아나지는 않는다.**
> `notion/seminars.md` S-1+S-2(🔴🔴 "세미나 신청 기능이 통째로 죽어 있다")에 따르면
> `notion/seminars.ts:86`의 `filter_properties`에 Seminar Requests DB에 **없는 속성**
> (`NOTION_PROPS.SEMINAR_FILES` = `"강의 자료"`, `constants.ts:29`)이 들어 있어
> **모든 읽기가 400으로 죽는다.** 그러면 `getSeminarRequests`가 `[]`를 돌려주고
> 관리자는 `getAllMembers`와 무관하게 0건을 본다.
>
> 즉 **현재 0건인 원인은 SM-1이 아니라 S-1이다.** SM-1은 S-1을 고친 뒤 드러나는 결함이다.
> 초판은 S-1을 인용하지 않아 이 순서를 놓쳤다.

---

## SM-2 🔴 상태 셋을 선언하고 둘만 저장하며 셋째는 삭제한다

**선언**:

```
types.ts:27      status: "pending" | "approved" | "rejected"
schema.ts:72     status: z.enum(["pending", "approved", "rejected"])
seminars.ts:94   status: "approved" | "rejected"
```

**저장**은 체크박스 하나다 — `constants.ts:37` `SEMINAR_REQ_APPROVED: n("승인됨")`.

```ts
// notion/seminars.ts:201-208
export async function updateSeminarRequestStatusInNotion(id: string, status: string) {
  await notionUpdate(id, {
    [NOTION_PROPS.SEMINAR_REQ_APPROVED]: { checkbox: status === "approved" },
  });
}
```

**읽기는 두 값만 낼 수 있다** — `notion/seminars.ts:111-115`:

```ts
status: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_APPROVED])
  ? "approved"
  : "pending",
```

**`"rejected"`는 읽기에서 절대 나오지 않는다.**

### 셋째 상태는 삭제로 구현돼 있다

`admin/+page.server.ts:300`의 반려 경로는 상태를 바꾸지 않는다:

```ts
await deleteSeminarRequest(id);        // → removeSeminarRequestInNotion = notionArchive
```

**반려 = 아카이브.** 반려됐다는 기록이 남지 않고, 왜 반려됐는지도, 반려 이력도 없다.
승인은 체크박스 하나로 되돌릴 수 있는데 반려는 되돌릴 수 없다. **비대칭이다.**

### 그래서 `:92-95`가 위험하다

```ts
export async function updateSeminarRequestStatus(id: string, status: "approved" | "rejected") {
```

**시그니처가 저장소가 담을 수 없는 값을 받는다.**
`"rejected"`를 넘기면 `checkbox: false`가 되고, 그것은 읽기에서 **`"pending"`**이다.
반려한 신청이 **관리자 대기열로 되돌아온다** — `getPendingSeminarRequests:117`이
`status === "pending"`으로 거르기 때문이다.

지금 그렇게 부르는 호출부는 없다 — `admin:267`은 `"approved"`만 넘기고,
`admin:294`의 `"rejected"`는 **메일 함수**로 간다(`sendSeminarStatusNotification`).

> **감면 근거가 아니다.** 좁은 타입의 값어치가 바로 그 호출부를 막는 것인데
> 이 타입은 **오히려 초대한다.** 시그니처가 `"rejected"`를 받는다고 말하고 있으므로
> 다음 사람이 `deleteSeminarRequest` 대신 이것을 쓰는 것이 자연스럽다.
> `events.md` SE-16(거부된 출석이 pending으로 남아 영구 잠금)과 **같은 형태**다.

**수정 방향**: 상태를 select 속성(`pending`/`approved`/`rejected`)으로 바꾸고
반려를 삭제가 아닌 상태 전이로 만든다. 그 전까지는
`updateSeminarRequestStatus`의 시그니처를 `"approved"`로 좁혀 거짓말을 없앤다.

---

## SM-3 🟠 반려 메일이 삭제보다 먼저 나간다

`admin/+page.server.ts:284-300`:

```ts
await sendSeminarStatusNotification(info.email, member.name, seminar.title, "rejected");
…
await deleteSeminarRequest(id);        // ← 여기서 실패하면?
```

`deleteSeminarRequest`(`:37-44`)는 **재전파한다.**
`handleAdminAction`이 잡아 `fail(500)`을 낸다 — **그러나 메일은 이미 나갔다.**

| | 상태 |
|---|---|
| 신청자 | "반려되었습니다" 메일 수신 |
| Notion | 신청 그대로 |
| 관리자 대기열 | 그 신청이 그대로 보임 |
| 관리자 화면 | 500 오류 |

관리자가 다시 반려를 누르면 **반려 메일이 한 통 더 간다**
(`mail/templates.md` MT-1이 메일 실패를 삼킨다고 지적했는데, 여기는 반대로
**실패하지 않은 메일이 취소되지 않는다**).

> **초판 처방 정정.** 초판은 "순서를 뒤집으면(삭제 → 메일) 이 창이 **사라진다**"고 썼다.
> **틀렸다.** 창이 **뒤집힐 뿐이다** — `sendSeminarStatusNotification`은
> 자기 오류를 삼키므로(`mail/templates.ts:90-92`, MT-1) 삭제 후 메일이 조용히 실패하면
> **신청은 사라졌는데 신청자는 통보를 못 받고**, 행이 아카이브돼 되찾을 수도 없다.
> 초판은 바로 윗줄에서 MT-1을 인용해 놓고 자기 처방에 적용하지 않았다.
>
> 진짜 처방은 **MT-1을 먼저 고쳐 메일 실패를 호출부가 알게 하는 것**이다.
> 그 뒤에 삭제 → 메일 순으로 바꾸고, 메일 실패 시 관리자에게 수동 통보를 안내한다.

`events.md` SE-2(`publishEvent`의 보상 부재)와 같은 계열이다.

---

## SM-4 🟠 `JSON.parse` 결과를 검증 없이 `string[]`이라 단언한다

`:13-23`:

```ts
export function parseSpeakerIds(rawIds?: string | null): string[] {
  if (!rawIds) return [];
  try {
    return JSON.parse(rawIds);          // ← 반환 타입은 string[]
  } catch {
    return rawIds.split(",").map((id) => id.trim()).filter(Boolean);
  }
}
```

`JSON.parse`는 **아무 JSON 값이나** 돌려준다. 실측:

```
"null"        → null
"42"          → 42
"{\"a\":1}"   → {"a":1}
"[\"x\",1]"   → ["x",1]
```

넷 다 `catch`에 걸리지 않고 `string[]`으로 나간다.

입력은 폼 데이터다(`seminar/apply/+page.server.ts:60`,
`seminar/edit/[id]/+page.server.ts:94`) — **클라이언트가 통제한다.**

하류에서 무슨 일이 나는지:

| 값 | `:61` `speakerIds.length === 0` | `notion/seminars.ts:148` `(data.speakerIds \|\| []).map(…)` |
|---|---|---|
| `null` | **TypeError** (`null.length`) | 도달 못 함 |
| `42` | `undefined === 0` → false, 통과 | **TypeError** (`.map` 없음) |
| `{"a":1}` | 통과 | **TypeError** |
| `["x",1]` | 통과 | `[{id:"x"},{id:1}]` → **Notion 400** |

마지막이 가장 나쁘다 — 타입 오류 없이 **잘못된 relation이 API까지 간다.**

`Array.isArray` 한 줄이면 끝난다:

```ts
const parsed = JSON.parse(rawIds);
return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
```

`getPendingSeminarRequests:120`이 이미 `Array.isArray(r.speakerIds)`를 검사한다 —
**같은 파일이 한쪽에서는 방어하고 한쪽에서는 안 한다.**

---

## SM-5 🟠 `status`와 `submittedAt`을 둘 다 지어낸다

`:60-65`:

```ts
return {
  ...data,
  id,
  status: "pending",
  submittedAt: new Date().toISOString(),
};
```

`createSeminarRequestInNotion`(`notion/seminars.ts:123-158`)이 쓰는 속성은
제목·설명·선수과목·기간·발표자(·첨부)뿐이다. **`status`도 `submittedAt`도 쓰지 않는다.**

읽을 때의 값은 다른 데서 온다:

| 필드 | 읽기 출처 |
|---|---|
| `status` | 체크박스에서 파생(`notion/seminars.ts:111-115`) |
| `submittedAt` | `(page as any).created_time` (`:116`) |

**반환된 두 필드는 어디에도 저장되지 않은 값**이고, 같은 신청을 다시 읽으면 다르다
(`submittedAt`은 Notion 서버 시각).

`admin.md` AD-7과 같은 결함이고 여기는 **필드가 둘**이다.
`mail/templates.md` MT-11(코드가 보장하지 않는 것을 본문이 단언)과 같은 형태다.

---

## SM-6 🟠 쓰기 함수가 입력을 되돌려준다

```ts
:85   return { id, ...data };        // updateSeminarRequest
:98   return { id, status };         // updateSeminarRequestStatus
:60   return { ...data, id, … };     // createSeminarRequest
```

셋 다 **Notion에서 읽어온 것이 아니라 넘긴 것을 그대로 돌려준다.**

`updateSeminarRequestInNotion`이 부분만 적용했거나 Notion이 값을 정규화했어도
(예: `rich_text` 길이 제한, relation id 정규화) 반환값은 **입력 그대로**다.
호출부는 반영된 상태를 봤다고 믿는다.

`updateSeminarRequestStatus`가 특히 나쁘다 — `{ id, status: "rejected" }`를 돌려주는데
저장소에는 SM-2에 따라 `pending`이 들어간다. **반환값이 저장소와 반대다.**

현재 호출부 셋(`seminar/apply:68`, `seminar/edit/[id]:100`, `admin:267`)이
반환값을 버려서 드러나지 않는다 — 감면 근거가 아니다.
**모르면 반환하지 않거나 재조회해야 한다.**

---

## SM-7 🟡 `catch → log → rethrow` 4곳, 그중 둘은 문구가 같다

`:40-43`, `:66-69`, `:86-89`, `:99-102` — 전부 로그 후 `throw e`.

호출부는 `handleUserAction`/`handleAdminAction`이고
`auth-guards.ts:126`·`:184`가 **다시** `console.error("[Action Error]", e)`를 찍는다.
같은 예외가 두 줄로 남고 이 파일이 더하는 정보는 없다
(`notion/client.md` C-4, `admin.md` AD-5와 같은 패턴).

그리고 두 문구가 **글자까지 같다**:

```
:87    console.error("Failed to update seminar request in Notion:", e);
:100   console.error("Failed to update seminar request in Notion:", e);
```

`updateSeminarRequest`(내용 수정)와 `updateSeminarRequestStatus`(승인)는
**전혀 다른 동작**인데 로그만 보고는 어느 쪽이 실패했는지 알 수 없다.

X-10의 처방대로 로그는 경계에서 한 번만 남기고, 남긴다면 함수를 구별해야 한다.

---

## SM-11 🟡 반환 타입 미선언 5개

`deleteSeminarRequest`(`:37`), `createSeminarRequest`(`:46`),
`updateSeminarRequest`(`:72`), `updateSeminarRequestStatus`(`:92`),
`getPendingSeminarRequests`(`:108`) — 전부 없다.
선언된 것은 `parseSpeakerIds`(`:13`)와 `getSeminarRequests`(`:27`) 둘뿐이다.

실제 효과는 하나다 — `createSeminarRequest`의 `status: "pending"`이
**리터럴이 아니라 `string`으로 추론되어** 아무 문자열이나 대입 가능해진다.
`Promise<SeminarRequest>`를 붙이면 그 구멍은 닫힌다.

> **초판 후반 철회.** 초판은 "반환 타입을 선언하면 SM-5·SM-6이 **컴파일 시점에 드러난다**"고
> 썼다. **틀렸다.** `Promise<SeminarRequest>`를 붙이면 문맥 타이핑이 `"pending"`을
> 리터럴로 좁혀 **그대로 통과한다**(`tsc --strict` 확인).
> TypeScript는 **어떤 필드가 저장소에서 읽은 것이고 어떤 필드가 지어낸 것인지 구별할 수 없다.**
> SM-5·SM-6은 타입 결함이 아니라 **출처(provenance) 결함**이다.

`getPendingSeminarRequests`의 반환은 익명 형태(`SeminarRequest & { speakerNames: string[] }`)이고
이름이 없어 호출부(`admin/+page.svelte`)가 자기 인터페이스를 다시 선언한다
(`admin.md` AD-10의 세 번째 `Application`과 같은 병).

---

## SM-10 🟡 `"Unknown"`이 두 원인을 뭉갠다

`:123` `return m ? m.name : "Unknown";`

`m`이 없는 이유는 둘이다 — **회원이 삭제·아카이브됐거나**,
**relation id가 애초에 잘못됐거나**(SM-4의 `["x",1]` 경로).
둘 다 데이터 정합성 문제인데 화면에는 같은 글자로 나온다.

문자열이 하드코딩이라 i18n·표기 변경도 여기 한 곳을 찾아야 한다.
`admin.md` AD-8이 같은 종류를 지적했다 — **버린 것에 대해 아무 말도 하지 않는다.**

최소한 몇 건이 해소 실패했는지 로그로 남기면 SM-4의 오염이 드러난다.

---

## SM-13 🟠 같은 조인이 복제돼 있고 의미가 다르다

`api/admin/seminar-requests/+server.ts:13-32`가 `getPendingSeminarRequests`를
**호출하지 않고 다시 구현한다** — 같은 `getSeminarRequests` + `getAllMembers`,
같은 `.filter(r => r.status === "pending")`, 같은 `Array.isArray` 가드,
같은 `members.find` in `.map`, 같은 `"Unknown"`(`:29`).

**그런데 두 곳의 의미가 다르다:**

| | `seminars.ts:108` | `api/.../+server.ts:7` |
|---|---|---|
| 정렬 | **없음** | `submittedAt` 오름차순(`:20-23`) |
| `getAllMembers` 실패 | try/catch → `[]` (SM-1) | **없음 → 500** |

호출부가 갈린다 — SSR은 `admin/+page.server.ts:59`가 `getPendingSeminarRequests`를,
새로고침은 `admin/+page.svelte:134-136`이 이 엔드포인트를 부른다.

**같은 화면이 첫 로드와 새로고침에서 다른 순서를 보이고, 실패 방식도 반대다.**
관리자가 새로고침을 누르면 표가 재정렬된다.

이 지적은 다른 셋의 범위를 넓힌다 —
SM-9의 `Map` 수정은 **두 곳**이고, SM-10의 `"Unknown"`도 **두 곳**이며,
SM-1의 "0건을 본다"는 **두 경로 중 하나에만** 해당한다.

라우트 쪽 수정은 A-f에서. 이 파일의 몫은 **`getPendingSeminarRequests`를 export해 두고도
라우트가 그것을 안 쓰게 만든 것**이다 — 반환 타입에 이름이 없어서(SM-11)
엔드포인트가 자기 형태를 다시 만드는 편이 쉬웠다.

---

## SM-14 🟠 올바른 스키마가 죽어 있다

`notion/schema.ts:64-74`에 정확한 모양의 zod 스키마가 있다 —
`speakerIds: z.array(z.string())`와 세 상태 enum까지 포함해서.

```
$ grep -rn "SeminarRequestSchema" --include=*.ts src/
src/lib/server/notion/schema.ts:64:export const SeminarRequestSchema = z.object({
src/lib/server/notion/schema.ts:76:export type SeminarRequest = z.infer<typeof SeminarRequestSchema>;
```

**정의와 자기 자신의 타입 파생 외에 사용처가 0곳이다.**

살아 있었다면 SM-4의 `["x",1]`·`{"a":1}`·`42`가 **전부 여기서 걸렸다.**
`speakerIds: z.array(z.string())`가 정확히 그 검사다.

그리고 `SeminarRequest`가 **셋**이다:

| 정의 | 검증 | 사용 |
|---|---|---|
| `types.ts:19` | 없음 | `seminars.ts:1`이 쓰는 것 |
| `schema.ts:76` (`z.infer`) | zod | **0곳** |
| `admin/+page.svelte:29` | 없음 | 그 컴포넌트 지역 |

`admin.md` AD-10(`Application`이 셋)과 **정확히 같은 형태**이고 개수까지 같다.
**검증되는 쪽이 죽어 있고 검증 안 되는 쪽이 이긴다.**

---

## SM-15 🟡 오류 문구가 가장 흔한 원인을 오귀속한다

`:58` `if (!id) throw new Error("Notion creation returned no ID");`

**검사 자체는 옳다** — `admin.md` AD-6이 `addApplication`에 이것이 **없다**고 지적했고
이쪽이 정본이다.

그러나 `createSeminarRequestInNotion`이 `null`을 주는 조건은 하나뿐이다:

```ts
// notion/seminars.ts:131-132
const dbId = env.NOTION_DB_SEMINAR_REQUESTS;
if (!dbId) return null;
```

**설정 부재다.** Notion이 응답을 안 준 것이 아니라 **호출 자체를 안 했다.**
`notionCreate`는 실패하면 던지므로(`client.ts:151`) 이 경로로 오지 않는다.

`"Notion creation returned no ID"`는 API 문제를 가리키고,
로그를 보는 사람이 Notion 상태부터 확인하게 만든다. 실제 원인은 `.env` 한 줄이다.

---

## SM-8 🟡 `:110`만 동적 import

```ts
:2-8    import { getSeminarRequestsFromNotion, … } from "./notion";
:110    const { getAllMembers } = await import("./notion");
```

**같은 모듈이다.** 순환 참조도 아니고(이미 정적으로 가져오는 중) 지연 이득도 없다.
`CROSS-CUTTING.md` X-9의 16곳 중 하나이고, **같은 파일 안에서 두 방식을 쓰는 5개 파일** 중 하나다.

---

## SM-9 🟡 `members.find()`가 `map` 안에 있다

`:121-124`:

```ts
r.speakerIds.map((id) => {
  const m = members.find((member) => member.id === id);
  return m ? m.name : "Unknown";
})
```

신청 수 × 발표자 수 × 회원 수. 회원 231명(`notion/schema.md` SC-9),
대기 신청 수가 작으므로 현재는 문제가 아니다.

`Map`으로 한 번 인덱싱하면 한 줄이다 —
`admin.ts:47`이 `getSearchableMembers`에서 이미 그렇게 한다.
**같은 레포에서 같은 조인을 두 방식으로 한다.**

---

## 지적하지 않은 것

- **`parseSpeakerIds`가 서버 파일에 있는 것** — 순수 함수라 `lib/utils.ts`가 더 맞지만,
  호출부 둘이 전부 서버 라우트이므로 위치가 틀렸다고 하기 어렵다
- ~~**`getSeminarRequests`의 `as SeminarRequest[]` 단언**(`:30`)을 U-1로 넘긴 것~~ —
  **오배정이었다.** `notion/seminars.ts`는 `validateNotionResponse`를 **아예 import하지 않는다**
  (`grep` 0건). U-1은 "실패해도 통과시키는 검증기" 이야기인데 **여기엔 검증기가 없다.**
  U-1을 고쳐도 이 경로는 그대로다. → SM-14가 그 자리의 결함이다
- **`getSeminarRequests`가 `[]`를 반환하는 것**(`:33`) —
  X-10이 계층 규약으로 다룰 문제다. 이 파일만의 결함이 아니다
- **`createSeminarRequest`의 `if (!id) throw`**(`:58`) — **옳다.**
  `admin.md` AD-6이 `addApplication`에 이 검사가 **없다**고 지적했다.
  같은 레포에서 이쪽이 정본이다

---

## 수정 순서

> **선행**: `notion/seminars.md` **S-1+S-2**(🔴🔴). 그것을 고치기 전에는
> 읽기가 400으로 죽으므로 아래 대부분이 관측되지 않는다.
> 초판은 SM-1을 1번에 두고 "한 줄이면 대기열이 살아난다"고 썼는데 **지킬 수 없는 약속이었다.**

1. **SM-12** — 소유권 검사. IDOR가 지금 열려 있다. 라우트 수정(A-f)과 함께
2. **SM-4** — `Array.isArray` 검사. 폼 입력이 Notion API까지 가는 경로를 막는다.
   **SM-14**(죽은 스키마를 살리기)가 근본 수정이다
3. **SM-2** — 시그니처를 `"approved"`로 좁혀 거짓말부터 없앤다.
   근본 수정은 상태를 select로 바꾸고 반려를 전이로 — `notion/seminars.ts`와 함께
4. **SM-1** — `getAllMembers(...).catch(() => [])`. **S-1 수정 이후에** 효과가 있다
5. **SM-13** — 라우트의 복제를 `getPendingSeminarRequests` 호출로. 정렬 위치를 하나로 정한다
6. **MT-1 → SM-3** — 메일 실패를 호출부가 알게 한 **뒤** 삭제 → 메일 순으로 바꾼다.
   순서만 뒤집으면 창이 뒤집힐 뿐이다
7. **SM-11 + SM-5 + SM-6** — 반환 타입 선언은 `status` 확장만 막는다.
   지어낸 필드는 **빼거나 재조회로 채워야** 하고 그것은 타입이 못 잡는다
8. **SM-7 / SM-15** — 로그를 경계로, 오류 문구를 실제 원인에 맞게
9. **SM-8 / SM-9 / SM-10** — 정적 import, `Map` 인덱싱(두 곳), 해소 실패 계수 로그

---

## 개정 이력

| 변경 | 내용 |
|---|---|
| **SM-12 신설 🔴** | `seminar/edit/[id]` 액션에 **소유권 검사가 없다.** `load`도 없고, 폼 POST는 `load`를 거치지도 않는다. 회원 누구나 임의 신청을 덮어쓰고 `speakerIds`로 **명의를 탈취**할 수 있다 |
| **수정 순서 1번이 거짓 약속이었다** | `notion/seminars.md` **S-1+S-2**를 한 번도 인용하지 않았다. 읽기가 항상 400이므로 SM-1을 고쳐도 대기열은 안 살아난다. **현재 0건인 원인은 SM-1이 아니라 S-1이다** |
| **SM-11 후반 철회** | "반환 타입을 선언하면 SM-5·SM-6이 컴파일 시점에 드러난다"는 **거짓**. `tsc --strict`로 확인 — 문맥 타이핑이 `"pending"`을 리터럴로 좁혀 통과시킨다. 지어낸 필드는 **출처 결함**이지 타입 결함이 아니다 |
| **SM-3 처방 정정** | "순서를 뒤집으면 창이 사라진다"는 **틀렸다.** MT-1이 메일 실패를 삼키므로 창이 **뒤집힐 뿐**이다 — 신청은 사라지고 통보는 안 가고 되찾을 수도 없다. **바로 윗줄에서 MT-1을 인용해 놓고 처방에 적용하지 않았다** |
| **SM-13 신설 🟠** | `api/admin/seminar-requests/+server.ts:13-32`가 같은 조인을 복제하는데 **정렬이 있고 오류 처리가 반대**다. SSR과 새로고침이 다른 순서·다른 실패를 낸다. SM-1·SM-9·SM-10의 범위가 각각 넓어진다 |
| **SM-14 신설 🟠** | `SeminarRequestSchema`(`schema.ts:64-74`)가 **사용처 0곳**. 살아 있었다면 SM-4를 전부 잡았다. `SeminarRequest` 정의가 **셋** — AD-10과 같은 형태 |
| **SM-15 신설 🟡** | `:58`의 문구가 API 문제를 가리키는데 실제 유일한 원인은 **`NOTION_DB_SEMINAR_REQUESTS` 미설정**이다 |
| **비지적 오배정 철회** | `as SeminarRequest[]`를 `utils.md` U-1로 넘겼는데, `notion/seminars.ts`는 `validateNotionResponse`를 **import하지도 않는다.** U-1을 고쳐도 무관하다 → SM-14 |
| 줄번호 정정 2건 | `members.ts:107`(그냥 `async () => {`) → **`:109`·`:111`·`:122`**. `createSeminarRequestInNotion` `:130-155` → **`:123-158`** |
