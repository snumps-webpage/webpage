# `src/lib/server/data/supabase.ts` (25줄)

**접두사 `LA35-`** · Supabase 클라이언트를 만드는 유일한 모듈(지연 생성·싱글턴)과 `DATA_BACKEND=memory` 판정.

## LA35-1 🟠 백엔드 스위치가 값 검증도, 운영 차단도 없다

> **검증 정정**: 근거 한 줄을 바로잡는다 — 결론은 **강화**되고 등급(🟠)은 그대로다.
> "Vercel 설정 스크립트는 `supabase`만 넣는다"는 미리보기·공개용(`ops-vercel-env-preview.sh:33`,
> `ops-vercel-env-public.sh:14`)에만 맞다. **운영용** `scripts/ops/ops-vercel-env.sh:24`는 `add DATA_BACKEND "$DATA_BACKEND"` —
> `.env.prod-secrets`에 적힌 값을 **그대로 복사**한다(빈 값이면 건너뛰어 미설정 = supabase). 즉 운영 값을 정하는 것은
> 스크립트가 아니라 한 비밀 파일의 한 줄이고, 그 줄이 `memory`여도 막는 곳이 없다.
> 또 memory 경로가 운영에서 실제로 **돈다**는 것도 확인했다: `@electric-sql/pglite`는 `dependencies`(`package.json:45`)이고
> 마이그레이션 SQL은 `import.meta.glob(..., { eager: true })`로 번들에 들어간다(`store-memory.ts:19-23`). 실패해서 드러나는
> 경로가 아니라 빈 DB로 성공하는 경로다. 서버리스 인스턴스마다 PGlite가 따로 떠서 인스턴스 간에도 데이터가 갈린다.

13행 `return env.DATA_BACKEND === "memory";`

문서는 값을 둘로 정의한다 — `supabase | memory`(`SETUP.md:69`, `OPERATOR-TODO.md:160`, `SUPABASE-MIGRATION-SPEC.md:206`).
코드는 "`memory`인가, 아니면 전부 supabase"다:

- 오타·대소문자(`Memory`, `memroy`)·빈 값은 **조용히 supabase**다. 로컬에서 memory를 의도하고 dev 키가 설정된 환경이면
  실제 dev 프로젝트에 쓴다
- 반대 방향이 더 크다: `memory`는 "dev 오프라인 보조, 재시작 시 소멸"(`SETUP.md:69,89-90`)인데, 운영 배포에서 이 값을
  거부하는 곳이 없다(`hooks.server.ts`·`core/` 어디에도 `DATA_BACKEND` 참조 없음). 설정 하나로 운영이 인프로세스
  PGlite로 바뀌면 **모든 가입·승인·출석이 성공 응답을 받고 콜드 스타트 때 사라진다**(`store-memory.ts:8`). 오류는 없다

README 판정 기준대로 "환경 변수가 그렇게 설정돼 있지 않다"는 감면 근거가 아니다 — 설정 하나로 살아나는 경로다.

**고침**: 값을 열거형으로 파싱해 모르는 값이면 던지고, `memory`는 `dev`(`$app/environment`)가 아닐 때 거부.
memory를 켜는 실행기는 전부 dev 서버다 — `scripts/measure/start.sh:57,63`은 `vite dev`로 띄우고, 그 주입 API도 이미 같은
가드를 쓴다(`scripts/measure/inject/probe-server.ts:16` `!dev || env.DATA_BACKEND !== "memory"`). Vercel 설정 스크립트는
`supabase`만 넣는다(`scripts/ops/ops-vercel-env-*.sh`). 즉 선례가 저장소 안에 있고, 이 파일에만 없다.
잘못된 설정에서 요청이 실패하게 되는 **동작 변경**.

## LA35-2 🟡 모듈 주석의 경계 서술이 실제보다 좁고, 백엔드 선택이 클라이언트 모듈에 있다

6행 "Everything above goes through store.ts" — `storage.ts`도 `getSupabase`·`isMemoryBackend`를 직접 쓴다
(`storage.ts:2`, `:63-266` 전반 — `getSupabase` 11곳). `ARCHITECTURE.md` §Data Layer "경계"는 데이터는 `store.ts`, 파일은 `storage.ts`라고
둘을 적는다. 주석만 읽으면 `storage.ts`가 경계 위반처럼 보인다.

또 `isMemoryBackend`(12-14)는 `store`와 `storage` **둘 다의** 백엔드 선택인데 "Supabase 클라이언트를 만드는 유일한
모듈"에 들어 있다. `LA35-1`의 고침(파싱·차단)이 들어갈 자리로도 이 파일은 맞지 않는다 — `data/backend.ts` 같은 한 곳이 낫다.
구조만 바뀐다.

## 확인했고 지적하지 않은 것

- **지연 생성 + 모듈 싱글턴(9, 17-23)** — 서버리스 인스턴스당 클라이언트 하나. env는 첫 호출에 한 번 읽힌다. 맞다
- **`persistSession: false`(22)** — 서버 비밀 키 클라이언트에 세션 저장은 무의미하다. 맞다
- **env 누락 시 평범한 `Error`(20-21)** — 읽기 경로에서는 `tables.ts`의 `unavailable()`이 이를 `SERVICE_UNAVAILABLE`(503,
  재시도 가능)로 바꾸고, `mutate`·`rpc` 경로에서는 500이 된다. 영구적 설정 오류가 읽기에서는 "일시 장애"로 보이는 셈이지만,
  분류는 `tables.ts`의 몫이라 이 파일의 지적으로 올리지 않는다
- **클라이언트 재생성 경로 없음** — 키 교체는 재배포로 반영된다. 서버리스에서 정상이다

## 검증 (2026-09-28)

- LA35-1 — 정정(근거 교정: 운영 스크립트는 값을 `.env.prod-secrets`에서 복사한다; PGlite가 런타임 의존성이라 운영에서 조용히
  동작함을 확인. 등급 불변 🟠). `hooks.server.ts`·`core/`에 `DATA_BACKEND` 참조 0건, 선례 가드
  `scripts/measure/inject/probe-server.ts:16` 확인
- LA35-2 — 확인(`storage.ts`의 `getSupabase()` 11곳)
- 누락 점검: 싱글턴 생성, env 누락 오류, `persistSession: false`를 확인. 추가 없음.
