# `src/lib/server/dev-preview.ts` (64줄)

**접두사 `LB04-`** · 개발 서버 전용 역할 미리보기 — `?dev_preview=member|admin|off`와 쿠키로 역할을 정하고, 가짜 Auth.js 세션을 만든다.

## LB04-1 🟡 가짜 인물 하나가 두 파일에 반씩 정의되고, 두 반쪽이 서로 다른 사람이다

같은 미리보기 사용자의 신원이 이 파일과 `hooks.server.ts`에 갈라져 있다.

|               | 세션 (`dev-preview.ts:43-64`)                    | 회원 컨텍스트 (`hooks.server.ts:82-91`) |
| ------------- | ------------------------------------------------ | --------------------------------------- |
| id            | `"dev-admin"` / `"dev-member"` (47·52행)         | `memberId: "dev-preview"` (역할 무관)   |
| 이름          | `"Dev Admin / 운영진 / 수리과학부"` 등 (48·53행) | `"Dev Preview"`                         |
| privateInfoId | —                                                | `"dev-preview"`                         |

- 관리자 미리보기와 회원 미리보기가 **같은 `memberId`** 를 쓴다. 미리보기에서 쓰기 액션을 하면(대부분의 액션은 미리보기 단락이 없다 — 단락은 `(public)/+page.server.ts:569`의 프로필 저장 등 일부) 두 역할의 기록이 한 id에 섞인다
- 화면 상단(세션 이름)과 본문(`locals.member.name`)이 다른 이름을 보인다
- 5-6행이 export하는 `DEV_PREVIEW_MEMBER_EMAIL`·`DEV_PREVIEW_ADMIN_EMAIL`, 4행의 `DEV_PREVIEW_COOKIE`는 **이 파일 밖에서 아무도 import하지 않는다.** 다른 반쪽(hooks)은 이 상수들을 모른다

미리보기 인물을 바꾸려면 두 파일을 같이 고쳐야 하고, 지금 이미 맞지 않는다.
처방: `buildDevPreviewMember(role)`을 이 파일에 두고 hooks는 부르기만 한다. 역할별 `memberId`를 쓰면 동작 변경(개발 전용).

## LB04-2 🟡 부수효과가 있는 판정 함수가 요청당 세 번 불린다

> **검증 정정**: 등급·처방 유지, 한 문장 철회. "`?dev_preview=member`가 붙은 요청은 `Set-Cookie`를 두 번 만든다"는 틀렸다.
> Kit의 `cookies.set`은 `new_cookies` 맵에 `(domain, path, name)` 키로 넣는다(`@sveltejs/kit/src/runtime/server/cookie.js:253-255`) —
> 같은 요청에서 같은 쿠키를 두 번 설정하면 뒤의 것이 앞의 것을 **덮어쓰고** 응답에는 한 줄만 나간다.
> 남는 결함은 문서의 나머지 그대로다 — 판정의 소유자가 셋이고, 부수효과(쿠키 쓰기·지우기)가 이름상 순수한 해석기 안에 있다.

`resolveDevPreviewRole`은 이름은 해석기지만 쿠키를 **쓰고 지운다**(23·28-33행). 호출부:

- `hooks.server.ts:77` — 역할을 정하고 `locals`를 바꾼다
- `(public)/+page.server.ts:245` (로드), `:568` (액션) — **같은 요청에서 다시** 판정한다

hooks가 정한 역할을 `locals`에 남기지 않으므로 페이지가 URL과 쿠키를 다시 읽는다. `?dev_preview=member`가 붙은 요청은 `Set-Cookie`를 두 번 만든다.
두 판정이 어긋날 수는 없지만(같은 입력), 판정의 소유자가 셋이다. 호출부의 `dev && devPreviewRole`(`+page.server.ts:255,569`)의 `dev`도 이 함수의 18행과 중복이다.
처방: hooks가 `locals.devPreviewRole`을 기록하고 페이지는 그것을 읽는다. 구조 변경.

## LB04-3 🟡 8시간이 두 단위로 두 번 적혀 있다

32행 `maxAge: 60 * 60 * 8`(초)과 62행 `1000 * 60 * 60 * 8`(밀리초). 같은 의도("미리보기 세션 수명")인데 이름이 없고 단위가 달라
한쪽만 바꾸면 쿠키와 세션 만료가 어긋난다. 상수 하나로. 구조 변경.

## LB04-4 🟡 `httpOnly: false`가 필요 없다

30행. 이 쿠키를 읽는 클라이언트 코드가 없다(`grep -rn "snumps_dev_preview\|dev_preview" src` — 이 파일 밖 0건).
읽을 이유가 없는 쿠키를 스크립트에 노출하는 것은 논리적으로 불필요하다. 개발 전용이라 위험은 작다. `true`로(동작 변경, 개발 전용).

## 확인했고 지적하지 않은 것

- **운영 차단**(18행 `if (!dev) return null`) — `$app/environment`의 `dev`는 빌드 시점 상수라 운영 번들에서 이 함수는 항상 `null`이다. 쿼리·쿠키를 위조해도 열리지 않는다. 호출부 셋이 모두 이 함수를 거치므로 우회 경로가 없다
- **`off`가 쿠키를 지우고 `null`**(22-25행) — 역할 해제가 명시적이다
- **`isRole` 타입 가드**(10-12행) — 쿠키 값 위조(`?dev_preview=superadmin`)는 `null`로 떨어진다
- **세션의 `image: null`**(60행) — `AuthenticatedSession.image?: string`(`auth-guards.ts:13`)과 다르지만 `locals.auth`의 타입은 Auth.js `Session`(`image?: string | null`)이므로 맞다
- **미리보기 이메일이 `@snu.ac.kr`**(5-6행) — 실존 도메인이지만 18행 때문에 개발 서버 밖에서는 만들어지지 않는다

## 검증 (2026-09-28)

- LB04-1 — 확인 (세 상수의 외부 import 0, hooks의 `memberId: "dev-preview"`가 역할 무관)
- LB04-2 — 정정 (등급 유지. "`Set-Cookie`를 두 번 만든다"는 틀렸다 — 위 블록)
- LB04-3 — 확인
- LB04-4 — 확인
- 누락 점검: 파일을 다시 읽고 `dev` 차단(18행)이 호출부 셋 모두의 앞에 있는지, `off` 처리와 쿠키 위조 경로를 확인했다. 추가 없음
