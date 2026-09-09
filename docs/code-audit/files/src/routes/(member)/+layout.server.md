# `src/routes/(member)/+layout.server.ts` (28줄)

**접두사 `ZM-`** · 회원 존 셸.

## ZM-5 🔴 `isPresenter`를 계산하는 블록 전체가 죽어 있고, 주석은 거짓이다

```ts
9   // PRES-03: the manage link renders for presenters only (cached table read).
10  let isPresenter = false;
...
26    isPresenter,
```

**`isPresenter`를 읽는 코드가 없다.** `grep -rn "isPresenter" src/`는 이 파일의 4줄만 잡는다.

관리 링크가 실제로 보는 것은 다른 필드다:

```
+layout.svelte:110 (데스크톱) · :157 (모바일)   {#if page.data.hasPresenterEvents}
+layout.server.ts:19 (루트)                     hasPresenterEvents: false,     ← 하드코딩
+layout.server.ts:10 (루트)                     TODO(integration): hasPresenterEvents — wire to
                                                the events service (PRES-03)
```

따라서 **관리 링크는 아무에게도 렌더되지 않는다.** `/events/manage`는 URL 직접 입력으로만 도달하고,
그 페이지의 주석도 그것을 안다(`(member)/events/manage/+page.server.ts:10-12`
"the nav link hides it, nothing more").

9행 주석이 서술하는 인과 — "이 값이 링크 렌더를 정한다" — 는 사실이 아니다.
**이 파일에서 가장 먼저 봤어야 할 것이고, ZM-1·ZM-2는 소비자 없는 값의 부작용을 논한 것이다.**

**처방**: 블록을 지우거나, 루트의 `hasPresenterEvents`로 이름을 맞춰 TODO를 닫는다.
**역인덱스를 만드는 것이 아니다.**

## ZM-1 🟡 회원 페이지 로드마다 events 배열 전체를 훑는다

> **초판 정정**: 🟠 → 🟡. 관찰은 맞으나 이를 🟠로 올린 근거 셋이 전부 틀렸다.

사실 부분: 13-16행이 `Array.some()`으로 전체 `events`를 훑어 불리언 하나를 만든다.

**틀린 근거 1 — cacheShield 문단은 혼동이다.** 9행 주석의 "cached table read"는
데이터 계층 캐시(`getTable` → `withCache("table_events", 300_000)`, `tables.ts:125-129`)를 가리킨다.
`cacheShield`(`hooks.server.ts:33-39`)는 **응답 헤더만 만진다** — `getTable`이 메모리를 맞는지
Redis를 맞는지에 아무 영향이 없다. 게다가 초판이 "없어서 비용이 든다"고 지목한 그 메커니즘
(개인화된 회원 페이지의 CDN 캐싱)은 실드의 주석이 실사고로 기록한 교차 유출 그 자체다
(`hooks.server.ts:23-32`). **없는 것이 옳은 것을 비용 가중 요인으로 든 셈이다.**

**틀린 근거 2 — 인과가 거꾸로다.** "캐시가 비거나 만료된 순간마다 전체 스캔"이 아니다.
`.some()`은 캐시 상태와 무관하게 **매 로드마다** 돈다. 캐시는 store 읽기 발생 여부만 정한다.

**틀린 근거 3 — 처방이 성립하지 않는다.** `data/views.ts`에는 인덱스가 없다 —
순수 row→DTO 매퍼 넷뿐이다(`:15,29,41,55`). 실제 선례인 `getDirectoryIndex`(`directory.ts:31-40`)는
호출마다 `getTable`에서 재구축되고 저장되지 않는다. 그대로 흉내내면 O(n) 읽기 위에 O(n) Map 빌드가
얹힌다. "한 번 만들면 끝난다"가 아니다 — **별도 캐시 키로 유지해야** 성립한다.

남는 사실: 인프로세스 배열 스캔이 매 요청 돈다. 동아리 규모에서 마이크로초급이다. 🟡.
그리고 ZM-5가 맞다면 이 스캔은 애초에 필요 없다.

