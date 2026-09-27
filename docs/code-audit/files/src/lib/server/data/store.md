# `src/lib/server/data/store.ts` (138줄)

**접두사 `LA40-`** · 문서 저장소 seam. `app_tables`/`app_queues` 문서의 읽기·version-CAS 쓰기, flow RPC, `audit_log` 삽입을 Supabase(PostgREST)로 수행하고, `DATA_BACKEND=memory`이면 매 호출을 `store-memory.ts`로 넘긴다.

## LA40-1 🟠 개발·테스트 백엔드가 운영 번들에 정적으로 실리고, 호출마다 런타임 환경 변수로 갈린다

> **검증 정정**: 🟠 유지, 인과·가드 부재 모두 확인 — 수치 두 개만 바로잡는다.
> HEAD(4fba767) 작업 트리로 `pnpm exec vite build`를 다시 돌려(2026-09-27 23:39) 확인했다: `chunks/tables.js`(91.00 kB)에
> `create or replace function` 34회, `import("@electric-sql/pglite")` 2회. `catchall.func`(모든 라우트 `.func`가 이것의 심링크)에
> `pglite.wasm` 10,088,161 B · `pglite.data` 6,295,316 B · `initdb.wasm` 395,242 B(합 16.8 MB), pglite 패키지 전체 18.0 MB.
> 정정: (1) "함수 25 MB"는 `du -h`의 블록 크기다 — 실제 바이트 합은 **22.3 MB**이고 그중 약 18 MB가 PGlite다.
> (2) `storage.ts`의 분기는 13번이 아니라 **12번**이다(63·77·100·120·137·161·183·195·235·246·258·264행 — 13은 2행 import를 센 것).
> 가드: `supabase.ts:12-14`는 문자열 비교뿐이고, `src/hooks.server.ts`를 포함해 `src/` 어디에도 `DATA_BACKEND`/`isMemoryBackend`를
> `dev`나 부팅 검사로 막는 곳이 없다(`grep` 전수). `dev` 가드는 `scripts/measure/inject/probe-server.ts:16`에만 있다.

2행이 `store-memory`를 **정적으로** import하고, 45·61·78·109·123·134행의 여섯 함수가 각각 첫 줄에서
`isMemoryBackend()`(`supabase.ts:12-14` — `env.DATA_BACKEND === "memory"` 문자열 비교뿐)를 본다.
`storage.ts:3`도 같은 구조를 13번 반복한다(`LA38` 문서 "확인했고" 참조 — 근원이 하나라 여기에 모았다).

결과 두 가지:

1. **번들.** `store-memory.ts:19-23`의 `import.meta.glob(..., { eager: true, query: "?raw" })`가 마이그레이션 SQL
   전문을 서버 청크에 박는다 — 로컬 `.svelte-kit/output/server/chunks/tables.js`(2026-09-27 23:24 빌드, 91 KB)에
   `create or replace function`이 34번 들어 있다. `store-memory.ts:46`·`pglite-bootstrap.ts:19`의 동적
   `import("@electric-sql/pglite")`는 adapter의 파일 추적에 잡혀 `.vercel/output/functions/![-]/catchall.func`에
   `pglite.wasm`(10.1 MB)·`pglite.data`(6.3 MB)·`initdb.wasm`(0.4 MB)이 실린다 — 함수 25 MB 중 약 17 MB.
   `@electric-sql/pglite`가 `dependencies`(`package.json:45`)에 있는 것도 같은 결정의 흔적이다.
2. **가드 부재.** 운영에서 `DATA_BACKEND=memory`가 설정되면(값 하나 — `ops-vercel-env.sh:24`가 이 변수를
   운영에 밀어 넣는 경로다) 오류 없이 **인스턴스마다 별개의 인메모리 Postgres**가 뜬다. 쓰기는 성공 응답을 받고,
   다른 람다 인스턴스는 그 쓰기를 보지 못하며, 콜드 스타트에 전부 사라진다. `storage.ts`도 같은 스위치로
   `https://memory.test/upload/...`를 실제 브라우저에 내준다. 측정 하네스의 시드 API는 이미
   `dev`(`$app/environment`) 가드를 쓴다(`scripts/measure/README.md:35`) — 이 seam에는 없다.

"지금 운영 값은 `supabase`다"는 감면 근거가 아니다(README 판정 기준 — 설정 하나로 되살아난다).

