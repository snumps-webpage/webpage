# `src/hooks.server.ts` (219줄)

**접두사 `LD01-`** · 서버 요청 진입점 — 캐시 실드(최외곽) → Auth.js → 개발 미리보기 → 존 가드의 `handle` 체인, 그리고 미포획 예외의 본문을 정하는 `handleError`.

## LD01-1 🟠 가드가 손으로 만든 거절·리디렉션이 폼 액션 프로토콜을 말하지 않는다

> **검증 정정**: 등급 유지(🟠). 인과는 재현으로 확인했고, **기원과 결과 범위**를 바로잡는다.
>
> - **기원.** "W-23 이후"는 절반만 맞다. 맨 303은 W-23(`c0e9820`)이 아니라 **`dea9879`(2026-09-01 캐시 실드)** 가
>   `throw redirect(303, …)`를 `new Response(null, {status: 303})`로 바꿀 때 생겼다 — `c0e9820`은 헤더 세 줄을 `...NO_STORE`로 묶었을 뿐이다.
>   **던진** `Redirect`였다면 Kit이 `respond.js:413-420`에서 `action_json_redirect`로 바꿔 줬으므로, (a)는 `dea9879`의 회귀다.
>   (b)는 W-23 **이전에도** 같았다 — `throw error(403)`은 `handle_fatal_error`(`utils.js:81-90`)가 `Accept: application/json`에 `{message}`로 답했다.
>   W-23은 두 결함 어느 쪽도 새로 만들지 않았고, 그대로 보존했다.
> - **재현**(일회용 vitest, 삭제함): `zoneGuard`에 enhance와 같은 헤더(`accept: application/json`, `x-sveltekit-action: true`, 폼 본문)로 POST.
>   게스트 → `303 /login?redirect=%2Fstudy%2Fapply`, 본문·content-type 없음. Kit 자신의 `is_action_json_request`는 이 요청에 `true`이고,
>   `action_json_redirect`는 `200 {"type":"redirect","status":303,"location":"/login?redirect=%2Fstudy%2Fapply"}`를 낸다.
>   fetch가 303을 따라가 받는 페이지 HTML에 `deserialize`(= `JSON.parse`)를 돌리면 `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`.
>   따라간 GET은 `x-sveltekit-action`·`accept: application/json`을 그대로 달고 가지만 `/login`·`/signup`·`/wait`·`/withdraw/pending`에는 `+server.ts`가 없어
>   페이지 HTML이 나온다(`endpoint.js:95-109`는 엔드포인트가 있을 때만 의미가 있다). 미등록 동문 → `403 {"message":"이번 학기 등록 회원만 할 수 있는 작업입니다."}`, `type` 없음.
> - **(a)의 화면은 콜백에 따라 갈린다.** 기본 콜백·`update()`를 부르는 폼(예: `/withdraw/pending`)은 `applyAction` → `set_nearest_error_page(err, undefined)` →
>   **상태 500**(기본값 — `result.status` 대입 전에 던졌으므로)의 `+error.svelte`에 위 `SyntaxError` 문구. 결과 타입만 보는 `ActionButton.svelte:46-58`은
>   `type: "error"`라 **"오류가 발생했습니다." 토스트**만 띄운다. 어느 쪽이든 목적지(`/login` 등)로 가지 않는다.
>   (b)는 `ActionButton`에서도 `success`·`failure`·`error` 어느 분기에도 걸리지 않아 **토스트조차 없다.**
> - **이 결함을 밟는 흐름** (enhance POST 기준):
>   - 303 → (a): 세션 만료·다른 탭 로그아웃(→ `/login?redirect=…`), 회원 행이 없어짐(→ `/signup`·`/wait`), 탈퇴 유예 회원이 `/withdraw/pending` 밖의 회원 존 폼 제출(→ `/withdraw/pending`),
>     **미등록 비동문**(capability `[]` → `VIEW_MEMBER_ZONE` 없음, `zone.ts:159-165` → `/signup`·`/wait`) — 학기가 바뀌어 등록 행이 사라진 채 열어 둔 페이지에서 제출하는 경우가 전형이다.
>     `(applicant)` 존: 신청서를 연 채 승인·등록돼 `registered`가 된 사용자(→ `/`), 세션 만료(→ `/login`)
>   - 403 → (b): **미등록 동문**(`VIEW_MEMBER_ZONE`·`MANAGE_SELF`만)이 `PARTICIPATE` 라우트 9곳의 폼 제출, capability 없는 탈퇴 유예 회원의 `/withdraw/pending` 철회(`LB05-1`(b))
>   - 404 → (b)와 같은 무반응: 관리자 권한을 잃은 사용자가 열어 둔 관리자 화면의 enhance 폼(`AdminApplicationQueue` 등) 제출
> - `guard-headers.test.ts:86-99`는 "enhance와 똑같은 헤더"가 아니라 `accept: application/json` **하나만** 보낸다(`x-sveltekit-action`·본문 없음). 고정하는 결론은 같다.

