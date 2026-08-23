# 코드 감사 범위 — `main` 전체 파일 분류

> **성격**: 한시적 작업 문서. 감사 완료 후 결과만 남기고 삭제. [README](./README.md) 참조.

기준: `origin/main` (`899f971`) 추적 파일 **129개** + `src/app.html` = **130개 전수 분류**.
경로는 전부 레포 루트 기준 상대경로.

| 분류 | 파일 | 줄 |
|---|---|---|
| **A. 검토 대상 — 코드** | **78** | **9,391** |
| A2. 검토 대상 — 스타일시트 (기준 다름) | 1 | 1,946 |
| A3. 검토 대상 — 빌드 설정 (기준 다름) | 6 | 143 |
| **B. 검토 제외** | **24** | — |
| **C. 사용자 확인 필요** | **21** | **3,256** |

> C를 먼저 처리해야 A의 실제 분량이 확정된다. C에서 삭제 결정이 나면
> **약 3,000줄이 검토 대상에서 빠진다** — 리뷰할 가치가 없는 코드를 리뷰하는 게 가장 비싼 낭비다.

---

## A. 검토 대상 — 코드 (78개 / 9,391줄)

파일 하나당 리뷰 문서 하나 + 검증 에이전트 하나. 검토 기준:

- 코드 중복
- 함수 내부 하드코딩 파라미터 (매직 넘버·문자열)
- 확장을 고려하지 않은 구조
- 그 외 clean code 원칙 위반 (책임 분리, 명명, 함수 길이, 부수효과, 오류 처리)

순서는 **의존 방향을 따라 아래에서 위로** — 서버 계층을 먼저 봐야 라우트의 문제가
자기 문제인지 계층 문제인지 구분된다.

### 서버 — Notion 접근 계층 (11개, 1442줄)

| # | 파일 | 줄 |
|---|---|---|
| 1 | `src/lib/server/notion/members.ts` | 271 |
| 2 | `src/lib/server/notion/client.ts` | 262 |
| 3 | `src/lib/server/notion/seminars.ts` | 226 |
| 4 | `src/lib/server/notion/activities.ts` | 163 |
| 5 | `src/lib/server/notion/events.ts` | 160 |
| 6 | `src/lib/server/notion/applications.ts` | 120 |
| 7 | `src/lib/server/notion/schema.ts` | 99 |
| 8 | `src/lib/server/notion/utils.ts` | 73 |
| 9 | `src/lib/server/notion/utils.test.ts` | 57 |
| 10 | `src/lib/server/notion/index.ts` | 7 |
| 11 | `src/lib/server/notion.ts` | 4 |

### 서버 — 도메인·인프라 (11개, 1188줄)

| # | 파일 | 줄 |
|---|---|---|
| 12 | `src/lib/server/events.ts` | 244 |
| 13 | `src/lib/server/auth-guards.ts` | 190 |
| 14 | `src/lib/server/mail/templates.ts` | 149 |
| 15 | `src/lib/server/admin.ts` | 146 |
| 16 | `src/lib/server/cache.ts` | 134 |
| 17 | `src/lib/server/seminars.ts` | 131 |
| 18 | `src/lib/server/mail/client.ts` | 90 |
| 19 | `src/lib/server/dev-preview.ts` | 64 |
| 20 | `src/lib/server/repositories/MemberRepository.ts` | 25 |
| 21 | `src/lib/server/repositories/base.ts` | 9 |
| 22 | `src/lib/server/mail.ts` | 6 |

### 서버 — 진입점 (4개, 157줄)

| # | 파일 | 줄 |
|---|---|---|
| 23 | `src/hooks.server.ts` | 73 |
| 24 | `src/auth.ts` | 40 |
| 25 | `src/app.d.ts` | 27 |
| 26 | `src/app.html` | 17 |

### 공유 라이브러리 (7개, 423줄)

| # | 파일 | 줄 |
|---|---|---|
| 27 | `src/lib/utils.ts` | 133 |
| 28 | `src/lib/types.ts` | 91 |
| 29 | `src/lib/constants.ts` | 79 |
| 30 | `src/lib/state.svelte.ts` | 57 |
| 31 | `src/lib/theme.ts` | 34 |
| 32 | `src/lib/toasts.ts` | 28 |
| 33 | `src/lib/index.ts` | 1 |

