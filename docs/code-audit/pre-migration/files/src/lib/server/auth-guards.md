# `src/lib/server/auth-guards.ts`

190줄 · export 6개(함수 5 + 인터페이스 1) · 인증/인가 가드 및 액션 래퍼
검토 2026-08-25 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판은 AG-1의 **메커니즘이 틀렸다** — "404"라고 썼는데 실제로는 `/`로 303 반송이다.
> 자기가 `auth-guards.ts`에 적용한 훅 분석을 네 줄 뒤 `auth.ts`에는 적용하지 않았다.
> 헤더의 AP-9 인용은 **날조**였다. §개정 이력 참조.

> 이 파일에 의존하는 리뷰: `events.md` SE-15(무효화 훅이 여기에만 있다),
> `notion/events.md:106`(`ensureSession`이 관리자 게이트가 아니라는 근거),
> `notion/client.md:194`(`:126`·`:184` 중복 로깅). 그 주장들의 정본이 여기다.

> 판정 기준은 `README.md` §판정 기준. "지금 도달 불가"는 감면 근거가 아니다.

---

## 요약

| #         | 지적                                                                                    | 분류      | 심각도 |
| --------- | --------------------------------------------------------------------------------------- | --------- | ------ |
| **AG-2**  | **39줄 본문이 문자열 하나만 다른 채 통째로 복제돼 있다**                                | 중복      | 🔴     |
| **AG-1**  | **삭제된 `/login`을 가리키는 참조 4곳 — 도메인 거부 사용자가 이유를 볼 수 없다**        | 버그      | 🔴     |
| **AG-12** | **`logic` 안의 `error(403)`이 `fail(500, "Action failed")`로 뭉개진다**                 | 버그      | 🟠     |
| AG-13     | 라이브러리가 `isRedirect`/`isActionFailure`/`isHttpError`를 주는데 손으로 구조 판별 4곳 | 정확성    | 🟠     |
| AG-14     | `locals.auth()`가 요청당 최대 4회 — 매번 세션 재복호화 + **쿠키 재기록**                | 성능      | 🟠     |
| AG-4      | 같은 함수의 두 `catch`가 리다이렉트를 반대로 다룬다 + 캐스트가 거짓                     | 오류 처리 | 🟠     |
| AG-3      | `invalidateCache`가 `await`되지 않는다 — 두 겹의 fire-and-forget                        | 버그      | 🟠     |
| AG-6      | `AuthenticatedSession` 캐스트가 **세 곳 전부**에서 거짓말한다                           | 타입      | 🟠     |
| AG-5      | `ensureAdmin`의 두 동작 중 **덜 안전한 쪽이 기본값**이고 안전한 쪽만 쓰인다             | 보안      | 🟠     |
| AG-7      | `requireAdminAction`이 export인데 외부 사용 0 + 판별 유니온이 아니다                    | 정리      | 🟠     |
| AG-11     | 내부 오류 메시지를 그대로 클라이언트에 내보낸다                                         | 노출      | 🟡     |
| AG-10     | `ActionFailure`를 오리 타이핑으로 판별한다                                              | 정확성    | 🟡     |
| AG-9      | `await import(...)`가 6곳 — 정적 의존을 동적으로 부른다                                 | 일관성    | 🟡     |
| AG-8      | `successMessage` 옵션이 죽어 있고, 같은 이름의 살아 있는 prop이 따로 있다               | 정리      | 🟡     |

**호출부 실측** (import·주석 제외한 **실호출** 수):

```
ensureSession       5      handleUserAction     6
handleAdminAction   6      ensureAdmin          1  (그 1곳이 { silent: true })
                           requireAdminAction   0  (외부)
```

---

## AG-2 🔴 39줄이 문자열 하나 차이로 복제돼 있다

`handleUserAction:91-129`와 `handleAdminAction:150-189`를 실제 diff했다:

```
$ diff <(sed -n '91,129p' auth-guards.ts) <(sed -n '150,189p' auth-guards.ts)
25d24
<
38c37,39
<     return fail(500, { error: (e as Error).message || "Action failed" });
---
>     return fail(500, {
>       error: (e as Error).message || "Internal server error",
>     });
```

**빈 줄 하나와 오류 문자열 하나가 전부다.** `ActionFailure` 판별, 캐시 무효화,
성공 래핑, 3xx 재전파, 로깅, 500 폴백이 전부 같다.
시그니처(`:69-80` vs `:135-146`)도 함수명과 `options` 타입(`successMessage`)만 다르다.

