# `src/app.d.ts` (32줄)

**접두사 `LD03-`** · 전역 앱 타입 — `App.Locals`(세션 함수·해석된 회원), `App.PageData`, `App.Error`(REST 코드), Auth.js `Session` 모듈 확장.

> 이 파일의 컴파일 오류는 `skipLibCheck: true`(`tsconfig.json:10`) 때문에 어떤 게이트에도 보이지 않는다 — `CROSS-CUTTING.md` **XC-11**.
> XC-11은 오류 **3건**을 세고 그중 `TS2307` 하나만 이름을 댔다. 다시 돌려 셋 모두를 확인했다
> (`tsc -p ./tsconfig.json --noEmit --skipLibCheck false`, 이 파일 밖의 오류 0건):
>
> ```
> src/app.d.ts(9,7):   error TS2300: Duplicate identifier 'auth'.
> src/app.d.ts(13,32): error TS2307: Cannot find module './lib/server/admin' …
> src/app.d.ts(16,7):  error TS2687: All declarations of 'session' must have identical modifiers.
> ```
>
> 아래 LD03-1이 첫째와 셋째, LD03-2가 둘째다.

## LD03-1 🟡 라이브러리가 이미 선언한 멤버를 다시 선언해 충돌한다

`@auth/sveltekit/dist/types.d.ts:8-31`이 전역 `App`을 이미 확장한다 — `Locals.auth(): Promise<Session | null>`(10행, 메서드)와 `PageData.session?: Session | null`(29-31행, 선택).

- 9행 `auth: () => Promise<Session | null>` — 같은 멤버를 **프로퍼티로** 다시 선언 → `TS2300`. 더하는 정보가 없다
- 15-17행 `session: Session | null` — 같은 멤버를 **필수로** 다시 선언 → `TS2687`. 라이브러리는 "없을 수 있다", 이 파일은 "항상 있다"고 말한다. 두 계약 중 어느 것이 유효한지는 검사가 꺼져 있어 아무도 판정하지 않는다

둘 다 논리적으로 불필요한 중복 선언이고, 그 결과가 숨은 컴파일 오류다. 처방: 9행 삭제, `PageData` 블록 삭제(루트 레이아웃이 `session`을 항상 반환하므로 Kit의 생성 타입이 이미 정확하다). 타입만 바뀐다.

## LD03-2 🟡 `userApplication` — 삭제된 모듈을 가리키는, 아무도 쓰지 않는 필드

12-13행. `./lib/server/admin`은 존재하지 않는다(`src/lib/server/`에 `admin*` 없음) → `TS2307`, 그리고 검사가 꺼져 있으니 타입은 조용히 `any`가 된다.
`locals.userApplication`을 읽거나 쓰는 곳은 0건이다. 주석 스스로 "legacy — removed at M3"라고 적는다 — 제거가 끝나지 않은 것이다.
타입이 `any`인 전역 필드는 **아직 없는** 호출부가 아무 값이나 넣게 허용한다. 처방: 삭제. 타입만 바뀐다.

## LD03-3 🟡 `Session.accessToken` 확장 — 아무도 채우지 않고 읽지 않으며, 채우면 위험하다

26-30행이 `Session`에 `accessToken?: string`을 더한다. `auth.ts`에는 `jwt` 콜백이 없어 OAuth 토큰을 토큰·세션에 옮기는 코드가 없고,
`session.accessToken`을 읽는 곳도 0건이다(`accessToken` 등장은 모두 Gmail 발송용 관리자 토큰 — `mail/client.ts:54`, `services/mail-admin.ts:667` — 세션과 무관하다).

죽은 선언이면서 **잘못된 방향을 가리킨다.** 세션은 루트 레이아웃을 통해 모든 로그인 페이지의 HTML에 직렬화된다(`+layout.server.ts:19`).
선언된 필드를 "채우는" 변경은 Google 액세스 토큰을 브라우저로 보낸다. 처방: 확장 블록 삭제. 타입만 바뀐다.

## 확인했고 지적하지 않은 것

- **`member?: MemberContext | null`의 세 상태**(10-11행) — "undefined = 미해석, null = 비회원"은 정확한 구분이다. api 존에서는 늘 첫 상태라는 사실이 타입에 없다는 `XC-6`은 `requireCapabilityAction`의 지연 해석으로 닫혔다(`UP-1` ✅)
- **`App.Error.error?: ApiErrorCode`**(18-22행) — `handleError`가 채우고, 가드의 `guardRefusal` 본문(`{message}`)은 채우지 않는다. 그 거절은 api 존에 가지 않으므로 선택 필드가 맞다. 채워지는 **값**이 틀린 문제는 `LD01-2`
- **`import()` 타입 표현식**(11·13·21행) — 전역 선언 파일에서 최상위 `import`를 늘리지 않으려는 관용구다
- **`export {}`**(32행) — 파일을 모듈로 만들어 `declare global`/`declare module` 확장이 작동하게 한다. 필요하다
  > **검증 정정**: "필요하다"는 틀렸다. 4행의 최상위 `import type`이 이미 이 파일을 모듈로 만든다 — `export {}`는 Kit 기본 템플릿(import 없음)에서 남은 중복이다. 해가 없어 지적으로 올리지는 않는다. 같은 이유로 위 항목의 "최상위 `import`를 늘리지 않으려는 관용구"도 이 파일에서는 근거가 약하다(이미 하나 있다) — 문체 선택일 뿐이다

## 검증 (2026-09-28)

- LD03-1 — 확인 (`tsc --skipLibCheck false`를 다시 돌려 `app.d.ts`의 세 오류를 재현. 라이브러리 쪽에도 짝 오류가 뜬다 — `@auth/sveltekit/dist/types.d.ts(10,13)` TS2300, `(30,13)` TS2687 **과 TS2717**("`session` must be of type `Session | null`"). 즉 `session` 충돌은 선택성뿐 아니라 **타입**(`undefined` 포함 여부)도 어긋난다. 전체 31건 중 나머지 25건은 `@auth/core`·`pglite` 선언 파일 자체의 오류로 이 파일과 무관하다)
- LD03-2 — 확인 (`src/lib/server/`에 `admin*` 없음, `userApplication` 사용 0건)
- LD03-3 — 확인 (`accessToken` 등장은 전부 Gmail 관리자 토큰 — `mail/client.ts`·`mail/dispatch.ts`·`services/mail-admin.ts`)
- 누락 점검: 32행 전체와 `@auth/sveltekit`의 `App` 확장을 대조했다. `Locals.member?`의 선택+`null` 세 상태, `App.Error` 형태 확인. `export {}` 근거 서술을 위에서 정정. 추가할 결함 없음
