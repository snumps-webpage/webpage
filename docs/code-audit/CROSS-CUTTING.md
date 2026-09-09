# 교차 발견 — 파일 단위 리뷰로는 안 잡히는 것들

> **성격**: 한시적 작업 문서. [README](./README.md) 참조.
> 파일별 리뷰(`files/`)는 한 파일 안의 문제를 본다. 이 문서는 **여러 파일에 걸쳐 반복되거나,
> 어느 파일에도 속하지 않는** 발견을 모은다.
>
> **ID 접두사는 `XC-`다.** 이관 이전 감사의 `X-1`~`X-10`과 겹치지 않게 하기 위함이다.
> 옛 항목을 인용할 때는 반드시 `pre-migration/CROSS-CUTTING.md X-n`으로 적을 것.

기준: 이 브랜치 (`main` `76a5cda` + 죽은 코드 삭제 커밋).

---

## XC-0 ✅ 이전 감사의 `X-1`은 해소되었다

이전 감사 최대 지적은 **"`main`이 빌드되지 않는다"** — `zod`가 `package.json`에도
`node_modules`에도 없는데 `notion/schema.ts`가 값으로 import 했다.

이관이 이것을 해결했다:

```
package.json:51    "zod": "^3.24.0"        ← 정식 의존성으로 들어옴
svelte-check       910 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
vitest run         40 passed | 1 skipped (41 files) · 258 passed | 2 skipped
```

`svelte-check` 오류 40개(전부 `zod` 부재의 연쇄)도 **0이 되었다.**

> **X-1의 교훈은 유효하다** — "기준선은 개수가 아니라 목록이어야 한다."
> 그래서 아래 XC-1·XC-2의 수치는 전부 실제 출력을 읽고 적었다.

---

## XC-1 🔴 `main`이 자기 CI의 lint 단계를 통과하지 못한다

`.github/workflows/ci.yml`의 Lint 단계는 `./node_modules/.bin/eslint .`다.
`main`에서 그대로 실행하면:

```
✖ 14 problems (14 errors, 0 warnings)
exit code: 1
```

8개 파일에 걸쳐 있다:

| 파일                                               | 오류 | 규칙                                                                            |
| -------------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| `src/routes/(admin)/admin/executives/+page.svelte` | 3    | `prefer-writable-derived` · `prefer-svelte-reactivity` · `no-useless-mustaches` |
| `src/lib/server/core/strings.ts`                   | 2    | `no-irregular-whitespace`                                                       |
| `src/lib/components/public/PublicIndexList.svelte` | 1    | `require-each-key`                                                              |
| `src/lib/server/data/storage-memory.ts`            | 1    | `no-unused-vars` (`_max`)                                                       |
| `scripts/migration/20-export-tables.ts`            | 1    | `no-unused-vars` (`TABLE_NAMES`)                                                |
| `scripts/ops/ops-clean-applications.mjs`           | 2    | `no-irregular-whitespace`                                                       |
| `scripts/ops/ops-strip-probe-check.mjs`            | 2    | `no-irregular-whitespace`                                                       |
| `scripts/ops/ops-verify-clean-names.mjs`           | 2    | `no-irregular-whitespace`                                                       |

### `no-irregular-whitespace` 8건은 성격이 다르다

전부 **비가시 문자 제거 로직 안의 의도된 리터럴**이다 —
`strings.ts:8`과 ops 스크립트 3개가 U+200B 류를 직접 문자 클래스에 적는다.
코드가 틀린 게 아니라 **규칙이 이 파일에 맞지 않는다.**
`\u200B` 이스케이프로 바꾸거나 해당 라인만 예외 처리하는 것이 옳다.
나머지 6건은 실제 지적이다.

### 왜 교차 발견인가

한 파일의 결함이 아니라 **게이트가 통과하지 않는 상태로 유지되고 있다**는 사실이 결함이다.
`main`에 머지되는 모든 PR의 CI가 이 단계에서 빨간불이면, CI는 신호를 잃는다.

---

## XC-2 🟠 CI가 검사하지 않는 것이 검사하는 것보다 많다

`package.json`에는 검사 스크립트가 넷 있다. CI는 그중 하나 반을 돌린다.

| 스크립트 | 내용                              | CI에서 도는가                                    |
| -------- | --------------------------------- | ------------------------------------------------ |
| `test`   | `vitest run`                      | ✅                                               |
| `lint`   | `prettier --check … && eslint .`  | ⚠️ **eslint만.** prettier 부분은 호출되지 않는다 |
| `check`  | `svelte-kit sync && svelte-check` | ❌                                               |
| `build`  | `vite build`                      | ❌                                               |