W-23 이후 가드는 던지지 않고 `Response`를 직접 만든다 — 거절은 `guardRefusal`(60-74행), 리디렉션은 174-177행의 맨 303.
그런데 이 요청의 상당수는 `use:enhance` 폼이다(`(member)` 9개 페이지, `(applicant)` 2개). enhance는
`accept: application/json` + `x-sveltekit-action: true`로 POST하고(`@sveltejs/kit/src/runtime/app/forms.js:172-175`),
응답을 **ActionResult**(`{type, ...}`)로 파싱한다(`forms.js:32-42,200`). 가드의 응답은 둘 다 ActionResult가 아니다.

**(a) 리디렉션 → 오류 화면.** 세션이 만료된 채 회원 존 폼을 제출하면(또는 탈퇴 회원·미등록 회원) 가드는 맨 303을 돌려준다.
`fetch`가 그것을 따라가 `/login`의 HTML을 받고, `deserialize`의 `JSON.parse`가 던지며, `forms.js:204`가
`{type:"error", error: SyntaxError}`로 만든다 → 로그인 화면 대신 오류 페이지에 `Unexpected token '<'…`가 뜬다.
Kit 자신은 같은 상황을 `is_action_json_request`로 가려 `action_json_redirect`(`{type:"redirect", location}`)로 답한다
(`runtime/server/respond.js:413-420`, `page/actions.js:14-21,125-131`). 반환된 30x를 Kit이 고쳐 주는 것은
**데이터 요청뿐**이다(`respond.js:533-540`).

**(b) 403 → 아무 일도 일어나지 않는다.** `{message}`에는 `type`이 없다. enhance의 기본 콜백은 `applyAction`을 부르고
(`forms.js:110-117`), `type`이 error/redirect가 아니므로 else 분기가 `page.form = undefined`만 한다
(`runtime/client/client.js:2602-2616`). 오류도 이동도 없다. 구체적 경로: `LB05-1`(b)의 탈퇴 유예 회원이
`/withdraw/pending`의 취소 버튼(enhance 폼)을 누르면 403이 **조용히 삼켜진다.**

**(c) 데이터 요청의 리디렉션은 176행이 붙인 헤더를 잃는다.** Kit은 반환된 303을 자기 JSON 응답으로 **새로 만든다**
(`respond.js:535-539` → `data/index.js:168-176`). 살아남는 것은 `cache-control: private, no-store` 하나이고
`vercel-cdn-cache-control`·`cdn-cache-control`은 사라진다. 173행 주석("캐시 금지 헤더를 직접 부착해 반환")은 이 경로에서 거짓이다.

53-58행 주석은 "Kit의 fatal-error 경로와 같은 모양"이라고 근거를 댄다. 그 경로(`runtime/server/utils.js:75-93`)도
액션 요청에 `{message}`를 내므로 모양은 충실히 복제됐다 — **결함까지 복제됐다.** 그리고 완전히 같지도 않다:
61-62행은 `accept.includes("application/json")`인데 Kit은 `negotiate`를 쓴다. `Accept: */*`(curl·기본 `fetch`)에 Kit은 JSON을,
이 함수는 HTML을 준다.

