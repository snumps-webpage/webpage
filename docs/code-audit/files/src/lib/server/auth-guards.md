# `src/lib/server/auth-guards.ts` (263줄)

**접두사 `LB02-`** · 세션·관리자·capability 게이트와 폼 액션 래퍼(`handleUserAction`/`handleAdminAction` → `runAction`), 스터디 조직자 가드 `ensureOrganizer`.

## LB02-1 🟠 "로그인했다"의 정의가 둘이다 — 이름 없는 세션은 무한 리디렉션에 갇힌다

| 판정                                              | 조건                       |
| ------------------------------------------------- | -------------------------- |
| `ensureSession` (57행)                            | `email` **그리고** `name`  |
| `resolveMemberContext` (31행)                     | `email`                    |
| `resolveAdminAccess` (91행)                       | `email`                    |
| 존 가드 `hooks.server.ts:132,139`                 | `email` (또는 해석된 회원) |
| 로그인 페이지 `(public)/login/+page.server.ts:18` | `session.user` 존재        |

`name`이 비어 있는 세션(Auth.js의 `Session.user.name`은 `string | null | undefined`이고 `src/auth.ts`는 이름을 보정하지 않는다)이
`/signup`에 오면:

1. 존 가드: `email`이 있으니 `hasSession = true` → `(applicant)` 통과
2. `signup/+page.server.ts:20` `ensureSession(event.locals, event.url)` → `name` 없음 → **302 `/login?redirect=/signup`**
3. 로그인 페이지: `session.user`가 있으니 → **303 `/signup`**
4. 2로 돌아간다

`ensureSession`을 부르는 로드 5곳(`events/[id]/[type]:22` · `seminar/edit/[id]:21` · `seminar/apply:17` · `signup/edit:15` · `signup:20`)이
전부 이 고리에 들어가고, 같은 사용자의 모든 사용자 액션은 `handleUserAction`(219행)에서 **401 `UNAUTHORIZED`** 를 받는다 — 로그인은 돼 있는데.

그리고 37행 `session as AuthenticatedSession`은 `name`을 검사하지 않은 세션을 `name: string`이라고 주장하는 타입으로 바꾼다.
`requireAdminAction`·`requireCapabilityAction`이 이 값을 호출자에게 넘긴다(107행, 205행).

덤으로 `resolveAdminAccess`(90-92행)는 `locals.auth()`를 직접 한 번, `resolveAdminContext → resolveMemberContext`(30행)에서 또 한 번 부른다 —
"세션 있음" 판정이 같은 함수 안에서도 두 번 적혀 있다.

**처방은 동작 변경**: "세션 있음"을 한 술어로 두고(이메일 기준이 존 가드·관리자 게이트와 맞는다) `name`이 필요한 호출부는 그 자리에서
`parseGoogleName` 폴백 등으로 다룬다. 또는 `auth.ts` 콜백에서 이름을 보정해 불변식으로 만든다. 어느 쪽이든 37·63행의 캐스트가 참이 된다.

## LB02-2 🟠 액션 래퍼가 오류를 추측으로 분류하고, 원시 예외 문구를 코드 자리에 싣는다

`runAction`(121-167행)의 분류:

| 줄      | 방식                                                                | 문제                                                                                                                      |
| ------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 131-139 | 반환값에 숫자 `status >= 400`이 있으면 `ActionFailure`로 간주       | `@sveltejs/kit`이 `isActionFailure`를 export한다(2.70.3 `exports/index.js:216`)                                           |
| 153-160 | 던진 값에 `300 <= status < 400`이면 리디렉션으로 재던짐             | `isRedirect`가 있다. `core/http.ts:2,17`은 이미 `isRedirect`·`isHttpError`를 쓴다 — **같은 판정이 두 방식으로 적혀 있다** |
| 164-165 | 그 밖은 전부 `fail(500, { error: e.message \|\| "Action failed" })` | 아래                                                                                                                      |

**165행이 두 계약을 깬다.**

- 118-119행이 스스로 "The CODE is the contract"라고 적는데, 500 경로는 `error` 필드에 **자유 문자열**을 넣는다.
  `mutateObject`의 `"table envelope validation failed: …zod 메시지…"`(`data/tables.ts:77-79`), store 드라이버 예외 문구가 그대로 들어간다
- `hooks.server.ts:203-204`의 `handleError`는 "raw exception text … must not travel to a browser"를 이유로 로드·엔드포인트의 원시 문구를 가린다.
  액션 경로에는 그 차단이 없다. 그리고 `data.error`를 그대로 화면에 찍는 컴포넌트가 있다 —
  `StudyRequestForm.svelte:56` · `StudyTransferPanel.svelte:54` · `StudyRosterPanel.svelte:49` · `StudySessionTimeline.svelte:74` · `MemberRecordSections.svelte:102`

