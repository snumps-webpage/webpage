# 교차 발견 — 파일 단위 리뷰로는 안 잡히는 것들

> **성격**: 한시적 작업 문서. [README](./README.md) 참조.
> 파일별 리뷰(`files/`)는 한 파일 안의 문제를 본다. 이 문서는 **여러 파일에 걸쳐 반복되거나,
> 어느 파일에도 속하지 않는** 발견을 모은다.

---

## X-1 🔴🔴 `main`이 빌드되지 않는다

```
$ ./node_modules/.bin/vite build
[vite]: Rollup failed to resolve import "zod" from
  "/home/toxiclemon/Working/webpage/src/lib/server/notion/schema.ts"
✗ Build failed in 679ms   (exit 1)
```

`zod`가 **`package.json`에도, `node_modules`에도 없다.**
그런데 `src/lib/server/notion/schema.ts:1`이 값으로 import 한다.

```
schema.ts:1   import { z } from "zod";        ← 값. 런타임에 필요
utils.ts:2    import type { z } from "zod";   ← 타입 전용. 런타임에 소거됨
```

### 왜 지금까지 안 드러났나

| 검사 | 결과 | 이유 |
|---|---|---|
| `vitest run` | ✅ 8 passed | 테스트가 `utils.ts`만 건드리고, 거기 import는 **타입 전용**이라 소거된다 |
| `eslint .` | ✅ clean | 모듈 해석을 하지 않는다 |
| `svelte-check` | ❌ **잡고 있었다** | 아래 |

### 🔴 내가 40개 오류를 읽지 않았다

감사 내내 이렇게 보고했다 — *"`svelte-check` 40 errors = 기준선, 신규 오류 0"*.
**그 40개가 무엇인지 한 번도 열어보지 않았다.** 그중 둘이 이것이다:

```
ERROR "src/lib/server/notion/utils.ts"  2:24  "Cannot find module 'zod' ..."
ERROR "src/lib/server/notion/schema.ts" 1:19  "Cannot find module 'zod' ..."
```

**기준선을 숫자로만 다루고 내용을 노이즈 취급했다.** 그 안에 "빌드가 깨져 있다"가 들어 있었다.
`A-1`부터 `A-9`까지 아홉 번 같은 문장을 반복하면서 매번 그냥 지나쳤다.

> **교훈**: 기준선은 개수가 아니라 목록이어야 한다.

### 40개는 서로 다른 결함이 아니다 — 전부 이 하나의 연쇄다

출력을 실제로 읽은 결과:

```
 9  Property 'memberId' does not exist on type '{}'
 6  Property 'privateInfoId' does not exist on type '{}'
 5  Property 'name' ...        4  Property 'email' ...
 4  'p' is of type 'unknown'   2  Property 'department' ...
 2  'm' is of type 'unknown'   2  'member' is of type 'unknown'
 + 근원 2건: Cannot find module 'zod'
```

`z.infer<typeof MemberSchema>`가 zod를 못 찾아 **`{}`로 붕괴**하고,
그 타입이 `notion/index.ts` 배럴을 통해 소비자 11개 파일로 퍼진 것이다.

**`pnpm add zod` 하나로 40개 대부분이 사라질 가능성이 높다.**
감사 내내 "기존 결함 40개"로 취급한 것이 실은 **의존성 하나**였다.

### 영향

- **배포 불가.** Vercel 빌드도 같은 지점에서 실패한다
- `docs/migration/notion-db-to-s3.md`가 계획하는 모든 것이 이 위에 있다
- `notion/schema.md`가 다룬 스키마 7개가 **런타임에 로드조차 안 된다**

### 수정

`pnpm add zod` 한 줄. 다만 **왜 사라졌는지**를 먼저 봐야 한다 —
`git log -S'zod' -- package.json`이 비어 있어, 애초에 추가된 적이 없는 것으로 보인다.
`b737a5a refactor(arch): modernize data layer with Repositories, Zod, and Middleware`가
zod 코드를 넣으면서 의존성을 안 넣은 것으로 추정된다.

---

## X-2 🔴 테스트가 아무것과도 연결돼 있지 않다

- `package.json`에 **`test` 스크립트가 없다** (`dev·build·preview·prepare·check·check:watch·lint·format·deploy·deploy:preview`)
- `.github/workflows`가 **없다**
- 레포 전체 테스트 파일이 **1개**(`notion/utils.test.ts`, 8케이스)

즉 **사람이 `npx vitest`를 직접 쳐야만 실행된다.**
`vitest`·`@vitest/ui`가 devDependency에 있고 `vitest.config.ts`도 있는데 아무도 부르지 않는다.