`routes/guard-headers.test.ts:86-99`는 enhance와 똑같은 헤더로 요청해 `{message}` 본문을 **정답으로 고정한다.**

처방(동작 변경): 가드가 요청 종류를 셋으로 가른다 — 데이터 요청은 `{type:"redirect"}` JSON을 NO_STORE와 함께 직접,
액션 요청(POST + JSON 협상, 또는 `x-sveltekit-action`)은 `{type:"error", error:{message}}` / `{type:"redirect", status, location}`,
나머지는 지금대로. 판별은 Kit과 같은 협상 규칙으로. 테스트는 세 종류 × (거절, 리디렉션).

## LD01-2 🟡 `handleError`가 상태도 원인도 보지 않고 모든 오류를 `SERVICE_UNAVAILABLE`이라 부른다

> **검증 정정**: 🟠 → 🟡. 표의 세 경로와 `get_status`(`utils/error.js:41-43`), `handle_error_and_jsonify`가 `SvelteKitError`에 이 훅을 부른다는 것(`runtime/server/utils.js:102-120`)은 맞다.
> 그러나 **등급을 받친 사용자 쪽 결과 하나가 거짓이다.** "`/api/없는경로`의 404를 `client/api.ts:61-66`이 `SERVICE_UNAVAILABLE` 코드로 만든다" —
> 매칭 안 되는 URL은 `respond_with_error`(`page/respond_with_error.js:93-104`)가 **HTML 오류 페이지**로 답한다(`Accept`와 무관). `requestJson`의 `response.json()`이 실패해
> 봉투가 `null`이 되고 코드는 **`REQUEST_FAILED`** 다. 이 404의 `error` 꼬리표는 `+error.svelte`도 읽지 않는다(`page.status`·`page.error.message`만 쓴다).
> 꼬리표가 클라이언트에 닿는 비-500 경로는 액션 결과 본문(없는 액션 404·415)뿐이고, 그것을 코드로 읽는 곳은 없다.
> 남는 것은 (1) 봇 404마다 error 레벨 로그 + 스택, (2) 코드 버그 500에 "재시도 가능한 장애" 꼬리표, (3) 미포획 `AppError`의 코드를 덮는 것 — 원인 구분 부재와 로그 수준의 문제로,
> 같은 부류인 `HL-3`(🟡)과 같은 등급이다. 또 196-198행 주석은 "이 훅이 상태를 바꿀 수 없다"는 말이지 "상태가 늘 500"이라는 말은 아니다 — 그 해석은 과하다. 다만 주석이 500만 상정하고 쓰였다는 지적은 유효하다.

211-219행은 무조건 `{ message, error: "SERVICE_UNAVAILABLE" }`을 돌려주고 `console.error`로 스택을 남긴다.
196-198행 주석은 "Kit이 상태를 먼저 정한다 — 500을 다른 것으로 바꿀 수 없다"라고 적어 **상태가 늘 500인 것처럼** 전제한다. 사실이 아니다.
`get_status`는 `SvelteKitError`의 상태를 그대로 준다(`utils/error.js:41-43`). Kit이 이 훅을 부르는 비-500 경로:

| 경로                                                   | 상태      | Kit 위치                  |
| ------------------------------------------------------ | --------- | ------------------------- |
| 매칭 안 되는 URL — **104-105행이 보내는 바로 그 경로** | 404       | `respond.js:707-717`      |
| 디코딩 불가 URI                                        | 400       | `respond.js:561-572`      |
| 없는 액션 이름 / 폼이 아닌 본문                        | 404 / 415 | `page/actions.js:248-258` |

결과:

- 봇이 두드리는 모든 404(`/wp-login.php` 등)가 **error 레벨 로그 + 스택**으로 남는다. 진짜 500이 그 잡음에 묻힌다
- 404 본문이 `error: "SERVICE_UNAVAILABLE"`이다. `/api/없는경로`의 404를 `client/api.ts:61-66`은 코드 `SERVICE_UNAVAILABLE`의 `ApiRequestError`로 만든다 — "잠시 후 다시 시도"할 일이 아니다
- 500이라도 원인이 코드 버그(`TypeError`)면 "재시도 가능한 장애"라는 꼬리표는 거짓이다. 미포획으로 빠져나온 `AppError`는 자기 코드를 이미 들고 있는데(`core/errors.ts:38-50`) 그것도 덮는다

