# `src/lib/server/core/http.ts` (67줄)

**접두사 `LA04-`** · HTTP 경계 헬퍼 — 로드용 `AppError → HttpError` 변환(`httpGuard`), REST 오류 봉투, `/api`용 관리자·Bearer 게이트.

## LA04-1 🟡 로드 경로가 `userMessage`를 버리고 코드 문자열을 화면에 띄운다

18행 `throw error(e.status, e.code)`. SvelteKit은 문자열 본문을 `{ message }`로 만들고,
`routes/+error.svelte:38-40`은 `page.error?.message`를 본문 문단에 그대로 출력한다.
결과: `httpGuard`로 감싼 로드가 `AppError`를 던지면 사용자는 `NOT_FOUND`·`FORBIDDEN` 같은
**계약 코드를 문장 자리에서** 본다. 그리고 `AppError.userMessage`(`errors.ts:42`)가 있어도 사라진다.

같은 변환의 액션 쪽(`auth-guards.ts:161-162` `runAction`)은 `fail(e.status, { error: e.code, message: e.userMessage })`로
`userMessage`를 전달한다. 7행 주석이 이 함수를 그 "counterpart"라고 부르지만 두 변환의 출력 계약이 다르다.
최근 커밋 `81a23f6`("say what went wrong instead of showing the error code")이 관리자 화면에서 고친 것과
같은 부류다.

처방: `error(e.status, { message: e.userMessage ?? <상태별 기본 문구> })` 또는 `App.Error`에 `code`를 추가해
`+error.svelte`가 코드로 문구를 고르게 한다. **동작 변경**(오류 화면 문구).

## LA04-2 🟡 `core`가 상위 계층 `auth-guards`에 의존한다

3행 `import { resolveAdminAccess } from "$lib/server/auth-guards"`. `ARCHITECTURE.md:23`은 `core/`를
"에러 코드, HTTP 헬퍼, 학기, 시간, id, capability" — 바닥 계층으로 둔다. 이 import 하나 때문에
`httpGuard`만 쓰려는 공개 로드(`archive/seminars/[id]/+page.server.ts:3`)도
`auth-guards → guards/resolve-member → data/tables → store` 사슬을 끌고 온다. 역으로 `auth-guards.ts:2-3`은
`core/capabilities`·`core/errors`를 import하므로, `auth-guards`가 언젠가 `core/http`를 쓰는 순간 순환이 된다.

`requireAdminRest`(43-51행)는 성격상 `auth-guards.ts`의 `requireAdminAction`·`requireCapabilityAction`
옆에 있어야 한다 — 같은 `resolveMemberContext`를 쓰는 세 번째 게이트다. **구조만 바뀐다**(import 경로 3곳).

## LA04-3 🟡 `restError`가 REST 오류 봉투의 유일한 생성처가 아니다

31행 주석은 "always `{ error: <code> }`"라고 하지만 그 "항상"은 이 함수를 거치는 호출에만 성립한다.

- `api/uploads/presign/+server.ts:23,38,45,53`이 같은 봉투를 `json({ error: … }, { status })`로 손으로 만든다 —
  코드와 상태를 따로 적으므로 `DEFAULT_STATUS`와 어긋날 수 있다
- `api/cron/sync-events/+server.ts:28`·`api/cron/maintenance/+server.ts:31`은 `{ error: "Sync failed" }`처럼
  **코드가 아닌 문자열**을 넣어 `domain/api.ts:24` `restErrorEnvelopeSchema`를 위반한다

또 `status?` 인자(32행)는 호출 3건 중 1건만 쓰고, 그 1건(50행 `restError("NOT_FOUND", 404)`)은 기본값과 같은
값을 다시 적는다. 쓰임새 없이 코드–상태 계약을 우회하는 문을 연다 — `LA03-1`과 같은 형태.

처방: `status` 인자를 없애고 `AppError`를 받는 `restErrorFrom(e: AppError)`를 더해 presign 53행을 대체한다.
presign은 **구조만**, cron 본문 교정은 **동작 변경**(응답 본문)이다 — 후자는 cron 문서의 몫이다.

## LA04-4 🟡 Bearer 비교가 상수 시간이 아니다 — `CS-2`가 공용 헬퍼로 옮겨 왔다

64행 `header !== \`Bearer ${secret}\``. `CS-2`(`api/cron/sync-events/+server.md`)가 세 엔드포인트의
복제본에 대해 지적한 것이 C-20으로 한 곳에 모이면서 **그대로 이 헬퍼의 성질이 됐다.** 원격 지터 때문에
심각도를 올리지 않는다는 `CS-2`의 판단과, `timingSafeEqual`을 그대로 쓰면 길이 불일치로 `RangeError`(→500)가
난다는 정정도 그대로 적용된다 — 양쪽을 sha256으로 고정 길이 다이제스트로 만든 뒤 비교한다.
**외부 동작 변화 없음.**

## 확인했고 지적하지 않은 것

- **`toHttpError`가 redirect·HttpError를 통과시킨다** (17행) — `isRedirect`/`isHttpError`로 SvelteKit 자체
  판별기를 쓴다. `runAction`(`auth-guards.ts:153-160`)의 `status 300-399` 덕 타이핑보다 정확하다.
  두 방식의 차이는 `auth-guards.ts` 문서의 몫이다
- **`httpGuard`의 catch가 값을 반환하지 않는다** (26-28행) — `toHttpError`가 `never`이므로 타입상 정확하다
- **`requireAdminRest`가 비관리자에게 404** (39-41행) — `(admin)` 존의 은닉 규칙(`zone.ts` `notFound`)과 일관된다
- **`requireCronAuth`가 "시크릿 없음"과 "틀린 시크릿"을 같은 401로** (56-59행) — `CS-4`의 해소이고,
  fail-closed는 유지된다(`secret`이 없으면 `!secret`에서 거부)
- **`toHttpError`가 export되지만 외부 호출이 없다** — 이름 붙은 변환을 테스트·향후 스트리밍 로드가 쓸 수 있고 비용이 없다

## 검증 (2026-09-28)

- LA04-1 — 확인 (`error(status, string)`은 `{ message: code }`가 되고, `+error.svelte:38-40`이 그것을 본문에 출력한다. `httpGuard` 호출부는 세 곳이다: `archive/seminars/[id]`, `study/[id]/attendance`, `study/[id]/manage`)
- LA04-2 — 확인 (`auth-guards.ts:2-3`이 `core/*`를 import하므로 역방향 의존이 생기면 곧바로 순환한다. `requireAdminRest` 호출부는 `api/admin/*` 세 곳이다)
- LA04-3 — 확인 (presign 23·38·45·53행, cron 두 엔드포인트의 문자열 `error`, 50행의 중복 404)
- LA04-4 — 확인 (64행. `CS-2`의 판단을 그대로 옮겨 적었다)
- 누락 점검: redirect·HttpError 통과(17행), `requireCronAuth`의 fail-closed(62-65행), `restError`의 기본 상태 경로(33행)를 읽었다. 새 지적은 없다.