> `migrate/dev-carryover` 브랜치에 `test` 스크립트가 추가돼 있다(`3fc8250`).
> 그 브랜치가 머지되면 절반은 해소된다. CI는 여전히 없다.

부수: `vitest.config.ts:8`이 `environment: "jsdom"`인데 유일한 테스트는 순수 함수다.
실행 681ms 중 **544ms가 jsdom 설정**이다.

---

## X-3 🔴 캐시 키 12개 중 **정상은 4개**

2026-08-25 전수 대조. 정의된 키 12개 vs 무효화 시도 7개.

| 캐시 키 (정의) | 무효화 | 판정 |
|---|---|---|
| `all_applications` | `admin:102,115` · `signup:103` · `signup/edit:71` | ✅ |
| `all_members` | `admin:102` | ✅ |
| `all_seminar_requests` | `admin:270,303` · `seminar/apply:82` · `seminar/edit:109` | ✅ |
| `schema_${databaseId}` | 없음 | ✅ 정당 (1h TTL, 스키마 불변) |
| `all_events` | `admin:141,153,165,270` **관리자 액션만** | ⚠️ **부분** — cron(`events.ts:222,234,240`)과 `load`(`events/[id]/[type]:29`) 두 쓰기 경로가 빠짐 (`events.md` SE-15) |
| `member_${email}` (`notion/members.ts:57`) | `member_${id}` (`admin:102`) — **id는 신청서 page id** | ❌ 불일치 (`members.md` M-10) |
| 〃 | `` `member_${locals.auth().then(...)}` `` (`+page.server.ts:278`) | ❌ **`member_[object Promise]`** — 상수 문자열, 완전 무동작. 주석은 `// Optimization: refresh member cache` |
| `user_activities_${memberId}` | `user_activities_${userEmail}` (`admin:191`) | ❌ 불일치 (`activities.md` AC-1) |
| `application_${email}` | 없음 | ❌ 0건 (`applications.md` AP-1) |
| `attendance_queue` | 없음 — 쓰기 4개 전부 | ❌ 0건 (`events.md` SE-3) |
| `all_activities` | 없음 — `createActivityPage`가 쓰는데 | ❌ 0건 |
| `activities_${startDate}_${endDate}` | 없음 | ❌ 0건 |
| `latest_executives` | 없음 | ❌ 0건 |

**개별 수정이 아니라 구조 문제다.** 키가 정의부와 무효화부에서 **각자 문자열로 조립된다.**
같은 함수를 쓰지 않는 한 이 종류의 불일치는 계속 생긴다.

**구조적 원인 두 가지:**
1. (`applications.md` AP-1) 무효화 배열이 `handleAdminAction(locals, fn, { invalidate })`의
   **바깥 스코프**에서 만들어지는데 거기엔 신청 id밖에 없다. 이메일은 클로저 안에서야 해석된다
2. (`events.md` SE-15) `invalidateCache`는 `auth-guards.ts`의 액션 래퍼를 통해서만 불린다.
   **액션이 아닌 쓰기 경로**(cron, `load`)에는 무효화를 걸 자리 자체가 없다

**처방**: 키 생성을 `cache.ts`로 모으고(`cacheKeys.member(email)`) 저장·무효화가 그것만 쓰게 한다.
액션 밖 쓰기 경로는 서비스 함수 안에서 직접 `invalidateCache`를 부르게 한다.

> ⚠️ `REDIS_URL`이 설정돼 있지 않아 `withCache`는 람다 인스턴스별 `Map`이다(`cache.ts:16`).
> **키를 고쳐도 무효화는 그 요청을 처리한 인스턴스에만 닿는다.** 필요조건이지 충분조건이 아니다.
> `attendance_queue`(SE-3)는 그 위에 TOCTOU까지 겹쳐 무효화만으로는 고쳐지지 않는다.

---

## X-4 🟠 `notionArchive` 별칭이 **네 곳**

```
notion/events.ts:95        deleteEventInNotion            = notionArchive
notion/events.ts:136       removeAttendanceRecordInNotion = notionArchive
notion/seminars.ts:210     removeSeminarRequestInNotion   = notionArchive
notion/applications.ts:120 removeApplicationInNotion      = notionArchive
```

공통 문제:
- **DB 소속 검사가 없다.** 이벤트 id 자리에 회원 id가 오면 회원을 아카이브한다.
  별칭이 검사를 넣을 수 있는 유일한 자리를 지운다