`API_ERROR_CODES`(`domain/api.ts:10-20`)에 내부 오류 코드가 없어 봉투 스키마를 맞추려면 무엇이든 골라야 했다는 사정은 이해된다.
그러나 그것은 코드 목록의 공백이지 이 꼬리표가 맞다는 근거가 아니다. `study-load-status.test.ts:45-60`은 500 하나만 본다.

처방(동작 변경): `AppError`면 `e.code`, 4xx면 상태에 맞는 코드(404 → `NOT_FOUND`), 그 밖의 500은 별도 내부 코드(목록에 추가)로.
로그는 5xx만 error 레벨. 주석 196-198행 정정.

## ~~LD01-3 🟠 회원 존 쓰기 게이트가 미등록 라우트에 열려 있고, 판정이 `decide` 밖에 있다~~ → `LB06-1` 상호참조

> **검증 정정**: 철회(중복). 관찰 셋 — 미등록 라우트의 기본값이 통과(160-168행), POST 판정이 `decide` 밖이라 `zone.test.ts` 행렬이 표현하지 못함,
> `hasCapability` 대신 `includes` — 이 **모두 `LB06-1`에 이미 같은 인용(`hooks.server.ts:161-162`)으로 적혀 있고** 처방도 "`LB06-1`의 ①②③ 그대로"다.
> 결함 하나를 두 문서가 🟠로 세면 집계가 이중이 된다. 등급은 `LB06-1`에 귀속하고, 이 항목은 집행 지점을 가리키는 상호참조로만 남긴다.
> 사실관계(인용 행·`zone.ts:79-81`·180-184행의 닫힌 분류)는 정확하다. POST 이외 메서드로 열린 틈은 `LB06-5`가 다룬다.

160-168행:

```ts
const needed = memberPostCapability(routeId);          // 표에 없으면 null (zone.ts:79-81)
if (needed && !member.capabilities.includes(needed)) { // null이면 통과
```

`LB06-1`이 표 쪽에서 본 결함을 여기서 확인했다. 새 `(member)` 라우트에 액션을 달고 `MEMBER_POST_CAPABILITY`에 한 줄을 잊으면
`VIEW_MEMBER_ZONE`만 가진 동문이 그 액션을 실행한다 — 기본값이 **통과**다. 같은 함수의 존 분류는 반대로 닫힌다(180-184행).
그리고 이 판정은 `decide`(순수 함수, `zone.test.ts`가 행렬로 검증) 밖에 있어 `GuardContext`에 메서드가 없고,
테스트 행렬이 쓰기 경로를 표현하지 못한다. 162행은 또 `hasCapability`(`core/capabilities.ts:48`) 접근자 대신 `includes`를 직접 쓴다.
처방은 `LB06-1`의 ①②③ 그대로. 현재 12개 라우트는 모두 등록돼 있다 — 우선순위의 사정이지 결함의 유무가 아니다.

## LD01-4 🟡 세션 쿠키 이름을 라이브러리 내부에서 베껴 왔고, 분할 쿠키를 놓친다

> **검증 메모**(등급·주장 유지): 분할 조건은 `cookie.js:30-33,175` — 값 길이가 `4096 − 160 = 3936`자를 넘을 때다.
> 이 앱의 JWT는 `jwt` 콜백이 없어 기본 클레임(`name`·`email`·`picture`·`sub` + `iat`·`exp`·`jti`, `callback/index.js:72-77`)만 싣는다.
> 긴 Google 사진 URL을 넣은 표본을 `@auth/core/jwt`의 `encode`로 실제 암호화하면 **670자** — 문턱의 약 1/6이다. 현재 설정으로는 분할되지 않는다.
> 분할은 `jwt` 콜백이 토큰에 무언가를 싣는 순간(예: `LD03-3`의 `accessToken`을 "채우는" 변경 — Google 액세스 토큰만으로 수백 자) 가까워진다.
> 이것은 우선순위의 사정이다. 결함은 라이브러리 내부 이름의 사본이 라이브러리 계약(분할 가능)의 일부만 옮겼다는 것이고, 그 논리는 성립한다.
> 영향 범위도 주장대로다 — 루트(`/`)와 비공개 존은 `locals.auth()`가 분할 쿠키를 제대로 합치므로 무관하고, 루트 외 **공개 페이지**만 게스트로 렌더된다(`+layout.server.ts:17-22`).