### 컴포넌트 (18개, 1908줄)

| # | 파일 | 줄 |
|---|---|---|
| 34 | `src/lib/components/poster/SeminarPoster.svelte` | 520 |
| 35 | `src/lib/components/poster/SeminarPosterDownloadPanel.svelte` | 295 |
| 36 | `src/lib/components/poster/SpeakerSelector.svelte` | 200 |
| 37 | `src/lib/components/SymbolBackground.svelte` | 125 |
| 38 | `src/lib/components/ActionButton.svelte` | 98 |
| 39 | `src/lib/components/poster/SeminarPosterSection.svelte` | 82 |
| 40 | `src/lib/components/Toasts.svelte` | 76 |
| 41 | `src/lib/components/StatusBadge.svelte` | 73 |
| 42 | `src/lib/components/SectionHeader.svelte` | 61 |
| 43 | `src/lib/components/ManuscriptHeader.svelte` | 55 |
| 44 | `src/lib/components/CopyButton.svelte` | 51 |
| 45 | `src/lib/components/Skeleton.svelte` | 49 |
| 46 | `src/lib/components/SuccessScreen.svelte` | 48 |
| 47 | `src/lib/components/Pagination.svelte` | 44 |
| 48 | `src/lib/components/signup/SignupConsentField.svelte` | 38 |
| 49 | `src/lib/components/admin/ApplicationDetails.svelte` | 37 |
| 50 | `src/lib/components/signup/SignupContactFields.svelte` | 37 |
| 51 | `src/lib/components/signup/SignupMetadataFields.svelte` | 19 |

### 라우트 — 서버 (15개, 1325줄)

| # | 파일 | 줄 |
|---|---|---|
| 52 | `src/routes/admin/+page.server.ts` | 306 |
| 53 | `src/routes/+page.server.ts` | 300 |
| 54 | `src/routes/seminar/edit/[id]/+page.server.ts` | 112 |
| 55 | `src/routes/signup/+page.server.ts` | 106 |
| 56 | `src/routes/events/[id]/[type]/+page.server.ts` | 88 |
| 57 | `src/routes/seminar/apply/+page.server.ts` | 85 |
| 58 | `src/routes/admin/events/new/+page.server.ts` | 76 |
| 59 | `src/routes/signup/edit/+page.server.ts` | 74 |
| 60 | `src/routes/admin/events/connect/+page.server.ts` | 39 |
| 61 | `src/routes/api/admin/seminar-requests/+server.ts` | 35 |
| 62 | `src/routes/+layout.server.ts` | 30 |
| 63 | `src/routes/wait/+page.server.ts` | 24 |
| 64 | `src/routes/api/cron/sync-events/+server.ts` | 21 |
| 65 | `src/routes/api/admin/applications/+server.ts` | 18 |
| 66 | `src/routes/admin/events/new/+layout.server.ts` | 11 |

### 라우트 — 화면 (12개, 2948줄)

| # | 파일 | 줄 |
|---|---|---|
| 67 | `src/routes/admin/+page.svelte` | 1091 |
| 68 | `src/routes/+page.svelte` | 524 |
| 69 | `src/routes/admin/events/connect/+page.svelte` | 238 |
| 70 | `src/routes/+layout.svelte` | 195 |
| 71 | `src/routes/seminar/edit/[id]/+page.svelte` | 172 |
| 72 | `src/routes/seminar/apply/+page.svelte` | 170 |
| 73 | `src/routes/+error.svelte` | 144 |
| 74 | `src/routes/events/[id]/[type]/+page.svelte` | 116 |
| 75 | `src/routes/admin/events/new/+page.svelte` | 111 |
| 76 | `src/routes/signup/+page.svelte` | 84 |
| 77 | `src/routes/signup/edit/+page.svelte` | 66 |
| 78 | `src/routes/wait/+page.svelte` | 37 |
---

## A2. 검토 대상 — 스타일시트 (1개 / 1,946줄)