**처방 방향.** 운영 빌드(`!dev`)에서 `memory`를 거부하는 것은 **동작 변경**(부팅 실패 또는 명시적 오류).
구현 선택을 한 곳에서 한 번 하도록 모으는 것(예: `const impl = isMemoryBackend() ? memory : supabaseImpl`)은
구조 변경이다. 단, 측정 하네스가 `vite dev`로 돈다는 사실(`scripts/measure/start.sh:57,63`)을 확인했으므로
빌드 타임 분기로 옮겨도 측정은 깨지지 않는다 — 운영 번들에서 PGlite를 빼려면 정적 import 자체를 없애야 한다.

## LA40-2 🟠 `listQueueIds`가 페이지를 넘기지 않고 순서도 정하지 않는다

108-115행은 `select("event_id")` 한 번으로 끝난다. PostgREST는 프로젝트의 **Max rows**(Supabase 기본 1000)
를 넘는 결과를 **오류 없이 자른다.** `app_queues`는 이벤트마다 한 행이고, 지워지는 경로는
`flow_delete_seminar`(세션 큐, `20260928000000_atomic_flows.sql:254`)와 `flow_delete_event`(`:645`)뿐이다 — 끝난 이벤트의 큐도
남으므로 행 수는 단조 증가한다. 1000을 넘는 순간 `listPendingQueues`(`tables.ts:231-241`) →
`getPendingAttendance`(`services/events.ts:332-334`)가 **어떤 이벤트의 대기 출석을 조용히 누락**한다.
순서가 없으므로 누락되는 쪽도 임의다.

같은 저장소의 `storage.ts:206-230`은 정확히 이 이유("without paging a large folder is silently truncated")로
`listAll`을 페이지네이션한다. 한 seam 안에서 같은 위험을 한쪽만 막았다.

그리고 대역이 실물보다 유능하다: `store-memory.ts:137`은 `order by event_id`로 결정적 순서를 준다.
테스트는 정렬된 결과를 보고, 운영은 정렬되지 않은 결과를 본다(`storage-memory.ts:96-99`가 스스로 적은
"must not be more capable than the real listing" 원칙의 위반, `W-2`와 같은 형태).

**처방.** `.order("event_id").range(...)` 루프 — **동작 변경**(1000행 초과 시 결과가 달라진다). 한계에 도달하기
전까지는 관측 차이가 없다.

## LA40-3 🟡 `writeDocIf`가 행 수를 세려고 문서 전체를 되받는다

85행·100행의 `.select()`는 인자 없이 `*`이다 — insert/update가 끝난 행의 **`doc` JSONB 전체**를 응답으로
돌려받는다. 호출부는 `data?.length`만 본다(92·105행). `members` 같은 큰 테이블 문서는 쓰기 한 번에
문서를 한 번 올리고 한 번 더 내려받는다. `.select("version")`이면 같은 판정에 수 바이트면 된다.

구조(전송량) 변경이며 의미는 같다.

## LA40-4 🟡 `rpc`가 어떤 함수 이름이든 받는다 — `flow_` 제약은 테스트 대역에만 있다

> **검증 정정**: 🟡 유지, **주장을 좁힌다.** 122·124행은 이름만 자유롭고 인자 봉투는 `{ p: args }`로 고정이다.
> PostgREST는 RPC를 **함수 이름 + 인자 이름**으로 해석하는데, `public`의 비-flow 함수 중 `app_*` 17개는
> 전부 `p_name`·`p_rows`·`p_event_id` 같은 `p_*` 이름을 쓰고, `audit_log_immutable`은 인자 없는 트리거 함수다 — `p` 하나를 받는 것이 없다(마이그레이션 전수). 따라서
> "`app_put`·`app_queue_put`을 부를 수 있다", "운영에서는 실행된다"는 **거짓이다** — 운영은 PGRST202(함수 없음)로 실패하고
> 테스트는 `rpc: bad name`으로 실패한다. 둘 다 실패이고 메시지만 다르다. 남는 결함: 이 seam의 계약(`flow_*`만)이 운영 경로의
> 타입에도 런타임에도 없어서, 앞으로 `(p jsonb)` 모양의 비-flow 함수가 생기면 그때 비로소 "테스트 거부 / 운영 실행"이 갈린다.
> `service_role`에 `app_*` 실행권이 있다는 점(`atomic_flows.sql:1157-1174`)은 사실이지만 이 seam으로는 닿지 않는다. 처방은 그대로.