118-120행은 `"__Secure-authjs.session-token"`과 `"authjs.session-token"`을 정확히 일치로 찾는다.
이 이름은 `@auth/core/lib/utils/cookie.js:48-49`의 기본값(`${cookiePrefix}authjs.session-token`)의 사본이다.
그런데 Auth.js는 JWT가 한 쿠키에 들어가지 않으면 **`.0`, `.1`로 나눠 쓴다**(`cookie.js:174-186`). 그때 두 `get`은 모두 `undefined`다.

결과: 분할 쿠키를 가진 로그인 사용자는 공개 페이지에서 빠른 경로(121-128행)를 타 **게스트로 렌더된다** — 전역 내비게이션이
게스트 화면이고, 루트 레이아웃의 `isAdmin`이 거짓이라 관리자 전용 메모도 사라진다(`zone.ts:84-87`이 이 쿠키 검사에 기대는 기능).
보안 방향으로는 닫힌 쪽이라 🟡. Auth.js `cookies` 설정이나 접두사가 바뀌어도 같은 방식으로 조용히 깨진다.

처방: 이름 판정을 한 함수로 — 기본 이름과 그 `.<n>` 분할을 모두 인정. 분할 쿠키 사용자에 대해서만 동작 변경.

## LD01-5 🟡 신청 여부 조회 조건이 `decide`의 소비 조건을 손으로 베꼈고, 두 존만큼 넓다

142-148행의 조건은 `zone !== "(public)" || needsMemberResolution(routeId)`다 — 즉 루트, `(applicant)`, `(member)`, `(admin)`.
그러나 `decide`가 `hasApplication`을 읽는 곳은 루트(`zone.ts:118`)와 `(member)`(`:147`, `:164`)뿐이다.
`(applicant)`(124-135행)와 `(admin)`(170-173행)은 그 값을 보지 않는다.

- 이번 학기 미등록인 관리자, 그리고 `registered: false`로 고정된 **부트스트랩 관리자**(`resolve-member.ts:39`)는 관리자 페이지마다 `applications` 표를 읽고 버린다
- `(applicant)` 존의 모든 요청도 마찬가지다

더 근본적으로, "어느 존이 신청 여부를 쓰는가"는 `decide`의 지식인데 훅이 다른 술어로 **추측**한다. `decide`에 분기가 늘면 두 곳을 함께 고쳐야 하고,
틀려도 아무 테스트가 잡지 않는다(`zone.test.ts`는 `hasApplication`을 입력으로 받을 뿐이다).
처방: `zone.ts`가 `needsApplication(routeId)`를 `decide` 옆에 export하거나, `hasApplication`을 지연 함수로 넘긴다. 불필요한 읽기만 사라지는 구조 변경.

## LD01-6 🟡 해석한 세션을 버린다 — 한 요청에서 JWT가 여러 번 복호화된다

> **검증 정정**: 지적·등급 유지, **처방을 바로잡는다.** 쓰인 처방 `const p = event.locals.auth(); event.locals.auth = () => p;`는 **즉시** 호출이라
> 훅의 빠른 경로(121-128행 — api 존, 익명 공개 페이지)에서도 매 요청 JWT를 복호화하고 쿠키를 쓴다(`@auth/sveltekit/dist/actions.js:69-90`). 이 파일이 피하려는 바로 그 일이다.
> 지연 메모여야 한다: `const orig = event.locals.auth; let p; event.locals.auth = () => (p ??= orig());`. 또 `auth-guards.ts:30,56,90`의 호출은 대부분 api 존·액션에서 일어나는데,
> api 존은 훅이 세션을 해석하지 않으므로(122행) 그 요청에서는 "다시" 부르는 것이 아니라 첫 호출이다. 중복은 페이지 존 요청에 한정된다.

