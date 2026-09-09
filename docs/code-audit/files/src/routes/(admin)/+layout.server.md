# `src/routes/(admin)/+layout.server.ts` (10줄)

**접두사 `ZA-`** · 관리자 존 셸.

## ZA-3 🟠 이 파일은 루트 레이아웃과 중복이고, 소비자가 없으며, 유일한 효과가 오답이다

`src/routes/+layout.server.ts:12-24`가 이미 `session`·`isAdmin`·`isMember`·`memberStatus`를
`locals.member`에서 **올바르게** 파생해 반환한다.

`(admin)` 그룹 어디도 이 레이아웃의 출력을 읽지 않는다:

| 확인                                                                | 결과                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `(admin)/+layout.svelte`                                            | **없음** (그룹에 `+layout.server.ts`·`+layout.ts`·`admin/`뿐) |
| `(admin)` 하위의 `await parent()` · `data.session` · `data.isAdmin` | **0건** (grep)                                                |
| `isMember`의 소비자                                                 | `(applicant)/wait/+page.server.ts:7` **하나뿐** — 다른 존이다 |

즉 관측 가능한 효과는 둘뿐이다 — **루트의 올바른 `isMember`를 틀린 값으로 덮는 것**(ZA-1),
그리고 세션 해석 왕복을 한 번 더 하는 것(ZA-4).

**ZA-1의 처방이 "`locals.member`를 쓰라"에서 "파일을 지우라"로 바뀐다.**

## ZA-1 🟠 `isAdmin: true`는 리터럴이고, `isMember: true`는 **지금 거짓이다**

```ts
7     isMember: true,
8     isAdmin: true,
```

`isAdmin`을 리터럴로 두는 것은 네 레이아웃 중 이 파일뿐이다:

| 파일                                                                 | isAdmin                           |
| -------------------------------------------------------------------- | --------------------------------- |
| `(member)/+layout.server.ts:25` · `(applicant)/+layout.server.ts:13` | `locals.member?.isAdmin ?? false` |
| `+layout.server.ts:16` (루트)                                        | `member?.isAdmin === true`        |
| **여기 8행**                                                         | `true`                            |

> **초판 정정**: "네 존 레이아웃 중 이 파일만 다르다"는 `isMember`에 대해서는 **거짓**이다 —
> `(member)/+layout.server.ts:24`도 `isMember: true` 리터럴이다(ZM-3).

더 중요한 것: **`isMember: true`는 가정이 아니라 현재 거짓이다.**

- `services/withdrawal.ts:42-58`이 `status`를 `"withdrawn"`으로 바꾸면서 **`isAdmin`은 지우지 않는다**
- `zone.ts:150-153`은 `isAdmin`만 보고 `status`를 보지 않는다 → **탈퇴한 관리자가 관리자 존에 들어온다**
- 루트는 `isMember: !!member && member.status !== "withdrawn"` = **false**(`+layout.server.ts:17`)
- 이 파일이 그것을 `true`로 덮는다

초판은 "가드 조건이 완화되는 날"을 걱정했다. **완화는 필요 없다.**

## ZA-4 🟡 같은 요청에서 세션을 세 번 해석한다

6행의 `event.locals.auth()`는 이 요청의 **세 번째** 호출이다 —
`hooks.server.ts:93`, `+layout.server.ts:15`(루트), 그리고 여기.

`@auth/sveltekit`의 `auth()`는 메모이즈되지 않는다. 호출마다 `Request`를 새로 만들고
JWT 디코드·세션 콜백을 다시 돌리며 **반환 쿠키를 매번 `event.cookies.set`으로 쓴다.**
루트는 `member ? … : null`로 최소한 조건을 건다. 여기는 무조건이다.

## ZA-2 🟡 → ZA-1에 흡수

프리렌더 의존은 실재하나(`hooks.server.ts:76`), 독립 지적으로 세우기 어렵다:

- `prerender = false`(`(admin)/+layout.ts:2`)는 방어적 중복이다 — SvelteKit 기본값이 이미 no-prerender고, `(admin)`의 조상 중 `prerender = true`는 없다
- 이 파일만의 문제가 아니다 — `(member)`도 같은 형태다
- 의존은 **설정 지점에 기록돼 있다** — `(admin)/+layout.ts:1` "세션 의존 존 — 프리렌더 금지"

ZA-3을 실행하면(파일 삭제) 함께 사라진다.

## 확인했고 지적하지 않은 것

- 관리자 존을 404로 감추는 설계(`zone.ts:151` "Existence is concealed") — 리다이렉트보다 낫다

## 이 파일 밖으로 넘기는 것

**`zone.ts`가 관리자 존에서만 `status`를 보지 않는다** — `(member)`(`zone.ts:135-141`)와
`(applicant)`(`:116-118`)는 탈퇴 회원을 `/withdraw/pending`으로 보낸다. `(admin)`(`:150-153`)만 안 본다.
ZA-1이 지금 거짓인 이유가 이것이다. → `guards/zone.ts` 리뷰(A-b)에서 볼 것.
