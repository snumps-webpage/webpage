# Notion 공개 페이지 → Vercel 웹앱 이주 계획

> **성격**: 한시적 작업 문서. 이주 완료 시 삭제하고 남길 내용은 `FEATURES.md`·`ARCHITECTURE.md`로
> 흡수. [README](./README.md) 참조.

대상 인벤토리: [`notion-site-inventory.md`](./notion-site-inventory.md)
데이터/자산 이주: [`notion-db-to-s3.md`](./notion-db-to-s3.md) (별도 프로세스)

범위: **snumps.notion.site에 로그인 없이 노출된 콘텐츠 20노드**를 이 SvelteKit 앱의
실제 웹페이지로 옮긴다. `관리자 전용`은 비공개이므로 제외.

---

## 1. 🔴 최대 전제: 지금 이 앱에는 공개 영역이 없다

`src/hooks.server.ts`의 `membershipGuard`가 이렇게 걸려 있다:

```ts
const isPublic = path === "/" || path.startsWith("/auth") || path.startsWith("/api/cron");
if (isPublic) return resolve(event);
// AUTHENTICATION GUARD
if (!session?.user?.email) throw redirect(303, "/");
// 이후 회원 여부까지 검사 → 비회원은 /signup, 미승인은 /wait 로 강제 이동
```

즉 **`/` 하나를 빼면 전부 로그인 + 회원 승인이 필요하다.** `/`도 비로그인 시 표지+Abstract만
보여주는 로그인 유도 화면이다.

Notion 사이트의 콘텐츠는 정반대로 전부 공개다. 그러므로 이 이주는 페이지를 옮기는 작업이기 이전에
**앱에 공개 영역(public zone)을 신설하는 아키텍처 변경**이다. 이게 P0다.

### 결정 필요 — 공개 경로 설계

| 안 | 형태 | 장점 | 단점 |
|---|---|---|---|
| **A. 접두사 분리 (권장)** | `/about/*`, `/archive/*` 를 `isPublic`에 추가 | 가드 규칙이 단순, 실수로 보호 경로가 뚫릴 여지 적음 | URL에 접두사가 붙음 |
| B. 화이트리스트 열거 | 공개 경로를 배열로 나열 | 최소 변경 | 페이지 추가할 때마다 가드 수정, 누락 시 조용히 비공개 |
| C. 레이아웃 그룹 | `(public)` / `(app)` 라우트 그룹 | SvelteKit 관용 | 가드가 경로 문자열 기반이라 그룹명이 URL에 안 남아 매칭 불가 → **가드 재작성 필요** |

A안 기준으로 아래 라우트 표를 작성했다. C안을 택하면 가드를 `route.id` 기반으로 바꿔야 한다.

> **회귀 주의**: `isPublic` 확장은 인증 우회 경로를 넓히는 변경이다. 새 공개 경로가
> `locals.member`에 의존하지 않는지, 관리자 데이터를 흘리지 않는지 라우트별로 확인해야 한다.

---

## 2. 라우트 매핑

Notion은 slug 없이 32자 ID를 쓴다. 이주하면서 **사람이 읽는 경로로 바꾼다.**

| Notion | 신규 경로 | 렌더링 방식 | 데이터 출처 |
|---|---|---|---|
| 루트 (소개/연락처) | `/` 게스트 랜딩에 흡수 | 기존 Svelte | 정적 + 임원 DB |
| 세미나 | `/archive/seminars` | 목록 + 상세 | 세미나 기록 DB |
| 스터디 | `/archive/studies` | 목록 | 스터디 기록 DB |
| 개인 프로젝트 | `/archive/projects` | 목록 | 회원 DB 파생 |
| 활동 기록 (캘린더) | `/archive/activities` | 캘린더/표 | 활동 기록 DB |
| 갤러리 | `/archive/gallery` | 이미지 그리드 | 3개 DB의 file 속성 |
| 동아리 문서 | `/about` 허브 | 정적 | — |
| 회칙 | `/about/charter` | 정적 장문 | 마크다운 |
| 역대 회장단 | `/about/executives` | 정적 | 마크다운 또는 회원 DB `임원` |
| 선거 공약 | `/about/elections` | 정적 + PDF 링크 | 마크다운 + S3 |
| 홍보 자료 | `/about/press` | 정적 + 이미지 | 마크다운 + S3 |
| 자금 내역 | `/about/finance` | 외부 링크 | Google Sheets |
| 기타 활동 자료 | `/archive/misc` 허브 | 정적 | — |
| Integration Bee | `/archive/misc/integration-bee` | 정적 | 마크다운 |
| 문제 창작 활동 | `/archive/problems` | 파일 목록 | 마크다운 + S3 (PDF 15) |
| 채팅방 논의 모음 | `/archive/discussions` | 파일 목록 | 마크다운 + S3 (PDF 3) |
| 데이터베이스 (허브) | 이주 안 함 | — | Notion 내부 편의용 페이지 |
| 관리자 전용 | 이주 안 함 | — | 🔒 비공개 |

