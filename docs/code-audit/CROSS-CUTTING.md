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

## 진행 중

파일별 리뷰가 시작되면 여기에 교차 패턴이 추가된다. 초기 관찰(미검증, 지적 아님):

| 관찰                  | 수치               | 확인할 것                                                               |
| --------------------- | ------------------ | ----------------------------------------------------------------------- |
| 동적 `await import()` | 25곳 / 15파일      | 이전 `X-9`와 같은 습관인지, 순환 의존 회피 등 정당한 이유가 있는지      |
| `catch` 블록          | 53곳 (테스트 제외) | 이전 `X-10`(계층별 오류 처리 규약 부재)이 새 계층 구조에서도 반복되는지 |

**둘 다 아직 지적이 아니다.** 세어 보기만 했다. 해당 계층 리뷰에서 확인한 뒤 승격하거나 버린다.