두 함수의 **진짜 차이는 인증 한 줄**이다:

|                         | 인증                                             |
| ----------------------- | ------------------------------------------------ |
| `handleUserAction:83`   | `await ensureSession(locals)` (try/catch로 감쌈) |
| `handleAdminAction:147` | `await requireAdminAction(locals)`               |

**비용은 줄 수가 아니라 변경 지점이다.** 이 문서의 지적 **여섯 개**
(AG-3·4·10·11·12·13)가 전부 두 곳을 고쳐야 한다.
`events.md` SE-15의 처방("액션 밖 쓰기 경로에도 무효화")도 마찬가지다.

**제안**: 인증 결과를 판별 유니온으로 받는 하나로 접는다.

```ts
type AuthResult =
  | { ok: true; session: AuthenticatedSession }
  | { ok: false; failure: ActionFailure<{ error: string }> };

async function handleAction<T>(
  authenticate: () => Promise<AuthResult>,
  logic: (s: AuthenticatedSession) => Promise<T | void>,
  options: { invalidate?: string | string[]; errorMessage?: string } = {},
);
```

> 초판은 `authenticate`의 반환을 `AuthenticatedSession | ActionFailure<...>`로 제안했다.
> **AG-10이 지적하는 구조적 판별을 그대로 재도입하는 형태다.** 판별 유니온으로 고쳤다.

---

## AG-1 🔴 삭제된 `/login`을 가리키는 참조가 넷

`:22-24`:

```ts
const loginPath = url
  ? `/login?redirect=${encodeURIComponent(url.pathname)}`
  : "/login";
throw redirect(302, loginPath);
```

`login` 라우트는 없다. `git ls-tree -r HEAD --name-only | grep -i login` → 빈 결과.
`16d4ba0`("chore: fix linting and type errors across the project")이
`src/routes/login/{+page.server.ts,+page.svelte}`를 삭제했고 **`HEAD`의 조상이다.**
참조는 지우지 않았다:

| 위치                   | 참조                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `auth.ts:23`           | `` return `/login?error=InvalidDomain` `` (도메인 거부 시) |
| `auth.ts:37`           | `pages: { signIn: "/login" }`                              |
| `auth.ts:38`           | `pages: { error: "/login" }`                               |
| `auth-guards.ts:22-24` | 여기                                                       |

### 실제로 무슨 일이 일어나는가

> **초판 정정.** 초판은 "네 곳이 404를 가리킨다"고 썼다. **틀렸다.** 404는 안 난다.

`@auth/core/lib/actions/callback/index.js:393-408` — `signIn` 콜백이 문자열을 반환하면
`callbacks.redirect`를 거쳐 `https://host/login?error=InvalidDomain`으로 **302**가 나간다.
브라우저가 따라가면 새 요청이 오고, SvelteKit은 **라우트 해석보다 `handle` 훅을 먼저** 돈다
(`runtime/server/respond.js:457` — 미매칭 라우트도 포함).

도메인 거부된 사용자는 **세션이 없다**(콜백이 `true`를 반환하지 않았으므로).
따라서 `hooks.server.ts:42-43`:

```ts
if (!session?.user?.email) {
  throw redirect(303, "/");
}
```

**`/`로 303 반송되고 `?error=InvalidDomain`은 버려진다.**

결과는 404보다 나쁘다 — 404였다면 최소한 뭔가 잘못됐다는 신호는 된다.
지금은 **비 `@snu.ac.kr` 계정 사용자가 로그인 버튼이 그대로 있는 홈으로 돌아온다.**
아무 설명도 없다. 다시 눌러도 같다. 영원히.

`auth-guards.ts:22-24`도 같은 이유로 도달하지 않는다 —
`ensureSession` 호출부 5곳(`seminar/apply:13`, `events/[id]/[type]:17`,
`seminar/edit/[id]:18`, `signup:13`, `signup/edit:14`) 중
훅의 `isPublic`(`hooks.server.ts:37-38`)에 드는 것이 없다.

### 그래서 무엇이 결함인가