**추가 정밀화**: "모든 페이지 로드에서 일어난다"도 부정확하다. 이 로드는 `event.locals`만 읽고
`url`/`params` 의존을 등록하지 않으므로 존 내부 클라이언트 내비게이션에서는 재실행되지 않는다.
SSR 진입과 `invalidateAll`에서만 돈다. **그 이면이 더 나은 지적이다** — 발표자로 지정되어도
클라이언트 세션 내내 값이 갱신되지 않는다.

## ZM-2 🟠 빈 catch가 데이터 계층의 의도적 시끄러움을 취소한다

```ts
17  } catch {
18    isPresenter = false;
19  }
```

읽기 실패와 "발표자 아님"이 구별되지 않고 로그도 없다.

초판보다 강하게 말할 수 있다: 이 catch는 `tables.ts:43-50`의 **의도적** throw까지 삼킨다.
그 자리 주석이 "A silent fallback here would corrupt data on the next write — fail loudly"라고 적는다.
`AppError("VALIDATION_FAILED")`·`WRITE_CONFLICT`도 `getTable`을 통해 올라온다.
**손상되거나 미이주된 `events` 봉투가 "이 회원은 발표를 하지 않는다"로 렌더된다** —
데이터 계층이 일부러 크게 낸 소리를 한 프레임 위에서 껐다.

## ZM-3 🟠 `isMember: true`가 가드가 보장하지 않는 것을 주장한다

> **초판 정정**: 🟡 → 🟠. 스타일 중복이 아니라 형제 계산과의 실제 불일치다.

24행은 리터럴, 25행은 `locals.member?.isAdmin ?? false` — 같은 반환 객체 안에서 규약이 갈린다.

더 중요한 것: 루트가 `isMember: !!member && member.status !== "withdrawn"`을 계산하고
(`+layout.server.ts:17`), `zone.ts:135-140`은 **탈퇴 회원을 `/(member)/withdraw/pending`에 일부러 들여보낸다.**
그 회원에게 `page.data.isMember`는 루트에서 `false`, 이 자식 레이아웃이 덮어 `true`가 된다.

**가드는 24행이 주장하는 것을 보장하지 않는다.**
(네비가 `memberStatus`로 분기하므로 지금 화면이 틀리지는 않는다 —
README 기준상 그것은 감면 근거가 아니다.)

## ZM-6 🟠 발표자 판정식이 서비스에서 복사돼 왔다

15행의 `isSeminarType(e.type) && e.presenterIds.includes(memberId)`는
`services/events.ts:198`의 `getManagedSeminars` 안과 **글자 그대로 같다.**

초판의 "확인했고 지적하지 않은 것"이 타입 판정을 서비스에 위임한 점을 칭찬했는데,
**그 판정을 감싼 술어 자체가 같은 서비스에서 복사됐다**는 것을 놓쳤다.
레이아웃이 `services/events`에 묻지 않고 `data/tables`를 직접 읽는 것도 같은 문제다.
"발표한다"의 정의를 바꾸려면(외부 발표자, 두 번째 세미나 타입) 두 곳을 고쳐야 하고,
`services/events.ts:148`이 이미 두 번째 경우를 예고한다.

## ZM-7 🟡 상태 필터가 없어 발표자 자격이 만료되지 않는다

14-16행은 상태와 무관하게 매칭한다. `effectiveStatus`가 존재하고(`services/events.ts:26-29`)
`getManagedSeminars`는 그것을 적용한다(`:208`). 여기는 안 한다.
**한 번 발표한 사람은 취소·만료된 이벤트까지 포함해 영원히 발표자다.**

## ZM-4 🟡 `memberId` 없음이 조용히 통과한다

7·11행. 가드가 이미 회원을 보장하므로(`zone.ts:127-147`, 이 파일 5행 주석도 그렇게 적는다)
`memberId` 부재는 **계약 위반**이지 정상 분기가 아니다.
현재 구조는 위반을 `isPresenter = false`로 흡수한다.
다만 이 검사는 15행 클로저를 위한 TypeScript 내로잉도 겸한다 — 그래서 무해해 보인다.
정직한 형태는 던지거나 assert하면서 내로잉을 유지하는 것이다.

## ZM-8 🟡 세션 재해석

23행. 루트가 이미 `session`을 반환한다(`+layout.server.ts:15`). `ZA-4`·`ZP-5` 참조.