또 `logic` 안에서 `error(404)`처럼 **Kit `HttpError`를 던지면** 153행(3xx 아님)도 161행(`AppError` 아님)도 통과해 `console.error` + **500**이 된다.
`HttpError`는 `Error`가 아니어서 `.message`도 없으니 본문은 `"Action failed"`다. 지금 액션 본문에서 `error()`를 던지는 곳은 없지만,
로드에서는 흔한 관용구(`study/[id]:13`, `events/[id]/[type]:25-29`)라 옮겨 오는 순간 404가 500이 된다.

같은 부류로 `handleUserAction`의 218-224행 `catch {}`는 `ensureSession`의 리디렉션만이 아니라 **`locals.auth()` 자체의 실패까지** 401로 바꾼다.
인증 백엔드 장애가 "로그인하지 않았다"로 보고된다.

**처방**: `isActionFailure`·`isRedirect`·`isHttpError`로 분류하고(구조), 500 본문은 `{ error: "SERVICE_UNAVAILABLE" }` 같은 코드로 고정하고 원문은 로그로만(동작 변경),
`HttpError`는 `fail(e.status, { error: … })`로 옮긴다. 218행은 `isRedirect(e)`일 때만 401.

## LB02-3 🟡 `invalidate`·`successMessage` 옵션이 죽었고, 살아나면 await 없이 돈다

- `invalidate`(126행, 215행, 236행) — 운영 호출부 **0**(`grep -rn "invalidate:" src`에 테스트 외 결과 없음). 캐시 무효화는 이제
  `data/tables.ts:155`(`mutate`)와 `data/flows.ts:45-47`(`callFlow`)가 쓰기 지점에서 한다. 액션 계층이 키를 알 이유가 없어졌다
- 그런데 141-146행은 `keys.forEach((key) => invalidateCache(key))` — `invalidateCache`는 `async`(`cache.ts:150`)이고 `forEach`는 기다리지 않는다.
  누가 옵션을 되살리면 성공 응답이 무효화보다 먼저 나가고 Redis 실패는 처리되지 않은 거부가 된다. 이관 전 `AG-3`과 같은 결함이 코드 그대로 남아 있다
- `successMessage`(236행) — 받기만 하고 어디에도 쓰지 않는다. 호출부 0

동작 변경 없는 삭제다.

## LB02-4 🟡 `requireAdminAction`만 C-19 이전 상태다

C-19(`STATUS-CODES.md` HS-5 → W-24)가 관리자 게이트를 **세 갈래**로 정했다 — `resolveAdminAccess`(87-94행)가 그것이고,
`handleUserAction`(221-223행)도 같은 결정으로 `FORBIDDEN` → `401 UNAUTHORIZED`가 됐다.
`requireAdminAction`(99-108행)은 여전히 **세션 없음과 비관리자를 한 값 `fail(403, FORBIDDEN)`으로** 접는다.

- 세션 없음이 401이 아니라 403 — 재로그인으로 풀리는 상태를 "권한 없음"으로 보고한다
- 비관리자에게 403 — 관리자 트리를 404로 숨긴다는 정책(`ensureAdmin` 76행, `core/http.ts:39-41`)과 반대로 존재를 확인해 준다
- `response`가 폼 전용 `fail()`이라 엔드포인트가 쓸 수 없다(`XC-7`). 유일한 엔드포인트 호출부 `api/uploads/presign/+server.ts:37-38`은 `allowed`만 읽고
  `json({error:"FORBIDDEN"},403)`을 손으로 만든다 — 그래서 **익명 presign 요청도 403**이다

`(admin)` 페이지의 액션에는 존 가드가 먼저 404를 내므로 지금 이 403이 브라우저에 닿는 경로는 presign뿐이다. 그것은 우선순위의 문제이지 결함의 유무가 아니다.
처방은 `requireAdminAction`이 `resolveAdminAccess`의 세 갈래를 그대로 돌려주고 렌더를 호출 계층에 맡기는 것(`XC-7`의 결론과 같다). 동작 변경.
97-98행 주석 "for form actions **and /api handlers**"도 낡았다 — `/api` 관리자 게이트는 `requireAdminRest`(`core/http.ts:43`)다.

## LB02-5 🟡 `ensureAdmin`의 기본값이 은폐 정책의 반대다 (`HS-17` 재확인)