- 이름이 `delete`/`remove`인데 동작은 **복구 가능한 아카이브**다.
  → `applications.md` AP-11: 관리자 UI가 *"영구적으로 삭제됩니다"*라고 안내한다
  → `client.md` 초판에서 **나도 "영구 삭제"로 오해**했다

**처방**: `client.ts`에 `archivePage(dbId, pageId)` 하나를 두고 네 별칭을 없앤다.

---

## X-5 🟠 접근 계층이 상위 타입보다 넓은 시그니처를 갖는 습관

| 위치 | 선언 | 상위 타입 |
|---|---|---|
| `notion/seminars.ts:201` | `status: string` | `"approved" \| "rejected"` (`seminars.ts:92`) |
| `notion/events.ts:79` | `status: string` | `"draft" \| "active" \| "expired"` (`types.ts:57`) |
| `notion/events.ts:127` | `updates: any` | — (아무것도 좁히지 않음) |
| `notion/events.ts:49` · `:113` | `data: any` | — |

`notion/activities.ts:125` `createActivityPage`는 **제대로 된 시그니처를 갖는다.**
같은 계층에서 한쪽은 타입이 있고 한쪽은 없다.

`events.ts`의 select 케이스는 실제 위험이 있다 — Notion은 select에 없는 이름을 주면
**옵션을 자동 생성**하므로 상태 어휘가 오염될 수 있다.

---

## X-6 🟠 `getPropertyValue`의 `any` 반환이 하류 타입을 전부 무력화한다

`notion/utils.ts:29` `export function getPropertyValue(property: any): any`

입력 `any`는 정당하다(Notion 응답이 실제로 비정형). **반환이 문제다.**

- `admin.ts:83` `Promise<Application | null>`에 `accepted: ""`가 들어가도 컴파일된다
- `activities.ts:56` `attendees`가 배열이 아니라 `""`일 수 있는데 `.includes()`를 부른다
- `MemberRepository.findAll(): Promise<Member[]>`가 없는 `privateInfoId`를 약속한다

> **런타임 검증과는 별개 문제다.** zod `safeParse`는 정적 타입과 무관하게 돈다 —
> 그걸 무력화하는 것은 `utils.ts:21`(실패해도 raw 반환)이다. 두 원인을 섞지 말 것.

---

## X-7 🟡 빈 JSDoc이 `notion/` 데이터 모듈 5개 중 4개

`activities.ts` · `applications.ts` · `events.ts` · `seminars.ts`의 `:2-3`이
전부 `/**\n */`로 동일하다. `members.ts`·`client.ts`·`schema.ts`·`utils.ts`만 설명이 있다.

**템플릿 잔재**이지 개별 파일의 특성이 아니다. 파일마다 반복 지적하지 않는다.

---

## 이 문서를 만든 이유

파일 단위 리뷰 9건을 진행하면서 **같은 결함이 다른 이름으로 반복** 나타났고
(캐시 키 3회, 아카이브 별칭 4회, 넓은 시그니처 4회),
반대로 **X-1·X-2처럼 어느 파일에도 속하지 않아 아홉 번 지나친 것**이 있었다.

파일별 리뷰는 계속하되, 반복이 확인되면 여기로 승격시킨다.

---

## X-8 🔴 인증 설정이 삭제된 라우트를 가리킨다

`16d4ba0`("chore: fix linting and type errors across the project")이
`src/routes/login/{+page.server.ts,+page.svelte}`를 삭제하고 **참조는 남겼다.**
`HEAD`의 조상이다.

현재 라우트 전수:

```
/  /admin  /admin/events/connect  /admin/events/new  /api/admin/applications
/api/admin/seminar-requests  /api/cron/sync-events  /api/posters/seminar/png
/auth  /events/[id]/[type]  /seminar/apply  /seminar/edit/[id]  /signup
/signup/edit  /wait
```

| 위치 | 참조 | 도달 | 실제 결과 |
|---|---|---|---|
| `auth.ts:23` | `` return `/login?error=InvalidDomain` `` | ✅ **살아 있다** | **`/`로 303 반송, `?error=` 소실** |
| `auth.ts:38` | `pages: { error: "/login" }` | ✅ | 〃 |
| `auth.ts:37` | `pages: { signIn: "/login" }` | ❌ | `+page.svelte:470`의 `signIn('google')`이 프로바이더로 직행 |
| `auth-guards.ts:22-24` | `redirect(302, "/login?redirect=…")` | ❌ | `hooks.server.ts:43`이 먼저 `/`로 보냄 |
| `hooks.server.ts:48` | `path === "/signout"` (허용 목록) | ❌ | **`/signout` 라우트도 없다.** 로그아웃은 `signOut()` → `/auth/signout` |

