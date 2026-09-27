# `src/lib/server/data/schemas/activity.ts` (13줄)

**접두사 `LA10-`** · `activities` 테이블 행 스키마 — 활동 기록(제목·기간·종류·출석자·멱등 앵커).

지적 없음.

## 확인했고 지적하지 않은 것

- **`type: ActivityType`(8행)** — `common.ts:24`의 저장 가능 집합(5종)을 쓴다. 그 이름이 `$lib/constants`의
  표시용 `ACTIVITY_TYPES`(7종)와 충돌하는 문제는 이 파일이 아니라 별칭을 만든 `common.ts`의 것이다 — `LA13-1`
- **`attendeeIds`(9행)에 중복 제거가 없다** — 집합 의미는 쓰기 쪽(`records-admin.ts` `setAttendees`, SQL 흐름)이
  맡는다. 저장 스키마는 모양 게이트이고 이 코드베이스는 행 간·배열 내부 불변식을 스키마에 두지 않는다(유일한 예외는
  세미나 일정의 교차 필드 검사). 이 파일만 달리 요구하면 기준이 흔들린다
- **학기 필드가 없다** — 공개 아카이브가 `date.start`에서 도출한다. 저장값이 도출값과 어긋날 여지가 없으므로 옳다
- **`date: DateRange`의 `end`가 `start`보다 뒤인지 검사하지 않는다** — `DateRange`(`common.ts:26-29`)의 성질이고,
  세미나 일정이 따로 하는 비교가 문자열 비교라 오히려 틀렸다(`LA26-1`). 여기에 같은 검사를 복제하자고 하지 않는다
- **`sourceRequestId`(10행)** — 형식 문서화의 누락은 `LA13-3`
- `z.infer` 별칭(13행) — 유지 관례(`487a8fb`)

## 검증 (2026-09-28)

- 지적 없음 — 확인. 확인 항목의 사실(`common.ts:24` 5종 enum, `LA13-1`·`LA26-1`·`LA13-3` 상호참조)을 코드와 대조했다
- 누락 점검: 13행 전체를 재독. `title: z.string().min(1)`이 입력(`admin-records.ts:74` `trim().min(1).max(160)`)보다 헐겁지만 이 파일은 `seminar.ts:21-22` 같은 동등성 약속을 하지 않으므로 지적하지 않는다. 추가 없음