| 파일 | 줄 |
|---|---|
| `src/lib/manuscript.css` | 1946 |

**코드와 같은 기준을 쓸 수 없다.** 별도 기준으로 본다:
중복 선언, 하드코딩된 색상·간격(토큰 미사용), 명시도 충돌, 미사용 셀렉터,
다크모드 누락, 반응형 분기 중복.

1,946줄 단일 파일이라 **한 번에 리뷰하면 정확도가 떨어진다.** 섹션 단위로 쪼갤 것.

---

## A3. 검토 대상 — 빌드 설정 (6개 / 143줄)

| 파일 | 줄 | 볼 것 |
|---|---|---|
| `package.json` | 45 | 스크립트 누락(`test` 없음), 의존성 정리 |
| `eslint.config.js` | 39 | 규칙이 실제 문제를 잡는가 |
| `tsconfig.json` | 20 | strict 수준. `svelte-check` 40 errors와 관계 |
| `svelte.config.js` | 20 | 어댑터 — Docker 경로와 불일치 |
| `vitest.config.ts` | 10 | 커버리지 설정 없음 |
| `vite.config.ts` | 9 | — |

**clean code가 아니라 설정 적절성**을 본다. 코드 리뷰와 섞지 말 것.

---

## B. 검토 제외 (24개)

이유가 분류마다 다르다.

### 문서 (17개) — 코드가 아님
`README.md` · `CHANGELOG.md` · `docs/ARCHITECTURE.md` · `docs/AUTH_VARS.md` ·
`docs/CACHE.md` · `docs/COMPONENTS.md` · `docs/DESIGN_BLUEPRINT.md` · `docs/FEATURES.md` ·
`docs/MAINTAINING_DOCS.md` · `docs/SETUP.md` · `docs/schema.md` ·
`experiment/README.md` · `experiment/palette-1.md` ~ `palette-4.md`

> 단 `docs/CACHE.md`(Redis 도입 이전)와 `docs/schema.md`(Events·Queue 절 부재)는
> **내용이 낡았다.** 코드 감사 대상은 아니지만 별도 갱신 대상이다.

### 에셋 (5개) — 바이너리·벡터
`src/lib/assets/favicon.svg` · `copy.svg` · `instagram.svg` · `menu.svg` ·
`static/posters/favicon.svg`

### 도구 설정 (2개) — 검토할 로직 없음
`.gitignore` · `.npmrc`

---

## C. 사용자 확인 필요 (21개 / 3,256줄)

**리뷰하기 전에 존치 여부를 정해야 하는 것들.** 각 항목에 확인 질문을 달았다.

### 실험 코드 — 앱 내 링크 없음

| 파일 | 줄 |
|---|---|
| `src/lib/components/ExperimentReplica.svelte` | 812 |
| `src/routes/experiment/index/+page.svelte` | 157 |
| `src/routes/experiment/2/+page.svelte` | 51 |
| `src/routes/experiment/3/+page.svelte` | 47 |
| `src/routes/experiment/1/+page.svelte` | 46 |
| `src/routes/experiment/4/+page.svelte` | 46 |

### Notion DB 브라우저 — 대체 대상

| 파일 | 줄 |
|---|---|
| `src/routes/notion/+page.svelte` | 463 |
| `src/routes/notion/+page.server.ts` | 74 |

### 정적 포스터 HTML — src 참조 없음

| 파일 | 줄 |
|---|---|
| `static/posters/snumps-modern-poster.html` | 487 |
| `static/posters/snumps-seminar-poster-3x4.html` | 460 |
| `static/posters/snumps-instagram-poster.html` | 309 |

### 배포 설정 — 현재 동작 불가

| 파일 | 줄 |
|---|---|
| `Dockerfile` | 62 |
| `docker-compose.yml` | 24 |
| `.dockerignore` | 18 |

### 운영 설정 — 판단 필요

| 파일 | 줄 |
|---|---|
| `vercel.json` | 8 |
| `.env.example` | 13 |
| `static/robots.txt` | 3 |
| `test-results/.last-run.json` | 4 |
| `GEMINI.md` | 110 |