① **`auth.ts:23`은 살아 있는 경로다.** 사용자가 지금 이유 없는 반송을 겪는다.
② **가드 두 개가 미인증 사용자의 목적지에 서로 다른 답을 갖고 있고,
이 파일의 답은 존재하지 않는 주소다.** 훅의 `isPublic`이 한 줄 바뀌면 즉시 드러난다.
③ **함정**: `isPublic`에 `/login`이 **없다.** 라우트만 되살리면
미인증 방문자가 `:43`에서 `/`로 튕겨 **무한 반송**이 된다.
복구는 라우트 추가 + `isPublic` 수정이 한 쌍이어야 한다.
④ `hooks.server.ts:48`의 허용 목록에 `path === "/signout"`이 있는데
**`/signout` 라우트도 없다.** 로그아웃은 `signOut()` → `/auth/signout`이다.

`CROSS-CUTTING.md`에 **X-8**로 올린다 (X-7까지만 있으므로 자리 비어 있음).

---

## AG-12 🟠 의도한 4xx가 500이 된다

두 번째 `catch`(`:117-129`, 복제본 `:175-189`)는 **3xx만** 재전파한다:

```ts
if (... (e as { status: number }).status >= 300 && (e as { status: number }).status < 400)
  throw e;
console.error(`[Action Error]`, e);
return fail(500, { error: (e as Error).message || "Action failed" });
```

`logic` 안에서 `throw error(403, "...")`을 하면 `HttpError`가 나온다.
`@sveltejs/kit/src/exports/internal/index.js:3-21`:

```js
export class HttpError {
  constructor(status, body) {
    this.status = status;
    if (typeof body === 'string') this.body = { message: body };
    ...
  }
}
```

**`status`와 `body`만 있고 최상위 `message`가 없다.** 그리고 403은 3xx가 아니다.

| 던진 것                   | 나가는 것                               |
| ------------------------- | --------------------------------------- |
| `error(403, "권한 없음")` | `fail(500, { error: "Action failed" })` |
| `error(404, "없음")`      | `fail(500, { error: "Action failed" })` |

**상태 코드가 거짓이 되고 `body`가 사라진다.** 로그에는 `[Action Error]`로만 남는다.

이 파일 자신이 그런 것을 던진다 — `ensureAdmin(locals, { silent: true })`는
`error(404)`를 던진다(`:42`). 그것을 `logic` 콜백 안에서 부르면 404가 500이 된다.

지금 그렇게 쓰는 호출부는 없다. **그러나 좁은 계약의 값어치가 바로 그런 호출부를
막는 것이므로**, 없다는 사실은 감면 근거가 아니다(AG-6과 같은 형태).

수정은 AG-13이다 — `isHttpError(e)`면 `fail(e.status, e.body)`로 보낸다.

---

## AG-13 🟠 라이브러리가 주는 판별자를 안 쓰고 손으로 짠다

`@sveltejs/kit`가 export하는 것:

```
src/exports/index.js:90   export function isHttpError(e, status)
src/exports/index.js:129  export function isRedirect(e)        { return e instanceof Redirect; }
src/exports/index.js:216  export function isActionFailure(e)   { return e instanceof ActionFailure; }
```

이 파일은 같은 판정을 **구조적으로 네 번** 손으로 짠다:

| 위치       | 손으로 짠 것                                 | 있어야 할 것              |
| ---------- | -------------------------------------------- | ------------------------- |
| `:94-102`  | `"status" in result && result.status >= 400` | `isActionFailure(result)` |
| `:118-125` | `"status" in e && 300 <= e.status < 400`     | `isRedirect(e)`           |
| `:153-161` | 〃 (복제)                                    | 〃                        |
| `:176-183` | 〃 (복제)                                    | 〃                        |

오리 타이핑과 신원 확인의 차이다. AG-10·AG-12·AG-4가 전부 이 하나에서 나온다:

- `isRedirect(e)`를 썼다면 AG-4의 첫 catch 누락이 드러났을 것이다
- `isActionFailure(result)`를 썼다면 AG-10이 발생하지 않는다
- `isHttpError(e)`가 없으니 AG-12가 생겼다

`:1`에서 이미 `@sveltejs/kit`을 정적 import하고 있으므로 추가 비용이 없다.

---

## AG-14 🟠 `locals.auth()`가 요청당 최대 4회

`@auth/sveltekit/dist/index.js:337`:

```js
event.locals.auth ??= () => auth(event, _config);
```

**`??=`는 함수를 한 번만 대입할 뿐 결과를 캐시하지 않는다.**
매 호출마다 `dist/actions.js:69-91`의 전부가 돈다:

```js
const request = new Request(sessionUrl, { headers: { cookie: ... } });
const response = await Auth(request, config);
const authCookies = parse(response.headers.getSetCookie());
for (const cookie of authCookies) { event.cookies.set(name, value, {...}); }   // ← 쿠키 재기록
const data = await response.json();
```

**Request 생성 → JWT 복호화 → set-cookie 파싱 → 모든 인증 쿠키 재기록 → JSON 파싱.**

`/admin/events/new` GET 한 번의 호출 지점:

| #   | 위치                                              |
| --- | ------------------------------------------------- |
| 1   | `hooks.server.ts:33`                              |
| 2   | `src/routes/+layout.server.ts:11`                 |
| 3   | `src/routes/admin/events/new/+layout.server.ts:6` |
| 4   | `src/routes/admin/events/new/+page.server.ts:14`  |

관리자 폼 액션은 훅(1) + `requireAdminAction:53`(2).

**이 파일의 몫**: 세 가드(`ensureSession:20`, `ensureAdmin:38`, `requireAdminAction:53`)가
전부 자기가 `locals.auth()`를 다시 부른다. 세션을 인자로 받거나 `locals`에서 읽지 않는다.

`hooks.server.ts:53`·`:58`이 이미 그 패턴을 세워 뒀다 —
`event.locals.member`, `event.locals.userApplication`을 요청 스코프에 캐시한다.
**세션만 그 대접을 못 받는다.** `app.d.ts:11-13`에 자리를 하나 더 만들면 끝난다.

---

## AG-4 🟠 같은 함수의 두 `catch`가 리다이렉트를 반대로 다룬다

**첫 번째** (`:84-89`) — 무조건 삼킨다:

```ts
} catch (e) {
  const { fail } = await import("@sveltejs/kit");
  return fail(401, { error: (e as Error).message || "Authentication required" });
}
```

**두 번째** (`:117-129`) — 3xx는 재전파한다.

`ensureSession`이 던지는 것은 `redirect(302, ...)`이고 3xx다.
**같은 종류의 예외를 같은 함수 안에서 두 규칙으로 다룬다.**

`:87`의 캐스트도 거짓이다. `internal/index.js:24-41`:

```js
export class Redirect {
  constructor(status, location) {
    this.status = status;
    this.location = location;
  }
}
```

**`Error`를 상속하지 않고 `message`가 없다.** 리다이렉트 경우에는 항상 폴백 문구가 나간다.

> 초판은 "**항상** `undefined`"라고 썼다. 과장이다 —
> `@auth/sveltekit/dist/actions.js:90`이 `throw new Error(data.message)`를 하므로
> `locals.auth()` 자체가 실패하면 **진짜 `Error`가 여기 도달하고 그 메시지가 나간다.**
> 초판은 바로 다음 문단에서 그 사실을 스스로 적어놓고 모순됐다.

그리고 그 경로가 문제다 — 첫 catch는 Auth.js 오류·네트워크 실패도 잡아
**"401 인증 필요"로 만든다.** 서버 장애와 미로그인이 구분되지 않고,
내부 메시지는 그대로 나간다(AG-11).

수정: `isRedirect(e)`면 재전파, `isHttpError(e)`면 상태 보존, 나머지만 401 (AG-13).

---

## AG-3 🟠 `invalidateCache`가 `await`되지 않는다

`:104-110` (복제본 `:163-169`):

```ts
keys.forEach((key) => invalidateCache(key));
```

`cache.ts:125`:

```ts
export async function invalidateCache(key: string) {
  localCache.delete(key);
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      /* Silently fail */
    }
  }
}
```

**`async`인데 `forEach`로 부른다.** `forEach`는 반환값을 버리므로 `await`할 수단이 없다.
`localCache.delete`는 동기라 즉시 반영되지만 **`redis.del`은 응답이 나간 뒤 완료된다.**

`invalidateCache`는 자기가 비동기라고 선언하고 호출부가 그 계약을 무시한다.
`REDIS_URL`이 없어 지금 Redis 분기가 안 도는 것은 **감면 근거가 아니다** —
X-3의 처방이 이 파일의 무효화를 신뢰 가능하게 만드는 것이므로, 그 전제가 여기서 깨진다.

```ts
await Promise.all(keys.map((key) => invalidateCache(key)));
```