66-69행 주석은 "Throws 404 if not (Security by Obscurity)"인데 기본값(`silent` 미지정)은 77행 **302 → `/`** 다.
호출부 11곳이 전부 `{ silent: true }`를 넘긴다(`(admin)/admin/**/+page.server.ts`). 즉 **옵션을 빼먹는 순간 정책이 깨지는 기본값**이다.
`STATUS-CODES.md` HS-17 → PRIORITY `W-36`이 이미 잡았고 미처리 상태다. 처방: 분기와 옵션을 지우고 항상 404. 호출부 11곳의 동작은 그대로다.

## LB02-6 🟠 조직자 신원 규칙이 한 곳에만 있다 — 탈퇴 게이트는 레거시 id 조직자를 모른다

> **검증 정정**: 핵심(SQL 탈퇴 게이트) 확인, 등급 🟠 유지. 표의 한 행은 철회, 누락 호출부는 추가, 이력은 바로잡는다.
>
> **전제 확인 — `organizerIds`는 실제로 레거시 id를 담는다.** `scripts/ops/ops-legacy-split.mjs`가 노션 이주분 `members`를
> **같은 id 그대로** `legacy-members`로 복사하고 운영 표를 비웠다. `studies`는 손대지 않았으므로 이주된 스터디의 `organizerIds`는
> 그 id(이제 레거시 id)를 가리킨다. 재가입 승인(`flow_approve_application`, `atomic_flows.sql:731-746`)은 **새 id**(`p.memberId`)로 행을 만들고
> `legacyMemberId`에 옛 id를 적는다. `data/directory.ts:9,13-15`도 같은 사실("과거 기록의 memberId는 legacy id")을 전제로 이름을 해석한다.
> 그리고 이 id 재기록을 하는 스크립트는 없다(`scripts/` 전수 grep, `organizerIds`를 쓰는 것은 `migration/20-export-tables.ts`의 최초 추출뿐).
>
> **이력 — 이관(SQL 포팅)이 만든 회귀가 아니다.** 포팅 직전 TS 판정(`git show 7781fd9 -- src/lib/server/services/withdrawal.ts`의 제거 줄)은
> `s.organizerIds.includes(memberId) && s.status !== "finished"`였다 — **이미 현재 id만 봤다.** 이 검사는 `48455f9`(2026-08-29)에서 생겼고,
> 레거시 id 규칙은 그 다음 날 `b322e60`(S9, 2026-08-30)이 `ensureOrganizer`에만 넣었다. 즉 S9가 규칙을 한 곳에만 넣은 순간부터의 결함이고,
> `7781fd9`의 SQL 포팅은 그것을 **충실히 옮겼다.** 처방은 그대로다.
>
> **`removeParticipant` 행 철회.** 148행의 `memberId`는 호출자가 아니라 **제거 대상**이다(`manage/+page.server.ts:141`, 폼의 `memberId`).
> 그 값은 명단에 저장된 id에서 오므로 "저장된 id가 `organizerIds`에 있는가"라는 **저장값 대 저장값** 비교이고, 레거시 id로 저장된 조직자를 지목하면
> `organizerIds.includes(legacyId)`가 참이 되어 CONFLICT가 난다. "이 사람이 조직자인가"의 신원 질문이 아니다.
>
> **`leaveStudy` 행 좁힘.** 보호가 걸리지 않는 것은 맞지만 결과는 "조직자가 빠진 스터디"가 아니다 — 필터도 현재 id로만 돌아
> 레거시 id로 저장된 조직자·참여자 항목은 그대로 남는다. 결과는 **성공처럼 보이는 무동작**(조직자 지위 유지)이다.
>
> **같은 판정을 현재 id로만 하는 곳이 더 있다**(이 문서가 놓친 것):
> `(member)/settings/withdraw/+page.server.ts:14`(탈퇴 페이지의 "먼저 인계할 스터디" 사전 경고 — 주석이 스스로 "Mirrors the organizer guard"라 적는다.
> 따라서 레거시 id 조직자에게는 경고도 게이트도 없다) · `(member)/study/[id]/+page.server.ts:38` `isOrganizer`(관리 진입 UI) ·
> `(member)/study/+page.server.ts:34` `myState` · `(public)/+page.server.ts:396`(대시보드 `myStudies` 필터 — 바로 아래 405행의 역할 판정은
> `myIds`로 레거시까지 보는데 필터가 먼저 현재 id로 걸러 **한 식 안에서 두 규칙**이 섞인다). 규칙의 사본 수는 문서가 적은 것보다 많다.

