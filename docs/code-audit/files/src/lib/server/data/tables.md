# `src/lib/server/data/tables.ts` (250줄)

**접두사 `LA41-`** · 데이터 계층 계약. 테이블/큐 문서의 읽기(`getTable`/`getQueue` — `withCache` + version 조건부 캐시)와 쓰기(`mutate`/`mutateQueue` — 스키마 게이트 + CAS 재시도), 큐 목록.

## LA41-1 🟠 읽기 결과가 캐시의 원본 배열이다 — 호출자가 고치면 이 인스턴스의 캐시가 무기한 오염된다

- `fetchRows`는 버전이 같으면 `known.rows`를 **그대로** 돌려준다(100행). 새로 읽은 것도 같은 배열을
  `versionCache`에 넣고 돌려준다(106-108행).
- `withCache`의 로컬 계층도 참조를 그대로 저장·반환한다(`cache.ts:97,124-127`).
- `mutateObject`는 쓴 `parsed`를 `versionCache`에 넣고 **같은 배열**을 호출자에게 돌려준다(142·151-156행).

반환 타입은 `RowOf<N>[]`(170·182행) — 가변이다. 호출자가 `rows.sort(...)`나 `row.name = ...`를 하면
그 변경이 로컬 캐시와 `versionCache`에 들어간다. 로컬 계층은 15초 뒤 만료되지만, 다시 읽을 때
`fetchRows`가 `readVersion`만 확인하고 버전이 같으므로 **오염된 `known.rows`를 다시 준다.**
`versionCache`에는 TTL이 없다 — 오염은 **누군가 그 테이블을 쓸 때까지** 이 인스턴스에 남고, Redis 계층과
다른 인스턴스(JSON 사본)는 오염되지 않으므로 인스턴스마다 다른 데이터를 보여 준다.

작성자는 이 위험을 **입력 쪽에서만** 막았다 — 123행 `fn(structuredClone(rows))`. 출력 쪽은 호출자 관례에
맡겨져 있고, 그 관례는 손으로 지켜진다(`(member)/study/+page.server.ts:20`의 `[...studies].sort(...)`).
현재 in-place 정렬 호출부는 찾지 못했다(`.sort(` 전수 확인 — 모두 `filter`/`map` 뒤의 새 배열). 하지만
"오염시키는 호출부가 현재 없다"는 README가 순환 논증으로 명시한 감면 불가 사유다.

**처방.** 반환 타입을 `readonly RowOf<N>[]`(행도 `Readonly`)로 좁히면 타입체커가 막는다 — 구조 변경.
런타임 동결(`Object.freeze`)은 동작 변경.

## LA41-2 🟠 캐시 키 형식을 이 파일이 정하지만 내보내지 않는다 — `flows.ts`가 철자를 다시 쓴다

- 테이블 키 `` `table_${name}` ``이 172행과 189행에 **두 번** 인라인돼 있다. 큐 키만 헬퍼가 있다(195행).
- `flows.ts:45`가 `` `table_${name}` ``, `flows.ts:47`이 `` `table_attendance-queue_${id}` ``를 **다시 적어서**
  무효화한다. 테스트도 같은 문자열을 적는다(`tables.test.ts:38`의 `"table_gallery-dinner"`).

형식을 한쪽만 바꾸면 flow가 쓴 테이블의 캐시 무효화가 **아무 키도 지우지 않는다.** 오류는 나지 않고,
flow 직후의 읽기가 Redis TTL(`TTL_TABLE_MS` 300초, 29행) 동안 옛 데이터를 준다.

추가로, 큐 키가 `table_`로 시작하는 것은 `cache.ts:50-52`의 `table_` 접두사 15초 로컬 상한을 받기 위해서다 —
이 결합이 어디에도 적혀 있지 않다. 큐 키를 `queue_…`로 "정리"하면 상한이 조용히 풀린다.

**처방.** `tableCacheKey(name)`·`queueCacheKey(id)`를 export하고 `flows.ts`·테스트가 가져다 쓴다. 구조 변경.

## LA41-3 🟠 "저장소 불통 = 503" 분류가 읽기 한 경로에만 적용된다

91-93행 주석이 규칙을 적는다: "A store that cannot answer is an availability fact, not a bug: it becomes
SERVICE_UNAVAILABLE (503, retryable) instead of a bare 500 (W-5)." 적용된 곳은 `fetchRows`의 두 호출(94·101행)뿐이다.

| 경로                                      | 저장소 불통 시                    |
| ----------------------------------------- | --------------------------------- |
| `getTable`/`getQueue` → `fetchRows`       | `AppError("SERVICE_UNAVAILABLE")` |
| `mutate`/`mutateQueue` → `readDoc`(121행) | plain `Error` → 500               |
| 같은 경로 → `writeDocIf`(144행)           | plain `Error` → 500               |
| `listQueues` → `listQueueIds`(222행)      | plain `Error` → 500               |