> 초판은 "Redis를 붙이는 것이 X-3의 처방"이라고 썼다. **오인용이다.**
> `CROSS-CUTTING.md:135`의 처방은 **키 생성 통합 + 액션 밖 경로에서 직접 호출**이고,
> Redis는 말미 ⚠️의 *관찰*이다.

---

## AG-6 🟠 캐스트가 세 곳 **전부**에서 거짓말한다

```ts
export interface AuthenticatedSession {
  user: { name: string; email: string; image?: string };
  expires: string;
}
```

`@auth/core/types.d.ts:204-216`의 실제 타입:

```ts
interface DefaultUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}
```

| 위치                        | `email` | `name`     | `image`                                                              |
| --------------------------- | ------- | ---------- | -------------------------------------------------------------------- |
| `ensureSession:21→:27`      | 검사 ✅ | 검사 ✅    | **미검사** — `string \| null \| undefined`를 `string \| undefined`로 |
| `ensureAdmin:41→:46`        | 검사 ✅ | **미검사** | **미검사**                                                           |
| `requireAdminAction:54→:63` | 검사 ✅ | **미검사** | **미검사**                                                           |

> 초판은 `ensureSession:27`을 "정당"이라고 **면죄했다.** 틀렸다.
> `image?: string`은 `null`을 배제하는데 검사가 없다. **세 곳 전부 거짓말한다.**
> 자기가 기소하는 결함을 자기 표에서 통과시켰다.

추가로 `auth.ts:31`이 `session.user.id = token.sub`을 넣는데
`AuthenticatedSession`에는 `id`가 없다 — **캐스트가 그것을 모든 소비자에게서 지운다.**

`handleAdminAction:151`이 이 세션을 `logic(session)`에 넘기므로
관리자 액션의 `logic`은 `session.user.name`을 `string`으로 신뢰한다.

수정: 뒤의 둘에 `name` 검사를 추가하고, `image`·`id`를 실제 타입으로 선언한다.

---

## AG-5 🟠 덜 안전한 쪽이 기본값이다

```ts
/** Throws 404 if not (Security by Obscurity). */
export async function ensureAdmin(locals, options: { silent?: boolean } = {}) {
  ...
  if (!session?.user?.email || !isAdmin) {
    if (options.silent) throw error(404, "Not Found");
    throw redirect(302, "/");
  }
```

주석은 404를 옹호하는데 **404는 옵션이고 기본은 302다.**
호출부는 하나뿐이고 그 하나가 옵션을 켠다:

```
src/routes/admin/+page.server.ts:38:  await ensureAdmin(event.locals, { silent: true });
```

`redirect(302, "/")` 분기는 **호출부 0곳**이다.

302와 404는 관찰자에게 다른 것을 알려준다 — 302는 "경로는 있고 너는 자격이 없다",
404는 "그런 것 없다". **주석이 옹호하는 쪽을 켜야만 얻는다.**

옵션 이름 `silent`도 동작을 설명하지 않는다. 조용해지는 것이 아니라 **응답 코드가 바뀐다.**

---

## AG-7 🟠 `requireAdminAction`이 export인데 외부 사용 0

```
$ grep -rn "\brequireAdminAction\b" --include=*.ts --include=*.svelte src/ | grep -v auth-guards.ts
(0건)
```

`handleAdminAction:147`만 쓴다. 반환 형태도 판별 유니온이 아니라 호출부가 비단언을 쓴다:

```ts
const { allowed, response, session } = await requireAdminAction(locals);
if (!allowed || !session) return response!;
```

`!session` 검사는 **`allowed === true`면 논리적으로 불가능한 경우**를 막는다.
타입이 그 사실을 표현했다면 검사도 단언도 필요 없다. AG-2의 제안과 같은 형태다.

---

## AG-11 🟡 내부 오류 메시지가 그대로 나간다

`:87`, `:128`, `:187` 세 곳:

```ts
return fail(500, { error: (e as Error).message || "Action failed" });
```

`logic`이 던진 모든 것의 `message`가 클라이언트로 간다:

| 출처                                         | 문구                                      |
| -------------------------------------------- | ----------------------------------------- |
| `src/lib/server/events.ts:183`               | `"Failed to record attendance in Notion"` |
| `src/routes/admin/+page.server.ts:183`       | `"Member not found in database"`          |
| `notion/client.ts:79,144,173,198,221,251`    | Notion 응답의 `data.message` 원문         |
| `@auth/sveltekit/dist/actions.js:90` → `:87` | Auth.js 내부 오류                         |

