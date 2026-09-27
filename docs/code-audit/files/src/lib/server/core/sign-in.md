# `src/lib/server/core/sign-in.ts` (23줄)

**접두사 `LA07-`** · 로그인 허용 판정(AUTH-01) — 이메일 접미사·`email_verified`·Workspace `hd` 세 조건.

## LA07-1 🟡 `"invalid-domain"`이 도메인이 아닌 실패까지 덮고, 세 갈래 판정이 화면에서는 한 갈래다

22행은 세 조건 중 **어느 것이 실패해도** `"invalid-domain"`을 돌려준다. 그래서
`a@snu.ac.kr` + `email_verified: false`, `a@snu.ac.kr` + `hd` 없음·불일치, 프로필 없음(`sign-in.test.ts:21-39`)이
모두 "도메인이 틀렸다"로 분류된다. 이름이 사유를 거짓으로 말한다.

그리고 세 값의 구분은 소비처에서 사라진다. `auth.ts:19-20`은 `"deny"`를 `false`(Auth.js → `?error=AccessDenied`),
`"invalid-domain"`을 `?error=InvalidDomain`으로 보내지만 `login/+page.server.ts:6-11`은 두 코드에 **같은 문장**
"서울대학교(@snu.ac.kr) Google 계정으로만 로그인할 수 있습니다."를 준다. 결과적으로 `@snu.ac.kr` 계정으로
로그인했지만 Workspace 발급이 아니거나 미인증인 사용자는 "@snu.ac.kr 계정을 쓰라"는, 이미 한 일을 하라는 안내를 받는다.

처방은 둘 중 하나다 — (a) 판정을 `"allow" | "deny"`로 줄여 불필요한 갈래를 없앤다(**구조만**), 또는
(b) 사유별 값(`"not-snu" | "unverified" | "not-workspace"`)으로 나누고 로그인 화면이 다른 문구를 준다(**동작 변경**).
지금 형태는 둘 사이에 있어 어느 쪽 정보도 주지 않는다.

## 확인했고 지적하지 않은 것

- **세 조건을 모두 요구한다** (17-22행) — 접미사만으로는 증명이 아니라는 주석(4-6행)과 코드·테스트가 일치한다.
  보안 판정으로서 정확하다
- **`email_verified === true` 엄격 비교** (18행) — OIDC ID 토큰의 불리언 필드다. 문자열 `"true"`를 받아주지 않는 것은
  fail-closed다
- **대소문자 무시** (17·21행) — `sign-in.test.ts:41-45`가 핀으로 고정한다
- **`ALLOWED_DOMAIN` 상수** (8행) — 이름 붙은 한 곳이다. `login/+page.server.ts:8,10`의 안내 문구에 같은 도메인이
  리터럴로 있지만 사용자 문구라 파라미터로 보지 않는다

## 검증 (2026-09-28)

- LA07-1 — 확인 (22행은 세 조건 중 어느 실패든 `"invalid-domain"`을 돌려준다. `auth.ts:19-20`이 두 값을 서로 다른 경로로 보내지만 `login/+page.server.ts:6-11`은 두 코드에 같은 문장을 쓴다)
- 누락 점검: `signInVerdict`의 유일한 호출부 `auth.ts:18`과 로그인 화면의 오류 표를 대조했다. 새 지적은 없다.