130-132행은 `event.locals.auth()`로 세션을 얻고 이메일만 꺼낸 뒤 버린다. `@auth/sveltekit`은 `locals.auth`를 메모하지 않는다
(`dist/index.js:337` `event.locals.auth ??= () => auth(event, _config)` — 호출마다 복호화하고 세션 쿠키를 다시 쓴다).
같은 요청에서 다시 부르는 곳: 루트 `+layout.server.ts:19`, `(admin)/+layout.server.ts:15`, `(applicant)/+layout.server.ts:7`,
`auth-guards.ts:30,56,90`. `(member)/+layout.server.ts:10-14`는 이 비용("a second JWT decode and cookie write per request")을
알고 **자기 자리에서만** 피한다 — 원인은 한 번 해석할 수 있는 유일한 지점인 이 훅이 결과를 남기지 않는 데 있다.
처방: 훅이 `const p = event.locals.auth(); event.locals.auth = () => p;`로 한 번만 해석하게 한다(dev preview 뒤). 결과 값은 같고 반복만 사라진다.

## LD01-7 🟡 캐시 금지 규칙의 사본이 있고, 실드가 라우트의 선언을 조용히 지운다

- `NO_STORE`(41-45행)와 같은 세 줄이 `(public)/media/[...key]/+server.ts:35-39`와 `guard-headers.test.ts:13-17`에 다시 적혀 있다. 실드 정책(예: 헤더 하나 추가)을 바꾸면 세 곳을 고쳐야 하고, 미디어 라우트의 사본은 어긋나도 아무도 모른다
- `(public)/sitemap.xml/+server.ts:33`은 `cache-control: public, max-age=3600`을 선언하지만 49행이 무조건 덮는다. 미디어 라우트 주석(27-29행)이 "있으나 마나 한 코드"라고 부른 바로 그 형태가 다른 라우트에 남아 있다. 실드에는 예외 수단이 없으므로 그 선언은 **실행될 수 없는 의도**다

처방: `NO_STORE`를 한 모듈(예: `core/http.ts`)에서 export해 셋이 import. 사이트맵의 헤더는 지우거나, 실드가 명시적 허용 목록을 갖게 한다. 구조 변경(사이트맵은 이미 덮이고 있으므로 동작 불변).

## LD01-8 🟡 실드가 자기 것이 아닌 응답의 헤더를 제자리에서 고친다

49행 `response.headers.set(k, v)` — `resolve()`가 돌려준 `Response`를 그대로 변형한다. 엔드포인트가 `fetch()` 결과를 그대로 넘기거나
`Response.redirect()`를 쓰면 헤더가 **immutable**이고 `set`이 `TypeError`를 던진다 → 그 라우트는 매 요청 500이다.
Kit 자신은 같은 이유로 변형 전에 복제한다(`respond.js:676-684` "the returned response might have immutable headers",
`endpoint.js:55-62`). 지금 그런 라우트가 없다는 것은 감면 근거가 아니다 — 최외곽 핸들이 모든 응답에 대해 참이어야 할 계약이다.
처방: `set`이 실패하면 `new Response(response.body, { status, statusText, headers: new Headers(response.headers) })`로 복제 후 설정. 해당 라우트에 대해서만 동작 변경.

## LD01-9 🟡 dev preview 회원 컨텍스트가 훅에 인라인돼 있다 (`LB04-1`의 다른 반쪽)

82-91행은 미리보기 회원을 여기서 조립한다 — 역할과 무관한 `memberId: "dev-preview"`, 이름 `"Dev Preview"`.
같은 인물의 세션은 `dev-preview.ts:43-64`가 역할별 id·이름으로 만든다. 두 반쪽이 다른 사람이고 관리자·회원 미리보기가 한 `memberId`를 공유한다.
처방은 `LB04-1`대로 `buildDevPreviewMember(role)`을 `dev-preview.ts`에 두고 여기서는 부르기만. 개발 전용.