내부 구조(Notion 사용, DB 이름)가 노출되고 사용자에게는 조치 가능한 정보가 아니다.
`events.md` SE-18과 짝이다 — 그쪽은 **너무 적게** 남기고 이쪽은 **너무 많이** 보낸다.

---

## AG-10 🟡 `ActionFailure`를 오리 타이핑으로 판별한다

`:94-102` (복제본 `:153-161`):

```ts
if (result && typeof result === "object" && "status" in result &&
    typeof result.status === "number" && result.status >= 400) {
```

SvelteKit의 타입 정의(`types/index.d.ts:68-72`)는 이 위험을 명시한다:

```ts
export interface ActionFailure<T = undefined> {
  status: number;
  data: T;
  [uniqueSymbol]: true; // necessary or else UnpackValidationError could wrongly
  // unpack objects with the same shape as ActionFailure
}
```

> 초판은 "라이브러리가 브랜드를 붙여 막으려 한 것을 **우회하고 있다**"고 썼다. **틀렸다.**
> 그 심볼은 **컴파일타임 전용**이다 — 런타임 클래스(`internal/index.js:65-73`)에는
> `status`와 `data`밖에 없고, `fail()`은 `// @ts-expect-error unique symbol missing`을
> 달고 생성한다(`exports/index.js:206-208`). 우회한 것이 아니라
> **라이브러리가 `isActionFailure`로 제공하는 신원 확인을 손으로 다시 짠 것**이다(AG-13).

`logic`이 `{ status: 404, ... }`를 *데이터*로 반환하면 실패로 오인된다.
현재 그런 호출부는 없다(전수 확인 0건 — `+page.server.ts:81`의 `status: "pending"`은 문자열,
나머지는 `+server.ts`의 `json(..., {status})`로 액션 콜백이 아니다).

---

## AG-9 🟡 정적 의존을 동적으로 부르는 곳 6

| 대상                          | 위치                         |
| ----------------------------- | ---------------------------- |
| `@sveltejs/kit`의 `fail`      | `:55`, `:85`, `:127`, `:185` |
| `./cache`의 `invalidateCache` | `:105`, `:164`               |

같은 패키지의 `redirect`, `error`, `type ActionFailure`는 `:1`에서 정적으로 가져온다.
`fail`만 다르게 다룰 이유가 코드에 없다 — 순환 참조도 아니고(외부 패키지),
모듈이 이미 로드돼 있어 번들 이득도 없다. 액션 경로마다 `await`가 하나씩 는다.

같은 관용구가 라우트에도 있다(예: `events/[id]/[type]/+page.server.ts:79`).
레포 전반의 습관이므로 A-f 도달 시 X 항목으로 승격할지 판단한다.

---

## AG-8 🟡 `successMessage`가 죽어 있고, 같은 이름이 따로 살아 있다

`:140`에 선언됐으나 본문 어디에서도 `options.successMessage`를 읽지 않는다.
서버 옵션으로 넘기는 호출부도 0건:

```
$ grep -rn "successMessage:" --include=*.ts src/
(0건)
```

`admin/+page.svelte`의 `successMessage=` 8곳은 `ActionButton.svelte:25`의
**클라이언트 prop**이고(`:47` `toasts.success(successMessage)`) 이 파일과 무관하다.
**이름이 같아서 "서버에서 오는 것"으로 오해하기 쉽다.**

---

## 지적하지 않은 것

- **`ensureSession`이 `name`까지 요구하는 것** — 정당하다.
  근거는 `events.ts:136-138` `recordAttendance(eventId, user: { ..., name: string, ... })`이고
  `events/[id]/[type]/+page.server.ts:74`가 `session.user.name`을 그대로 넘긴다.
  > 초판은 `parseGoogleName`을 근거로 들었다. **틀렸다** —
  > `utils.ts:88`은 `rawName?: string | null`이고 `:89`가 `(rawName || "")`로
  > null을 명시적으로 허용한다. 아무것도 정당화하지 않는다.
  > 인용 줄도 틀렸다(`:76` → 실제 `:57`).
- **`checkIsAdmin` 재수입 개명**(`:2`, `:39`) — 지역 변수 `isAdmin`과의 충돌 회피. 정당
- **반환 타입 유니온 4갈래**(`:75-80`) — 장황하지만 SvelteKit 액션 규약의 정직한 표현

---

## 수정 순서

