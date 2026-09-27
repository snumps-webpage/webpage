# `src/lib/domain/admin-dashboard.ts` (176줄)

**접두사 `LC02-`** · 관리자 운영 대시보드의 DTO 타입, 입력 스키마(id·이벤트·출석 시간), 행별 가능 액션(capabilities), 실패 코드→문구 변환.

## LC02-1 🟠 "열기"가 시간으로 종료된 이벤트에도 켜지고, 누르면 아무것도 바뀌지 않은 채 성공한다

135행 `canActivate: status === "draft" || status === "expired"`.
여기 들어오는 `status`는 저장값이 아니라 `effectiveStatus(e)`다(`admin/+page.server.ts:92,104`).
`effectiveStatus`는 저장값이 `active`여도 종료 시각이 지났으면 `"expired"`를 돌려준다(`services/events.ts:32-38`, 기준은 `expiryOf` 26-30행).

그래서 "expired"는 두 가지를 뭉뚱그린다:

| 실제 상태                                              | `canActivate` | `activateEvent` 결과                                                                   |
| ------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------- |
| 관리자가 수동 종료(저장값 `expired`), 종료 시각은 미래 | true          | 저장값 `active` → 실제로 열림                                                          |
| 종료 시각이 지남(저장값 `active` 또는 `expired`)       | **true**      | 저장값 `active`로 씀(이미 `active`면 변화 없음) → `effectiveStatus`는 여전히 `expired` |

둘째 줄에서 `setEventStatus`(`events.ts:128-139`)는 취소 여부만 보고 성공한다. 액션은 200을 내고
화면은 "이벤트를 열었습니다."(`admin/+page.svelte:128`)를 띄우며, 새로고침하면 다시 "종료"다.
관리자가 실제로 열려면 날짜를 고쳐야 하는데(`updateEvent`), 화면은 그 사실 대신 거짓 성공을 알린다.

원인은 구조다 — 130-133행이 `status` 하나만 받으므로 "시간 때문에 끝났다"와 "사람이 닫았다"를 구분할 수 없다.
처방: capability가 만료 시각(또는 `expiryOf < now` 여부)을 함께 받아 시간 만료에는 `canActivate:false`,
서버 `setEventStatus("active")`도 같은 조건에서 `CONFLICT`. **동작 변경**(버튼이 사라지고 서버가 거절한다).

## LC02-2 🟠 `localDateTimeSchema`는 모양만 보고, 그 위에서 순서를 비교한다

> **검증 정정**: 등급(🟠)과 표의 세 실측은 그대로 둔다(Node로 재확인: `02-30` → `03-02T01:00Z`, `T24:00` → 다음 날 00:00 KST, `13`월 → NaN).
> 고친 것은 두 가지다.
>
> 1. **"그 이벤트는 만들어지는 순간 종료 상태다"는 과하다.** `effectiveStatus`는 `expiryOf(e) < now`일 때 `expired`를 돌려준다
>    (`events.ts:36`). 그래서 역순 구간의 이벤트는 **종료 시각부터** 종료로 판정되고, 그 시각은 시작보다 앞선다. 종료 시각이 아직 오지 않았다면
>    저장 직후에는 `active`다. 정확한 결과는 "출석 창이 시작 시각이 되기 **전에** 닫힌다"이다.
> 2. **중복**: 결과 첫째 줄(역순 구간의 조용한 저장)은 `time.md` **LA09-1**(🔴, 검증) 결과 1과 같은 결함이다. 예시 값
>    (`start=2026-02-30T10:00`, `end=2026-03-01T12:00`)까지 같고, 처방("`localDateTimeSchema`도 달력 검사를 쓰게 한다")도 같다.
>    셋째 줄(같은 정규식의 사본들)은 LA09-3이 센다. 백로그에서는 한 건으로 센다. 이 문서가 따로 맡는 것은 이 스키마 자체의 수정이다.
>    처방은 새로 쓰지 말고 이미 있는 올바른 검사 `isCalendarDateTime`(`domain/studies.ts:88-100`)을 공용 자리로 옮겨 재사용할 것.

95-98행은 `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$` 정규식뿐이다. 달력상 존재하는 시각인지는 보지 않는다.
그 값은 `kstInputToIso`(`server/core/time.ts:24-33`)가 `new Date()`로 바꾸는데, JS는 넘치는 날짜를 굴린다(실측):

| 입력               | 스키마 | `kstInputToIso`                                      |
| ------------------ | ------ | ---------------------------------------------------- |
| `2026-02-30T10:00` | 통과   | `2026-03-02T10:00+09:00`로 **조용히 다른 날짜** 저장 |
| `2026-01-01T24:00` | 통과   | 다음 날 00:00으로 저장                               |
| `2026-13-01T10:00` | 통과   | NaN → 필드 없는 `AppError("VALIDATION_FAILED")`      |

결과:

- 110-118행의 "종료 > 시작"은 **정규화 전 문자열**을 비교한다. 시작 `2026-02-30T10:00`, 종료 `2026-03-01T12:00`은
  문자열로 종료가 뒤라 통과하지만, 저장값은 시작 03-02 10:00 · 종료 03-01 12:00 — 스키마가 막는다고 선언한 역순 구간이 저장된다.
  `expiryOf`가 종료를 쓰므로 그 이벤트는 만들어지는 순간 종료 상태다
- 셋째 줄은 스키마를 통과한 뒤 서버가 던지므로 `issues`가 없다. 화면은 "입력값을 확인해 주세요."(164행)를 띄우는데,
  그 문구가 가리키는 필드 메시지는 없다
- 같은 정규식이 `time.ts:27`, `admin-seminars.ts:141,151`에 또 있다. 99행 `const localDateTime = localDateTimeSchema;`는 별칭일 뿐이다
- 이벤트는 `mutate`의 쓰기 게이트를 거치고 `DateRange`(`schemas/common.ts:26-29`)에 순서 규칙이 없어 역순 구간이 **조용히 저장**되는 데서 그친다.
  같은 모양 검사를 가진 세미나 일정 스키마는 SQL 흐름 경로에서 표 전체를 막는다(`admin-seminars.md` LC04-1)

처방: 스키마 안에서 달력 유효성을 확인하고(재조합한 날짜가 입력과 같은지), 순서 비교는 그 뒤에 한다.
브라우저의 `datetime-local`은 이런 값을 보내지 않지만, 판정 기준상 감면 근거가 아니다. **동작 변경**(지금 저장되는 값이 400이 된다).

## LC02-3 🟡 잘못된 입력 두 경로에 zod의 영어 기본 문구가 나간다

- 108행 `endsAtLocal: z.union([z.literal(""), localDateTime])` — 형식이 틀린 종료 시각은 union 전체의 실패
  (`invalid_union`, 메시지 `"Invalid input"`)로 보고된다. 98행의 한국어 문구는 union 내부 오류에 묻혀
  `fieldIssues`에 닿지 않는다(실측)
- 103행 `.max(160)`에 메시지가 없다 — 161자 제목은 `"Too big: expected string to have <=160 characters"`를 받는다

같은 파일의 다른 제약은 모두 한국어 메시지를 단다. 원장 편집 폼은 `issues`를 필드 옆에 그대로 렌더한다
(`AdminEventLedger.svelte:54,189-195`). 같은 형태가 `admin-records.ts`·`admin-seminars.ts`에도 있다.
처방은 문구 추가(union은 `z.string().refine(v => v === "" || RE.test(v), msg)` 형태로). 동작 변화는 메시지뿐.

## LC02-4 🟡 출석 capability 네 필드와 이벤트 `canEdit`을 아무도 읽지 않는다

142-149행 `adminAttendanceCapabilities`는 `canApprove/canReject/canEdit/canDelete`를 만들어 모든 대기 행에 싣는다
(`admin/+page.server.ts:133`). 그런데:

- 그 행들은 `getPendingAttendance()` → `listPendingQueues()`에서 온다(`tables.ts:231-241`, `status === "pending"`만). `status`는 항상 `pending`이고,
  approved/rejected 분기는 이 목록에 들어올 수 없다
- 네 필드를 읽는 UI가 없다(`AdminAttendanceQueue.svelte`에 참조 0). 이벤트의 `canEdit: true`(137행)도 원장이 읽지 않는다
  (`AdminEventLedger.svelte`는 `canActivate/canExpire/canDelete`만 읽는다)
- `admin-dashboard.test.ts:28-34` "allows reversing an approved attendance record"는 **어느 화면에도 없는** 되돌리기를 규칙으로 고정한다

도달성의 문제가 아니라 **논리적으로 불필요한** 값이다 — 상수 `true` 두 개와, 데이터 원천이 배제한 상태에 대한 분기.
`AdminAttendanceStatus`(7행)의 두 멤버도 같은 이유로 이 DTO에는 불필요하다.
처방: 지우거나, 되돌리기 화면을 만들 계획이면 그때 데이터 원천과 함께 들인다. 구조 변경.

## LC02-5 🟡 삭제 가능 규칙이 화면에 한 번 더 적혀 있다

138행 `canDelete: pendingAttendanceCount === 0`과 같은 규칙을 `admin/+page.svelte:155-159`가
출석 처리 후 `dashboard.attendanceQueue.every(item => item.eventId !== event.id)`로 **다시 계산**한다.
삭제 규칙이 바뀌면(예: 승인된 출석이 있으면 금지) 첫 로드만 새 규칙을 따르고, 출석 한 건을 처리한 뒤부터는 옛 규칙이 버튼을 켠다.
처방: 화면이 `adminEventCapabilities(event.status, count)`를 불러 덮어쓴다. 구조 변경, 동작 동일.

## LC02-6 🟡 `adminActionErrorMessage`의 코드 목록이 오류 코드 집합에 묶여 있지 않다