## LD01-10 🟡 `AUTH_SECRET` 검사가 소비자 밖에 있고, 셋 중 하나만 보고, "FATAL"이라 적고 계속 돈다

27-29행. Auth.js 설정은 `auth.ts`가 만들고 그 파일이 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`을 `!`로 단언만 한다(`auth.ts:9-10`).
필수 변수 셋 중 하나만, 그것도 다른 파일에서 검사한다. 로그는 "FATAL"이지만 프로세스는 요청을 계속 받는다 — 이름과 동작이 다르다.
상세와 처방은 `LD02-2`. 여기서는 검사를 `auth.ts`로 옮기는 것만 해당한다(구조).

## LD01-11 🟡 빠른 경로의 주석이 존재하지 않는 이유를 댄다

115행 "no session work for ANONYMOUS visitors (**prerender/ISR safety**)". 저장소에 `prerender = true`인 페이지가 없고
(`prerender`는 `(admin)`·`(member)`·`(applicant)` `+layout.ts`의 `false`뿐), `svelte.config.js`와 라우트에 ISR 설정이 없다.
빌드 크롤은 이미 111행이 먼저 끊는다. 이 분기의 실제 이유는 익명 방문자에 대한 세션 복호화·데이터 읽기 생략이다.
README 교훈 다섯째 — 틀린 이유는 다음 사람을 엉뚱한 계층으로 보낸다. 주석만 정정.

## LD01-12 🟡 가드 **안에서 던져진** 예외는 여전히 실드를 건너뛴다 — W-23은 거절만 옮겼다 (검증 추가)

W-23의 전제(53-58행, 173행 주석)는 "`handle` 안에서 던지면 Kit의 fatal 경로로 나가 `cacheShield`를 건너뛴다"이다. 가드는 **자기 거절**을 반환으로 바꿨지만,
가드가 부르는 것들이 던지는 예외는 그대로다:

- 135행 `resolveMember(email)` — `getTable`이 데이터 계층 장애에서 `AppError("SERVICE_UNAVAILABLE")`을 던진다(`resolve-member.ts:25,45,51` → `tables.ts:69`). 회원 존·관리자 존·루트·로그인 사용자의 공개 페이지 요청 전부가 이 줄을 지난다
- 131행 `event.locals.auth()` — Auth.js가 200이 아닌 세션 응답을 주면 `throw new Error(data.message)`(`@auth/sveltekit/dist/actions.js:86-89`)

예외는 `zoneGuard` → `sequence` → 47-50행의 `await resolve(event)`를 그대로 통과해(`try` 없음) `respond.js:412-427`의 `handle_fatal_error`로 간다.
그 응답(`runtime/server/utils.js:75-93` — JSON 또는 `static_error_page`)에는 `cache-control`이 **없다**. 41-45행 위 주석의 "모든 SSR 응답에 브라우저·CDN 캐시를 전면 금지"가 이 경로에서 거짓이다.
또 상태는 500으로 고정된다 — 로드 안에서였다면 `httpGuard`가 만들었을 503이 아니다(206-209행 주석이 인정하는 바로 그 경로).

등급: 500은 RFC 9111의 휴리스틱 캐시 대상이 아니어서 `HS-3`(404)보다 좁다. 그러나 이 파일 스스로 엣지가 `cache-control`과 무관하게 재생하는 것을 실측했다고 적는다(33-35행) —
장애 중의 500이 경로 단위로 굳으면 복구 뒤에도 재생된다. 계약 위반 자체는 W-23과 같은 부류다.
처방(동작 변경): 가드가 135행을 `try`로 감싸 `AppError`면 `guardRefusal(event, 503, …)`(+ `Retry-After`, W-30)로 반환하거나, `cacheShield`가 예외를 잡아 no-store가 붙은 응답을 직접 만든다.
후자는 모든 핸들의 예외를 덮지만 `+error.svelte`를 잃는다 — W-23이 이미 받아들인 대가와 같다.

## 확인했고 지적하지 않은 것

- **핸들 순서**(188-193행) — `cacheShield`가 최외곽이라 Auth.js가 직접 답하는 `/auth/*` 응답도 덮는다. dev preview가 `authHandle` 뒤라서 `locals.auth`를 덮어쓸 수 있다. 순서가 의도와 맞다
- **`routeId === null` → `resolve`**(104-105행) — Kit이 404를 만들게 둔다. 상태 코드는 W-1(루트 레이아웃의 await)로 해결됐다. 이 경로가 `handleError`로 가는 문제는 `LD01-2`
- **`if (building) return resolve(event)`**(111행) — 지금 프리렌더 페이지가 없어 돌지 않지만, 페이지 하나에 `prerender = true`를 넣는 순간 필요해지는 방어다. 주석(107-110행)의 인과도 맞다
- **`guardRefusal`의 HTML 이스케이프**(65행) — 메시지는 전부 코드의 리터럴이고 텍스트 노드에만 들어간다. `'`를 빼도 충분하다
- **`misconfigured` → 500, 라우트 id는 로그로만**(180-184행) — W-35 결정대로다
- **`switch`에 `default`가 없다**(157-185행) — 반환 타입이 `Handle`로 고정돼 있어 새 `GuardDecision`을 추가하면 "모든 경로가 값을 반환하지 않는다"로 컴파일이 깨진다. 망라성이 타입으로 강제된다
- **api 존이 주체를 해석하지 않는다**(122행) — `zone.ts:103-105`의 계약이다. 그 틈(`XC-6`)은 `requireCapabilityAction`의 지연 해석으로 닫혔다(`UP-1` ✅)
- **`hasSession = member !== null || !!email`**(139행) — dev preview는 `locals.member`를 채우고 세션을 부르지 않으므로(130-131행) 이메일 없이도 세션이 있는 것으로 판정돼야 한다. 식이 그것을 정확히 표현한다
- **404/500 거절 문구가 영어**(179·184행) — `HS-14` / `W-35`가 열린 채로 다룬다. 재제기하지 않는다

## 검증 (2026-09-28)

- LD01-1 — 정정 (등급 유지 🟠. 기원: 맨 303은 `dea9879`, 403 `{message}`는 W-23 이전부터 — W-23은 보존만 했다. 재현 결과·콜백별 화면·해당 흐름 추가. 테스트 헤더 서술 정정)
- LD01-2 — 정정 (🟠 → 🟡. `/api` 미매칭 404가 `SERVICE_UNAVAILABLE`이 된다는 결과는 거짓 — HTML 오류 페이지라 `REQUEST_FAILED`)
- LD01-3 — 철회 (`LB06-1`과 같은 결함 — 상호참조로 남김)
- LD01-4 — 확인 (현재 JWT 670자 vs 분할 문턱 3936자 — 발생 조건을 메모로 추가, 등급 유지)
- LD01-5 — 확인
- LD01-6 — 정정 (처방만: 즉시 호출 → 지연 메모. 등급 유지)
- LD01-7 — 확인
- LD01-8 — 확인 (`Response.redirect()`의 헤더가 `set`에 `TypeError: immutable`을 던지는 것을 Node에서 실측)
- LD01-9 — 확인
- LD01-10 — 확인
- LD01-11 — 확인
- LD01-12 — 추가 (가드 내부 예외 — `resolveMember`·`locals.auth()` — 가 여전히 실드를 건너뛴다)
- 누락 점검: 소스 219행을 문서 없이 다시 읽었다 — 핸들 순서, 빠른 경로 조건, `hasSession` 식, `needsApplicationLookup`, POST 게이트의 메서드 한정(`LB06-5`), `guardRefusal` 이스케이프, 예외 전파 경로(→ LD01-12), `handleError` 호출 경로(Kit `respond_with_error`·`handle_fatal_error`·액션)를 Kit 2.70.3·@auth/sveltekit 1.11.3 소스와 대조했다
