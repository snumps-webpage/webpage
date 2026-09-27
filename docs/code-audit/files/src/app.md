# `src/app.html` (17줄)

**접두사 `LD04-`** · SvelteKit HTML 셸 — 문서 언어, 뷰포트, Google Fonts 로드, `%sveltekit.head%`/`%sveltekit.body%` 자리.

## LD04-1 🟡 글꼴 목록이 타이포그래피 토큰의 둘째 사본이다

9행의 URL이 다섯 가족과 굵기를 적는다 — JetBrains Mono 400-800, Noto Sans KR 400-900, Noto Serif KR 400-700, STIX Two Math, STIX Two Text(이탤릭 포함).
같은 가족 이름이 `lib/manuscript.css:51-56`의 토큰(`--font-body`·`--font-display`·`--font-math`·`--font-mono`)과
`components/poster/SeminarPoster.svelte`의 개별 `font-family`(예: 461·508행)에 다시 적혀 있다. 이름으로만 이어진 두 목록이다.

- 토큰에 가족을 더하고 이 URL을 잊으면 브라우저는 조용히 다음 후보로 떨어진다 — 오류도 경고도 없다
- 굵기 목록의 일부(Noto Sans KR 900, JetBrains Mono 800)는 포스터 한 컴포넌트의 사용(`SeminarPoster.svelte:371,389,419,455,502`)에서 온다. 그 사실이 어디에도 적혀 있지 않아, 포스터가 바뀌어도 이 목록을 줄일 근거를 찾을 수 없다

처방: 로드 선언을 토큰 옆(`manuscript.css`의 `@import` 또는 루트 레이아웃의 `<svelte:head>`)으로 옮겨 한 파일이 가족 목록을 소유하게 한다. 구조 변경.

## 확인했고 지적하지 않은 것

- **`preconnect` 두 줄**(6-7행) — CSS 호스트와 글꼴 파일 호스트(`crossorigin`)를 각각 연다. 글꼴 파일은 CORS 요청이므로 `crossorigin`이 있어야 연결이 재사용된다. 맞다
- **`display=swap`**(9행) — 글꼴 도착 전에 대체 글꼴로 텍스트를 그린다. 보이지 않는 텍스트 구간이 없다
- **`data-sveltekit-preload-data="hover"`**(14행)·`display: contents` 래퍼(15행) — SvelteKit 기본 템플릿 그대로다
- **`lang="ko"`**(2행) — 콘텐츠 언어와 맞다
- **파비콘이 셸에 없다** — 루트 레이아웃이 `<link rel="icon">`을 넣는다(`+layout.svelte:3,81`). 빌드 해시가 붙는 자산이라 그쪽이 맞다
- **외부 글꼴 CDN 의존** — 제3자 요청이라는 선택은 설계 판단이고 논리 결함이 아니다. 요청 하나가 실패해도 대체 글꼴로 렌더된다

## 검증 (2026-09-28)

- LD04-1 — 확인 (`manuscript.css:51-56` 토큰, `SeminarPoster.svelte` 900·800 사용처 대조 — JetBrains Mono 800은 `.info-item`(800) 안의 `.info-key`가 상속으로 쓴다)
- 누락 점검: 17행 전체 — 뷰포트, preconnect, `display=swap`, 셸 자리표시자, CSP/nonce 부재(설정된 CSP가 없어 자리표시자가 필요 없다). 추가할 결함 없음