**404가 나지는 않는다.** SvelteKit은 라우트 해석보다 `handle` 훅을 먼저 돌고
(`runtime/server/respond.js:457`), 도메인 거부된 사용자는 세션이 없으므로
`hooks.server.ts:42-43`의 `redirect(303, "/")`에 먼저 걸린다.

**404보다 나쁘다.** 비 `@snu.ac.kr` 계정 사용자는 **로그인 버튼이 그대로 있는 홈으로
아무 설명 없이 돌아온다.** 다시 눌러도 같다. 무엇이 잘못됐는지 알 방법이 없다.

**복구 함정**: `isPublic`(`hooks.server.ts:37-38`)에 `/login`이 **없다.**
라우트만 되살리면 미인증 방문자가 `:43`에서 `/`로 튕겨 **무한 반송**이 된다.
라우트 추가와 `isPublic` 수정이 한 쌍이어야 한다.

**구조적 원인**: 문자열 경로가 세 파일(`auth.ts`, `auth-guards.ts`, `hooks.server.ts`)에
흩어져 있고 타입도 테스트도 검증하지 않는다. 라우트를 지울 때 참조를 찾아주는 것이 없다.
라우트 상수 모듈이나 `resolveRoute` 사용이 있으면 삭제 시점에 드러난다.

**우선순위**: `auth.ts:23`·`:38`이 급하다 — 지금 사용자가 겪는다.

관련: `auth-guards.md` AG-1.

---

## X-9 🟡 정적 의존을 동적으로 부르는 습관 — 8개 파일 16곳

`await import(...)`가 서버·라우트 전반에 16곳 있다. 정당한 것은 **하나뿐**이다.

| 파일 | 대상 | 횟수 | 판정 |
|---|---|---|---|
| `components/poster/SeminarPosterDownloadPanel.svelte` | `html-to-image` | 1 | ✅ **정당** — 클라이언트 번들 분리 |
| `lib/server/auth-guards.ts` | `@sveltejs/kit` | 4 | ❌ **`:1`에서 이미 정적** |
| 〃 | `./cache` | 2 | ❌ |
| `lib/server/admin.ts` | `./notion` | 1 | ❌ **`:6`에서 이미 정적** |
| `lib/server/seminars.ts` | `./notion` | 1 | ❌ **같은 파일에서 정적으로도** |
| `lib/server/notion/seminars.ts` | `../../utils` | 1 | ❌ |
| `routes/events/[id]/[type]/+page.server.ts` | `@sveltejs/kit` | 1 | ❌ **`:1`에서 이미 정적** |
| 〃 | `$lib/server/mail` | 1 | ❌ |
| `routes/signup/+page.server.ts` | `$lib/server/admin` | 1 | ❌ **`:4`에서 이미 정적** |
| 〃 | `$lib/server/mail` | 1 | ❌ |
| `routes/+page.server.ts` | `$lib/server/admin` | 1 | ❌ |
| `routes/seminar/apply/+page.server.ts` | `$lib/server/mail` | 1 | ❌ |

**5개 파일이 같은 모듈을 정적·동적으로 둘 다 가져온다** —
`auth-guards.ts`(`@sveltejs/kit`), `admin.ts`(`./notion`), `seminars.ts`(`./notion`),
`events/[id]/[type]`(`@sveltejs/kit`), `signup`(`$lib/server/admin`).
**이미 정적 그래프에 있으므로 지연 이득이 원리적으로 0이다.**

### 왜 결함인가

- 서버 모듈은 콜드 스타트에 한 번 로드되면 그만이다. 동적으로 미루면
  **비용이 첫 요청 안으로 들어온다** — 그것도 폼 제출 응답 경로에서
- 의존 그래프가 정적 분석에 안 잡힌다. 순환 참조 탐지·트리셰이킹·타입 검사가 약해진다
- 호출 경로마다 `await`가 하나 늘고, 그 자리가 예외 지점이 된다
- **어느 것이 의도된 지연이고 어느 것이 습관인지 구별할 수 없게 된다** —
  포스터 컴포넌트의 정당한 사용 하나가 열다섯 개의 잡음에 묻힌다

### 처방

`html-to-image` 하나만 남기고 전부 정적 import로.
순환 참조가 실재하는 곳이 있다면 그것은 **모듈 경계 문제**이지 동적 import로 덮을 일이 아니다.

관련: `auth-guards.md` AG-9, `admin.md` AD-11.

