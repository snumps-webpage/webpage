# 우선 처리 목록

> **성격**: 한시적 작업 문서. [README](./README.md) 참조.
> 근거는 [REGISTER.md](./REGISTER.md)와 `files/` 아래 파일별 문서에 있다 — 여기서는
> **무엇을 어떤 순서로, 왜 그 순서로** 하는지만 적는다.
>
> 기준일: 2026-09-10. 브랜치 `chore/code-audit-v2`.

## 지금 상태

|           |                                                                                            |
| --------- | ------------------------------------------------------------------------------------------ |
| 감사 진행 | 위험 선행 11개 완료 (지적 66건). 계층 감사(A-a~A-d, 98파일) 미착수                         |
| 처리 완료 | 🔴 6건 중 6건 (5건 수정, ZR-7은 C-17 결정으로 해소)                                        |
| 검증 상태 | `vitest` 270 passed · `svelte-check` 0 errors · `vite build` 통과 · **`eslint` 14 errors** |
| 미결 결정 | C-12 ~ C-15                                                                                |

---

## P0 — CI가 빨간불이다

**이것을 먼저 하지 않으면 이후 모든 작업의 신호가 죽는다.**
`.github/workflows/ci.yml`의 Lint 단계가 `eslint .`이고, `main`에서 exit 1이다(`XC-1`).
PR마다 빨간불이면 그 빨간불이 새 결함을 뜻하는지 아무도 구별하지 못한다.

### P0-1 `no-irregular-whitespace` 8건 ✅ 처리됨

| 파일                                     | 위치       |
| ---------------------------------------- | ---------- |
| `src/lib/server/core/strings.ts`         | 8:26, 8:29 |
| `scripts/ops/ops-clean-applications.mjs` | 5:35, 5:38 |
| `scripts/ops/ops-strip-probe-check.mjs`  | 6:22, 6:25 |
| `scripts/ops/ops-verify-clean-names.mjs` | 6:22, 6:25 |

전부 **비가시 문자 제거 로직 안의 의도된 리터럴**이다 — U+200B 류를 문자 클래스에 직접 적는다.
코드가 틀린 게 아니라 규칙이 이 파일에 맞지 않는다.
✅ **처리 (2026-09-10)**: 네 파일의 문자 클래스를 `[\u00AD\u200B-\u200D\uFEFF\u2060]`로 교체.
라인 단위 `eslint-disable`은 쓰지 않았다 — 다음에 진짜 오염이 들어와도 못 잡는다.

**등가성을 먼저 증명했다.** `stripInvisibles`에는 테스트가 없었는데 가입 신청·임원 등록·회원 수정이
전부 이걸 거친다(비가시 문자 오염은 `7517e76`·`93d594c`의 실사고였다). 그래서
`core/strings.test.ts`를 **변경 전에** 작성해 13건을 통과시키고, 교체 후 같은 13건이
그대로 통과하는 것을 확인했다. 제거 대상 6종·보존 대상 5종을 코드포인트로 명시한다.

`eslint` 14 → **6**.

### P0-2 나머지 6건 ✅ 처리됨 — CI 초록

| 파일                                                  | 규칙                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `src/routes/(admin)/admin/executives/+page.svelte:15` | `svelte/prefer-writable-derived`                        |
| `src/routes/(admin)/admin/executives/+page.svelte:48` | `svelte/prefer-svelte-reactivity` (`Map` → `SvelteMap`) |
| `src/routes/(admin)/admin/executives/+page.svelte:89` | `svelte/no-useless-mustaches`                           |
| `src/lib/components/public/PublicIndexList.svelte:44` | `svelte/require-each-key`                               |
| `src/lib/server/data/storage-memory.ts:118`           | 미사용 `_max`                                           |
| `scripts/migration/20-export-tables.ts:59`            | `TABLE_NAMES`가 타입으로만 쓰임                         |

**여섯이 성격이 제각각이었고, 셋은 코드가 옳았다.**

| #   | 지점                  | 성격                   | 처리                                                                                                                                                                                                     |
| --- | --------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | `executives:15`       | 진짜 개선              | `$state`+`$effect` → 쓰기 가능한 `$derived`. 첫 렌더에 빈 칸을 보였다가 덮던 것도 사라진다                                                                                                               |
| ②   | `executives:89`       | 진짜 개선              | 속성을 표현식으로 → `{'{'}` 이스케이프 곡예 제거                                                                                                                                                         |
| ③   | `storage-memory:118`  | **설정 문제**          | 코드가 이미 `_` 관례를 따랐다. `eslint.config.js`에 `no-unused-vars` 옵션이 **하나도 없었다** → `argsIgnorePattern: "^_"` 추가                                                                           |
| ④   | `PublicIndexList:44`  | **규칙 부적합**        | 값 키는 실데이터의 빈/중복 문자열에서 `each_key_duplicate`로 클라이언트를 죽인다(이유가 이미 주석에 있었다). 재정렬 없는 파생 목록이라 **인덱스 키**가 비키와 의미가 같고 규칙도 만족 — disable보다 낫다 |
| ⑤   | `executives:48`       | **오탐**               | `Map`이 `$derived.by` 안에서 만들어져 반환되고 이후 변형되지 않는다. `SvelteMap`은 이득 없이 프록시 비용만 → 이유와 함께 disable                                                                         |
| ⑥   | `20-export-tables:59` | 판단 → **런타임 강제** | 아래                                                                                                                                                                                                     |

#### ⑥ — 제거 대신 실제 일을 시켰다

`Record<(typeof TABLE_NAMES)[number], any[]>`가 리터럴 누락을 잡아준다고 기대할 수 있지만,
**`scripts/`는 타입체크 프로그램에 없고**(include는 `src/`·`test/`·`tests/`뿐) 실행은 `tsx`가
**타입을 검사 없이 벗긴다.** 즉 그 보장은 어떤 도구도 검증하지 않는 장식이었다.

이 파일의 원칙은 "매칭 실패 항목은 전부 리포트 후 **중단**(조용한 드롭 금지)"인데,
**테이블 자체가 누락되는 경로만 조용했다** — `Object.entries(tables)`로 돌면 9개만 쓰고 끝난다.

그래서 목록을 런타임에서 강제한다: 커버리지 양방향 검사 + 쓰기 루프를 `TABLE_NAMES`에서 순회.
`errors` 게이트가 **업로드 전에** `process.exit(1)`을 하므로 DB를 건드리기 전에 멈춘다.

가드는 `name in tables`가 아니라 `Array.isArray`로 본다 — 키가 `undefined`로 존재하면
누락 검사를 통과하고 쓰기에서 조용히 빠진다. 타입이 검사되지 않는 것이 전제이므로
런타임 검사도 타입을 믿으면 안 된다.

실증(가드 로직만 떼어 실행):

```
정상 10개    : errors [] · 파일 10
1개 누락     : errors ['테이블 누락: studies'] · 파일 9
undefined 키 : errors ['테이블 누락: studies'] · 파일 9
낯선 키 추가 : errors ['알 수 없는 테이블: ghost']
```

**결과: `eslint` 0. CI 네 검사 전부 통과** — Lint · Test · Typecheck · Build.
