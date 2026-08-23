# Handoff — Notion 대체 프로젝트

> 이 브랜치를 처음 받는 사람이 읽는 문서. 30분 안에 작업 가능한 상태가 되는 것이 목표다.

---

## 1. 이 브랜치가 뭔가

`docs/notion-migration-plan` — snumps.notion.site를 이 앱으로 완전히 대체하기 위한
**조사·계획 문서 묶음**이다. 아직 코드 변경은 하나도 없다. 전부 `docs/migration/` 아래 문서다.

### 브랜치 스택 구조 ⚠️

```
main (899f971)
  └── docs/seminar-migration-spec   (1 commit)  ← 미머지 seminar 브랜치 이주 명세
        └── docs/notion-migration-plan (5 commits) ← 이 브랜치. Notion 대체
```

**이 브랜치는 `docs/seminar-migration-spec` 위에 쌓여 있다.** 별개 주제지만 같은
`docs/migration/README.md`를 공유하기 때문에 스택했다. PR을 만든다면 아래 브랜치부터 머지하거나,
`main`을 base로 하되 두 브랜치가 README에서 충돌한다는 점을 알고 있어야 한다.

관련 있는 다른 브랜치:

| 브랜치 | 내용 | 상태 |
|---|---|---|
| `migrate/dev-carryover` | 구 `dev` 라인에서 이주한 전화번호 검증·관리자 모달·문서 4종 | 푸시됨, 미머지 |
| `seminar` | 이벤트 신청/출석관리 원본 (`fd7e482`) | 푸시됨. **삭제 금지** — main에 없는 810줄 기능 |
| `dev` | 구 라인. `main`과 **공통 조상 0개** | 푸시됨 |

### ⚠️ `main`과 `dev`는 공통 조상이 0개다

```
git merge-base origin/main origin/dev   →  (빈 출력)
루트 커밋 두 개:  af0fe8d (dev 계열, 279커밋)  vs  ded066b (main 계열, 318커밋)
```

메시지·날짜·작성자가 같고 SHA만 다르다. `package-lock.json`과 잡파일을 지우려고 히스토리를
재작성하면서 라인이 갈렸다. 앞 274(dev)↔272(main) 커밋이 제목 기준 동일하고,
논리적 분기점은 `daa108e` ↔ `02c6e7b`("fix: parse speaker name…", 2026-02-19)다.

**결과: 두 라인 사이에서 `git cherry-pick`이 작동하지 않는다.**
`git show <sha> | git apply`도 컨텍스트 불일치로 대부분 실패한다. 구 라인의 작업을 가져오려면
수동 재작성이 기본이다 — `migrate/dev-carryover`가 그 방식으로 만들어졌다.

---

## 2. 받아오기

```bash
git clone https://github.com/snumps-webpage/webpage.git
cd webpage
git fetch origin
git switch docs/notion-migration-plan
```

이미 클론이 있다면:

```bash
git fetch origin
git switch -c docs/notion-migration-plan origin/docs/notion-migration-plan
```

---

## 3. 🔴 환경 설정 — 레포만으로는 안 된다

`.env`와 `pnpm-lock.yaml`이 **둘 다 `.gitignore` 대상**이다. 그리고 `.env.example`은 실제로
필요한 변수의 절반만 담고 있다.

### 3-1. 받아야 할 것

회장(현 김건호)에게 요청:

| 항목 | 왜 필요한가 |
|---|---|
| `.env` 전체 (또는 Vercel 프로젝트 env) | 아래 변수들이 `.env.example`·`SETUP.md` 어디에도 없다 |
| Notion 워크스페이스 읽기 권한 | 조사 재현·검증에 필요 |
| AWS 계정 접근 (트랙 A 착수 시) | S3 버킷 생성 |

### 3-2. `.env.example`과 `SETUP.md`에 **빠져 있는** 변수

```
NOTION_DB_EVENTS              ❌ 코드는 읽는데 문서·예시 어디에도 없음
NOTION_DB_ATTENDANCE_QUEUE    ❌ 동일
CRON_SECRET                   ❌ 없으면 /api/cron/sync-events 가 인증 없이 열린다
REDIS_URL                     ❌ 없으면 메모리 캐시만 동작 (정상 폴백)
ADMIN_REFRESH_TOKEN           ❌ Gmail 발송용
```

