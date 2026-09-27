# `src/lib/server/data/flows.ts` (50줄)

**접두사 `LA32-`** · 여러 문서 쓰기의 유일한 경로 `callFlow` — plpgsql `flow_*` 호출, RAISE된 코드 → `AppError` 변환, 흐름이 보고한 표·큐의 캐시 무효화.

## LA32-1 🟠 캐시 키 형식을 `tables.ts`에서 복사해 쓴다

45-47행:

```ts
for (const name of out.touched ?? []) await invalidateCache(`table_${name}`);
for (const id of out.touchedQueues ?? [])
  await invalidateCache(`table_attendance-queue_${id}`);
```

이 두 문자열은 `tables.ts`가 **읽을 때** 쓰는 키의 복사본이다 — 표는 `tables.ts:172`(`getTable`)·`:189`(`mutate`),
큐는 **비공개** `queueCacheKey`(`tables.ts:195`). 키 형식의 주인은 `tables.ts`인데, 이 파일은 그 함수를 import할 수
없어서(내보내지 않았다) 형식을 다시 적었다.

`tables.ts`가 키를 바꾸면(예: 큐 키에서 `table_` 접두를 떼어 `cache.ts:51`의 15초 상한 대상에서 빼기) 이 파일의
무효화는 **존재하지 않는 키를 지우고 아무 오류도 내지 않는다.** 흐름이 커밋한 변경을 쓴 인스턴스조차
`TTL_TABLE_MS` 300초(`tables.ts:29`) 동안 옛 상태를 읽는다. 테스트는 memory 백엔드에서도 같은 캐시를 쓰므로
흐름 직후 읽기를 단언하는 테스트가 있으면 잡히겠지만, 그것은 우연한 보호다.

**고침**: `tables.ts`가 `invalidateTable(name)`·`invalidateQueue(eventId)`를 내보내고 이 파일은 그것만 부른다. 구조만 바뀐다.

## LA32-2 🟠 무효화의 정확성이 SQL 함수마다 손으로 적은 `touched` 목록에 달려 있고, 아무것도 대조하지 않는다

17-20행의 `FlowResult`는 `touched?: string[]` — `TableName`이 아니다. 목록은 16개 흐름이 각자 손으로 누적한다
(`atomic_flows.sql:206,257,273,306,342,365,400,438,469,494,507,…`). 실제로 `app_put`한 문서와 보고한 이름이
같다는 것은 **각 함수 작성자의 주의**로만 보장된다.

- 표를 쓰고 목록에 빠뜨리면 → 그 표의 캐시가 남아 방금 성공한 변경이 최대 300초 안 보인다
- 이름을 틀리면(`seminar_requests` 등) → `LA32-1`과 같은 조용한 무효화 실패
- `touched`를 대조하는 테스트는 **없다**(`grep touched *.test.ts` → 무관한 2건뿐)

ATOMIC-FLOWS가 SQL 규칙 미러에는 고정 테스트를 붙였는데(`flow-rules.test.ts`), 이 목록은 "함수가 쓰는 것"의
미러이면서 고정 테스트가 없다 — 브리프의 기준 그대로 **고정 없는 미러**다.

**고침(둘 중 하나)**: (a) 흐름 테스트 공용 훅에서 호출 전후 `app_tables.version`을 비교해 바뀐 표 집합 == `touched`를
단언, 또는 (b) `app_put`/`app_queue_put`이 트랜잭션 로컬 설정에 이름을 누적하고 함수가 그것을 반환. (a)는 구조만,
(b)는 SQL 변경이다. 어느 쪽이든 `touched`의 TS 타입을 `TableName[]`으로 좁힌다.

## ~~LA32-3 🟡 오류 분류가 "RAISE된 앱 코드 / 그 밖의 전부" 둘뿐이다 — 경합이 500이 된다~~ (철회)