같은 장애가 GET에서는 503("재시도하라"), POST와 관리자 대기 출석 목록(`services/events.ts:334`)에서는 500이다.
관리자 대시보드는 503 분기를 따로 가지고 있어(`domain/admin-dashboard.ts:171`) 이 차이가 화면 문구로 드러난다.
W-5(`PRIORITY.md:193-198`)는 공개 로드를 고치면서 읽기만 감쌌다 — 규칙은 "읽기"가 아니라 "저장소가 답하지 못함"으로
적혀 있다. (`flows.ts`의 `rpc` 경로도 같은 부류지만 그 파일의 몫이다.)

**처방.** `mutateObject`의 두 store 호출과 `listQueueIds`를 `unavailable()`로 감싼다. 봉투 디코드(122행)와
스키마 게이트(129-138행)는 밖에 둔다. **동작 변경**(상태 코드 500 → 503).

## LA41-4 🟡 마지막 시도가 실패한 뒤에도 백오프를 잔다

159-161행의 대기가 루프 끝에서 무조건 실행된다. `attempt === maxAttempts - 1`에서 CAS를 잃으면
`backoffBaseMs·2^attempt`를 자고 나서 163행에서 던진다 — 다음 시도가 없는 대기다.
기본값(53행 50ms)으로 테이블은 마지막 800ms, **큐는 마지막 25.6초**(`QUEUE_ATTEMPTS` 10, 51행)가 순수 낭비이고,
큐 쪽의 총 대기는 약 51초다. 상한 없는 지수 백오프에 10회라는 조합이 요청 하나를 거의 1분 붙잡는다.

(`mutateQueue`의 운영 호출부는 이제 `updateAttendanceTime`(`services/events.ts:323`) 하나다. 체크인은
`flow_check_in`으로 옮겨졌지만, flow도 `app_queue_put`으로 version을 올리므로(`atomic_flows.sql:104-114`)
51행 주석의 "check-in bursts contend on one document"는 여전히 경합 원인으로 유효하다.)

**처방.** 마지막 시도 뒤에는 자지 않는다 + 대기 상한. **동작 변경**(실패 응답까지의 지연만).

## LA41-5 🟡 대기 출석 목록이 존재했던 모든 이벤트의 큐를 매번 읽는다

`listPendingQueues`(231-241행) → `listQueues`(219-229행)는 `listQueueIds()`가 준 **모든** 큐에 대해
`getQueue`를 병렬로 부른다. 캐시가 식으면 큐마다 `readVersion` 1회(+변경 시 `readDoc`)이고,
큐 문서는 이벤트 삭제 때만 사라지므로(`LA40-2`) 호출 비용이 **이벤트 누적 수에 비례해 끝없이 는다.**
원하는 것은 `status = 'pending'`인 행이 있는 큐뿐이다 — `app_queues`에 대한 SQL 한 번
(`doc -> 'rows' @> '[{"status":"pending"}]'`)이면 된다. 호출자는 관리자 대시보드 로드 두 곳
(`(admin)/admin/+page.server.ts:82,110`).

구조 변경(결과 동일).

## LA41-6 🟡 "앱이 쓰지 않는 테이블" 불변식이 타입으로 강제되지 않는다

`FROZEN_TABLES`(46-49행)는 "no in-app write path at all"(36행)을 전제로 로컬 TTL을 120초로 늘린다.
전제는 현재 참이다 — `mutate("legacy-…")` 호출부 0, flow는 `app_rows('legacy-…')`로 읽기만 한다
(`atomic_flows.sql:723,726`). 그러나 `mutate<N extends TableName>`(179행)는 두 이름을 그대로 받는다.
누가 `mutate("legacy-members", …)`를 추가하면 컴파일되고, 다른 인스턴스는 그 쓰기를 최대 2분 늦게 본다 —
주석(41-43행)이 다른 테이블에 대해 "watch it take up to two minutes"라며 피한 바로 그 증상이다.

**처방.** `mutate`의 타입 매개변수를 `Exclude<TableName, FrozenTable>`로 좁힌다 — 좁은 타입이 _아직 없는_
호출부를 막는다. 구조 변경(타입만).

## LA41-7 🟡 (검증 추가) `versionCache`에 상한도 퇴출도 없다 — 사라진 큐의 행이 인스턴스 수명 내내 남는다