빠진 것의 실제 크기:

```
prettier --check (추적 파일만):   131 files                 ← 지금 실패한다
svelte-check:                    0 errors                  ← 지금 통과한다
vite build:                      컴파일 통과. prerender는 SUPABASE_URL 필요
```

**`check`가 CI에 없는 것이 가장 위험하다.** 이전 감사의 `X-1`(빌드 불가)을 실제로
잡고 있었던 유일한 도구가 `svelte-check`였는데, 그때도 CI에 없었고 지금도 없다.
같은 종류의 결함이 다시 들어오면 또 아무도 모른다.

`prettier` 131개는 별개 판단이 필요하다 — 한 번 `--write`로 정리하고 CI에 넣을지,
아니면 `lint` 스크립트에서 prettier를 빼서 스크립트와 CI를 일치시킬지.
**지금은 스크립트와 CI가 서로 다른 것을 뜻한다는 점이 문제다.**

---

## XC-3 🟠 락파일이 둘인데 하나는 무시되고 하나는 커밋돼 있다

```
package-lock.json    4,459줄   ← 추적됨
pnpm-lock.yaml                 ← .gitignore:31 에 있다
```

프로젝트는 pnpm을 쓴다 — CI가 `pnpm/action-setup@v4` + `pnpm install`이고,
로컬 `prepare` 훅도 pnpm으로 돈다. 그런데:

- **재현 가능한 설치를 보장하는 락파일(`pnpm-lock.yaml`)은 커밋되지 않는다.**
  CI의 `pnpm install`은 매번 범위 내 최신을 끌어온다
- **아무도 쓰지 않는 락파일(`package-lock.json`)은 4,459줄로 커밋돼 있다.** 갱신도 되지 않는다

이전 감사에서 `C-4`(Docker)가 죽어 있던 원인 중 하나가 정확히
"`pnpm-lock.yaml`이 gitignore라 `--frozen-lockfile`이 실패한다"였다.
Docker는 지웠지만 **원인은 그대로 남아 있다.**

---

## XC-4 🟡 `sync-events` 스케줄러가 문서상 미완 상태로 하루 1회에 머물러 있다

이력:

| 커밋      | 변화                                                                                |
| --------- | ----------------------------------------------------------------------------------- |
| `9d73869` | GitHub Actions `cron-sync-events.yml`(매시) 추가, Vercel은 격일 → 하루 1회 백업으로 |
| `6ad9ece` | `cron-sync-events.yml` **삭제** (AWS 정리와 함께)                                   |
| 현재      | `vercel.json`의 `0 15 * * *` 하나뿐 = 하루 1회 00:00 KST                            |

**이것은 미문서화 회귀가 아니다.** `docs/OPERATOR-TODO.md`가 설명하고 있다 —
Vercel Hobby는 크론이 일 1회뿐이라 주 스케줄러를 cron-job.org로 옮기기로 했고,
잡 3개 등록은 **⬜ 미완**으로 추적 중이다(4절).

즉 결함이 아니라 **열린 채로 남은 운영 항목**이다. 감사가 새로 발견할 것은 없다.
다만 코드 감사가 `vercel.json`을 볼 때(A3) "하루 1회가 의도인가"로 잘못 지적하지 않도록
여기 적어 둔다. → `SCOPE.md` C-10.

---

## XC-5 🟡 `.claude/`가 gitignore에 없어 lint·format 도구가 중첩 워크트리를 훑었다 — 처리됨

`eslint.config.js`는 `includeIgnoreFile(.gitignore)`로 무시 목록을 가져온다.
`.claude/`는 `.gitignore`에 없고, 그 안에 git 워크트리가 하나 들어 있다
(`.claude/worktrees/feature-spec` — 레포 전체의 또 다른 사본).

결과:

```
eslint .                        3,104 problems   ← 대부분 중첩 사본
eslint . --ignore-pattern .claude/**   14 errors  ← 실제 코드베이스
```

**220배 부풀려진 숫자가 나온다.** CI는 `.claude/`가 없는 깨끗한 체크아웃이라 영향받지 않지만,
로컬에서 lint를 돌리는 사람은 매번 이 노이즈를 본다.
이전 감사의 `X-1`이 "기준선 40을 숫자로만 다뤄서" 생긴 사고였다는 점을 생각하면,
**기준선을 오염시키는 것 자체가 위험**이다.

`.gitignore`에 `.claude/`를 추가해 처리했다. 이후 `eslint .`는 14개만 낸다.

