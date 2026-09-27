# `src/lib/domain/attendance.ts` (37줄)

**접두사 `LC06-`** · 발표자 출석 화면의 액션 결과 타입, 대상 id 스키마, 관리 범위 안에서의 출석 병합 규칙 `mergeManagedAttendance`.

## LC06-1 🟡 `mergeManagedAttendance`는 운영이 쓰지 않는 병합 규칙의 사본이다

17-37행은 `server/attendance.ts:9-20` `mergeAttendees`와 같은 규칙(부분집합 검증 → 관리 범위 밖 보존 → 합집합·중복 제거)이다.
운영 경로는 서버 쪽만 부른다(`services/events.ts:271` 발표자 저장, `services/studies.ts:349` 조직자 저장).
이 함수의 유일한 호출부는 `domain/studies.ts:160-175` `mergeStudyAttendance`이고, 그 함수의 호출부는 `domain/studies.test.ts`뿐이다.
따라서 `attendance.test.ts` 세 케이스와 `studies.test.ts`의 병합 케이스는 운영에서 돌지 않는 사본을 초록으로 유지한다.

서버 쪽 리뷰가 같은 사실을 반대편에서 적었다(`server/attendance.md` LB01-1). 이 파일에서 덧붙일 것은, 두 사본이
**같다고 말할 수도 없다**는 점이다(LC06-2). 병합 규칙을 바꾸는 사람은 어느 쪽이 진짜인지 이름으로도 위치로도 알 수 없고 —
오히려 `domain/`에 있는 이쪽이 규칙처럼 보인다 — 한쪽만 고쳐도 두 스위트가 모두 초록이다.

처방: 하나만 남긴다. 순수 함수이므로 도메인에 두고 서버가 실패를 `AppError`로 옮기는 편이 계층상 자연스럽다(LB01-1과 같은 결론).
`mergeStudyAttendance`의 필드 메시지를 운영에 살리면 스터디 출석 실패 문구가 바뀌는 **동작 변경**이 따라온다.

## LC06-2 🟡 빈 문자열 id가 검증을 통과한다 — 사본은 원본과 다른 규칙이다

23-24행은 풀 밖 id를 `find`로 찾고 **truthiness**로 판정한다:

```ts
const unknownMemberId = submittedAttendeeIds.find((id) => !managed.has(id));
if (unknownMemberId) { … return failure }
```

풀 밖의 id가 `""`이면 `find`는 `""`를 돌려주고 `if ("")`는 거짓이다. `mergeManagedAttendance([], [""], ["a"])`는
`{ success: true, attendeeIds: [""] }` — 검증을 통과해 빈 id가 출석 명단에 들어간다.
서버 사본은 `selected.every((id) => pool.has(id))`(`server/attendance.ts:15`)라 같은 입력을 거부한다.

라우트가 `""`를 미리 거르므로(`events/manage/+page.server.ts:111` `.filter(Boolean)`) 현재 경로로는 들어오지 않지만,
그것은 호출부의 성질이다. 이 함수의 계약("관리 범위 밖 id는 거부")은 깨져 있다. 처방: `!== undefined` 판정, 또는 `every`로.
LC06-1을 따라 한쪽을 지우면 함께 사라진다. 이 함수만 보면 **동작 변경**(빈 id 거부).

## LC06-3 🟡 `managedEventIdSchema`는 관리자 id 스키마의 글자 그대로 사본이고, 이름이 쓰임과 다르다

11-15행은 `admin-dashboard.ts:79-83` `adminDashboardIdSchema`와 **메서드 체인과 문구까지 같다**
(`trim` · `min(1, "대상을 선택해 주세요.")` · `max(200, "대상 id를 확인해 주세요.")`). id 상한이나 문구를 바꾸면 두 곳이다.

이름은 "managed **event** id"인데 같은 라우트가 **세미나 id**에도 쓴다(`events/manage/+page.server.ts:148-150`, `seminarId`).
이 화면은 이벤트 id와 세미나 id를 구분해야 하는 곳이라(`:31-50` 주석이 둘의 다리를 설명한다) 이름이 틀린 쪽을 가리키는 것이 특히 해롭다.
처방: 범용 `requiredIdSchema` 하나를 공용 자리(예: `form-data.ts`)에 두고 둘 다 그것을 쓴다. 구조 변경, 동작 동일.

## LC06-4 🟡 액션 결과 타입이 `as` 캐스트로만 묶여 있다

3-9행 `PresenterAttendanceOperationResult`는 `saveAttendance` 액션의 반환(`events/manage/+page.server.ts:120-125`)을 손으로 옮긴 것이다
(`success: true`는 래퍼가 붙인다 — `auth-guards.ts:149`). 소비처는 캐스트다(`events/manage/+page.svelte:290`
`result.data as PresenterAttendanceOperationResult`). 액션은 반환에 타입을 달지 않는다.
액션이 필드 이름 하나를 바꾸면 화면은 컴파일 오류 없이 `undefined`를 읽는다 — `admin-seminars.ts:94-99`의 주석이
같은 형태의 타입이 **실제로 그렇게 어긋났던** 기록이다.
처방: 액션 반환에 `satisfies Omit<PresenterAttendanceOperationResult, "success">`. 구조 변경.

## 확인했고 지적하지 않은 것

- **병합 규칙 자체** — 부분집합이 아니면 통째로 거부(부분 적용 없음), 관리 범위 밖 기존 출석자 보존, 범위 안에서 선택에서 빠진 사람은 제거, 중복 제거. `API-SPEC` §5-6/§6-6의 "명단을 통째로 덮어쓰지 않는다"와 일치한다(문제는 LC06-1·2의 중복과 판정식뿐)
- **실패를 반환값으로 표현**(25-29행) — 브라우저 안전 모듈이라 `AppError`를 던질 수 없다. 반환형 계약 자체는 이 계층에 맞다
- **`unknownMemberId`를 실패에 싣는 것** — 폼이 어느 항목이 문제인지 표시할 수 있게 하는 정보다. 다만 운영 경로(서버 사본)는 이 정보를 내지 않는다(LC06-1)

## 검증 (2026-09-28)

- LC06-1 — 확인 (운영 호출은 `mergeAttendees`뿐이다(`events.ts:271`, `studies.ts:349`). `mergeManagedAttendance` → `mergeStudyAttendance` → `studies.test.ts`만 부른다. `server/attendance.md` LB01-1과 같은 결함이므로 한 건으로 센다. 문서가 이미 그렇게 상호참조한다)
- LC06-2 — 확인 (23-24행: `find`가 `""`를 돌려주면 truthiness 판정이 통과시킨다. 서버 사본 `every`(`server/attendance.ts:15`)는 거부한다)
- LC06-3 — 확인 (11-15행은 `admin-dashboard.ts:79-83`과 체인·문구가 같다. `seminarId`에도 쓰인다(`events/manage/+page.server.ts:148-150`))
- LC06-4 — 확인 (액션 반환 `:120-125`에는 `operation`에만 `as const`가 있고 `satisfies`가 없다. 소비처는 `+page.svelte:290` 캐스트)
- 누락 점검: 37줄을 문서 없이 다시 읽었다. 실패 반환이 첫 번째 미지 id 하나만 싣는 것은 필드 메시지 용도로 충분하다. 새 지적은 없다.
