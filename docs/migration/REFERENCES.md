# 참조 문서 — Notion 대체 프로젝트

> **성격**: 한시적 작업 문서. [README](./README.md) 참조.
> 이 프로젝트를 진행하며 실제로 확인해야 하는 것들. **문서를 읽기 전에 코드와 데이터를 먼저 본다**는
> 원칙은 [`HANDOFF.md`](./HANDOFF.md) §11에 있다.

---

## 1. 이 레포 안에서

### 1-1. 반드시 먼저 읽을 것

| 파일 | 왜 |
|---|---|
| `docs/ARCHITECTURE.md` | 현행 구조. 데이터 계층 교체가 무엇을 건드리는지 |
| `docs/CACHE.md` | 캐시 전략. ⚠️ **`:41`이 Redis 도입(`84f4b2a`) 이전 내용이라 낡았다** |
| `docs/schema.md` | Notion DB 구조. ⚠️ **Events·Attendance Queue 절이 아예 없다** |
| `docs/DESIGN_BLUEPRINT.md` | 시각 언어. `design-concept.html`이 이걸 확장한 것 |
| `docs/COMPONENTS.md` | 재사용 컴포넌트·유틸. 편집 UI(트랙 C)에서 재사용할 것들 |
| `docs/AUTH_VARS.md` | `ADMINS_EMAILS` / `AUTHORIZED_USERS` 의미 |
| `docs/MAINTAINING_DOCS.md` | 문서 taxonomy. `docs/migration/`은 이 바깥이다 |

### 1-2. 코드에서 직접 확인할 지점

| 대상 | 위치 | 이 프로젝트와의 관계 |
|---|---|---|
| 공개/비공개 경계 | `src/hooks.server.ts` `membershipGuard` | 공개 영역 신설(P1)이 여기를 고친다 |
| 인증 래퍼 | `src/lib/server/auth-guards.ts` | `handleUserAction` / `handleAdminAction` / `ensureSession` |
| 캐시 인터페이스 | `src/lib/server/cache.ts` | `withCache(key, ttl, fetcher)` — S3 전환 시 페처만 교체 |
| Notion 접근 계층 | `src/lib/server/notion/` | 익스포터가 여기 함수를 쓴다 |
| Notion 속성명 | `src/lib/constants.ts` `NOTION_PROPS` | 공개 DB가 프로덕션 DB임을 증명한 근거 |
| Repository | `src/lib/server/repositories/` | S3 데이터 계층이 흡수될 자리 |
| ⚠️ 개인정보 누수 | `src/routes/+layout.server.ts` → `getLatestExecutives()` | P0-3 |
| ⚠️ cron fail-open | `src/routes/api/cron/sync-events/+server.ts:9` | P0-4 |
| ⚠️ 크롤링 차단 | `static/robots.txt` | P7 |
| 조회 속성 화이트리스트 | `src/lib/server/notion/events.ts` `filter_properties` | 속성 추가 시 여기 안 넣으면 **무성 실패** |

### 1-3. 다른 브랜치에 있는 문서

| 문서 | 브랜치 | 내용 |
|---|---|---|
| `docs/API.md` | `migrate/dev-carryover` | 엔드포인트 계약. `CRON_SECRET` fail-open 기록 |
| `docs/DEPLOYMENT.md` | `migrate/dev-carryover` | Vercel·cron·Docker. **Docker 경로가 현재 깨져 있다는 기록** |
| `CONTRIBUTING.md` | `migrate/dev-carryover` | 커밋 컨벤션, Svelte 5 runes 규칙 |
| `docs/COMMENTING_RULES.md` | `migrate/dev-carryover` | 주석 기준 |

> 이 브랜치엔 없다. `git show origin/migrate/dev-carryover:docs/API.md` 로 볼 수 있다.

---

## 2. AWS — 공식 문서

URL은 바뀐다. **제목으로 찾는 편이 안전하다.**

### 2-1. S3

| 주제 | 문서 | 이 프로젝트에서 |
|---|---|---|
| 조건부 쓰기 | *Amazon S3 User Guide — Conditional requests* (`If-Match` / `If-None-Match`) | §2-2 `mutate()`의 근간. **이 설계 전체가 여기 달렸다** |
| 버전 관리 | *Using versioning in S3 buckets* | §2-5 변경 이력·복구 |
| 수명 주기 | *Managing your storage lifecycle* | §4-6-8 비현재 버전 90일, 미완료 멀티파트 7일 |
| 스토리지 클래스 | *Understanding and managing storage classes* | §4-6-8 Standard 선택 근거 |
| presigned URL | *Sharing objects with presigned URLs* | §5-2 업로드. SigV4 최대 7일 |
| 서버 액세스 로깅 | *Logging requests with server access logging* | §4-6-9 PII 감사 |
| 성능 지침 | *Best practices design patterns: optimizing S3 performance* | §4-6-11 요청률 한도 |
| 암호화 | *Protecting data with server-side encryption* | SSE-KMS (비공개 버킷) |