### 엔드포인트 — 존치 판단

| 파일 | 줄 |
|---|---|
| `src/routes/diag/+server.ts` | 50 |
| `src/routes/api/posters/seminar/png/+server.ts` | 12 |
### 확인 질문

| # | 대상 | 확인해야 할 것 | 근거 |
|---|---|---|---|
| C-1 | 실험 코드 6개 (**1,159줄**) | **지울 것인가?** | `/experiment`로 가는 **앱 내 링크가 하나도 없다**. URL을 직접 쳐야만 도달한다. `ExperimentReplica.svelte` 812줄이 여기에만 쓰인다. 살릴 거면 리뷰 대상, 지울 거면 A에서 1,159줄이 빠진다 |
| C-2 | `src/routes/notion/**` (537줄) | **Notion 대체 후에도 필요한가?** | 관리자용 Notion DB 브라우저다. `+layout.svelte:110,143`에서 링크된다. Notion을 떠나면 존재 이유가 사라진다. 지금 리뷰할 가치가 있는지 판단 필요 |
| C-3 | `static/posters/*.html` (**1,256줄**) | **누가 쓰는가?** | `src/` 어디서도 참조하지 않는다. `static/`이라 `/posters/*.html`로 직접 열리긴 한다 — 외부에 URL을 공유한 적이 있나? 없으면 죽은 파일 |
| C-4 | `Dockerfile` · `docker-compose.yml` · `.dockerignore` | **Docker 배포를 쓸 것인가?** | 현재 **동작하지 않는다** — `svelte.config.js`가 adapter-vercel인데 Dockerfile은 adapter-node 산출물(`node build`)을 기대하고, `pnpm-lock.yaml`이 gitignore라 `--frozen-lockfile`이 실패한다. 고칠지 지울지 |
| C-5 | `src/routes/diag/+server.ts` | **필요한가? 보호되는가?** | 진단 엔드포인트인데 **앱 내 링크가 없다**. `membershipGuard` 뒤에 있긴 하지만 무엇을 노출하는지 확인 필요 |
| C-6 | `src/routes/api/posters/seminar/png/+server.ts` | **스텁을 유지할 것인가?** | POST 전용, 항상 410 반환. 구 클라이언트를 위한 묘비다. 지울 시점인지 |
| C-7 | `test-results/.last-run.json` | **왜 커밋되어 있나?** | 테스트 실행 산출물이다(`{"status":"failed"}`). `.gitignore`에 넣고 삭제하는 게 맞다 |
| C-8 | `.env.example` | **채울 것인가?** | 실제 필요 변수의 절반만 있다. `NOTION_DB_EVENTS`·`ATTENDANCE_QUEUE`·`CRON_SECRET`·`REDIS_URL`·`ADMIN_REFRESH_TOKEN` 등 누락 |
| C-9 | `static/robots.txt` | **언제 풀 것인가?** | `Disallow: /` 전면 차단 중. 공개 페이지 이주와 직결 |
| C-10 | `vercel.json` | **cron 주기가 의도된 값인가?** | `0 15 */2 * *` = 격일 00:00 KST |
| C-11 | `GEMINI.md` | **현행인가?** | AI 도구용 지침. 내용이 코드 현실과 맞는지 |

---

## 진행 방식

```
1) C 먼저 처리 → 삭제 결정분을 A에서 제외 (최대 3,000줄 감소)
2) A를 의존 순서대로: 서버 Notion 계층 → 서버 도메인 → 진입점
                    → 공유 라이브러리 → 컴포넌트 → 라우트 서버 → 라우트 화면
3) 파일 1개당:
     a. 리뷰 → docs/code-audit/files/<경로>.md
     b. 검증 에이전트 dispatch — 지적이 옳은지, 과도하지 않은지, 빠진 게 없는지
     c. 에이전트 지적 반영 후 커밋
4) A2 스타일시트는 섹션 단위로 별도 진행
5) A3 빌드 설정은 마지막에 (앞 결과가 설정 판단에 영향)
```

**파일 1개 = 문서 1개 = 커밋 1개 = 검증 1회.** 묶어서 처리하지 않는다.