---

## XC-6 🔴 api 존은 주체를 해석하지 않는데, 엔드포인트가 `locals.member`를 읽는다

`guards/zone.ts:92-94`가 계약을 정한다 — "Endpoint-level auth (Bearer / ensureAdmin) lives in each handler."
그에 맞춰 `hooks.server.ts:86-91`이 api 존에서 **`locals.member`를 채우기 전에** 빠져나간다.

그런데 엔드포인트 하나가 그 필드를 읽는다:

```ts
api/uploads/presign/+server.ts:24    locals.member?.capabilities.includes(CAPABILITIES.PARTICIPATE)
```

**언제나 `undefined`다.** 결과는 `UP-1` — 회원의 세미나 포스터 업로드가 프로덕션에서 항상 403이고,
dev preview에서는 통과하므로 검증을 빠져나간다.

### 왜 파일 단위 지적이 아닌가

이것은 `presign` 한 곳의 실수가 아니라 **계층 계약이 타입으로 표현되지 않은 결과**다.

`app.d.ts:10-11`이 `member?: MemberContext | null`로 선언하고 주석이
"undefined = not resolved, null = not a member"라고 적는다. 세 상태를 구분하는 좋은 설계다.
그러나 **api 존에서는 언제나 첫 번째 상태**라는 사실이 타입에도, 이름에도 없다.
`?.`가 그 사실을 조용히 흡수한다.

`auth-guards.ts:20-26`의 `resolveAdminContext`는 이 문제를 **이미 알고 처리한다** —
`locals.member !== undefined ? locals.member : await resolveMember(...)`.
즉 지연 해석 패턴이 레포에 존재하는데, capability 검사에는 대응물이 없다.

### 처방

`requireCapabilityAction(locals, cap)` — `requireAdminAction`과 같은 자리에, 같은 지연 해석으로.
그러면 api 핸들러가 `locals.member`를 직접 읽을 이유가 사라진다.
(`UP-4`가 지적하듯 `hasCapability` 접근자를 우회하는 두 곳도 함께 닫힌다.)

---

## XC-7 🟠 엔드포인트 계층에 공통 래퍼가 없다 — 같은 코드가 세 번, 네 번씩

`src/routes/api/` 아래 7개 파일에서 세 종류의 복제가 동시에 일어난다.

| 복제                                          | 사본 수 | 위치                                                               |
| --------------------------------------------- | ------- | ------------------------------------------------------------------ |
| 크론 Bearer 인증 블록 (주석 포함 바이트 동일) | **3**   | `cron/sync-events:12-19` · `cron/maintenance:9-16` · `health:9-16` |
| 403 응답 본문 수기 작성                       | **4**   | 관리자 큐 3종 `:9` + `uploads/presign:26-27`                       |
| 관리자 큐 엔드포인트 골격                     | **3**   | `admin/{applications,seminar-requests,study-requests}`             |

`requireCronAuth` 같은 헬퍼는 레포에 없다. `OPERATOR-TODO.md` 4절이 이 관문을 쓰는
cron-job.org 잡 3개를 예고하므로 넷째 사본이 예정돼 있다.

### 403이 네 번 적힌 이유는 헬퍼 설계에 있다

`requireAdminAction`(`auth-guards.ts:65-74`)이 거부 시 `fail(403, ...)`을 반환한다.
`fail()`은 **폼 액션 전용**이라 엔드포인트가 쓸 수 없다 — 그래서 네 호출부 모두
`response`를 버리고 `json(...)`을 손으로 만든다. 이 필드를 실제로 쓰는 곳은 액션 래퍼(`:178`) 하나다.

**하나의 헬퍼가 호환되지 않는 두 반환 계약을 섬긴 결과가 네 곳의 중복이다.**

### 단, 관리자 큐 추출은 단순하지 않다 — `QD-4`가 반증이다

세 큐는 계약 수준에서 교환 가능하지 않다:

|                               | applications | seminar-requests | study-requests                                                      |
| ----------------------------- | ------------ | ---------------- | ------------------------------------------------------------------- |
| `directorySummaryIndex()`     | 없음         | 있음             | 있음 (그러나 **불필요** — 신설 테이블이라 legacy id가 없다, `QD-5`) |
| item 함수 인자                | 1            | 2                | 2                                                                   |
| item에 `status`·`canWithdraw` | 없음         | 없음             | **있음** (`admin-queue-views.ts:92-112`)                            |
| 정렬 / 필터                   | 정렬         | 필터             | 필터                                                                |