`.env.example`에는 `NOTION_DB_MEMBERS`, `NOTION_DB_PRIVATE_INFO`, `NOTION_DB_ACTIVITIES`,
`NOTION_DB_SEMINARS`, `NOTION_DB_STUDIES`, `NOTION_DB_APPLICATIONS`,
`NOTION_DB_SEMINAR_REQUESTS`도 없다. `docs/SETUP.md`가 그나마 목록을 갖고 있으나
그것도 위 5개가 빠졌다. **문서를 믿지 말고 실제 `.env`를 받아라.**

> 이 문서 갭 자체가 작업 항목이다 — 작업 목록의 P0에 들어 있다.

### 3-3. 문서만 읽고 리뷰할 거라면

환경 설정 없이도 `docs/migration/*.md` 전부 읽을 수 있고
`docs/migration/design-concept.html`은 브라우저로 바로 열면 된다.
**코드를 건드릴 때만** §3-1이 필요하다.

---

## 4. 🔴 툴체인 함정

### 4-1. `pnpm run <script>` 가 실패한다

```
$ pnpm run check
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2
[ERROR] Command failed with exit code 1: pnpm install
```

pnpm이 스크립트 실행 전에 `pnpm install`을 돌리는데, `esbuild`의 빌드 스크립트가 승인되지 않아
거기서 죽는다. 부산물로 `pnpm-workspace.yaml`이 생기니 보이면 지워라.

**해결 1 (권장) — 바이너리 직접 호출.** 검증된 방법이다:

```bash
./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json
./node_modules/.bin/vitest run
./node_modules/.bin/eslint .
```

**해결 2 — 빌드 승인:**

```bash
pnpm approve-builds     # esbuild 선택 후 승인
```

### 4-2. lockfile이 없다

`pnpm-lock.yaml`이 gitignore 대상이라 `pnpm install --frozen-lockfile`이 불가능하다.
(`Dockerfile`이 이 명령을 쓰는데, 그래서 현재 Docker 빌드가 깨진다 —
`migrate/dev-carryover` 브랜치의 `docs/DEPLOYMENT.md` §3에 기록돼 있다.)

그냥 `pnpm install` 하면 된다.

### 4-3. `test` 스크립트가 이 브랜치엔 없다

`vitest`는 devDependency에 있지만 `package.json`에 `test` 스크립트가 없다.
`migrate/dev-carryover` 브랜치에 추가돼 있으니, 그게 머지되기 전까지는 §4-1의 직접 호출을 써라.

---

## 5. 검증 기준선 — 이건 회귀가 아니다

```bash
./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json
# → COMPLETED 511 FILES 40 ERRORS 1 WARNINGS 12 FILES_WITH_PROBLEMS
```

**40 errors는 `main`의 기준선이다.** 대부분 Zod/Repository 도입 과정의 `unknown` 타입 문제로,
이 프로젝트와 무관하다. 작업 후 **숫자가 40을 넘지 않으면 회귀 없음**으로 본다.

```bash
./node_modules/.bin/eslint .          # clean 이어야 함
./node_modules/.bin/vitest run        # 이 브랜치엔 테스트 1개 (notion/utils.test.ts)
```

---

## 6. 읽는 순서

`docs/migration/` 안에서:

| 순서 | 파일 | 목적 |
|---|---|---|
| 1 | [`notion-replacement-tasks.md`](./notion-replacement-tasks.md) | **여기서 시작.** 확정 결정, 블로커, 트랙 5개, 의존 그래프 |
| 2 | [`notion-site-inventory.md`](./notion-site-inventory.md) | 실측 데이터 — 22노드, 9DB/605행, 자산 90개, PII 현황 |
| 3 | [`notion-db-to-s3.md`](./notion-db-to-s3.md) | 데이터·자산·편집 이주 설계 (S3 레코드 저장소 설계 포함) |
| 4 | [`notion-pages-to-web.md`](./notion-pages-to-web.md) | 공개 페이지 22개 라우트 매핑 |
| 5 | [`design-concept.html`](./design-concept.html) | 시각 컨셉 — 브라우저로 열 것 |
| — | [`seminar-events.md`](./seminar-events.md) | **별개 주제.** 이 프로젝트 아님 |

읽기 전에 알아둘 것:
- `docs/ARCHITECTURE.md`, `docs/CACHE.md`, `docs/schema.md` — 앱 현행 구조
- `docs/DESIGN_BLUEPRINT.md` — 시각 언어. 디자인 컨셉이 이걸 확장한 것이다

---