122행 `rpc<T>(fn: string, ...)`. 좁히는 곳은 두 군데인데 둘 다 이 seam 밖이다:
`flows.ts:29`의 타입 `` `flow_${string}` ``과 `store-memory.ts:161`의 런타임 정규식. 운영 경로에는 아무 검사도 없고,
secret key로 붙은 PostgREST는 `public` 스키마의 함수를 전부 RPC로 노출한다 — `app_put`·`app_queue_put`
(`atomic_flows.sql:51-61,104-114`)처럼 잠금·검증 없이 문서를 통째로 바꾸는 헬퍼도 포함이다.
`store.ts`를 직접 import하는 새 호출부는 그것을 부를 수 있고, **테스트에서는 거부되고 운영에서는 실행된다.**

`store-memory`의 정규식은 SQL 문자열 보간을 막는 별개의 이유도 있으므로 지우자는 것이 아니다.
122행의 매개변수 타입을 `` `flow_${string}` ``으로 좁히는 것은 구조 변경(타입만)이다.

## LA40-5 🟡 `TABLE_OF`·`PK_OF`가 두 벌이다

32-39행과 `store-memory.ts:76-77`이 같은 매핑을 따로 적는다. `DocKind`를 하나 늘리면 두 곳 모두 고쳐야 한다.
타입이 누락은 잡아 주지만(두 쪽 다 `DocKind`로 인덱싱) 값의 일치(`"app_queues"` 철자, PK 이름)는 잡지 못한다.
`store-memory`는 이미 `./store`에서 타입을 가져오므로 상수도 같은 곳(또는 순환을 피하려면 제3 모듈)에서
가져오면 된다. 구조 변경.

## 확인했고 지적하지 않은 것

- **CAS 갱신을 `expectedVersion + 1`로 쓰는 것**(94-99행) — `WHERE version = expected` 아래에서는
  `version = version + 1`과 같은 결과다. 주석이 정확하다
- **생성 경합을 23505로 판정**(86-87행) — PK 충돌만 `false`, 나머지는 throw. `store-memory.ts:121`의
  `on conflict do nothing`은 모든 제약 충돌을 삼키지만 두 테이블에 PK 외 제약이 없어 의미가 같다
- **`Number(data.version)`**(54·69행) — `bigint` 열을 PostgREST가 JSON 숫자로 준다. 2^53 전에는 정확하다
- **`rpc` 오류가 `message`·`details`만 넘긴다**(126-129행) — `flows.ts:37-41`이 소비하는 것이 정확히 그 둘이다.
  SQLSTATE를 버리지만 소비자가 없다
- **읽기 오류를 plain `Error`로 던지는 것** — 503 분류는 상위(`tables.ts:63-71`)의 몫이고, 여기서 `AppError`를
  만들지 않는 편이 계층상 맞다. 분류가 **어디까지** 적용되는지는 `LA41-3`에서 다룬다
- **`insertAuditRow`** — 단순 삽입, 불변성은 트리거(`20260901000000_documents.sql:57-69`)가 지킨다

## 검증 (2026-09-28)

- LA40-1 — 정정 (🟠 유지. 실제 빌드로 번들·PGlite 포함 확인, 수치 두 개 보정: 함수 22.3 MB 중 ~18 MB, storage 분기 12곳. 결과 2 "가드 부재"는 배치 밖 `LA35-1`(`supabase.ts`)의 후반부와 같은 결함 — 결과 1 "번들"이 이 지적의 고유분이다. 참고로 `LA35-1`의 "Vercel 설정 스크립트는 `supabase`만 넣는다"는 `ops-vercel-env-public.sh:14`·`-preview.sh:33`에만 맞고, `ops-vercel-env.sh:24`는 `.env.prod-secrets`의 값을 그대로 민다 — 이 문서의 서술이 맞다)
- LA40-2 — 확인 (`app_queue_delete` 호출은 `:254`·`:645` 두 곳뿐, 순서·페이지 없음, 대역은 `order by`)
- LA40-3 — 확인
- LA40-4 — 정정 (🟡 유지, `{ p: args }` 봉투 때문에 `app_*` 헬퍼는 이 seam으로 호출 불가 — 미래 `(p jsonb)` 함수에 대한 결함으로 좁힘)
- LA40-5 — 확인 (`LA39-4`와 한 결함)
- 누락 점검: 여섯 함수의 오류 경로, `maybeSingle`, create 경로의 `data` 부재 처리, `Number(version)`, 헤더 주석의 `vi.mock` 서술
  (`tables.test.ts:3` 등과 일치)을 다시 읽었다 — 새 지적 없음.