`adminQueueEndpoint({table, view, item, key, filter?})`는 이 넷 중 하나도 흡수하지 못한다.
**추출 전에 item 계약을 먼저 정리해야 한다.**

---

## XC-8 🔴 크론이 아무것도 못 해도 성공을 보고하고 dead-man's switch를 누른다

두 크론 엔드포인트가 같은 형태다:

```ts
cron/sync-events:22-25          cron/maintenance:19-22
  const results = await runCron();   const results = await runMaintenance();
  await pingHeartbeat();             await pingHeartbeat();
  return json({ success: true, ...results });
```

두 실행 함수 모두 **단계/스텝별로 try/catch 격리하고 실패를 플래그로 반환한다** —
던지지 않는다(`services/events.ts:369-380`, `services/maintenance.ts:183-212`).
`maintenance.ts:180-182`의 독스트링이 그 설계를 명시한다.

따라서 **두 라우트의 catch는 작업 실패에 대해 도달 불가**이고,
`pingHeartbeat()`는 무조건 실행되며, 응답은 언제나 `success: true` 200이다.
라우트는 `results`의 `*_failed` 키를 읽지 않는다.

```
{ success: true, keptAlive: false, cleanup_failed: 1, backup_failed: 1 }   HTTP 200
```

### 왜 🔴인가

`pingHeartbeat`의 독스트링(`maintenance.ts:157-161`)이 목적을 적는다 —
"catches every silence mode — scheduler death, deploy accidents, and **project pause** alike."

project pause를 막는 것이 `keepAliveSelect()`다. 그 함수는 캐시를 우회해 실제 Postgres를
건드리도록 일부러 `readVersion`을 쓴다(`maintenance.ts:26-36`).
**keep-alive가 매일 실패해도 Healthchecks는 계속 초록이다** —
탐지하려던 정확히 그 상태에서 경보가 울리지 않는다.

두 라우트의 "ping ONLY on success" 주석은 **코드가 지키지 않는 불변식을 서술한다.**
여기서 "success"는 "라우트가 죽지 않았다"는 뜻뿐이다.

### 커버리지

`services/maintenance.test.ts:107-127`은 월요일·일요일 정상 경로만 본다.
단계 실패 격리를 검증하는 테스트가 없다. `src/routes/api/` 아래에는 테스트가 아예 없다.

---

## XC-9 🟠 소비자 없는 계산과 페이로드가 계층 곳곳에 있다

위험 11개를 보는 동안 같은 형태가 다섯 번 나왔다. **전부 "무엇을 만드는가"만 보고
"누가 읽는가"를 묻지 않아 생긴 것이다.**

| 위치                                     | 죽은 것                                                                           | 확인                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `(member)/+layout.server.ts:26`          | `isPresenter` — 네비는 루트의 `hasPresenterEvents`(하드코딩 `false`, TODO)를 본다 | `grep isPresenter` → 이 파일 4줄뿐         |
| 관리자 큐 3종 `:19`/`:20`                | `applications:`·`seminarRequests:`·`studyRequests:` — 봉투 스키마가 스트립        | `domain/api.ts:26-30`, 소비자는 `.items`만 |
| `(public)/archive/+layout.server.ts:154` | `dataAvailable: true` — 거짓이 될 수 없음                                         | 소비자 5곳의 else 분기가 죽은 코드         |
| 아카이브 하위 서버 로드 5개              | 반환 props를 읽는 컴포넌트 없음 (페이지는 레이아웃의 `data.archive`를 읽는다)     | `grep data.photos                          | projects | …` → 0건 |
| `(admin)/+layout.server.ts`              | 파일 전체 — 그룹 안에 소비자 없음                                                 | `await parent()`·`data.isAdmin` → 0건      |

**둘은 비용이 아니라 위험이다:**

- `applications:`가 버리는 페이로드는 **신청자 PII 전체**다 — `email`·`phone`·`studentId`·`background`
  (`views.ts:41-52`). 30초 폴링 × 폴러 2개로 계속 직렬화되어 전송된다
- 아카이브의 금지 키 테스트(`public/archive.test.ts`, BE-64)가 감사하는 `getPublic*` 함수들이
  바로 그 죽은 로드들이다. **안전망이 실제 렌더 경로를 덮지 않는다**(`ZR-8`)

---

## XC-10 🟠 레이아웃 데이터 필드가 부모–자식 체인 안에서 서로 다르게 정의된다

`isMember` 하나가 **여섯 곳에서 생산되고 한 곳에서 소비된다.**

