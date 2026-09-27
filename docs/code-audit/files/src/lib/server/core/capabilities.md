# `src/lib/server/core/capabilities.ts` (53줄)

**접두사 `LA02-`** · S9 capability 모델 — `(registered, isAlumni)`에서 권한 집합을 파생하고 포함 여부를 검사한다.

## LA02-1 🟠 파생이 탈퇴 상태를 모른다 — 한쪽에서는 과다 부여, 다른 쪽에서는 본인 취소를 막는다

> **검증 정정**: 등급 🟠은 유지한다. 두 증상 모두 끝까지 따라가 확인했다.
>
> **과다 부여**: `resolve-member.ts:50-64`(탈퇴 여부를 보지 않고 registrations로 파생) → `hooks.server.ts:121-128`(api 존은
> 해석 없이 통과) → `auth-guards.ts:195-207`(`resolveMemberContext`로 지연 해석한 뒤 capability만 본다) →
> `presign/+server.ts:33-35` 통과. 확인 결과다. 같은 `PARTICIPATE`를 요구하는 루트 액션들(`(public)/+page.server.ts:468-580`)은
> 이 경로로 새지 않는다. `decide`가 메서드를 가리지 않고 탈퇴 회원을 루트에서 pending으로 보내기 때문이다(`zone.ts:108-111`).
> 따라서 과다 부여가 실제로 드러나는 곳은 api 존뿐이다.
>
> **과소 부여**: 증상이 적힌 것보다 넓다. "유예 기간(30일)이 학기 경계를 넘을 수 있는 한"은 조건을 너무 좁게 잡았다.
> 자동 익명화는 보류됐고 자기 취소에는 기한이 없다(`withdrawal.ts:9-10`. `flow_member_withdrawal`의 cancel도
> 기한을 검사하지 않는다, `atomic_flows.sql:1076-1087`). 그러니 취소하지 않은 **모든** 비동문 탈퇴 회원이
> 3/1·9/1 학기 경계를 넘는 순간 영구히 막힌다. 빠져나갈 길도 없다. 신청 존(`zone.ts:126-129`)과 루트(`zone.ts:110-111`)는 pending으로
> 되돌리고, 관리자는 탈퇴 회원의 상태를 바꿀 수 없다(`members-admin.ts:48` "lifecycle owns withdrawn").
> 관리자 쪽 lifecycle은 hold·release뿐이다(`atomic_flows.sql:1071`).
>
> **중복**: `guards/resolve-member.md`의 **LB05-1**과 같은 결함이다. 하나로 추적할 것.
> **처방 보정**: 핵심 호출부는 `resolve-member.ts:64`다(처방이 든 `hooks.server.ts:89-90`은 dev-preview 고정값이다).
> 테스트 픽스처 "7곳"은 `capabilitiesFor`를 부르는 테스트 **파일** 7개다.

`CapabilityInput`(27-31행)에 `status`가 없다. 13행 주석은 "withdrawn은 capability 이전 단계(가드)에서
차단된다"고 적지만, 그 전제는 **회원 존에서만** 참이다. 탈퇴 신청(`flow_request_withdrawal`,
`atomic_flows.sql:1044-1051`)은 `members.status`만 바꾸고 이번 학기 `registrations` 행은 그대로 두므로,
`resolve-member.ts:51-64`는 유예 중인 회원에게도 등록 여부대로 capability를 계산한다.

**과다 부여 (api 존).** `zone.ts:103-105`는 api 존을 무조건 통과시키고, `auth-guards.ts:195-208`
`requireCapabilityAction`은 capability만 본다. 이번 학기 등록 후 탈퇴를 신청한 회원은
`presign/+server.ts:32-35`에서 `PARTICIPATE`를 통과해 `seminar-poster` 업로드 URL을 받는다.
회원 존이었다면 `zone.ts:150-155`가 `/withdraw/pending`으로 보냈을 요청이다.

