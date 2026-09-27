# `src/auth.ts` (35줄)

**접두사 `LD02-`** · Auth.js(SvelteKitAuth) 설정 — Google 프로바이더, 로그인 허용 판정 콜백(`signInVerdict` 위임), 세션 콜백, 로그인·오류 페이지 경로.

## LD02-1 🟡 세션 콜백이 아무도 읽지 않는 값을, 주석과 다른 성질로 싣는다

23-29행은 `session.user.id = token.sub`를 넣고 주석은 "the unique Auth.js user ID … for easier lookups"라고 한다. 둘 다 성립하지 않는다.

- **읽는 곳이 없다.** `src`에서 `user.id`/`user?.id`를 읽는 코드는 0건이다(이 26행이 유일한 등장). 회원 매칭은 이메일로 한다(`resolve-member.ts:23-26`)
- **조회 키가 될 수 없다.** 어댑터가 없으므로 Auth.js는 로그인할 때마다 `id: crypto.randomUUID()`를 새로 만든다(`@auth/core/lib/actions/callback/oauth/callback.js:218-225` — 주석이 "intentionally not set based on the profile id"). `token.sub`는 그 값이다(`callback/index.js:76`). 같은 사람이 다시 로그인하면 바뀐다 — "unique"하지만 안정적이지 않다
- **그래도 브라우저로 간다.** 이 세션은 루트 레이아웃이 `session`으로 반환하고(`+layout.server.ts:19`) SvelteKit이 로그인 사용자의 모든 SSR HTML에 직렬화한다

처방: 콜백을 지운다(구조 — 페이지 데이터에서 의미 없는 필드 하나가 빠진다).

## LD02-2 🟡 환경 변수 계약이 두 파일에 흩어져 있고, 13행은 라이브러리 기능 하나를 끄기만 한다

- 9-10행 `env.GOOGLE_CLIENT_ID!`·`env.GOOGLE_CLIENT_SECRET!` — `!`는 검사 없는 단언이다. 없으면 로그인은 Google 쪽 `invalid_client`로 실패하고 기동 시 아무 신호가 없다(`@auth/core/lib/utils/env.js:47-56`가 `AUTH_GOOGLE_ID`로 채우려 하지만 이 저장소는 그 이름을 쓰지 않는다 — `docs/SETUP.md:40-41`)
- 필수 셋 중 `AUTH_SECRET` **하나만**, 그것도 **다른 파일**에서 검사한다(`hooks.server.ts:27-29`, `LD01-10`). 이 모듈의 설정 계약을 이 모듈이 모른다
- 13행 `secret: env.AUTH_SECRET` — Auth.js는 `secret`이 비어 있을 때 스스로 `AUTH_SECRET`과 순환용 `AUTH_SECRET_1..3`을 읽는다(`env.js:28-37`, `if (!config.secret?.length)`). 이 줄은 값이 있을 때 그 기본 동작을 **건너뛰게 만들 뿐**이라 키 순환 지원이 꺼진다. 값이 없을 때는 기본 동작과 같다. 즉 이 줄이 하는 일은 기능 하나를 끄는 것뿐이다

처방: 이 파일에서 세 변수를 한 번에 검사(없으면 기동 로그 또는 실패 — 어느 쪽이든 셋이 같게), 13행 삭제. 키 순환이 살아나는 동작 변경, 나머지는 구조.

## LD02-3 🟡 로그인 오류 코드와 로그인 경로가 이름 없이 흩어져 있다

20행 `` `/login?error=InvalidDomain` `` — 코드 `InvalidDomain`은 `login/+page.server.ts:6-11`의 표 키와 **문자열로만** 연결된다.
로그인 경로 `"/login"`은 이 파일에만 세 번(20·32·33행), 가드에 두 번(`zone.ts:125,141`) 있다.
판정 값을 늘리면(`LA07-1`의 처방 (b) — 사유별 값) 이 파일의 매핑과 로그인 페이지의 표를 함께 고쳐야 하고, 오타는 조용히 기본 문구로 떨어진다(`login/+page.server.ts:23-24`).
세 갈래 판정이 화면에서 한 문구로 합쳐지는 문제 자체는 `LA07-1`이 다룬다. 여기서 보는 것은 **그 매핑이 이 파일에 있고 계약이 이름을 갖지 않는다**는 점이다.
처방: 판정 → 오류 코드 → 문구를 한 모듈(예: `core/sign-in.ts`)이 소유하고 이 파일과 로그인 페이지가 import. 구조 변경.