`ensureOrganizer`(249-263행)는 재가입 회원이 이주된 스터디를 **현재 id 또는 `legacyMemberId`** 로 조직한다고 인정한다(252-261행, S9).
같은 질문("이 회원이 이 스터디의 조직자인가")을 하는 다른 곳들은 현재 id만 본다.

| 위치                                                     | 판정                              |
| -------------------------------------------------------- | --------------------------------- |
| `auth-guards.ts:256-261`                                 | `memberId` ∪ `legacyMemberId`     |
| `services/studies.ts:117` (`leaveStudy`)                 | `organizerIds.includes(memberId)` |
| `services/studies.ts:148` (`removeParticipant`)          | `organizerIds.includes(memberId)` |
| `atomic_flows.sql:1039-1040` (`flow_request_withdrawal`) | `organizerIds ? v_id`             |

마지막이 실질적이다. `services/withdrawal.ts:23-24`의 계약은 "an active organizer must hand over first"인데, 레거시 id로 조직하는 회원은
`ensureOrganizer`로는 조직자 권한을 행사하면서 **인계 없이 탈퇴 신청이 통과한다.** 결과는 조직자가 탈퇴 회원인 진행 중 스터디다.
`leaveStudy`·`removeParticipant`의 "조직자는 먼저 인계하라"(117·148행)도 같은 판정을 현재 id로만 한다 — 레거시 id 조직자에게는 그 보호가 걸리지 않는다.

규칙은 TS 둘 + SQL 하나에 흩어져 있고 SQL 쪽은 `flow-rules.test.ts`가 고정하는 미러 목록에도 없다.
처방: TS에 `isOrganizer(study, member)` 하나를 두고 서비스가 쓰며, SQL은 `legacyMemberId`까지 포함하도록 고친 뒤 미러 테스트에 올린다. 동작 변경.

## LB02-7 🟡 capability 거부 문구가 두 벌이고, capability를 가리지 않는다

180행 `"이번 학기 등록 회원만 할 수 있는 작업입니다."`가 `hooks.server.ts:166`에 글자 그대로 한 번 더 있다.
두 곳 모두 **어떤 capability가 없는지와 무관하게** 이 문구를 낸다. `MANAGE_SELF`는 미등록 동문도 가진다(`core/capabilities.ts:43`) —
그 거부에 "등록 회원만"은 사실이 아니다. 문구를 `Capability → 메시지` 맵으로 한 곳에 두면 두 사본과 부정확이 같이 닫힌다. 문구만 바뀌는 동작 변경.

## LB02-8 🟡 주석이 제자리에 있지 않다

169-171행 `/** Standard wrapper for user actions. */`는 **`requireCapability`의 JSDoc 바로 위**에 붙어 있다(172-176행과 연달아 두 블록).
정작 `handleUserAction`(210행)에는 문서가 없다. 편집기 호버에서 `requireCapability`의 설명이 두 블록 중 어느 것으로 보일지는 도구 나름이다. 구조 변경 없음.

## LB02-9 🟡 `runAction`이 도메인 실패 결과를 성공으로 포장한다 — 반환 타입이 그것을 허락한다 (검증 추가)

148-150행 `return { success: true, ...(result as T) }` — `status`가 없는 객체는 전부 성공이다(131-139행의 판정만 통과하면).
이 레포의 도메인 계층은 실패를 **`{ success: false, error, issues }` 값으로 돌려주는** 관용구를 쓴다
(`domain/attendance.ts:25-29`, `domain/studies.ts:170-176`, 폼 검증기들의 `parsed.failure`). 그런 값을 `fail()`로 감싸지 않고 반환하면:

- 전개 순서 때문에 결과의 `success: false`가 앞의 `success: true`를 **덮어쓴다** — 본문은 실패를 말하는데
- Kit은 그것을 `ActionFailure`가 아닌 반환값으로 받아 **`type: "success"`, 200** 으로 보낸다. `use:enhance`의 성공 분기가 돈다

`logic`의 타입 `T extends Record<string, unknown>`은 `{ success: false }`를 막지 않고, `ActionResult<T>`의 `T & { success: true }`는
실제로 담길 수 있는 값을 거짓으로 서술한다. 이것은 가정이 아니다 — `(admin)/admin/seminars/+page.server.ts:182-184`의 주석이
"fail()로 감싸지 않으면 runAction이 `status`가 없는 객체를 성공으로 포장한다 — 다이얼로그가 저장된 것처럼 닫히고 … (실측)"이라고 적고,
그 호출부 하나만 손으로 막았다. 막는 장치는 호출자의 기억뿐이다.