`/archive/*`는 "지나간 기록", `/about/*`는 "동아리 자체 정보"로 나눴다. 다른 분류를 쓸 거면
§9 결정 1번에서 확정할 것.

---

## 3. 콘텐츠를 어떻게 옮길 것인가

### 3-1. Notion 렌더러를 만들지 말 것

`react-notion-x` 류의 런타임 렌더러를 붙이면 (a) Notion API 의존이 영구화되고,
(b) presigned URL 5분 만료 문제를 매 요청 우회해야 하며, (c) 이 앱의 LaTeX/논문 디자인
(`manuscript.css`, `DESIGN_BLUEPRINT.md`)과 Notion 기본 스타일이 충돌한다.

**정적 콘텐츠는 이주 시점에 1회 변환해서 레포에 넣는다.**

| 원본 블록 | 변환 결과 |
|---|---|
| `header` / `sub_header` | `##` / `###` |
| `numbered_list` | `1.` (회칙의 조문 번호는 의미가 있으므로 순서 보존 필수) |
| `text` | 문단. 빈 `text` 블록 다수는 버린다 |
| `toggle` | `<details><summary>` 또는 그냥 펼쳐서 평문화 |
| `column_list` / `column` | 반응형 레이아웃이 아니므로 대부분 평문화 |
| `code` | 코드 블록 (선거 공약 LaTeX 양식) |
| `file` | S3 URL 링크 |
| `collection_view` | **변환 대상 아님** — DB 뷰이므로 §3-2 |

### 3-2. DB 기반 페이지

세미나·스터디·활동·갤러리는 정적화하면 안 된다. Notion DB가 계속 갱신되고, 이 앱이 이미 그
DB를 읽고 있다. 그러므로 **기존 서버 계층을 재사용**한다.

이미 존재하는 것:
```
src/lib/server/notion/seminars.ts     세미나
src/lib/server/notion/activities.ts   활동 기록 (getActivities / getAllActivities)
src/lib/server/notion/members.ts      회원
src/lib/server/cache.ts               Redis+메모리 2단 캐시
```

없는 것: **스터디 기록 DB 접근 코드가 전혀 없다.** `NOTION_DB_STUDIES`(가칭)에 해당하는
env·모듈·타입을 신설해야 한다. 회식 갤러리도 마찬가지.

> 단 §5의 데이터 이주가 S3로 가면 출처가 바뀐다. 두 문서의 §1을 반드시 같이 읽을 것.

### 3-3. 정적 마크다운 파이프라인이 아직 없다

이 앱에는 마크다운을 렌더링하는 수단이 없다 (`package.json`에 mdsvex·marked·remark 전무).
회칙·역대 회장단·Integration Bee 같은 장문을 옮기려면 하나 골라야 한다.

| 선택지 | 평가 |
|---|---|
| **mdsvex** | SvelteKit 표준. 마크다운 안에서 Svelte 컴포넌트 사용 가능. 빌드타임 처리 → 런타임 비용 0 |
| Svelte 컴포넌트로 손수 작성 | 의존성 0, 디자인 완전 제어. 회칙 34개 조문을 손으로 옮기는 건 비현실적 |
| marked 런타임 렌더 | 번들 증가 + XSS 표면. 자체 콘텐츠라 위험은 낮지만 이득도 없음 |

권장: **mdsvex**. 단 `svelte.config.js`의 `extensions`/`preprocess` 변경은
빌드 전반에 영향을 주므로 별도 커밋으로 분리하고 기존 페이지 회귀를 확인한다.

---

## 4. 🔴 개인정보 — 그대로 옮기면 안 된다

인벤토리 §5 참조. Notion에 공개돼 있다는 사실이 새 사이트에 다시 공개해도 된다는 뜻은 아니다.
새 도메인은 검색엔진에 색인되고, Notion과 달리 앱이 직접 서빙한다.

| 항목 | 현 상태 | 권고 |
|---|---|---|
| 회원 231명 이름·학과·가입일 | 전체 공개 | **공개 이주 금지.** 로그인 뒤로 옮기거나 통계(인원수)만 노출 |
| 역대 회장단 개인 이메일 8건 | 공개 | 대표 메일(`snumps0@gmail.com`)로 치환 |
| 회장/부회장 휴대전화 | 공개 (랜딩) | 본인 동의 확인. 미확인 시 대표 연락처만 |
| 홍보문 내 전 회장 휴대전화 | 공개 | 과거 문서이므로 마스킹 |
| 세미나/스터디 진행자 실명 | 공개 | 활동 기록 성격상 유지 가능. 비회원 진행자는 동의 확인 |

