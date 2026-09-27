# `src/lib/server/data/schemas/attendance-record.ts` (17줄)

**접두사 `LA12-`** · 출석 요청 큐의 행 스키마 — 이벤트별 문서에 저장되며 `TABLES` 레지스트리 밖에 있다.

## LA12-1 🟡 저장 위치 주석이 이관 이전 저장소를 가리킨다

4-7행: "Stored per event as `tables/attendance-queue/<eventId>.json.gz`". 현재 큐는 Postgres
`app_queues`의 `event_id` 행이다(`store.ts:32-39`, `20260901000000_documents.sql`). gzip도 없다
(`documents.sql:19` "no gzip"). "레지스트리 밖"이라는 두 번째 사실은 여전히 옳다.

결과: 이 주석을 따라 저장소에서 큐를 찾는 사람은 존재하지 않는 경로를 찾는다. 구조·동작 변경 없음, 주석 교체만.

## LA12-2 🟡 상태 집합이 도메인에 따로 선언돼 있다

14행 `z.enum(["pending", "approved", "rejected"])`는 이름 없는 인라인 enum이고, 같은 집합이
`domain/admin-dashboard.ts:7` `AdminAttendanceStatus`에 문자열 유니온으로 다시 있다.
`seminar.ts:2,7`이 이미 보여 준 방식(도메인 배열 하나 → 저장 스키마가 `z.enum(ARRAY)`)을 따르지 않았다.

결과: 상태를 하나 늘리려면(예: 취소된 요청) 두 곳을 고쳐야 한다. 저장→도메인 방향의 누락은 대입 지점에서 컴파일러가
잡지만, 도메인에만 추가하면 화면은 그 상태를 다루고 저장 게이트는 거부한다. 구조 변경만.

## 확인했고 지적하지 않은 것

- **`eventId`(11행)가 문서 키와 중복된다** — 큐는 이벤트별 문서라 행의 `eventId`는 문서 키와 항상 같아야 한다.
  어긋난 행을 스키마가 막지 못하지만, 이것은 문서 키를 스키마가 볼 수 없는 구조의 한계이고 쓰기 경로
  (`mutateQueue`, SQL `app_queue_put`)가 문서 키로만 행을 만든다. 행을 단독으로 넘길 때(관리자 목록) 필요한 필드다
- **`endTime: DateTime.nullable()`(13행)** — 관리자 목록이 `r.endTime ?? r.startTime`으로 다룬다
  (`(admin)/admin/+page.server.ts:130`). 의미가 명확하다
- **`AttendanceRecord` 별칭(17행)** — `tables.ts:9`가 쓴다

## 검증 (2026-09-28)

- LA12-1 — 확인 (`store.ts:32-39`, `documents.sql:19` "no gzip" 인용 일치)
- LA12-2 — 확인 (`domain/admin-dashboard.ts:7` `AdminAttendanceStatus` 일치)
- 누락 점검: 17행 재독. `expectTablesValid`가 큐 문서도 `AttendanceRecordSchema`로 엄격 디코드함을 확인했다(`expect-tables-valid.ts:49-51`) — SQL 흐름이 쓴 큐 행도 테스트로 묶여 있다. 추가 없음
