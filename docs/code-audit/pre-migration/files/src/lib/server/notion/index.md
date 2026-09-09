# `src/lib/server/notion/index.ts`

7줄 · `export *` 7개 · 이름 51개 공개 (중복 0)
검토 2026-08-24 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판(119줄)은 7줄 파일에 17배 분량을 썼고, **IX-3은 정반대였으며**,
> IX-1의 "전수 확인, 0건"은 **14개 중 7개만 검색하고 한 주장**이었다.
> 그리고 이 파일의 3행이 빌드를 깨뜨린다는 사실을 적지 않았다. §개정 이력 참조.

---

## IX-4 🔴 이 파일의 3행이 빌드를 깨뜨린다

```
index.ts:3  export * from "./members"
  → members.ts:8  import { MemberSchema, PrivateInfoSchema } from "./schema"
    → schema.ts:1  import { z } from "zod"      ← 미설치
```

```
$ vite build
[vite]: Rollup failed to resolve import "zod" from ".../notion/schema.ts"
✗ Build failed
```

**그리고 `svelte-check`의 40개 오류가 전부 이 하나의 연쇄다.** 내용을 실제로 읽어보니:

```
 9  Property 'memberId' does not exist on type '{}'
 6  Property 'privateInfoId' does not exist on type '{}'
 5  Property 'name' ...          4  Property 'email' ...
 4  'p' is of type 'unknown'     2  Property 'department' ...
 ... (+ 근원 2건: Cannot find module 'zod')
```

`z.infer<typeof MemberSchema>`가 zod를 못 찾아 **`{}`로 붕괴**하고,
그 타입이 이 배럴을 통해 소비자 파일들로 퍼진 것이다.

> 🔴 **감사 열 번째 리뷰까지 "40 errors = 기준선"이라고만 적고 내용을 안 읽었다.**
> 40개는 서로 다른 기존 결함이 아니라 **의존성 하나가 빠진 결과**다.
> `pnpm add zod` 하나로 대부분이 사라질 가능성이 높다.
> 상세: [`CROSS-CUTTING.md`](../../../../CROSS-CUTTING.md) X-1.

---

## IX-5 🟠 이 파일을 직접 import 하는 곳은 한 곳뿐이다

```
$ grep -rn 'notion/index' src/
src/lib/server/notion.ts:4:export * from "./notion/index";
```

`notion.ts`(4줄)와 `notion/index.ts`가 **둘 다 존재**하므로,
`$lib/server/notion` · `./notion` · `../notion` 세 형태가 **전부 파일 쪽(`notion.ts`)으로 해석된다** —
Node/TS가 파일을 디렉터리보다 우선한다.

즉 **배럴이 배럴을 감싸고 있고, 소비자는 아무도 이 파일을 직접 보지 않는다.**

`notion.ts`를 지우면 `$lib/server/notion`이 `notion/index.ts`로 해석되어
**호출부 변경 0으로 한 겹이 사라진다.** (A-11에서 다룬다)

> 초판은 IX-1·비지적 절에서 `$lib/server/notion`을 **이 파일인 것처럼** 썼다. 아니다.

---

## IX-1 🟠 프리미티브 14개를 도메인과 함께 공개한다

`client.ts` 12개 + `utils.ts` 2개가 그대로 나간다:
`notionQuery` · `notionQueryFirst` · `queryDatabase` · `notionCreate` · `notionUpdate` ·
`notionArchive` · `notionRetrieve` · `notionRetrieveDatabase` · `getHeaders` ·
`validateNotionConfig` · `NotionProperty` · `DatabasePropertySchema` ·
`getPropertyValue` · `validateNotionResponse`

> 🔴 **초판 정정.** 초판은 *"현재 라우트는 프리미티브를 쓰지 않는다 — 전수 확인, 0건.
> 계층은 지켜지고 있다"*고 썼다. **거짓이다.** 14개 중 **7개만 검색해 놓고 "전수"라고 적었다.**
> 나머지로 재검색한 결과:
>
> ```
> admin/events/new/+page.server.ts:7   type DatabasePropertySchema,
> admin/events/new/+page.server.ts:25  schema["활동 종류"] as DatabasePropertySchema
> ```
>
> **이미 새고 있다.** 계층은 지켜지고 있지 않다.

`client.md` C-7에서 확인한 대로 `getHeaders`·`validateNotionConfig`·`queryDatabase`·
`NotionProperty`는 파일 밖에서 아무도 안 쓴다. 그런데 배럴이 앱 전역에 공개한다.

**제안**: 명시적 재수출로 도메인 표면만 내보낸다. `client`·`utils`는 모듈 내부용으로 남긴다.
`DatabasePropertySchema`는 실제 사용처가 있으므로 **타입만 별도 경로로 노출**하거나
`getDatabaseSchema`의 반환 타입으로 흡수한다.

---

