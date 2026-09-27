# `src/lib/server/attendance.ts` (20줄)

**접두사 `LB01-`** · 출석 병합 규칙 `mergeAttendees` 하나 — 선택이 허용 풀의 부분집합인지 검증하고, 풀 밖의 기존 출석자를 보존한 채 합친다.

## LB01-1 🟡 "유일한 병합 규칙"이 두 벌이다 — 도메인 사본은 죽은 채 테스트로 초록이다

> **검증 정정**: 결론·등급 유지, **"로직은 줄 단위로 같다"는 틀렸다 — 두 사본은 이미 다르게 동작한다.**
> 도메인 사본의 검증은 `find`로 첫 위반 id를 받아 `if (unknownMemberId)`로 판정한다(`domain/attendance.ts:23-24`).
> 풀 밖 id가 빈 문자열 `""`이면 `find`가 `""`(falsy)를 돌려주므로 **검증을 통과하고 병합된다.**
> `mergeAttendees`의 `every(pool.has)`(15행)는 같은 입력을 거부한다. 표의 "부분집합 검증" 행은 같은 규칙이 아니다.
> 이것은 지적을 약하게 하지 않고 강하게 한다 — "어느 쪽이 진짜인가"가 가정이 아니라 이미 관측 가능한 차이다.

3-8행 주석은 이것을 **"The one attendance-merge rule"** 이라고 부른다. 그런데 같은 규칙이
`src/lib/domain/attendance.ts:17-37`의 `mergeManagedAttendance`에 한 번 더 있다.

|                  | `server/attendance.ts:9-20` `mergeAttendees`         | `domain/attendance.ts:17-37` `mergeManagedAttendance`                                                         |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 부분집합 검증    | `selected.every(pool.has)` (15행)                    | `submitted.find(!managed.has)` (23행)                                                                         |
| 풀 밖 보존       | `current.filter(!pool.has)` (18행)                   | `existing.filter(!managed.has)` (32행)                                                                        |
| 합집합·중복 제거 | `[...new Set([...outside, ...selected])]` (19행)     | `[...new Set([...preserved, ...submitted])]` (35행)                                                           |
| 실패 계약        | `throw AppError("VALIDATION_FAILED")` — 메시지 없음  | `{ success:false, error, unknownMemberId }` 반환                                                              |
| 운영 호출부      | `services/events.ts:271` · `services/studies.ts:349` | **0** — `domain/studies.ts:165`의 `mergeStudyAttendance`만 부르고, 그것의 호출부도 `domain/studies.test.ts`뿐 |

로직은 줄 단위로 같고, 도메인 사본은 운영 경로에서 한 번도 돌지 않는데
`domain/attendance.test.ts`·`domain/studies.test.ts`가 초록으로 유지한다.
`upload-validation.ts`(LB08-1)와 같은 형태 — **테스트가 죽은 사본을 살려 둔다.**

결과:

- 병합 규칙을 바꾸면(예: 풀 밖 보존 조건) 한쪽만 고쳐도 두 테스트 스위트가 모두 초록이다. 어느 쪽이 진짜인지를 이름도 위치도 알려 주지 않는다 — 오히려 `domain/`에 있는 쪽이 규칙처럼 보인다
- 도메인 사본만 가진 것이 하나 있다 — `domain/studies.ts:171-174`의 필드 메시지 "현재 스터디 참여자만 출석 처리할 수 있습니다." 운영 경로(`mergeAttendees`)는 `userMessage` 없이 `VALIDATION_FAILED`만 던지므로 스터디 출석 저장 실패 시 사용자는 일반 문구를 본다

처방은 구조 변경: 하나를 지우고 남은 하나를 두 서비스가 쓴다. 순수 함수(의존은 `AppError` 하나)이므로
도메인 쪽에 두고 서버가 실패를 `AppError`로 옮기는 편이 계층상 자연스럽다.
도메인 사본의 메시지를 살리면 **동작 변경**(스터디 출석 실패 문구)이 따라온다.

## LB01-2 🟡 주석이 호출부를 하나 더 센다

4-5행: "shared by presenter save, organizer save, **and queue approval**."
큐 승인은 이 함수를 부르지 않는다 — `flow_decide_attendance`(`supabase/migrations/20260928000000_atomic_flows.sql:593-600`)가
plpgsql 안에서 `attendeeIds`에 한 명을 덧붙인다(이미 있으면 건너뜀).

규칙상으로는 모순이 없다 — 한 명 추가는 `pool = selected = {id}`인 퇴화 사례이고, "명단을 통째로 덮어쓰지 않는다"를 지킨다.
문제는 주석이 **TS 함수 하나가 세 경로를 모두 소유한다**고 말하는 것이다. 다음 사람이 병합 규칙을 바꿀 때
큐 승인까지 바뀐다고 믿게 된다. 문구만 고치면 된다(구조 변경 없음).

## 확인했고 지적하지 않은 것

- **검증이 병합 전에 일어난다**(15-17행) — 풀 밖 id를 하나라도 포함한 선택은 통째로 거부된다. 부분 적용이 없다. `API-SPEC.md:762`의 "부분집합 검증"과 일치
- **풀 안의 기존 출석자가 선택에서 빠지면 제거된다**(18행) — 풀이 곧 관리 범위라는 뜻이고 의도다. 발표자는 자기 세미나 신청자만, 조직자는 자기 스터디 참여자만 지운다. 풀 밖(현장 체크인 등)은 보존된다
- **`current`의 중복도 제거된다**(19행 `Set`) — 저장값이 중복을 가졌다면 이 저장으로 정리된다. 해가 없다
- **`setAttendees` 예외**(7행) — `services/records-admin.ts`에 실재하고 관리자 전용이다. 주석이 정확하다
- **SQL 미러 여부** — 큐 승인의 한 명 추가는 이 함수의 미러가 아니라 별개의 원자 연산이다. `flow-rules.test.ts`의 고정 대상이 될 필요가 없다

## 검증 (2026-09-28)

- LB01-1 — 정정 (등급 유지. "줄 단위로 같다" → 빈 문자열 id에서 두 사본의 판정이 갈린다)
- LB01-2 — 확인 (`flow_decide_attendance` 593-600행이 plpgsql 안에서 한 명을 덧붙이고 이 함수를 부르지 않는다)
- 누락 점검: 호출부 두 곳(`events.ts:271`·`studies.ts:349`)의 풀 인자(`event.applicantIds`·`study.participantIds`), `AppError` 기본 상태(400), `setAttendees` 예외의 실재를 대조했다. 20줄 파일에서 추가할 결함은 찾지 못했다
