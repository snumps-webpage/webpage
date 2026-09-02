# 성능 최적화 기록 (Performance Notes)

> **성격**: 적용된 성능 최적화의 **무엇을·어떻게·왜**를 남기는 살아있는 문서.
> 새 최적화가 들어가면 여기에 절을 추가한다. 되돌리는 방법도 함께 적는다.

## 1. 아카이브 사진 — Vercel 이미지 최적화 (2026-08-30)

### 문제

공개 갤러리 그리드(`/archive/gallery`)가 Supabase Storage의 **원본 사진을
그대로** 로드했다. 원본은 장당 1~2MB(실측 1,576KB), 43장 그리드면 총 60MB+ —
로딩이 눈에 띄게 느렸다.

### 선택한 방식

**그리드 = 저화질 변환본, 클릭(상세) = 원본.** 변환본은 저장하지 않고 Vercel
내장 이미지 최적화(`/_vercel/image`)로 **요청 시 엣지에서 생성**한다.

- 원본 파일은 어떤 경우에도 변형·복제하지 않는다 (assets 버킷 그대로).
- 변환: 요청 폭에 맞춘 리사이즈 + WebP 인코딩, 결과는 Vercel CDN에 캐시
  (`minimumCacheTTL` 30일).
- 실측 효과: 동일 사진 **1,576KB → 18.6KB** (640px WebP, 약 1/85).

### 구성 요소 (수정 지점)

| 파일 | 역할 |
|---|---|
| `svelte.config.js` → `adapter({ images: … })` | 최적화 허용 도메인(prod/dev Supabase)·사이즈(480/640/960/1280)·포맷(webp)·캐시 TTL 선언. 빌드 시 `.vercel/output/config.json`의 `images`로 내려간다 |
| `src/lib/image.ts` | `thumbUrl(src, width, q)` — `/_vercel/image?url=…&w=…&q=…` 래퍼. `thumbSrcset(src)` — 480/640/960 srcset 문자열. **dev에서는 둘 다 원본으로 폴백** (로컬엔 최적화 엔드포인트가 없음) |
| `src/routes/(public)/archive/+layout.server.ts` | 갤러리 아이템의 `thumbnailUrl`만 `thumbUrl(원본, 640)`으로. `displayUrl`(클릭 대상)은 원본 유지 |
| `src/routes/(public)/archive/gallery/+page.svelte` | `<img srcset sizes loading="lazy" decoding="async">` — 브라우저가 그리드 칸 폭(3열 33vw / 2열 50vw / 1열 100vw)에 맞는 크기만 받는다 |
| `src/routes/(public)/archive/seminars/[id]/+page.svelte` | "3. 활동 사진" 섹션 신설 — 960px 변환본 2열 그리드, 클릭 시 원본 새 탭 |

### 왜 사전 생성 썸네일이 아니라 이 방식인가

- 스토리지 중복 0 (무료 플랜 1GB 한도 보호), 기존 57장 배치 변환 불필요.
- 업로드/이주 파이프라인 무수정 — **앞으로 올라오는 사진도 자동 적용**.
- 대신 Vercel 의존이 생기지만, 배포 자체가 Vercel이라 추가 결합이 아니다.

### 제약·주의

- **Hobby 플랜 한도**: 이미지 최적화는 원본 이미지 종수 기준 무료 구간이
  있다(수천 장 규모). 현재 57장 + 완만한 증가라 여유가 크지만, 한도 경고가
  오면 아래 "롤백/전환"으로 사전 생성 방식 전환.
- `thumbUrl`의 width는 반드시 `svelte.config.js`의 `images.sizes` 값 중
  하나여야 한다 — 목록 밖 값은 400 에러.
- 새 Supabase 프로젝트(리전 이전 등)가 생기면 `images.domains`에 추가할 것.

### 롤백/전환 방법

- **끄기**: `src/lib/image.ts`의 두 함수가 항상 `src`를 반환하게 하면 끝
  (호출부는 전부 이 헬퍼만 쓴다).
- **사전 생성 방식으로 전환**: 헬퍼가 `…/thumb/` 경로를 반환하게 바꾸고,
  업로드 승급(`services/uploads.ts`)에 리사이즈 단계 + 기존분 배치 스크립트를
  추가한다. 호출부 수정 불필요.

### 후속 후보 (미적용)

- 공개 페이지 응답 ISR/캐시 (API-SPEC §1-4의 `revalidate: 60` 미구현 상태)
- 대시보드 로드의 테이블 조회 병렬화·프로젝션 축소