| 생산자                                                          | 값                                          |
| --------------------------------------------------------------- | ------------------------------------------- |
| `+layout.server.ts:17` (루트)                                   | `!!member && member.status !== "withdrawn"` |
| `(applicant)/+layout.server.ts:12`                              | `!!locals.member`                           |
| `(member)/+layout.server.ts:24` · `(admin)/+layout.server.ts:7` | `true`                                      |
| `(public)/+page.server.ts:153` · `:319`                         | `true` (dev preview) · `!!member`           |

소비자: `(applicant)/wait/+page.server.ts:10` 하나. `.svelte` 중 이 필드를 읽는 것은 없다.

SvelteKit은 자식 레이아웃 데이터로 부모를 덮으므로 **한 페이지의 데이터 체인 안에서
두 정의가 충돌하고, 느슨한 쪽이 이긴다.**

### 결과가 실제 사용자 흐름을 막는다 — `ZP-4`

미등록 회원(재가입 대상)은 가드가 **일부러** 신청자 존에 들여보낸다(`zone.ts:119-121`).
신청 제출 후 `/wait`으로 가면 `isMember`가 true라 `/`로 튕긴다.
**자기 대기 중인 신청서를 볼 수 없다.**
`wait:10-11`의 `!isAdmin` 예외 둘은 부트스트랩 관리자가 튕기지 않게 하려고 붙은 우회다.

### 그리고 `(admin)`의 `isMember: true`는 지금 거짓이다 — `ZA-1`

`services/withdrawal.ts:42-58`은 `status`를 바꾸면서 `isAdmin`을 지우지 않고,
`zone.ts:150-153`은 `isAdmin`만 본다. **탈퇴한 관리자가 관리자 존에 들어오고**,
루트가 계산한 `isMember: false`를 `(admin)` 레이아웃이 `true`로 덮는다.

---

## XC-11 🟠 `skipLibCheck`가 앱 자신의 선언 파일을 검사 밖에 둔다

`tsconfig.json:10`의 `skipLibCheck: true`는 **모든 `.d.ts`** 를 타입 검사에서 제외한다.
`src/app.d.ts`는 앱의 중심 타입 계약(`App.Locals`)을 담은 **앱 소스**인데 확장자가 `.d.ts`다.

증거 — 이관에서 삭제된 모듈을 아직 참조하고 있고 아무도 몰랐다:

```
src/app.d.ts:13   userApplication?: import("./lib/server/admin").Application | null;
                                            ^^^^^^^^^^^^^^^^^^^ main에 존재하지 않는다
```

주석 자체가 "legacy — removed at M3"라고 적는다.

| 검사                                                       | 결과                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `svelte-check --tsconfig ./tsconfig.json` (= `pnpm check`) | 0 errors                                                                       |
| `tsc -p ./tsconfig.json`                                   | 0 errors                                                                       |
| `tsc -p ./tsconfig.json --skipLibCheck false`              | **`app.d.ts`에서 3건** — `TS2307 Cannot find module './lib/server/admin'` 포함 |

`skipLibCheck` 자체는 정당하다(node_modules의 `.d.ts`를 검사하지 않기 위한 것).
문제는 **앱 소스가 그 면제 범위에 우연히 들어가 있다**는 것이다.

**처방**: `App.Locals` 선언을 `.ts` 파일로 옮기거나, `app.d.ts`만 별도로 검사한다.
`XC-2`(CI가 `check`를 돌리지 않는다)와 합쳐지면 이 사각지대는 아무 게이트도 통과하지 않는다.

---

## 진행 중 — 이전 감사 습관의 재발 여부

| 관찰                        | 이전 감사                       | 위험 11개에서 확인된 것                                                                                                                                                                        |
| --------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 정적 의존을 동적 `import()` | `X-9` (8파일 16곳)              | **재발 확인.** 관리자 큐 3종에서 호출 9회 / 심볼 12개. 같은 모듈이 다른 곳에서는 정적 import된다(`admin-queue-views`는 `(admin)/admin/+page.server.ts:25-29`) — 순환 의존 회피가 아님이 증명됨 |
| 계층별 오류 처리 규약 부재  | `X-10` (catch 51곳, 규약 4가지) | **재발 확인.** 레이아웃 5개에 규약 3가지(던짐 / 완전 침묵 / `.catch(()=>null)`). 더 나쁜 사례: **같은 요청·같은 테이블**을 `hasApplication`은 삼키고 `getApplicationForEmail`은 던진다         |

전체 `catch`는 53곳(테스트 제외), 동적 import는 25곳 / 15파일이다.
계층 감사에서 이 둘을 정식 지적으로 승격할지 판단한다.