**과소 부여 (회원 존).** 반대로 `/withdraw/pending`의 POST는 `MANAGE_SELF`를 요구한다
(`zone.ts:75`, 집행 `hooks.server.ts:160-167`). 비동문 준회원이 8월에 탈퇴를 신청하면
9월 1일 `currentTerm()`이 바뀌는 순간 `registered=false`·`isAlumni=false` → 45행 `[]`가 되고,
유예 페이지는 열리지만(`zone.ts:156`) **자기 탈퇴 취소**(`withdraw/pending/+page.server.ts:17-19`)가
403 "이번 학기 등록 회원만 할 수 있는 작업입니다"로 막힌다. 유예 기간(`WITHDRAWAL_GRACE_MS` 30일)이
학기 경계를 넘을 수 있는 한 이 경로는 열려 있다.

두 증상의 원인은 하나다 — 권한 파생의 입력에 권한을 바꾸는 사실(탈퇴)이 빠져 있다.
`zone.test.ts:291`은 유예 페이지 **열람**만 확인하고 POST capability는 확인하지 않는다.

처방: `CapabilityInput`에 `status`를 넣고 `withdrawn → [MANAGE_SELF]`를 첫 규칙으로 둔다.
**동작 변경**이다(의도된 교정). `hooks.server.ts:89-90`·테스트 픽스처 7곳의 호출부 시그니처가 바뀐다.

## LA02-2 🟡 머리 주석이 코드·ARCHITECTURE와 다르다

- 11행 "미등록 + 동문 → 회원 존 열람만" — 코드(43행)와 `ARCHITECTURE.md:62`는 열람 **+ 본인 관리**
  (`MANAGE_SELF`)다. 42행 인라인 주석은 맞게 적었다. 한 파일 안에서 두 주석이 서로 다르다
- 6-7행 "가드·서비스 호출부는 requireCapability만 쓴다" — 실제로는 `hasCapability`를 직접 부르는
  곳(`zone.ts:160`, `(public)/+page.server.ts:363`)과 api용 `requireCapabilityAction`이 있고,
  `hooks.server.ts:162`는 `member.capabilities.includes(...)`로 이 모듈을 아예 거치지 않는다

권한 규칙은 이 주석을 보고 판단하게 되는 곳이다. **문서만 고친다.**

## 확인했고 지적하지 않은 것

- **`hasCapability(undefined, …)`가 `false`** (52행) — 세션 없음·미해석을 거부로 처리한다. fail-closed가 맞다
- **capability 값이 문자열 리터럴 3개** — 원자 단위 추가라는 목표(5-7행)에 비해 과하지 않다.
  `MEMBER_POST_CAPABILITY`(`zone.ts:63-76`)가 라우트별 요구를 한 표에 모은다
  — **정리 정정**: 초판은 "`zone.test`가 강제한다"고 적었지만 거짓이다. 표에 없는 라우트는 열린 채로 통과한다
  (`guards/zone.md` LB06-1)
- **관리자 여부가 capability가 아니다** — `isAdmin`은 D4에 따라 회원 레코드 필드로 별도 판정한다.
  모델을 둘로 나눈 것은 결정 사항(`ARCHITECTURE.md:65`)이다
- **부트스트랩 관리자에게 `capabilities: []`** (`resolve-member.ts:40`) — 등록 전이라는 주석(28-30행)과 일치한다

## 검증 (2026-09-28)

- LA02-1 — 정정 (🟠 유지. 과다 부여는 api 존에서만 드러남을 확인. 과소 부여의 조건을 "유예가 학기 경계를 넘을 때"에서 "취소하지 않은 비동문 탈퇴 회원 전원, 학기 경계 이후 영구·탈출 경로 없음"으로 넓힘. LB05-1과 중복)
- LA02-2 — 확인 (11행 대 43행, 6-7행 대 실제 호출부 `zone.ts:160`·`(public)/+page.server.ts:363`·`hooks.server.ts:162`. `ARCHITECTURE.md:62`는 HEAD 기준)
- 누락 점검: `capabilitiesFor`·`hasCapability`·`requireCapability(Action)`의 테스트 밖 호출부 13곳을 grep하고, 탈퇴 회원이 각 존의 GET·POST에서 어떻게 판정되는지 `decide`와 `hooks.server.ts:157-169`로 대조했다. 새 지적은 없다.