## 7. 지금 당장 할 수 있는 것 / 막혀 있는 것

### 🚦 막혀 있음 — 사람이 필요

| 작업 | 막는 것 | 누구에게 |
|---|---|---|
| **P0-1** EVENTS·ATTENDANCE_QUEUE 실측 | 프로덕션 env | 회장 |
| **P0-5** 정합성 이상 정리 (주인 없는 PII 5건 등) | 삭제 승인 | 회장 + 당사자 확인 |
| 결정 §8-1 정합성 처리 방침 | 판단 | 임원진 |
| 결정 §8-10 회칙 제8조 부재 | 확인 | 임원진 |
| 트랙 A 버킷 생성 | AWS 계정 | 회장 |

### ✅ 지금 착수 가능

| 작업 | 왜 지금 가능한가 |
|---|---|
| **P0-3** 개인정보 누수 차단 — `getLatestExecutives()`를 루트 레이아웃에서 제거 | 코드 변경만. 이주와 독립. 지금 게스트 표지에 임원 전화번호가 렌더된다 |
| **P0-4** `CRON_SECRET` 설정 | env 한 줄 |
| **P1** 공개 영역 신설 + 가드 테스트 | 외부 의존 없음. 다만 인가 경계 변경이라 테스트가 종료 조건 |
| **P2** mdsvex 도입 | 독립 |
| **P3** 회칙 이주 | 첨부 0개라 자산 파이프라인과 무관. **최대 작업량이므로 일찍 시작할 가치가 있다** |
| A0 안정 id 체계 | 설계 작업 |

> P3(회칙)는 현행본 + 개정본 2건이다. 개정본은 `회칙` 페이지의 "이력" 토글 안에 있어서
> 눈으로 보면 놓치기 쉽다. 인벤토리 §1의 트리를 보고 작업하라.

---

## 8. 작업 방식

### 브랜치

이 브랜치에 직접 쌓지 말고 갈라 나가라:

```bash
git switch -c feat/<주제> docs/notion-migration-plan
```

문서만 고친다면 이 브랜치에 직접 커밋해도 된다.

### 커밋

레포 관례는 Conventional Commits + 기능 단위 atomic이다
(`migrate/dev-carryover` 브랜치의 `CONTRIBUTING.md`에 정리돼 있다).

```
feat(events): ...    fix(forms): ...    docs: ...    refactor: ...
```

### 문서 갱신 규칙

`docs/migration/`은 **한시적 작업 문서 전용**이고 `docs/MAINTAINING_DOCS.md`의 taxonomy
바깥이다. 이주가 끝나면 이 디렉터리는 삭제하고, 남길 내용은 `FEATURES.md`(기능),
`schema.md`(DB 구조), `ARCHITECTURE.md`(구조적 결과)로 옮긴다. 자세한 건
[`README.md`](./README.md).

**계획과 실제가 어긋나면 문서를 고쳐라.** 이 문서들은 두 차례 검증을 거치며
사실 오류를 여러 건 잡아냈다 — 문서를 코드 대신 읽어서 생긴 오류가 대부분이었다
(예: `SETUP.md`에 없다고 `NOTION_DB_STUDIES`가 없다고 판단했으나 `.env`에 있었다).
**항상 코드와 실제 데이터를 먼저 확인하라.**

---

## 9. 알아둘 함정 (조사 중 실제로 당한 것들)

| 함정 | 증상 |
|---|---|
| **Notion 토글 안의 페이지** | `loadPageChunk`가 토글 자식을 안 내려준다. 조사 중 **세 번** 놓쳤고, 이미지 5개가 전부 토글 안에 있었다. 하위 페이지 id로 재귀 재조회 필수 |
| `filter_properties` 화이트리스트 | `notion/events.ts`가 조회 속성을 제한한다. 새 속성을 배열에 안 넣으면 **에러 없이 빈 배열**이 온다 |
| 서명 URL | 접근 경로마다 형태·수명이 다르다. 블록 `source` 23개 중 10개는 서명이 없어 그대로 받으면 403 |
| `docs/SETUP.md` | 오래됐다. env 변수 5개가 빠져 있다 |
| `static/robots.txt` | `Disallow: /` — 전 사이트 크롤링 차단 중. SEO 작업은 이걸 풀기 전까지 무효 |
| `src/app.html` | `lang="en"`인데 콘텐츠는 한국어 |

---

## 10. PR과 머지

### 머지 순서