현 게스트 랜딩(`+page.svelte`)은 이미 임원 이름·전화번호를 Notion에서 끌어와 표시한다
(`page.data.executives`). 이주와 무관하게 이 정책 판단이 선행돼야 한다.

---

## 5. 자산(이미지·PDF) 참조

블록 첨부 24개(확인) + DB 첨부 62개 = 86개, 미해결 2개. Notion presigned URL은 **300초 만료**라 DB에
URL을 저장하는 방식이 아예 성립하지 않는다.

→ [`notion-db-to-s3.md`](./notion-db-to-s3.md)의 자산 파이프라인이 **선행**돼야 한다.
페이지 이주는 S3 키가 확정된 뒤에야 링크를 박을 수 있다. 순서 의존이 있다.

---

## 6. 기존 앱과의 중복

| Notion 페이지 | 앱에 이미 있는 것 | 처리 |
|---|---|---|
| 루트 소개문 | `/` Abstract 섹션 | 문구 통합. 중복 유지 금지 |
| 세미나 목록 | `/seminar/apply` (신청) + 대시보드 승인 세미나 | 공개 목록은 신규, 신청 흐름은 그대로 |
| 활동 기록 | 대시보드 활동 테이블 (본인 출석 기준) | 공개용은 출석자 없는 일정만 |
| 연락처 | `/` 표지의 임원 정보 | 통합 |
| 가입 신청 (Google Form) | `/signup` 자체 폼 | **Notion의 구글폼 링크는 폐기**, `/signup`으로 통일 |

Notion 홍보문이 안내하는 가입 경로가 Google Form(`forms.gle/gE4vF8a3dARBz5cv9`)인데
앱에는 `/signup`이 있다. 이주 시 창구를 하나로 합쳐야 한다.

---

## 7. 전환 이후

| 항목 | 내용 |
|---|---|
| 리다이렉트 | notion.site는 커스텀 리다이렉트를 못 건다. Notion 루트를 "새 사이트로 이동" 안내 페이지로 바꾸고 나머지는 순차 비공개 전환 |
| SEO | 신규 경로에 `<title>`/`og:` 메타 필요. 현재 앱은 `+error.svelte` 외 메타 관리가 없다 |
| 사이트맵 | 공개 경로용 `sitemap.xml` 신설 |
| 검색 색인 | Notion 페이지가 색인돼 있다면 중복 콘텐츠가 된다. 전환 완료 후 Notion 공개 해제 |
| 캐시 | 공개 페이지는 비로그인 대상이므로 CDN 캐시 가능. 현 캐시는 서버 메모리/Redis 기준이라 별도 설계 필요 |

---

## 8. 단계

```
P0  공개 영역 신설         membershipGuard 확장 + /about, /archive 레이아웃 + 회귀 확인
P1  마크다운 파이프라인      mdsvex 도입, 단독 커밋
P2  자산 이주 선행          notion-db-to-s3.md 자산 파이프라인 완료 대기 (블로커)
P3  정적 페이지 이주        회칙 → 역대 회장단 → Integration Bee → 선거 공약 → 홍보 → 문제 창작 → 채팅방 논의
P4  DB 페이지 이주          세미나 → 스터디(신규 모듈) → 활동 → 갤러리 → 개인 프로젝트
P5  통합·정리              랜딩 문구 통합, 가입 창구 일원화, 메타·사이트맵
P6  전환                   Notion 안내 페이지화 → 공개 해제
```

P3는 페이지 단위로 독립이라 병렬 가능. P4는 §3-2의 신규 모듈이 선행.

---

## 9. 결정 필요

1. **URL 체계** — `/about` + `/archive` 이분법으로 갈지, 다른 분류를 쓸지
2. **회원 DB 공개 범위** — 231명 명단을 공개 유지할지, 로그인 뒤로 옮길지, 통계만 노출할지
3. **개인 연락처** — 임원 전화번호·역대 회장단 이메일 공개 여부 (본인 동의 확인 필요)
4. **가입 창구** — Google Form 폐기하고 `/signup` 일원화가 맞는지
5. **마크다운 도구** — mdsvex 채택 여부
6. **Notion 존치 여부** — 편집 UI로 계속 쓸지(=콘텐츠 이중 관리), 완전히 떠날지.
   이 답에 따라 §3-1의 "1회 변환" 전제가 바뀐다
7. **전환 시점** — 신·구 병행 기간을 둘지, 일시 전환할지