LB02-2와 같은 뿌리(분류를 추측으로 한다)지만 다른 입력이다 — LB02-2는 `status` 숫자로 실패를 **추측**하는 쪽, 이것은 실패 표지(`success: false`)를 **무시**하는 쪽이다.
처방: `logic`의 반환 타입에서 `success` 키를 배제하거나(`T extends Record<string, unknown> & { success?: never }`), 런타임에 `result.success === false`를 500 대신
개발자 오류로 크게 실패시킨다. 전자는 구조 변경(컴파일 오류가 호출부를 찾아 준다).

## 확인했고 지적하지 않은 것

- **지연 해석과 `locals` 재기록**(26-38행) — api 존이 `locals.member`를 채우지 않는다는 사실(`hooks.server.ts:122`)을 정확히 다룬다. `XC-6`의 처방이 반영된 형태다
- **`requireCapabilityAction`의 `ctx!`·`ctx!.member!`**(205-206행) — `hasCapability(undefined, …)`가 `false`이므로(`core/capabilities.ts:52`) 200행을 지나면 둘 다 존재한다. 타입이 증명하지 못할 뿐 계약은 지켜진다
- **관리자 판정의 단일 소스** — 네 게이트(`ensureAdmin`·`resolveAdminAccess`·`requireAdminAction`·`http.ts`의 `requireAdminRest`)가 모두 `resolveAdminContext`의 `isAdmin` 하나를 쓴다. 규칙은 한 곳이고 갈라진 것은 출력 형태다(그중 하나가 LB02-4). 탈퇴 관리자의 권한은 C-18 결정 사항이다
- **`ensureOrganizer`가 캐시된 표를 읽는다**(250·255행) — 243-245행의 "cached on **locals**"는 `locals`를 신뢰하지 않는다는 뜻이고 사실이다. 표 캐시의 신선도는 `cache.ts`(LB03-1)의 문제다
- **`ensureOrganizer`가 던지는 `AppError`** — 로드 쪽은 `httpGuard`(`W-22`)가, 액션 쪽은 `runAction` 161-163행이 상태로 옮긴다
- **`ensureSession`의 `?redirect=`가 `pathname`만 싣는다**(59행) — 쿼리가 빠지지만 존 가드(`zone.ts:141`)와 같은 규칙이다

## 검증 (2026-09-28)

- LB02-1 — 확인. 고리가 실제로 닫힌다: `(applicant)` 존은 이메일만 보고 통과(`zone.ts:125`) → `signup:20` `ensureSession`이 이름 없음으로 302 → `login:18`은 `session.user`만 보고 303 `/signup`. 브라우저의 리디렉션 상한에서 끊긴다. 이름 부재의 가능성: `src/auth.ts`는 Google 공급자에 `profile` 콜백을 주지 않으므로 Auth.js 기본 OIDC 매핑(`@auth/core/lib/utils/providers.js:81` `profile.name ?? profile.nickname ?? profile.preferred_username`)이 쓰이고, 세션의 `name`은 `token.name`(`lib/actions/session.js:38`)이다. Google은 `name` 클레임을 "profile 스코프일 때 제공될 수 있다"로만 약속한다 — 불변식이 아니다. 오늘의 Workspace 계정이 늘 이름을 가진다는 것은 데이터의 성질이라 감면 근거가 아니다
- LB02-2 — 확인 (`isActionFailure`·`isRedirect` export는 Kit 2.70.3 `exports/index.js:129,216`에서 확인. `mutateObject → decode`의 원문 메시지가 165행으로 나가고, 인용된 컴포넌트 5곳이 모두 `data.message ?? data.error`로 그것을 화면에 쓴다)
- LB02-3 — 확인 (`invalidate:`·`handleAdminAction`의 `successMessage` 운영 호출부 0 — `successMessage` grep 결과는 무관한 컴포넌트 prop뿐)
- LB02-4 — 확인
- LB02-5 — 확인 (`ensureAdmin(` 호출부 11곳 전부 `silent: true`)
- LB02-6 — 정정 (등급 유지. 전제 확인·회귀 아님·`removeParticipant` 행 철회·누락 사본 4곳 추가 — 위 블록)
- LB02-7 — 확인
- LB02-8 — 확인
- LB02-9 — 추가 🟡 (`{ success: false }` 결과가 200 성공으로 나간다 — 레포 안에 실측 주석이 있다)
- 누락 점검: 파일 전체를 문서 없이 다시 읽고 `runAction`의 반환 분기, `handleUserAction`의 `catch`, `requireCapabilityAction`의 단언, `ensureOrganizer`의 표 읽기를 호출부와 대조했다. 추가 1건(LB02-9)
