# `src/lib/server/data/store-memory.ts` (252줄)

**접두사 `LA39-`** · `store.ts`의 PGlite 대역. 운영과 같은 마이그레이션을 인프로세스 Postgres에 적용해 테스트·`DATA_BACKEND=memory`(로컬 개발·`scripts/measure`) 백엔드로 쓴다. 테스트 제어(`__reset`·`__putRawDoc`·실패 주입)를 함께 가진다.

## LA39-1 🟡 테스트용 경합 주입(jitter)이 개발·측정 백엔드에서도 돈다 — 그리고 조절 손잡이가 죽어 있다

74행 `jitter()`가 `readDoc`·`readVersion`·`writeDocIf`·`rpc`(84·98·114·163행)마다 0~3ms 무작위 지연을 넣는다.
목적은 테스트에서 경합 창을 벌리는 것인데, 이 모듈은 헤더(2-3행)가 말하듯 **`scripts/measure`의 백엔드이기도 하다**
(`scripts/measure/start.sh:57`이 `DATA_BACKEND=memory`로 `vite dev`를 띄운다). 전후 비교 측정의 모든 store 호출에
무작위 잡음이 섞이고, 그 사실이 측정 쪽 어디에도 적혀 있지 않다.

게다가:

- `maxJitterMs`는 `let`인데 값을 바꾸는 곳이 **없다** — 31행의 초기값 3과 `__reset`(184행)의 재설정 3뿐이다.
  setter 없는 가변 변수는 상수다.
- 적용 범위가 들쭉날쭉하다 — `listQueueIds`(134-140행)·`insertAuditRow`(142-157행)에는 없다.
  "store 호출은 느리고 순서가 흔들린다"는 모델이라면 여섯 진입점 모두에 있어야 하고, 아니면 이유가 적혀야 한다.

**처방.** jitter를 테스트 제어(`__setJitter`)로 노출하고 기본값을 테스트 설정에서만 켠다. 측정·개발 경로의
**동작 변경**(지연 제거). `maxJitterMs`를 `const`로 바꾸는 것만이라면 구조 변경.

## LA39-2 🟡 `__setReadsFail`이 흉내 내는 "불통"이 두 함수에만 걸린다

30행 주석: "Simulates an unreachable data layer — the failure mode the app must survive." 그러나 스위치를 보는 곳은
`readDoc`(85행)과 `readVersion`(99행)뿐이다. **읽기인** `listQueueIds`(134행), 그리고 `rpc`·`writeDocIf`·
`insertAuditRow`는 정상 동작한다. 실제로 데이터 계층이 불통이면 여섯 경로가 모두 실패한다.

결과: `readsFail` 아래에서 flow를 호출하는 테스트는 **운영에서 불가능한 상태**(읽기는 죽고 트랜잭션 쓰기는 성공)를
본다. 현재 사용처(`routes/public-degradation.test.ts:45,53,69`)는 공개 읽기만 검사하므로 이 틈을 밟지 않는다 —
그것은 감면 근거가 아니다. 이름("reads")을 좁게 읽어도 `listQueueIds`는 빠져 있다.

**처방.** 스위치를 `listQueueIds`까지 넓히거나(이름대로), `__setUnavailable`로 바꿔 전 진입점에 건다.
테스트 대역의 동작 변경.

## LA39-3 🟡 `__reset`이 지울 테이블을 손으로 나열한다

187-191행이 `app_tables, app_queues`를 truncate하고 `audit_log`를 트리거 이름(`audit_log_immutable`)까지 박아 비운다.
마이그레이션이 테이블을 하나 추가하면(관계형 정규화가 "separate milestone"으로 예고돼 있다 — `store.ts:6-7`)
`__reset`이 그것을 모른 채 **테스트 사이에 상태가 샌다.** 실패는 순서 의존적인 테스트 결과로만 드러난다.

`pg_tables where schemaname = 'public'`을 순회해 truncate하고 트리거는 `session_replication_role = replica`로
한 번에 우회하면 목록이 사라진다. 구조 변경(현재 스키마에서는 같은 결과).

## LA39-4 🟡 `TABLE_OF`·`PK_OF` 복제

76-77행 — `store.ts:32-39`와 같은 매핑. `LA40-5`에서 다룬다(한 결함, 두 위치).

## 확인했고 지적하지 않은 것

- **`rpc`의 `flow_` 정규식**(161행) — 함수 이름을 SQL에 보간하므로(166행) 필요한 가드다. 운영 쪽에 같은 제약이 없는 것은
  `LA40-4`에서 다룬다
- **`listQueueIds`의 `order by event_id`**(137행) — 운영보다 유능한 대역이지만, 고칠 곳이 운영 쪽(정렬·페이지네이션 추가)이라
  `LA40-2`에 모았다
- **`database()`가 실패한 `opening` 프라미스를 기억한다**(42-57행) — 초기화가 한 번 실패하면 이후 호출이 모두 같은 오류로
  실패한다. 마이그레이션이 깨진 상태에서 재시도해도 결과가 같으므로 빠른 실패가 맞다. Vite가 SQL 변경 시 모듈을 다시
  평가하므로 개발 서버도 복구된다
- **`version::int` 캐스트**(87·101·249행) — `bigint`를 `int`로 줄이지만 인메모리 DB의 버전이 2^31에 닿을 수 없다
- **`__reset`이 플래그를 동기로, truncate를 큐로**(181-192행) — 헤더(10-12행)가 설명한 대로 모든 store 호출이 `pending`을
  먼저 기다리므로 순서가 맞다. `enqueue`가 실패를 삼켜 다음 호출을 막지 않게 한 것(69행)도 의도대로다
- **`rpc` 오류 모양**(170-176행) — `store.ts:126-129`와 같은 `message`+`detail`. `flows.ts:37-41`이 두 백엔드를 구분 없이 받는다
- **스냅샷/새 DB 분기**(40-58행) — 테스트만 `PGLITE_SNAPSHOT`을 쓰고 나머지는 `freshDatabase`. 두 경로 모두 같은 마이그레이션에서
  나온다(`pglite-bootstrap.ts:15-24`)

## 검증 (2026-09-28)

- LA39-1 — 확인 (`maxJitterMs` 쓰기는 31·184행뿐, `src`·`scripts` 전수)
- LA39-2 — 확인 (`__setReadsFail` 사용처 `public-degradation.test.ts:41,45,53,69`)
- LA39-3 — 확인
- LA39-4 — 확인 (`LA40-5`로의 지시 항목, 별도 결함 아님)
- 누락 점검: 실패한 `opening` 프라미스 고정, `enqueue`의 실패 삼킴, 스냅샷 분기(`process.env.PGLITE_SNAPSHOT`), `rpc` 정규식과 보간,
  단일 연결 PGlite에서 flow의 `for update`가 의미 없는 점(각 flow가 한 문장이라 원자성은 유지)을 봤다 — 새 지적 없음.
  이 모듈과 마이그레이션 SQL 전문이 운영 서버 청크에 실린다는 점은 실제 빌드로 확인했고 `LA40-1`에 있다.
