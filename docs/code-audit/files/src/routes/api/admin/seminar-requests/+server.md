# `src/routes/api/admin/seminar-requests/+server.ts` (26줄)

**접두사 `QS-`** · 관리자 폴링용 대기 세미나 신청 목록 (§8-3).

## QS-5 🟠 `seminarRequests:` (20행)는 죽은 페이로드다

`queueResponseEnvelopeSchema`가 `success`/`items`/`generatedAt`만 남기고 나머지를 버린다
(`domain/api.ts:26-30`, `client/api.ts:80-88`). 소비자는 `.items`만 읽는다
(`admin/+page.svelte:68`, `admin/seminars/+page.svelte:38`). 다른 fetcher는 없다.

**폴링마다 같은 pending 집합을 두 번 투영해 한 벌을 버린다** — QS-4보다 큰 낭비이고 같은 파일 안에 있다.
근거·범위는 `QA-5` 참조.

## QS-1 🟡 `study-requests`와 이름만 다른 동일 파일

`diff` 결과 **26줄 중 6줄만 다르고 전부 식별자**다 — 단 6행은 예외로,
`study` 쪽이 `/ BE-56` 스펙 태그를 더 단다. 나머지 20줄은 바이트 동일.
21행의 `// Shared queue envelope…` 주석은 세 파일 모두 동일.

근거·처방·제약은 `QA-1` 참조(초판의 🟠에서 🟡로 내림 — 피해 주장이 거짓이었다).

## QS-2 🟡 동적 import — 이 파일 3회, 전이적으로 4회

12·13-15·16행이 **호출 3회**로 심볼 4개를 가져온다(초판이 "4회"로 셌다 — 호출이 아니라 심볼 수다).
네 번째 호출은 `directorySummaryIndex` 안에 있다(`admin-queue-views.ts:35`). `QA-3` 참조.

## QS-3 🟡 403 본문 수기 작성

9행. `QA-4` 참조. 본문 `{error:"FORBIDDEN"}`은 `restErrorEnvelopeSchema`(`domain/api.ts:23`)와
일치하므로 동작은 옳다 — 중복만 문제다.

## QS-4 🟡 `directorySummaryIndex()`를 대기 건수와 무관하게 매번 부른다

17-18행. `pending`이 비어도 인덱스를 만든다. 30초 폴링 × 폴러 2개인 경로다.

**비용은 정확히 말해야 한다.** `directorySummaryIndex`(`admin-queue-views.ts:34-40`)
→ `getDirectoryIndex`(`directory.ts:28-40`) → `getTable("members")` + `getTable("legacy-members")`,
둘 다 `withCache` 경유(TTL 300초 Redis / 로컬 15초 상한, `tables.ts:125-129`·`cache.ts:46-53`).

- `members`는 이 요청에서 이미 따뜻하다 — `requireAdminAction` → `resolveMember`(`resolve-member.ts:43`)가 방금 읽었다
- 실제 추가 비용은 **`legacy-members` 읽기 + Map 2개 재구축**이다. 함수 자체는 메모이즈되지 않는다
- 30초 폴링에 로컬 15초 상한이면 그 읽기는 대개 Redis까지 내려간다

**DB 스캔이 아니라 캐시 읽기 + Map 할당이다.** 그래도 조건부로 옮기면 되는 한 줄이다.

## 확인했고 지적하지 않은 것

- `status === "pending"` 필터가 있다 — 반면 **정렬은 없다.** `applications`는 정렬한다.
  둘 다 각자의 SSR 로드와 일치하므로(`admin/seminars/+page.server.ts:50-52`) 드리프트가 아니다