두 문서 브랜치가 `docs/migration/README.md`를 **둘 다** 수정한다. 순서를 정해야 충돌이 없다.

```
1) docs/seminar-migration-spec  →  main     (먼저)
2) docs/notion-migration-plan   →  main     (그 다음. 1번을 이미 포함하고 있다)
```

`docs/notion-migration-plan`은 `docs/seminar-migration-spec` 위에 쌓여 있으므로,
**1번을 머지한 뒤 2번을 올리면 충돌이 없다.** 순서를 뒤집거나 둘을 동시에 열면
README에서 충돌한다.

1번을 머지하지 않고 2번만 가져가고 싶다면, `main` 기준으로 리베이스하고
seminar 커밋(`6369e2c`)을 빼야 한다 — 다만 그러면 README의 seminar 행이 끊긴 링크가 된다.
권장하지 않는다.

### PR 만들기

```bash
gh pr create --base main --head docs/seminar-migration-spec   --title "docs: seminar migration spec"
gh pr create --base main --head docs/notion-migration-plan   --title "docs: Notion replacement plan"
```

두 브랜치 모두 **문서만** 담고 있어 빌드·런타임에 영향이 없다. 코드 리뷰보다는
**사실 검증**이 리뷰의 초점이어야 한다 — §11 참조.

### 완료 기준

| 트랙 | 완료로 볼 조건 |
|---|---|
| P0 | 5개 항목 전부. 특히 P0-1 없이는 범위가 안 닫힌다 |
| A | S3 객체 수 90, sha256 일치, `assets-manifest.json` 커밋 |
| B | 행 수 일치(9개 DB 전부), dangling relation 0, 쓰기 라우트 10개 회귀 없음 |
| P | 페이지별 원문 대조 + `svelte-check` ≤ 40 + 가드 테스트 통과 |
| C | 임원진이 Notion 없이 데이터를 고칠 수 있음 — **이게 D의 전제다** |
| D | Notion 읽기 전용 → 최종 델타 → 아카이브. 삭제 아님 |

---

## 11. 이 문서들이 어떻게 검증됐나

숫자를 그냥 믿지 말라는 뜻이 아니라, **어디까지 확인됐고 언제 다시 확인해야 하는지** 알라는 뜻이다.

| 항목 | 출처 | 재확인 필요 시점 |
|---|---|---|
| 페이지 트리 22노드, 블록 구조 | 미인증 공개 API 전수 크롤 (인벤토리 §7에 재현 명령) | Notion 콘텐츠가 바뀔 때마다 |
| 공개 DB 5개 행 수 (351) | 공개 `queryCollection` | 상시 변동. 착수 시 재측정 |
| 전체 DB 9개 행 수 (605) | **공식 API + 프로덕션 키** | 상시 변동 |
| 정합성 이상 (고아 PII 11건 등) | 공식 API로 relation 직접 추적 | P0-5 착수 시 재확인 |
| 코드 관련 주장 전부 | 이 레포 직접 확인 | `main`이 움직이면 |
| EVENTS / ATTENDANCE_QUEUE | ❌ **미측정** | P0-1 |

작성 과정에서 **독립 검증을 두 차례** 거쳤고, 그때 잡힌 오류가 적지 않다. 대표적인 것:

- Notion 토글 안의 페이지를 **세 번** 놓쳤다 (회칙 개정본 2건 포함 → 노드 20→22)
- 첨부 개수를 85→86→**90**으로 두 번 정정했다
- 존재하지 않는 코드(`SEMINAR_TYPES`)를 현행이라고 단정했다 — 미머지 브랜치 코드였다
- `NOTION_DB_STUDIES`가 없다고 판단했으나 `.env`에 있었다 (`SETUP.md`만 보고 판단)
- 쓰기 경로를 raw grep 43줄로 세어 "43곳"이라 적었다 — 실제 호출부는 17곳, 라우트는 10개
- "S3는 동시 쓰기를 잃는다"는 논거가 틀렸다 — Notion이 오히려 `If-Match`가 없어 더 취약하다

**공통 원인은 하나다: 코드·실제 데이터 대신 문서를 읽은 것.**
이 프로젝트에서 무언가를 주장하기 전에 반드시 원본을 확인하라.

---

## 12. 연락

| 역할 | |
|---|---|
| 회장 · 워크스페이스/AWS 소유 | 김건호 |
| 부회장 | 서성욱 |
| 동아리 대표 | snumps0@gmail.com |
