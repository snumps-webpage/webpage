# `src/lib/server/guards/zone.ts` (175줄)

**접두사 `LB06-`** · 라우트 그룹 = 접근 존. 순수 판정 `decide(routeId, ctx)`, 존 분류 `zoneOf`, 회원 존 POST의 capability 표 `MEMBER_POST_CAPABILITY`, `MemberContext` 타입.

## LB06-1 🟠 쓰기 게이트는 미등록 라우트에 열려 있고, "zone.test가 강제"는 사실이 아니다

58-62행: "새 회원 존 라우트가 생기면 여기 한 줄이 늘어난다 **(zone.test가 강제)**."
`zone.test.ts:298-313`은 표의 **세 항목**을 확인할 뿐, `(member)` 라우트가 전부 표에 있는지는 보지 않는다.
경로 탐색(`zone.test.ts:24-38`)은 `REGISTERED`(존 분류)만 강제한다.

그리고 누락의 기본값이 **통과**다:

```ts
// zone.ts:79-81
return MEMBER_POST_CAPABILITY[routeId] ?? null;
// hooks.server.ts:161-162
const needed = memberPostCapability(routeId);
if (needed && !member.capabilities.includes(needed)) { … 403 }
```

새 `(member)` 라우트에 액션을 달고 표에 한 줄을 잊으면, `VIEW_MEMBER_ZONE`만 가진 **미등록 동문이 그 액션을 실행한다.**
회원 존 액션들은 서비스 앞에서 capability를 다시 보지 않으므로(`requireCapability` 호출부는 `(public)/+page.server.ts` 하나) 이 표가 유일한 방어선이다.
같은 파일의 존 분류는 반대로 설계됐다 — 존 밖 라우트는 `misconfigured`로 **닫힌다**(99-101행). 한 파일에 두 가지 실패 방향이 있다.

원인은 구조에도 있다. 1-5행이 "Pure decision logic — tests exercise it directly"라고 하지만 **POST 판정은 `decide` 밖**(`hooks.server.ts:160-168`)에 있다.
`GuardContext`에 요청 메서드가 없으므로 `zone.test.ts`의 행렬은 쓰기 경로를 표현할 수 없다.
훅은 또 `hasCapability`(`core/capabilities.ts:48`) 대신 `includes`를 직접 쓴다.

처방: ① 테스트가 `+page.server.ts`에 `actions`를 가진 모든 `(member)` 라우트의 표 등록을 강제(구조) ② 미등록이면 `PARTICIPATE`를 요구하는 닫힌 기본값(동작 변경) ③ `GuardContext`에 `method`를 넣어 POST 판정을 `decide`로 옮긴다(구조).
현재 12개 `(member)` 라우트는 모두 등록돼 있다 — 지금 열린 구멍은 없다. 그것은 우선순위이지 결함의 유무가 아니다.

## LB06-2 🟡 "신청했으면 `/wait`, 아니면 `/signup`"이 세 번 적혀 있다

118행, 147행, 164행 — `ctx.hasApplication ? "/wait" : "/signup"`. 가입 흐름의 목적지 규칙 하나가 세 분기에 복사돼 있다.
예컨대 반려된 신청자를 별도 페이지로 보내게 되면 세 곳을 함께 고쳐야 한다. `signupFlowTarget(ctx)` 하나로. 구조 변경.

## LB06-3 🟡 로그인 리디렉션이 존마다 다르고, 조립 규칙이 두 파일에 있다

> **검증 정정**: 등급 유지, 예시를 바로잡는다. "공유받은 `/signup` 링크 → 로그인 후 `/`로 떨어진다"는 끝까지 따라가면 대부분 `/signup`에 도착한다 —
> 로그인 페이지의 기본 대상 `/`(`safeInternalRedirect(null)`)에서 루트 분기(115-119행)가 세션 있는 비회원을 다시 `/signup`(신청이 있으면 `/wait`)으로 보낸다.
> 목적지가 실제로 사라지는 경우는 둘이다: ① `/signup/edit` 링크 — 루트는 `/wait`으로 보낸다 ② **회원 행은 있지만 미등록인 재가입 대상** —
> `ctx.member`가 있으므로 루트는 리디렉션하지 않고 대시보드에 둔다. S9 재가입 흐름의 주 사용자가 바로 ②다.
> 복제(두 존 + `ensureSession`의 조립 규칙 셋)와 `(applicant)`만 돌아올 경로가 없다는 불일치는 그대로다.

- `(applicant)` 125행: `"/login"` — 돌아올 경로가 **없다**
- `(member)` 139-142행: `` `/login?redirect=${encodeURIComponent(ctx.pathname)}` ``
- `auth-guards.ts:58-60`(`ensureSession`): 같은 문자열을 따로 조립한다

비로그인 사용자가 공유받은 `/signup` 링크를 열면 로그인 후 `/`로 떨어진다(로그인 페이지의 기본 대상). `/signup`만 예외일 이유가 코드에 없다.
`loginRedirect(pathname)` 하나를 두고 두 존과 `ensureSession`이 쓴다. `(applicant)`의 대상이 바뀌는 동작 변경.

## LB06-4 🟡 탈퇴 회원 예외가 경로 접두사를 세그먼트 경계 없이 비교한다