## LD02-4 🟡 export한 서버측 `signIn`·`signOut`을 아무도 쓰지 않는다

6행은 `handle, signIn, signOut`을 구조분해해 export한다. `handle`만 `hooks.server.ts:10`이 쓴다.
로그인·로그아웃을 부르는 다섯 곳(`login/+page.svelte:2`, `+layout.svelte:8`, `wait/+page.svelte:2`, `withdraw/pending/+page.svelte:3`,
`GuestLanding.svelte:2`)은 모두 `@auth/sveltekit/client`의 **같은 이름**을 쓴다. 이름이 같은 두 API 중 하나가 죽어 있어, 자동 import가 서버 쪽을 고르면
클라이언트 번들에서 `$env/dynamic/private` 경계 오류로 드러난다. 처방: `export const { handle } = …`. 구조 변경.

## 확인했고 지적하지 않은 것

- **`trustHost: true`**(14행) — 필요하다. `@auth/sveltekit/dist/env.js:5`가 코어 기본값보다 **먼저** `trustHost ??= dev`를 넣으므로 운영에서는 `false`가 되고, 코어의 `VERCEL` 자동 감지(`@auth/core/lib/utils/env.js:40-44`, `??`)는 실행되지 않는다. 이 줄이 없으면 운영 로그인이 `UntrustedHost`로 막힌다
- **`signIn` 콜백이 순수 함수에 위임**(16-22행) — 판정은 `signInVerdict`(테스트 있음)가, 이 파일은 Auth.js 반환값 매핑만 한다. `"invalid-domain"`의 명명 문제는 `LA07-1`
- **`pages.signIn`·`pages.error`가 둘 다 `/login`**(31-34행) — 오류 페이지를 따로 두지 않고 로그인 화면이 `?error=`를 해석한다(`login/+page.server.ts:5`). 의도된 단일 진입점
- **JWT 세션(어댑터 없음)** — 회원 식별은 매 요청 이메일로 다시 한다(`resolve-member.ts`). 세션에 회원 상태를 굽지 않으므로 상태 변경이 즉시 반영된다. 설계와 맞다
- **Google 프로바이더에 `hd` 인가 파라미터가 없다** — 계정 선택 화면을 좁히는 UX 힌트일 뿐이고, 권한 판정은 서버가 ID 토큰의 `hd`로 한다(`sign-in.ts:19-21`). 없어도 판정은 닫혀 있다

## 검증 (2026-09-28)

- LD02-1 — 확인 (`user.id` 읽기 0건 재확인, `oauth/callback.js:218-225`의 `randomUUID`·`callback/index.js:76`의 `sub` 대조)
- LD02-2 — 확인 (`env.js:28-37`의 `!config.secret?.length` 분기로 순환 키가 꺼지는 것, `env.js:47-56`의 `AUTH_GOOGLE_ID` 보충 대조. 둘째 항목은 `LD01-10`과 같은 사실이며 LD01-10이 훅 쪽 절반만 맡는다고 스스로 한정하므로 이중 계상은 아니다)
- LD02-3 — 확인
- LD02-4 — 확인 (서버측 `signIn`·`signOut` import 0건, 다섯 곳 모두 `@auth/sveltekit/client`)
- 누락 점검: 35행을 문서 없이 다시 읽었다 — 모듈 로드 시점의 `$env/dynamic/private` 읽기(Kit이 훅 모듈 import 전에 env를 채우므로 문제없음), `@auth/sveltekit`이 `skipCSRFCheck`를 강제하는 것(`dist/env.js`, Kit의 origin 검사가 대신함), `pages.error` → `/login` 대체 문구 경로. 추가할 결함 없음