1. **AG-2** — 두 함수를 하나로. **이것을 먼저 해야 아래가 한 번씩만 고쳐진다**
2. **AG-13 + AG-12 + AG-4** — `isRedirect`/`isHttpError`/`isActionFailure`로 교체.
   셋이 한 수정이다. 의도한 4xx가 살아난다
3. **AG-1** — `auth.ts:23`·`:38`이 급하다. 라우트 복구 시 `isPublic`도 함께
4. **AG-6** — `name` 검사 추가, `image`·`id` 타입 정직화
5. **AG-3** — `await Promise.all(keys.map(invalidateCache))`
6. **AG-14** — 세션을 `locals`에 요청 스코프 캐시. 훅이 이미 그 패턴을 쓴다
7. **AG-5** — 404를 기본으로, 옵션 이름을 동작에 맞게
8. **AG-7 / AG-8 / AG-9 / AG-11** — 정리 단계

---

## 개정 이력

| 변경                        | 내용                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AG-1 메커니즘 전면 정정** | "네 곳이 **404**를 가리킨다" → **404는 안 난다.** 세션이 없으므로 `hooks.server.ts:42-43`이 `/`로 **303 반송**하고 `?error=`는 버려진다. `handle` 훅이 라우트 해석보다 먼저 돈다(`respond.js:457`). 결론(이유를 볼 수 없다)은 유지 — 오히려 더 나쁘다 |
| **헤더 인용 날조 철회**     | "`applications.md` AP-9의 정본"은 **거짓**. AP-9는 `hooks.server.ts`의 미래핑 import 이야기이고 `auth-guards`를 한 번도 언급하지 않는다(`grep -c` → 0). 실제 의존 문서는 `notion/events.md:106`·`notion/client.md:194`                                |
| **AG-12 신설 🟠**           | `logic` 안의 `error(403)`이 `fail(500,"Action failed")`가 된다. `HttpError`에 최상위 `message`가 없고 403은 3xx가 아니다                                                                                                                              |
| **AG-13 신설 🟠**           | `isRedirect`/`isActionFailure`/`isHttpError`가 export돼 있는데 구조 판별을 4곳에서 손으로 짠다. AG-4·10·12의 공통 뿌리                                                                                                                                |
| **AG-14 신설 🟠**           | `locals.auth ??=`는 함수만 캐시한다. 요청당 최대 4회 전체 세션 복호화 + **쿠키 재기록**. 가드 셋이 각자 다시 부른다                                                                                                                                   |
| **AG-6 면죄부 철회**        | `ensureSession:27`을 "정당"이라 했으나 `image?: string`이 `null`을 배제하는데 미검사. **3곳 전부 거짓말**. `id` 소실도 추가                                                                                                                           |
| **AG-10 근거 정정**         | `uniqueSymbol`은 **컴파일타임 전용**이다(`internal/index.js:65-73`, `fail()`의 `@ts-expect-error`). "우회"가 아니라 "라이브러리 판별자를 손으로 재구현"                                                                                               |
| **AG-4 과장 정정**          | "항상 `undefined`" → 리다이렉트 경우만. `actions.js:90`이 진짜 `Error`를 던진다. 자기 다음 문단과 모순됐다. `:87`을 AG-11 목록에 추가                                                                                                                 |
| **AG-3 오인용 정정**        | "Redis를 붙이는 것이 X-3 처방" → **아니다.** `CROSS-CUTTING.md:135`는 키 통합 + 직접 호출이다                                                                                                                                                         |
| **AG-2 제안 수정**          | 초판 제안이 AG-10의 구조적 판별을 재도입했다. 판별 유니온으로 교체                                                                                                                                                                                    |
| AG-9 확대                   | `fail` 4곳 → `./cache` 동적 import 2곳 포함 **6곳**                                                                                                                                                                                                   |
| AG-11 인용 정정             | `admin:172` → `src/routes/admin/+page.server.ts:183`. `:87` 추가                                                                                                                                                                                      |
| 비지적 #1 근거 교체         | `parseGoogleName`은 `string \| null`을 받는다(`utils.ts:88-89`) — 정당화 못 한다. `recordAttendance`의 `name: string`으로 교체. `:76` → `:57`                                                                                                         |
| 호출부 표 정정              | raw grep 수(import·주석 포함)를 "실측"이라 표기했다. **실호출 수**로 교체                                                                                                                                                                             |
