# `src/lib/server/services/seminar-requests.ts` (148줄)

**접두사 `LB29-`** · 세미나 신청의 수명주기(API-SPEC §5-1·§5-2·§7-2) — 제출·수정·철회는 단일 문서 CAS, 승인은 `flow_approve_seminar_request`(일정 미정 세미나 생성 + 신청 뒤집기), 반려는 CAS.

## LB29-1 🟡 반려가 존재 확인과 반환값을 캐시에서 읽는다 — 승인과 반환 계약이 다르다

137-148행 `rejectSeminar`는 `getTable`(캐시, 교차 인스턴스 최대 15초 — `cache.ts:51`)로 행을 찾아 `NOT_FOUND`를 판정하고,
**그 캐시된 행을 반환한다.** 상태 검사만 `mutate` 안에서 한다(143). 같은 파일의 `withdrawSeminarRequest`(108-115)는
찾기·권한·상태를 모두 `mutate` 안에서 한다 — 한 파일 안에서 두 방식이다.

결과:

- 반환값을 받은 라우트가 그것으로 알림을 보낸다(`admin/+page.server.ts:389-390` — `req.presenterIds[0]`, `req.title`).
  신청자가 다른 인스턴스에서 방금 제목이나 발표자를 고쳤다면 **옛 제목으로, 옛 발표자에게** 반려 통지가 간다.
- 캐시에는 있고 최신 행에는 없으면 `map`이 아무것도 바꾸지 않아 쓰기 없이 "성공"하고 통지까지 나간다. 지금은 신청 행을
  지우는 경로가 없지만(grep), 그것은 호출부 부재 논증이다 — 이 함수가 스스로 계약을 지키지 않는다.
- 승인(126-135)은 잠근 행을 흐름에서 받아 파싱한다. 둘 다 **뒤집기 전** 행(`status: "pending"`)을 `SeminarRequest`로 돌려주는데
  그 사실은 SQL 주석(`atomic_flows.sql:797` "as it was before the flip")에만 있고 이 파일의 두 함수 어디에도 없다.

처방: `withdrawSeminarRequest`처럼 찾기·검사·반환 행 포착을 `mutate` 안으로. 반환값이 "뒤집기 전"임을 JSDoc에 적는다.
통지 내용이 최신 행을 따르게 되는 **동작 변경**(경합 시에만).

## LB29-2 🟡 포스터를 승격한 뒤 권한·상태 검사에서 거절되면 승격된 파일이 고아가 된다

`updateSeminarRequest`는 70-72행에서 포스터를 assets와 백업 미러로 승격하고, 그다음 `mutate` 안에서 82-85행이
`FORBIDDEN`·`CONFLICT`를 던진다. 남의 신청이거나 이미 승인·반려된 신청을 고치려는 요청도 **파일은 영구 버킷에 남긴다.**
`submitSeminarRequest`(41 → 47)도 쓰기가 실패하면 같다. 아무 기록도 그 키를 가리키지 않고, 정리는 넘겨받은 키만 한다
(`asset-cleanup.ts:36-49`).

`records-admin.ts`의 같은 모양은 `LB28-5`. 처방도 같다 — 쓰기 실패 시 `forgetUnreferencedAssets([promotedPoster])`.
저장소 정리만 바뀌는 **동작 변경**.

## LB29-3 🟡 선호 시점의 "닫힌 집합"이 세 층에서 셋으로 다르게 다뤄진다

- 도메인: 목록 밖 값은 **거부**한다(`domain/seminars.ts:110-116`, "선택지에 없는 시점입니다.").
- 이 파일: 목록 밖 값을 **빈 문자열로 바꾼다**(18-22). 17행 주석은 이것을 "닫힌 집합 강제"라고 부른다.
- 저장 스키마: `z.string()` — **아무 값이나 받는다**(`seminar-request.ts:22-23`, 주석만 "옵션 중 하나 또는 빈 문자열").

두 호출자(`seminar/apply`·`seminar/edit`)는 모두 도메인 검증을 먼저 거치므로 18-22행은 결과를 바꾸는 일이 없다.
도메인을 거치지 않는 호출자가 생기면 잘못된 값은 **거부되지 않고 조용히 지워진다** — 사용자는 고른 시점이 사라진 이유를 모른다.
규칙을 바꾸면(예: 학기별 옵션) 두 곳을 고쳐야 하고, 저장 계층은 여전히 모른다.

같은 부류: `kind?`(32)와 `input.kind ?? null`(44). 도메인은 `kind`를 필수로 요구하고(`domain/seminars.ts:88-90`),
저장 스키마는 `null`을 "그 필드가 생기기 전의 행"으로 정의한다(`seminar-request.ts:28-31`). 이 함수는 **새 행**에 `null`을 허용해
그 구분을 무너뜨린다.

처방: 닫힌 집합을 저장 스키마로 옮기고(`z.union([z.enum(SEMINAR_TIMING_OPTIONS), z.literal("")])`) `normalizeTiming` 삭제.
`kind`를 필수로. 도메인을 거치지 않은 잘못된 호출이 거부되는 **동작 변경**, 현행 호출자에게는 구조만.

