# `src/routes/(applicant)/+layout.server.ts` (16줄)

**접두사 `ZP-`** · 신청자 존 셸. `/signup`·`/wait`에 세션과 신청 상태를 공급.

## ZP-4 🟠 재가입 신청자가 자기 대기 페이지에 들어갈 수 없다

`isMember`의 정의가 이 파일에서 느슨한 결과가 실제 사용자 흐름을 막는다.

```ts
12  isMember: !!event.locals.member,
```

`locals.member`는 **미등록 회원**(재가입 대상)에게도 값이 있다.
그리고 가드는 그런 사용자를 **일부러 신청자 존에 들여보낸다**:

```
zone.ts:119-121  // S9: 미등록 회원(동문 포함)은 재가입 신청을 위해 들어와야 한다
```

그가 신청을 제출하면 `signup/+page.svelte:39,47`이 `/wait`으로 보낸다. 거기서:

```ts
wait/+page.server.ts:10   if (isMember && !isAdmin) throw redirect(302, "/");
```

`isMember`는 **true**(회원 행이 존재하므로), `isAdmin`은 false → **`/`로 튕긴다.**
**자기 대기 중인 신청서를 영영 볼 수 없다.**

반대 방향도 막힌다 — 미등록 비동문은 `capabilitiesFor`가 빈 배열을 주므로
(`core/capabilities.ts:41`) `zone.ts:145`가 그를 회원 존에서 **`/wait`으로** 보낸다.
가드가 의도한 목적지가 그 사용자에게만 닫혀 있다.

`wait:10-11`의 `!isAdmin` 예외 둘은 부트스트랩 관리자(`registered:false`, `isAdmin:true`)가
튕기지 않게 하려고 붙은 것이다 — **의미론을 고치지 않고 우회한 흔적이다.**

## ZP-3 🟠 `isMember`가 여섯 곳에서 생산되고 한 곳에서만 소비된다

> **초판 정정**: 🟡 → 🟠. 초판은 "존마다 의미가 다르다"는 명명 문제로 다뤘다. ZP-4가 그 대가다.

| 생산자                                                          | 값                                          |
| --------------------------------------------------------------- | ------------------------------------------- |
| `+layout.server.ts:17` (루트)                                   | `!!member && member.status !== "withdrawn"` |
| **여기 12행**                                                   | `!!event.locals.member`                     |
| `(member)/+layout.server.ts:24` · `(admin)/+layout.server.ts:7` | `true`                                      |
| `(public)/+page.server.ts:153` · `:319`                         | `true` (dev preview) · `!!member`           |

소비자는 `wait/+page.server.ts:10` 하나. `.svelte` 파일 중 이 필드를 읽는 것은 없다.

**같은 페이지의 데이터 체인 안에서 두 정의가 충돌한다.** SvelteKit은 자식 레이아웃 데이터로
부모를 덮으므로, 루트의 탈퇴 인지 값이 이 파일의 값에 조용히 덮인다.
`application: null`(루트 20행)도 같은 방식으로 덮인다.

## ZP-1 🟡 같은 요청에서 신청 테이블을 두 번(`/signup`에서는 세 번) 읽는다

`hooks.server.ts:108`이 이미 `hasApplication(email)`을 부른다.
신청자 존은 `needsMemberResolution`이 true이므로(`zone.ts:78-82`) 공개 fast path를 타지 않는다.
그리고 9행이 `getApplicationForEmail(email)`로 또 읽는다.
`/signup`에서는 `signup/+page.server.ts:36`이 세 번째다(`/signup/edit`은 `:15`).

**물리적 읽기는 한 번이다** — 둘 다 `getTable("applications")` → `withCache` 경유이고,
훅의 읽기가 로컬 맵을 15초 채운다(`cache.ts:46-53`). 밀리초 뒤의 호출은 메모리 히트다.
그래서 🟠가 아니라 🟡다.

**초판의 처방은 작동하지 않는다** — 가드는 `boolean`을 갖고 있고 레이아웃은 레코드가 필요하다.
합치려면 가드가 레코드를 가져와야 한다.

**진짜 문제는 비용이 아니라 두 함수의 계약이 다르다는 것이다:**

|        | `hasApplication` (`resolve-member.ts:64-74`) | `getApplicationForEmail` (`membership.ts:20-23`) |
| ------ | -------------------------------------------- | ------------------------------------------------ |
| 실패   | **삼킴** → `false`                           | **던짐**                                         |
| 정규화 | `a.email.toLowerCase()` (trim 없음)          | `norm(a.email)` = trim + lowercase               |

**같은 테이블, 두 매칭 규칙, 두 오류 규약.** 데이터 계층 장애 시 가드는 조용히
"신청 없음"으로 판정하고 레이아웃은 500을 낸다.

## ZP-2 🟡 레이아웃 계층에 오류 처리 규약이 없다

| 파일                                       | 읽기                     | 실패 시                |
| ------------------------------------------ | ------------------------ | ---------------------- |
| `+layout.server.ts:23` (루트)              | `getPublicExecutives()`  | `.catch(() => null)`   |
| **여기 9행**                               | `getApplicationForEmail` | **try 없음** — 500     |
| `(member)/+layout.server.ts:12-19`         | `getTable("events")`     | `catch {}` — 완전 침묵 |
| `(public)/archive/+layout.server.ts:51-61` | `getTable` ×7            | **try 없음** — 500     |

> **초판 정정**: "네 존 레이아웃, 두 규약"이 아니다. **다섯 레이아웃, 세 규약**이다 —
> 루트를 빠뜨렸고, `(public)`에는 존 레이아웃이 없다(archive는 공개 존 안의 중첩 레이아웃이다).

> **초판 인용 오류**: "`zone.ts:121`이 그 값으로 리다이렉트 방향을 정한다"는 **거짓**이다.
> `:121`은 `registered`를 본다. **신청자 분기(`zone.ts:113-123`)는 `hasApplication`을 아예 안 쓴다.**
> 소비자는 `:107`(공개 루트)·`:133`·`:145`(회원 존)다.
> 이 파일의 값에 해당하는 올바른 인용은 `wait/+page.server.ts:11`이고,
> 거기서 삼킨 실패는 대기 중인 신청자를 `/signup`으로 보내 재제출 시 `CONFLICT`를 맞게 한다
> (`membership.ts:45-47`).

가장 날카로운 사례는 **같은 요청, 같은 테이블**이다 — ZP-1의 표 참조.

## ZP-5 🟡 세션과 email을 `locals` 대신 새로 구한다

7-8행이 `event.locals.auth()`를 다시 부르고 거기서 `email`을 파생한다.
훅이 이미 세션을 해석해 그 결과로 `locals.member`를 만들었다(`hooks.server.ts:93-97`).
**레이아웃의 신청 조회와 가드의 판정이 각각 독립적으로 얻은 입력에서 계산된다.**
`(member):23`·`(admin):6`도 같다 → `ZA-4`.

## 확인했고 지적하지 않은 것

- `applicationView()`를 거쳐 내려보낸다(14행) — **다만 초판이 "레코드를 통째로 넘기지 않는다"고
  적은 것은 과했다.** `views.ts:41-53`은 `phone`·`studentId`·`background`를 포함한다.
  본인 데이터라 유출은 아니나, `/signup`은 이 값을 쓰지 않고 자기 `pending` 플래그를 따로 읽는다
  (`signup/+page.server.ts:36`) — 존 전 페이지에 실어 보낼 이유가 없다