157-176행의 `switch`는 `string`을 받아 9개 코드(`domain/api.ts:10-20` `API_ERROR_CODES`) 중 5개만 다룬다.
`FORBIDDEN`·`UNAUTHORIZED`·`EVENT_NOT_OPEN`·`STUDY_NOT_RECRUITING`은 호출부의 일반 문구("이벤트를 처리하지 못했습니다.")로 떨어진다 —
예를 들어 세션 도중 관리자 권한을 잃은 사람은 권한 문제라는 사실을 듣지 못한다.
`ErrCode`에 코드를 더해도 이 함수는 컴파일 오류 없이 그대로다. `admin-dashboard.test.ts:64-75`는 다섯 코드를 손으로 나열해 같은 공백을 공유한다.

처방: 인자를 `ApiErrorCode`로 좁히고 `Record<ApiErrorCode, string>`(또는 `satisfies`)로 전수를 강제한다. 구조 변경 + 네 코드의 문구 추가(표시 변화).
화면마다 문구가 다른 것(`dashboard.ts:86-97`, `SeminarRequestForm.svelte:89-104`)은 맥락이 달라 중복으로 보지 않는다.

## 확인했고 지적하지 않은 것

- **`canDelete`와 SQL의 일치** — `flow_delete_event`(`atomic_flows.sql:638-641`)도 대기(pending) 출석이 있으면 `CONFLICT`다. 규칙이 같다(LC02-5는 화면 사본의 문제)
- **`canActivate/canExpire`와 취소 상태** — 취소된 이벤트는 둘 다 false이고 서버도 `CONFLICT`(`events.ts:135`). 일치한다
- **`AdminEventStatus`·`AdminAttendanceStatus`의 문자열 사본**(6-7행) — 저장 스키마(`schemas/event.ts:5`, `attendance-record.ts:14`)와 같은 집합이다. 로드가 저장 타입 값을 이 타입 자리에 넣으므로(`+page.server.ts:101,131`) 저장 쪽에 멤버가 늘면 컴파일이 깨진다. 한 방향이지만 위험한 방향이 고정돼 있다
- **출석 시간의 `>=`**(125행) vs 이벤트의 `>`(111행) — 출석 행은 종료가 없으면 시작과 같게 채워진다(`+page.server.ts:130`). 같음을 허용해야 한다. 의도된 차이다
- **`adminDashboardIdsSchema`**(86-92행) — 키마다 같은 스키마를 붙이는 얇은 팩토리. 타입 단언은 `Object.fromEntries`의 한계 때문이고 정확하다
- **DTO 타입과 로드 객체** — 로드는 타입을 달지 않지만 화면이 `AdminDashboardData`에 대입하므로(`+page.svelte:56-64`) 모양이 어긋나면 `svelte-check`가 잡는다
- **`data.message` 우선**(161행) — `AppError.userMessage`가 있을 때만 실리는 서버 문구다. 코드가 계약이라는 `errors.ts:1-5`와 모순되지 않는다

## 검증 (2026-09-28)

- LC02-1 — 확인 (`effectiveStatus`는 저장값이 `active`이고 만료 시각이 지났으면 `expired`를 낸다. `setEventStatus`는 취소 여부만 본다. 화면 문구는 `admin/+page.svelte:128`. 같은 거짓 성공이 **`draft` + 종료 시각 경과**에도 일어난다. `canActivate`가 true이고, 저장값은 `active`가 되지만 `effectiveStatus`는 곧바로 `expired`다. 처방의 "시간 만료" 조건이 draft도 덮어야 한다)
- LC02-2 — 정정 (등급 유지. "만들어지는 순간 종료"는 "시작 전에 출석 창이 닫힌다"로 좁혔다. LA09-1과 같은 결함이므로 한 건으로 센다. 처방은 `isCalendarDateTime` 재사용)
- LC02-3 — 확인 (zod v4에서 직접 실행: union 실패는 `invalid_union`/`"Invalid input"`이고 한국어 문구는 `errors` 안에 묻힌다. `.max(n)`에 메시지가 없으면 `"Too big: expected string to have <=n characters"`)
- LC02-4 — 확인 (`getPendingAttendance` → `listPendingQueues`는 `status === "pending"`만 준다. `AdminAttendanceQueue.svelte`의 네 필드 참조 0, 원장의 `canEdit` 참조 0)
- LC02-5 — 확인 (`admin/+page.svelte:148-161`이 `canDelete`를 큐에서 다시 계산한다)
- LC02-6 — 확인 (`requireAdminAction`은 메시지 없는 `fail(403, { error: "FORBIDDEN" })`을 낸다(`auth-guards.ts:104`). 그래서 권한 상실은 일반 문구로 떨어진다)
- 누락 점검: 176줄을 문서 없이 다시 읽었다. `adminAttendanceTimeInputSchema`(125행)도 정규화 전 문자열을 비교한다. 이것은 LC02-2가 가리키는 같은 결함의 둘째 사용처다(`admin/+page.server.ts:343`). `canEdit: true`가 `cancelled` 이벤트에도 켜지는 것은 원장이 이 값을 읽지 않으므로 LC02-4에 포함된다. 새 번호를 붙일 지적은 없다.