### 2-2. CloudFront

| 주제 | 문서 |
|---|---|
| OAC | *Restricting access to an Amazon S3 origin* — Origin Access Control |
| 압축 | *Serving compressed files* |
| 무효화 | *Invalidating files* — 무료 한도 월 1,000경로 |
| 가격 등급 | *Choosing the price class* — PriceClass_200 |

### 2-3. IAM · 인증

| 주제 | 문서 |
|---|---|
| 최소 권한 | *IAM best practices — Apply least-privilege permissions* |
| OIDC 페더레이션 | *Creating OpenID Connect (OIDC) identity providers* |
| Vercel 쪽 | Vercel Docs — *OIDC Federation* (AWS 연동 절차) |

> §4-6-2에 적었듯 **연동 절차는 양쪽 문서의 현행판을 볼 것.** 여기 옮겨 적으면 곧 낡는다.

### 2-4. SDK

| 패키지 | 문서 |
|---|---|
| `@aws-sdk/client-s3` | AWS SDK for JavaScript v3 API Reference — S3 Client |
| `@aws-sdk/s3-request-presigner` | 동 — S3 Request Presigner |
| `@aws-sdk/credential-providers` | 동 — Credential Providers (OIDC 사용 시) |

### 2-5. 비용

| 주제 | 문서 |
|---|---|
| S3 요금 | *Amazon S3 pricing* — 스토리지 / 요청 / 전송 |
| CloudFront 요금 | *Amazon CloudFront pricing* |
| 예산 알림 | *AWS Budgets* — §4-6-8. **동아리 계정이므로 필수** |

---

## 3. Notion — 이주 원본 접근

| 주제 | 비고 |
|---|---|
| 공식 API (`api.notion.com`, `Notion-Version: 2022-06-28`) | 앱이 쓰는 것. 익스포터도 이걸 쓴다 |
| 미인증 공개 API (`/api/v3/loadPageChunk`, `queryCollection`) | 인벤토리 조사에 쓴 것. **재현 명령은 [인벤토리 §7](./notion-site-inventory.md)에 있다** |
| `getSignedFileUrls` | 서명 URL 재발급. 블록 `source` 그대로는 403 |

> ⚠️ `/api/v3/syncRecordValues`는 Cloudflare가 차단한다.
> ⚠️ `loadPageChunk`는 **토글 자식을 안 내려준다.** 조사 중 세 번 놓쳤다.

---

## 4. 프레임워크

| 주제 | 문서 | 어디서 |
|---|---|---|
| SvelteKit 라우팅·훅 | SvelteKit Docs — *Hooks*, *Routing* | P1 공개 영역 |
| prerender / ISR | SvelteKit Docs — *Page options*, Vercel adapter | P3 정적 페이지, 페이지 계획 §7 |
| mdsvex | mdsvex 문서 | P2 마크다운 파이프라인 |
| Svelte 5 runes | Svelte Docs — *Runes* | 트랙 C 편집 UI |

---

## 5. 이 환경의 스킬

| 스킬 | 이 프로젝트에 쓸 만한가 |
|---|---|
| `senior-devops` | ⚠️ **AWS 구체 내용 없음.** 참조 문서 3개가 각 103줄 범용 보일러플레이트고 S3·CloudFront·IAM 언급이 0회다. 인용하지 말 것 |
| `frontend-design` / `impeccable` | 트랙 P·C의 UI 작업에 유효. 단 `DESIGN_BLUEPRINT.md`가 우선한다 |
| `superpowers:brainstorming` | 미확정 결정(§8) 논의 시 |
| `superpowers:test-driven-development` | P1 가드 테스트 |
| `code-review` | PR 리뷰 |

> AWS 부분은 스킬에 기댈 게 없어서 **§2의 공식 문서를 직접 봐야 한다.**

---

## 6. 이 프로젝트의 문서

| 문서 | 역할 |
|---|---|
| [`HANDOFF.md`](./HANDOFF.md) | **시작점.** 환경 설정, 툴체인 함정, PR 순서 |
| [`notion-replacement-tasks.md`](./notion-replacement-tasks.md) | 작업 목록·의존 그래프 |
| [`notion-site-inventory.md`](./notion-site-inventory.md) | 실측 데이터 + 재현 명령 |
| [`notion-db-to-s3.md`](./notion-db-to-s3.md) | 데이터·자산·편집 설계 + **§4-6 AWS 아키텍처** |
| [`notion-pages-to-web.md`](./notion-pages-to-web.md) | 공개 페이지 라우트 매핑 |
| [`design-concept.html`](./design-concept.html) | 시각 컨셉 |
| [`seminar-events.md`](./seminar-events.md) | **별개 주제** — 이 프로젝트 아님 |