152행 `!routeId.startsWith(\`/(member)${WITHDRAW_PENDING}\`)`—`/(member)/withdraw/pending-archive` 같은 형제 라우트도 예외에 들어간다.
의도는 "pending 페이지(와 그 하위)"이고, 세그먼트 경계를 지키는 비교가 레포에 이미 있다(`route-policy.ts:12-14` `matchesPathRoot`— 그 파일은 LB07-1대로 죽어 있지만).
정확 일치 또는`routeId === X || routeId.startsWith(X + "/")`. 동작 변경(가상의 형제 라우트에 대해서만).

## LB06-5 🟠 쓰기 게이트가 `POST`에만 걸린다 — 등록된 라우트도 다른 쓰기 메서드로는 열려 있다 (검증 추가)

`hooks.server.ts:160` `if (event.request.method === "POST" && zone === "(member)" && member)`. 표(63-76행)는 라우트 id만 키로 하고
게이트는 메서드 하나만 본다. 폼 액션은 POST뿐이라 지금의 12개 `+page.server.ts`에는 맞지만, `(member)` 존에 `+server.ts`가 생겨
`PUT`·`PATCH`·`DELETE` 핸들러를 가지면 그 요청은 **표에 등록돼 있어도** capability 검사를 거치지 않는다. `decide`가 보는 것은 열람 capability(`VIEW_MEMBER_ZONE`)뿐이므로
미등록 동문이 통과한다 — 결과는 LB06-1과 같다.

LB06-1과는 다른 구멍이다: LB06-1은 "표에 없는 라우트", 이것은 "표에 있는 라우트의 POST 아닌 쓰기". LB06-1의 처방 ②(닫힌 기본값)만으로는 닫히지 않고,
처방 ③(`GuardContext`에 `method`를 넣어 `decide`로 옮김)에서 판정을 "안전 메서드(`GET`·`HEAD`·`OPTIONS`)가 아니면 쓰기"로 둘 때 함께 닫힌다.
지금 `(member)` 존에 `+server.ts`는 0개다 — 도달성은 우선순위이지 결함의 유무가 아니다(LB06-1과 같은 판정).

## 확인했고 지적하지 않은 것

- **존 밖 라우트 = `misconfigured`**(99-101행) — 닫힌 실패다. `hooks.server.ts:180-184`가 500으로 렌더하고 라우트 id는 로그로만 보낸다(W-35)
- **`(admin)`이 `isAdmin`만 본다**(170-173행) — C-18 결정("관리자 권한은 회원 상태에 구속되지 않는다", `SCOPE.md:644`). 탈퇴를 **신청 중인** 관리자에 관한 C-23은 열린 결정이라 여기서 판정하지 않는다
- **루트 `/(public)`이 미등록 회원을 대시보드에 들인다**(107-122행) — `(member)` 존은 같은 사람을 `/signup`으로 보내지만, 루트 로드가 미등록을 명시적으로 다룬다(`(public)/+page.server.ts:104,363` — `PARTICIPATE` 없으면 참여 UI를 끄고 액션은 403). 의도된 하이브리드다
- **`(applicant)`가 미등록 회원을 들인다**(130-133행) — S9 재가입 경로. 그 뒤 `/wait`에서 튕기는 것은 `ZP-4`/`W-16`(열림)이고 이 파일의 결함이 아니다
- **`MemberContext.status` 유니온이 `schemas/member.ts:4`의 `MemberStatus`와 따로 적혀 있다**(26행) — 스키마에 값이 늘면 `resolve-member.ts:59`의 대입이 컴파일 오류가 되므로 조용한 드리프트는 불가능하다
- **`GuardContext.member`의 `undefined` 상태**(38-39행) — `decide`는 훅이 해석을 마친 뒤에만 불리므로 실제로 받지 않는다. 받더라도 모든 분기가 `?.`로 닫힌 쪽으로 떨어진다
- **`import`가 export 뒤에 있다**(16-20행) — 호이스팅되므로 동작과 무관한 배치 문제다. lint가 잡지 않는다

## 검증 (2026-09-28)

- LB06-1 — 확인. `zone.test.ts:298-313`은 표의 두 항목과 존 밖 `null` 하나를 볼 뿐이고(문서의 "세 항목"은 이 셋을 센 것), `REGISTERED`의 경로 탐색(24-38행)은 존 분류만 강제한다. 기본값 `?? null` → 훅 `if (needed && …)`가 통과시킨다. 현재 `actions`를 가진 `(member)` 라우트 12개는 전부 표에 있다. **교차 문서 불일치**: 배치 밖 `core/capabilities.md`의 "확인했고 지적하지 않은 것"이 "`MEMBER_POST_CAPABILITY`를 … `zone.test`가 강제한다"고 적어 이 지적이 반박한 주석을 그대로 승인한다 — 그 문서의 해당 줄은 이 지적에 맞춰 고쳐져야 한다
- LB06-2 — 확인
- LB06-3 — 정정 (등급 유지. `/signup` 예시 → 실제로 목적지를 잃는 두 경우)
- LB06-4 — 확인
- LB06-5 — 추가 🟠 (메서드가 `POST`일 때만 쓰기 게이트가 돈다)
- 누락 점검: 175줄을 문서 없이 다시 읽고 `decide`의 다섯 분기를 `hooks.server.ts:101-186`의 호출 맥락과 대조했다(`GuardContext.member`가 `undefined`로 오지 않는 것, 탈퇴 회원 허용이 capability 검사 앞인 것). 추가 1건