## IX-2 🟠 `schema.ts`만 배럴에 없다

8개 모듈 중 `schema.ts`만 빠져 있고, 그래서 `MemberRepository.ts:2`가
**배럴을 건너뛰고 내부 파일을 직접 가리킨다**(`import type { Member } from "../notion/schema"`).

> **초판 정정**: 초판은 "빼둔 것이 우연히 옳았을 수 있다 —
> `types.ts`와의 이름 충돌이 전역으로 퍼질 테니"라고 추측했다. **근거 없다.**
> `types.ts`는 이 배럴에 포함돼 있지 않다. `export *`는 나열된 7개 모듈만 병합하므로
> `schema.ts`를 추가해도 **51개 이름 중 무엇과도 충돌하지 않는다.**
> (그리고 중복 이름은 4개다 — `types.ts`에 `Application`은 없다.)
>
> 게다가 배럴은 **이미 `schema.ts`에 전이적으로 의존한다**(IX-4의 경로).
> 빼는 것이 그래프를 줄이지도 않는다.

누락이 의도인지 실수인지 코드가 말하지 않는다. **추가하는 쪽이 단순하다.**

---

## IX-6 🟡 `export *`가 부수효과 그래프를 끌고 온다

7개 모듈 중 다섯이 `../cache`를 import 하고,
`cache.ts:16-22`가 **모듈 스코프에서 `new Redis(...)`를 실행**한다(핸들러 등록 포함).

Rollup이 이걸 보존해야 하므로 `getMemberByEmail` 하나만 import 해도
**7개 모듈 그래프 전체가 평가되고 `ioredis`가 콜드 스타트마다 로드된다.**
(`lazyConnect: true`라 TCP 연결은 안 하지만, 모듈 로드와 생성자 비용은 든다.)

---

## ~~IX-3~~ **철회** — 정반대였다

초판은 *"두 모듈이 같은 이름을 내보내면 배럴에서 **조용히 사라진다**. 에러가 아니다.
다음 충돌이 조용할 것"*이라고 썼다. **틀렸다.** 이 레포 툴체인으로 직접 실험했다:

```
$ tsc -p .   (moduleResolution: bundler)
src/barrel.ts(2,1): error TS2308: Module "./a" has already exported a member named 'dup'.
```

**TS2308이 배럴 자체에서, 소비자 없이 발생한다.** `pnpm run check`가 모든 미래 충돌을
무조건 잡는다. 소비자가 그 이름을 쓰면 빌드까지 깨진다.

"`export *` 순서가 모호성 해소에 영향을 준다"고 쓴 것도 거짓 메커니즘이다 —
순서는 우선권을 주지 않는다.

---

## 지적하지 않은 것

- **배럴이 존재하는 것 자체**: 표준 패턴이고 소비자 12곳이 하나로 import 한다. 유지가 맞다
  (초판은 8곳이라 썼다 — **12곳**이다)
- **클라이언트 번들 유출**: 없다. `.svelte`가 `$lib/server/*`를 import 하지 않고,
  SvelteKit이 구조적으로 금지한다. `client.ts` 재수출이 노출을 늘리지 않는다 — 확인함
- **순환 참조**: 없다. `notion/` 하위 어느 모듈도 `./index`나 `../notion`을 import 하지 않는다 — 확인함

---

## 우선순위

1. **IX-4** — `pnpm add zod`. 빌드가 살아나고 `svelte-check` 40개 대부분이 사라진다
2. **IX-5** — `notion.ts` 제거. 호출부 변경 0 (A-11)
3. **IX-1** — 명시적 재수출. `DatabasePropertySchema`가 이미 샜다
4. **IX-2 / IX-6** — 배럴 완성, 부수효과 검토

---

## 개정 이력

| 변경 | 내용 |
|---|---|
| **IX-4 신설 🔴** | 이 파일 3행이 빌드를 깨뜨린다. **`svelte-check` 40개가 전부 zod 하나의 연쇄**임을 확인 |
| **IX-5 신설 🟠** | `$lib/server/notion`은 **셰임**으로 해석된다. 이 파일의 직접 importer는 1곳 |
| **IX-1 all-clear 철회** | "전수 확인 0건"은 **14개 중 7개만 검색한 결과**. `DatabasePropertySchema`가 라우트에서 쓰인다 |
| **IX-3 철회** | 정반대. TS2308이 배럴에서 즉시 발생한다 — 툴체인으로 실험 확인 |
| IX-2 추측 삭제 | `types.ts`는 배럴에 없어 충돌하지 않는다. 중복 이름도 5개가 아니라 4개 |
| IX-6 신설 🟡 | `cache.ts`의 모듈 스코프 `new Redis(...)`가 그래프에 끌려온다 |
| 소비자 수 정정 | 8곳 → **12곳** |
| 분량 | 119줄 → 절반 이하. 초판은 7줄 파일에 17배를 썼다 |