## LB29-4 🟡 `updateSeminarRequest`만 patch를 `definedOnly` 없이 펼친다

91-95행 `{ ...row, ...cleanPatch, … }`. 시그니처는 `Partial<Pick<…>>`이라 `{ title: undefined }`는 합법적인 호출인데,
펼치면 저장된 값을 `undefined`로 덮는다. 쓰기 게이트는 `title`(`min(1)`)이면 **쓰기 전체를 거부**하고, 기본값이 있는
`kind`면 `null`로 **조용히 지운다**(`seminar-request.ts:32`).

`records-admin.ts`의 수정 함수 넷은 모두 `definedOnly`를 거친다(45·136·235·320) — 이 저장소의 관례를 이 함수만 따르지 않는다.
지금 호출자(`seminar/edit/[id]/+page.server.ts:76-90`)는 모든 칸을 채워 보내므로 드러나지 않을 뿐이다.

처방: `definedOnly(cleanPatch)`. 구조만 바뀐다(현 호출자 기준).

## LB29-5 🟡 신청 수명주기가 스터디 신청과 복제돼 있다

| 동작 | 이 파일 | `studies.ts`                                    |
| ---- | ------- | ----------------------------------------------- |
| 철회 | 104-116 | 41-54 — 표 이름 외 동일                         |
| 반려 | 137-148 | 66-77 — 표 이름 외 동일(LB29-1의 캐시 읽기까지) |
| 승인 | 126-135 | 56-64 — `callFlow` + 스키마 파싱, 같은 모양     |

"대기 중일 때만 철회·반려, 철회는 신청자만"이라는 규칙이 두 번 산다. LB29-1을 고치면 `rejectStudy`도 따로 고쳐야 한다.

처방: 신청 표 이름을 받는 `withdrawRequest(table, id, memberId)`·`rejectRequest(table, id)` 하나씩. 구조만 바뀐다.

## 확인했고 지적하지 않은 것

- **승인의 원자성** — `flow_approve_seminar_request`가 신청·세미나 표를 잠그고 대기 상태를 확인한 뒤 뒤집는다
  (`atomic_flows.sql:807-811`). 이미 앵커된 세미나가 있으면 새로 만들지 않는다(`:815-816`)
- **승인 시 `currentTerm()`을 임시 학기로 넘긴다(132)** — 공개가 확정 일정으로 다시 도출한다(`atomic_flows.sql:317-322`,
  `semesterPinned: false`). 주석(129)과 일치한다
- **흐름 출력을 `SeminarRequestSchema.parse`로 검증한다(134)** — SQL이 쓴 값이 zod 게이트를 거치지 않는 틈(ATOMIC-FLOWS §3)을
  반환 경로에서 막는다
- **`updateSeminarRequest`의 권한·상태 검사가 `mutate` 안에 있다** — 최신 행 위에서 판정한다. 관리자 편집 허용은 편집 라우트의
  로드(`seminar/edit/[id]/+page.server.ts:28-34`)와 같은 규칙이다
- **`replacedPoster`는 CAS 재시도마다 다시 계산되고**, 승인된 세미나가 물려받은 키는 `referencedAssetKeys`가 세미나 행을 보고 남긴다
- **철회·반려된 신청이 포스터를 계속 가리킨다** — 신청 행은 지워지지 않는 이력이고, 키는 그 행이 참조하는 동안 살아 있는 것이 맞다
- **반려·승인 통지의 수신자가 `presenterIds[0]`이다**(`admin/+page.server.ts:379,390`) — 신청자(`requesterId`)가 아닐 수 있다.
  라우트의 선택이라 이 파일의 지적이 아니다. 해당 라우트 리뷰에서 볼 것

## 커버리지

승인·철회는 `approvals.test.ts:282-340`·`approve-request-flow.test.ts`가, 수정의 상태 거절은
`seminar-request-actions.test.ts:307`이 덮는다. `updateSeminarRequest`의 `FORBIDDEN`, 포스터 교체·고아(LB29-2),
반려 반환값의 신선도(LB29-1)는 미검증이다.

## 검증 (2026-09-28)

- LB29-1 — 확인. 반려 통지(`admin/+page.server.ts:389-390`)가 캐시된 행의 `presenterIds[0]`·`title`을 쓴다. `map`은 행이 없어도 던지지 않는다
- LB29-2 — 확인
- LB29-3 — 확인. 두 호출자 모두 `validateSeminarRequestForm`을 먼저 거친다(`seminar/apply/+page.server.ts:51`, `seminar/edit/[id]/+page.server.ts:70`)
- LB29-4 — 확인. 쓰기 게이트는 JSON 왕복 뒤 파싱하므로(`tables.ts:129-130`) `undefined`는 키가 사라진 것으로 읽힌다 — `title`은 거부, `kind`는 기본값 `null`
- LB29-5 — 확인. `studies.ts:41-54,56-64,66-77`과 표 이름 외 동일
- 누락 점검: 파일 전체와 `flow_approve_seminar_request`(`atomic_flows.sql:791-845`)를 다시 읽었다. 새 지적 없음