> **검증 정정**: **철회.** 인과 주장("경합이 500이 된다")이 이 흐름들의 잠금 방식에서는 성립하지 않는다.
> 흐름은 낙관적 CAS가 아니라 **비관적 잠금**이다 — `app_lock`/`app_queue_lock`이 `FOR UPDATE`를 `NOWAIT` 없이 걸고
> (`atomic_flows.sql:46,88`), 저장소 어디에도 `lock_timeout`·격리 수준 설정이 없다(`grep` 0건; 함수는 `search_path`만 설정).
> 따라서 경합하는 두 번째 흐름은 **기다렸다가** 커밋된 상태를 새 문장 스냅숏으로 다시 읽고(READ COMMITTED,
> `app_rows`는 매 문장 새로 읽힌다) 성공하거나 앱 코드(`CONFLICT` 등)로 끝난다. 오류로 나오지 않는다. 지적이 든 SQLSTATE별로:
>
> - `55P03`(lock_not_available) — `NOWAIT`이나 `lock_timeout`이 있어야 난다. 둘 다 없다
> - `40001`(serialization_failure) — REPEATABLE READ/SERIALIZABLE에서만 난다. PostgREST 기본은 READ COMMITTED이고 흐름이 바꾸지 않는다
> - `40P01`(deadlock) — 흐름 간 순환 대기가 생기지 않는다: `app_lock`은 한 호출 안에서 `order by name`,
>   모든 호출부의 배열이 이름순이고, 표를 잠근 뒤 큐를 잠그며, 두 `FOR SHARE`(`:532` events→큐, `:1029` members→studies)도
>   같은 순서 위에 있다. TS 쪽 CAS 쓰기는 한 행 한 문장이라 순환에 끼지 못한다. 교착이 난다면 그것은 순서 규약을 어긴
>   **코드 버그**이고, 버그를 5xx로 내는 것은 맞는 분류다
>
> 남는 경로는 잠금 대기가 역할의 `statement_timeout`을 넘는 경우(`57014`)뿐인데, 그것은 잠금을 쥔 쪽이 타임아웃보다
> 오래 돈 **서버 쪽 지연**이지 사용자 경합이 아니다 — C-21(`errors.ts:29-31`)의 논리는 "CAS에서 지는 것은 설계상 정상"이라는
> 낙관적 동시성에 대한 것이라 여기로 옮겨 오지 않는다. PGlite(memory) 백엔드는 연결 하나라 경합 자체가 없다.
> `store.rpc`가 `error.code`를 버린다는 사실(`store.ts:126-129`)은 맞지만, 메시지 문자열에 원인이 남아 로그 구분은 되고,
> 지금 코드가 그 코드로 내려야 할 분기가 없다. 결함으로 남길 근거가 없어 철회한다.

37-43행은 `e.message`가 `ERR` 키면 `AppError`, 아니면 그대로 던진다. 그런데 `store.rpc`는 PostgREST 오류에서
`message`와 `details`만 옮기고 **SQLSTATE(`error.code`)를 버린다**(`store.ts:126-129`). 그래서 이 함수는
잠금 대기 시간 초과·교착(`55P03`, `40P01`)·직렬화 실패(`40001`) 같은 **경합**을 SQL 버그와 구별할 수 없고,
둘 다 500이 된다.

같은 저장소의 단일 문서 경로는 경합을 `WRITE_CONFLICT`(409)로 낸다 — 그리고 `errors.ts:29-31`(C-21)이 그 이유를
적는다: "사용자 경합을 5xx로 내면 서버 장애로 청구된다 — 5xx는 이 프로젝트의 크론 경보 축이다."
흐름 경로는 그 결정의 적용을 받지 않는다. (교착은 잠금 순서 규약이 막으려 하지만 규약은 코드가 아니다.)

**고침**: `store.rpc`가 `code`도 옮기고, 여기서 경합 SQLSTATE를 `WRITE_CONFLICT`로 매핑. 상태 코드가 바뀌는 **동작 변경**.

## 확인했고 지적하지 않은 것

- **`messages` 매핑이 없는 DETAIL은 기본 문구로 떨어진다(40)** — "코드가 계약이고 문구는 보조"라는 25-27행 설계대로다.
  호출자가 모든 이유를 매핑했는지 검사하지 않는 것은 결함이 아니다
- **실패 시 무효화하지 않는다** — RAISE는 트랜잭션 전체를 롤백하므로 비울 것이 없다. 맞다
- **응답이 유실되면(커밋 후 네트워크 오류) 무효화도 유실된다** — TS는 이 경우 `touched`를 알 수 없고, 결과는
  TTL로 한정된다. 원리적 한계라 지적하지 않는다
- **`APP_CODES`가 SQL이 내지 않는 코드(`UNAUTHORIZED` 등)도 포함** — SQL이 앱 코드를 RAISE하는 한 전부 유효한 매핑이다
- **무효화를 순차 `await`** — `invalidateCache`는 Redis 오류를 삼키므로(`cache.ts:150-159`) 커밋 후 여기서 던지지 않는다
- **메모리 백엔드의 오류 모양** — `store-memory.ts:170-175`가 PostgREST와 같은 `message`+`detail` 모양을 만든다.
  두 백엔드가 같은 계약을 준다(`ATOMIC-FLOWS.md` §4 끝)

## 검증 (2026-09-28)

- LA32-1 — 확인(`tables.ts:172,189,195`의 키 형식, `queueCacheKey` 비공개, `TTL_TABLE_MS`)
- LA32-2 — 확인. 16개 흐름의 `app_put`/`app_queue_put`/`app_queue_delete` 대상과 `touched`/`touchedQueues`를 전수 대조했다 —
  **현재는 모두 일치**(`flow_update_study_session`은 조건부 쓰기에도 두 표를 항상 보고해 과잉 무효화일 뿐). 일치가 손으로
  유지된다는 지적 자체는 그대로다
- LA32-3 — 철회(위 정정: `FOR UPDATE` 무`NOWAIT`·무`lock_timeout`·READ COMMITTED에서는 경합이 대기로 흡수되고, 교착은 순서
  규약상 불가, 남는 `57014`는 사용자 경합이 아니다)
- 누락 점검: 모든 흐름이 객체를 반환하는지(`out.touched` 접근이 커밋 뒤 던지지 않는지)·`APP_CODES` 매핑·실패 시 무효화
  생략을 확인. 추가 없음.