59행 `versionCache`는 `Map`이고, 지우는 곳은 `fetchRows`가 **그 키를 다시 읽다가** 문서가 없음을 볼 때(97·103행)와
`_resetDataLayerForTests`뿐이다. `listPendingQueues`가 존재하는 모든 큐를 읽으므로(`LA41-5`) 대시보드를 한 번 연
인스턴스는 모든 이벤트 큐의 행 전체를 여기에 보관한다. `flow_delete_event`로 큐가 지워지면 `listQueueIds`가 그 id를
더는 주지 않으므로 **아무도 그 키를 다시 읽지 않고**, 항목은 인스턴스가 죽을 때까지 남는다. 같은 역할의 `cache.ts`
로컬 계층은 `MAX_LOCAL_SIZE`(1000, `cache.ts:40,71-79`)로 묶여 있다 — 이 두 번째 캐시에는 그런 경계가 없다.
크기는 지금 작지만 증가 방향은 `LA40-2`·`LA41-5`와 같은 "누적 이벤트 수"다.

**처방.** 항목 수 상한(삽입 순 퇴출) 또는 `listQueues`가 받은 id 집합 밖의 `queue:` 키를 정리. 구조 변경(결과 동일,
캐시 미스 시 다시 읽을 뿐).

## 확인했고 지적하지 않은 것

- **쓰기 후 버전을 `stored.version + 1 : 1`로 추정**(152행) — `writeDocIf`가 새 버전을 돌려주지 않아
  store의 증가 규칙(`store.ts:84,97` · `store-memory.ts:121,127` · SQL `app_put`)을 네 번째로 적은 셈이다.
  그러나 추정이 틀려도 `fetchRows`(100행)가 **동등 비교**로 캐시 미스를 내고 다시 읽으므로 결과는 읽기 1회 낭비다.
  +1 규칙 아래에서는 다른 쓰기가 같은 번호를 가질 수 없어 충돌도 없다. 결함으로 올리지 않는다
- **no-op 판정을 `JSON.stringify` 비교로**(124행) — 키 순서만 바뀐 결과는 불필요한 쓰기 1회가 될 뿐 정합성은 같다
- **봉투 디코드 실패를 plain `Error`(500)로**(73-82행) — 저장된 데이터 손상은 가용성 문제가 아니다. W-5의 결정과 일치
- **`unavailable()`이 설정 오류(`SUPABASE_URL is not set`, `supabase.ts:20-21`)도 503으로 만든다** — 클라이언트 입장에서
  "서버가 지금 데이터를 줄 수 없음"이라는 뜻은 같고, W-5 실측이 이 상태를 장애로 취급했다(`PRIORITY.md:198`). 지적하지 않는다
- **쓰기 게이트가 `JSON.parse(JSON.stringify(...))`를 거친다**(130행) — 저장소에 들어갈 JSON 형태와 똑같은 입력으로
  검증하려는 의도가 139-141행에 적혀 있고 맞다
- **`tableKey`/`queueKey` 항등 함수**(55-56행) — 쓸모는 작지만 "문서 키"라는 개념에 이름을 붙이고, 해가 없다
- **`FROZEN_TABLES` 목록 자체**와 120초 값 — `tables-cache-policy.test.ts:36-56`이 고정한다
- **`_resetDataLayerForTests`** — 운영 호출부 없음, 테스트 파일 46개가 쓴다

## 검증 (2026-09-28)

- LA41-1 — 확인 (100·106-108·142·151-156행 참조 반환, `cache.ts:97,124-127` 참조 저장. 호출부의 `.sort(`·`.reverse(`·`.push(`·
  `.splice(`를 `src/lib/server`·`src/routes` 전수로 다시 봤다 — `getTable`/`getQueue` 결과를 제자리에서 바꾸는 곳은 없다
  (`archive.ts:127`의 `holders.sort`는 새로 만든 배열, `events.ts:326`의 대입은 `mutate` 콜백 안의 복제본). 판정 기준대로 감면하지 않는다.
  보충: Redis가 있으면 로컬 만료 뒤 첫 읽기는 깨끗한 JSON 사본이 받고, 오염된 `known.rows`가 다시 나오는 것은 Redis TTL(300초)도
  지난 뒤다 — "쓰기가 있을 때까지 남는다"는 결론은 그대로다)
- LA41-2 — 확인 (`flows.ts:45,47`, `tables.test.ts:38` 일치. 배치 밖 `LA32-1`(`flows.ts`)과 한 결함의 양 끝이다 — 고칠 때 하나로 센다)
- LA41-3 — 확인
- LA41-4 — 확인 (큐: 50·2^9 = 25.6초, 총 50·(2^10−1) ≈ 51초 + 지터)
- LA41-5 — 확인 (같은 로드에서 `getPendingAttendance`가 82·110행 두 번 불려 `listQueueIds` 왕복도 두 번이다)
- LA41-6 — 확인
- LA41-7 — 추가
- 누락 점검: `fetchRows`의 버전 동등 비교가 동시 쓰기에서 스스로 복구되는지, JSON 왕복(Redis)이 행 타입을 바꾸는지
  (스키마에 `Date`·`Map`·`transform` 산출 없음), `mutateObject`의 no-op 경로, 재시도 시 `fn` 재실행을 봤다 — `LA41-7` 외 새 지적 없음.