---

## X-10 🟠 오류 처리 규약이 계층별로 없다 — `catch` 51개, 규약 4가지

전수 조사(2026-08-28). `catch` 블록 51개를 본문으로 분류했다.

| 규약 | 수 | 뜻 |
|---|---|---|
| 재전파 (`throw`) | 16 | 호출부가 판단 |
| 폴백값 반환 (`return null` / `[]` / `false`) | 14 | 장애를 "없음"으로 |
| 로그만 (`console.*` 후 암묵 `undefined`) | 17 | 호출부가 알 수 없음 |
| 완전 침묵 (주석뿐) | 4 | 흔적 없음 |

**분포 자체는 문제가 아니다.** 문제는 **같은 계층 안에서 갈린다**는 것이다.

### 규약이 있는 계층

| 파일 | 규약 | 일관성 |
|---|---|---|
| `notion/client.ts` | 재전파 6/6 | ✅ **완전히 일관** |
| `mail/templates.ts` | 로그만 5/5 | ✅ 일관 (규약 자체는 MT-1이 지적) |
| `notion/{events,members,utils}.ts` | 폴백 1/1씩 | ✅ |

Notion 접근 계층은 **재전파로 통일돼 있다.** 설계가 있었다는 뜻이다.

### 규약이 없는 계층 — 파일 안에서 갈리는 8곳

| 파일 | 침묵 | 로그만 | 폴백 | 재전파 | 규약수 |
|---|---|---|---|---|---|
| `lib/server/admin.ts` | 0 | 1 | 2 | 2 | **3** |
| `lib/server/auth-guards.ts` | 0 | 0 | 1 | 2 | 2 |
| `lib/server/cache.ts` | **3** | 1 | 0 | 0 | 2 |
| `lib/server/events.ts` | 0 | 1 | 2 | 0 | 2 |
| `lib/server/seminars.ts` | 0 | 0 | 3 | 4 | 2 |
| `routes/+page.server.ts` | 0 | 1 | 2 | 0 | 2 |
| `routes/admin/events/new/+page.server.ts` | 0 | 1 | 0 | 1 | 2 |
| `routes/seminar/edit/[id]/+page.server.ts` | 0 | 1 | 0 | 1 | 2 |

**도메인 서비스 계층 전체가 규약 없이 쓰였다.**
`admin.ts` 하나가 세 규약을 쓰고(AD-5), `seminars.ts`는 폴백 3 + 재전파 4다(A-17에서 확인).

### 왜 이것이 결함인가

같은 계층의 함수가 실패를 다르게 표현하면 **호출부가 계층을 신뢰할 수 없다.**
함수마다 시그니처를 보고 판단해야 하고, 그것도 반환 타입에 안 드러난다
(`admin.md` AD-18 — 반환 타입 미선언 3개).

이미 실제 피해로 이어졌다:

| 결함 | 규약 부재의 결과 |
|---|---|
| `admin.md` AD-5 ③ | `getApplications() → []` 가 `signup:47` 가드를 무력화 → 중복 신청 → AP-10 영구 잠김 |
| `events.md` SE-12 | `getEvents() → []` 로 관리자가 "이벤트 없음"을 본다 |
| `templates.md` MT-1 | 승인 메일 실패가 호출부에 전달되지 않아 채팅방 링크가 영영 사라진다 |
| `cache.md` CA-5 | 무효화 **실패**가 무효화 **부재**와 구별되지 않는다 |
| `cache.md` CA-13 | fetcher가 삼킨 `[]`가 **캐시되어 Redis로 확산**된다 — 삼킴이 전파된다 |

### 처방

계층별로 하나씩 정한다:

1. **접근 계층(`notion/`)** — 이미 재전파다. 유지
2. **도메인 서비스(`lib/server/*.ts`)** — 재전파로 통일.
   "없음"과 "장애"를 구분해야 하면 `Result<T>` 또는 명시적 유니온
3. **경계(`auth-guards`, 라우트)** — 여기서만 잡고 로그를 남긴다.
   지금은 로그가 두 번 남는다(`client.md` C-4, `admin.md` AD-5 ②)

`cache.ts`의 완전 침묵 3곳(`:92`, `:109`, `:130`)은 캐시 폴백이 있으므로
읽기(`:92`)는 정당하지만 쓰기·무효화 실패(`:109`, `:130`)는 로그가 필요하다.

관련: `admin.md` AD-5, `events.md` SE-12·SE-18, `templates.md` MT-1,
`cache.md` CA-5, `notion/client.md` C-4, `notion/utils.md` U-1.
