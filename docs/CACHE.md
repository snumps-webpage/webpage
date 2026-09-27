# Caching Policy

두 가지를 다룬다 — **HTTP 캐시는 전면 금지**, 서버 내부의 **테이블 캐시**만 쓴다.

## 1. HTTP 캐시: 쓰지 않는다

- `hooks.server.ts`의 `cacheShield`가 모든 SSR 응답에 `cache-control: private, no-store`,
  `vercel-cdn-cache-control: no-store`, `cdn-cache-control: no-store`를 붙인다.
- 이유: 2026-09-01 prod 엣지가 쿠키·쿼리·no-store와 무관하게 경로 단위로 SSR 응답을 재생해 개인화
  페이지가 다른 사용자에게 서빙됐다. ISR은 그때 제거됐고(`9035cad`), 프리렌더도 제거됐다(결정 C-17).
- 재도입은 유출 원인이 플랫폼 측에서 규명된 뒤에만 검토한다 (`spec/API-SPEC.md` §1-4).
- 예외: 정적 자산(`/_app/**`)과 `/_vercel/image` 파생본(`minimumCacheTTL` 24시간 — 자산 회수가 늦게 듣는 기간이다).
- 알려진 구멍: 가드가 `throw`하는 404/403/500은 `cacheShield`를 거치지 않는다 (감사 W-23, 방식 결정 대기).

## 2. 테이블 캐시 (`src/lib/server/cache.ts`)

`withCache(key, ttlMs, fetcher, { skipCache?, localTtlMs? })` — 2단 구성.

| 단      | 저장소                               | TTL                                                                       |
| ------- | ------------------------------------ | ------------------------------------------------------------------------- |
| L1 로컬 | 인스턴스 메모리 `Map` (최대 1,000개) | `table_*` 키는 **15초 상한**. 앱이 쓰지 않는 `legacy-*` 두 테이블만 120초 |
| L2 공유 | Redis (`REDIS_URL` 있을 때만)        | 호출자 TTL 그대로 (테이블 300초)                                          |

- 쓰는 키는 두 종류뿐: `table_<name>`, `table_attendance-queue_<eventId>`. 파생 캐시는 없다.
- `mutate`/`mutateQueue`가 쓰기 성공 후 해당 키를 **자동 무효화**한다. 직접 `invalidateCache`를 부를 일은 없다.
- 무효화는 쓴 인스턴스의 로컬 + Redis에만 닿는다 — 다른 인스턴스는 로컬 TTL(15초)만큼 옛 값을 볼 수 있다.
  그래서 로컬 상한이 짧다.
- 캐시 아래에는 **version 조건부 읽기**가 한 겹 더 있다 (`data/tables.ts`): 저장된 `version`이 같으면
  문서를 다시 받지 않고 파싱된 행을 재사용한다.
- 만료 정리: 읽을 때 만료 확인 + 쓰기 시 5% 확률로 가지치기, 1,000개 초과분은 오래된 것부터 제거.
- Redis 오류는 전부 조용히 무시하고 원본을 읽는다.

## 3. 현재 운영 상태와 알려진 한계

- **prod에는 `REDIS_URL`이 없다** (2026-09-17 확인) — 메모리 캐시만 쓴다.
- Redis를 켜면 생기는 경쟁: 쓰기 전에 옛 문서를 읽은 다른 인스턴스가 무효화 뒤에 Redis에 옛 값을 다시
  쓸 수 있다(최대 300초). 세대 토큰이 없다 (감사 W-13).
- `skipCache`는 로컬 캐시는 채우고 Redis는 건너뛴다 — 비대칭 (감사 W-13 / pre-migration CA-1).
- `private-info`(이메일·전화번호)도 테이블 캐시에 평문으로 들어간다 — Redis를 켜면 그대로 Redis에 저장된다.
