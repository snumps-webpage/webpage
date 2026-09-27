# `src/lib/server/data/schemas/seminar.ts` (120줄)

**접두사 `LA26-`** · `seminars` 테이블 행 스키마 — 공개 수명주기 상태, 확정 일정(시각 미상 표현 포함), 공지 앵커, 학기 고정.

## LA26-1 🟠 `endsAt > startsAt`가 문자열 비교라, 오프셋이 다르면 틀린 판정을 낸다

55행 `.refine((s) => s.endsAt === null || s.endsAt > s.startsAt, …)`. 두 값은 `DateTime`(`common.ts:13`)이고 이 스키마는
**아무 오프셋이나** 받는다 — `seminar.test.ts:105-115`가 `Z`를 "유효한 instant"로 명시적으로 고정한다. ISO 문자열의 사전식
비교는 오프셋이 같을 때만 시간 순서와 일치한다.

실측(Node 24, 같은 비교식):

| startsAt                    | endsAt                      | 실제                     | 판정     |
| --------------------------- | --------------------------- | ------------------------ | -------- |
| `2026-10-15T19:00:00+09:00` | `2026-10-15T10:30:00Z`      | 종료 19:30 KST — 30분 뒤 | **거부** |
| `2026-10-15T19:00:00-03:00` | `2026-10-15T21:00:00+09:00` | 시작 = 16일 07:00 KST    | **통과** |

앞의 것은 유효한 일정을 거부하고, 뒤의 것은 종료가 시작보다 10시간 **앞선** 일정을 저장한다. 테스트 `:200-213`은 두 값이
같은 `+09:00`인 경우만 본다.

처방: `Date.parse(s.endsAt) > Date.parse(s.startsAt)`. 같은 오프셋 입력에서는 결과가 같으므로 현재 쓰기 경로
(`kstInputToIso`는 항상 `+09:00`)의 동작은 바뀌지 않는다 — 혼합 오프셋 입력에 대해서만 판정이 바로잡힌다(동작 변경은
그 경우에 한정). 근본 원인인 "KST 고정이라는 주석이 강제되지 않는다"는 `LA13-2`.

## LA26-2 🔴 일정 불변식은 `mutate` 경로에서만 검사되고, 공개된 세미나의 일정 수정(SQL 흐름)은 검사 없이 커밋한 뒤에 파싱한다

> **검증 정정**: 🟠 → 🔴. 기전은 전부 맞고(`atomic_flows.sql:393,414-420` 무검사 커밋, `seminars.ts:179` 커밋 후 파싱),
> 틀린 것은 마지막 문단의 **"현재 유일한 호출부는 올바른 값을 조립한다"**다. 유일한 호출부 `?/scheduleSeminar`
> (`(admin)/admin/seminars/+page.server.ts:175-218`)는 지금 이대로 불변식을 어긴 일정을 조립한다:
>
> - 폼 스키마의 `localDateTime`(`domain/admin-seminars.ts:137-143`)은 자릿수만 보고, `kstInputToIso`는 V8이 받아 주는 값을
>   통과시킨다(`LA09-1`). `startsAtLocal = "…T24:00"`이면 `startsAt`은 다음 날 `00:00:00+09:00`, `startTime`은
>   `slice(11, 16)` = `"24:00"`이 된다 — `KST_TIME`(25행)이 거부하고 59행 `refine`도 어긋난다
> - `startsAtLocal = "2027-02-30T19:00"`, `endsAtLocal = "2027-03-01T20:00"`은 폼의 문자열 비교(`:162`)를 통과하지만 저장값은
>   시작 3월 2일, 종료 3월 1일 — 55행 `refine`이 거부한다
>
> **실측**(PGlite에 실제 마이그레이션을 적용하는 메모리 백엔드, 액션 함수를 직접 호출, 임시 테스트는 레포 밖 scratchpad):
> 공개된 세미나에 두 입력을 각각 보내면 액션은 500을 돌려주고, 그 **뒤의** `getTable("seminars")`가
> `table envelope validation failed`로 던진다 — 표가 벽돌이 됐다. 같은 입력을 공개 전 세미나에 보내면 `mutate` 게이트가
> 막아 400 `VALIDATION_FAILED`이고 표는 멀쩡하다. 브라우저의 `datetime-local` 위젯은 두 값을 만들지 않지만 서버는 폼 POST를
> 신뢰할 근거가 없고(`LA09-1`과 같은 판단), 도달성은 등급이 아니라 우선순위의 문제다(README 판정 기준).
>
> 따라서 이것은 "아직 없는 호출부"를 위한 잠재 결함이 아니라 **현존 호출부로 재현되는 결함**이고, 결과는 세미나 표 전체의
> 읽기 불능(아카이브·홈 대시보드·관리 화면·`visibility.ts` 경유 활동 필터)과 TS로는 수리할 수 없는 상태(`mutate`도 읽기부터
> 실패)다. 🔴. `LA09-1`(🟠, 잘못된 날짜를 조용히 다른 날짜로 저장)과는 원인 한 조각을 공유하지만 결과가 다르다 — 저쪽을 고쳐도
> 이 경로에는 흐름 입력 검증이 없으므로 다른 조립 실수(또는 `LA26-1`의 혼합 오프셋으로 생긴 거짓 거부 대상)가 같은 방식으로
> 커밋되고 표를 벽돌로 만든다. 처방(흐름 호출 전 `SeminarScheduleSchema.parse`)은 독립적으로 필요하다. 참고로 실측의
> 500 응답 본문 `data.error`에는 zod 이슈 JSON 원문이 실려 나간다 — 귀속은 `handleAdminAction` 리뷰다.

`SeminarScheduleSchema`(37-62행)의 세 검사 — 종료 > 시작, `startTime` = `startsAt`의 KST 시각, 장소 1~160자 — 는
이 파일 밖에서 **단독으로 쓰이지 않는다**(99행의 중첩 사용이 유일). 따라서 검사가 일어나는 곳은 테이블 쓰기 게이트
(`tables.ts:129-138`)뿐이다. 일정을 쓰는 경로는 둘이다:

- 공개 전: `scheduleSeminar`(`services/seminars.ts:64-83`) → `mutate` → 게이트가 검사한다
- **공개 후: `updateSeminarSchedule`(`services/seminars.ts:172-179`)** → `callFlow("flow_update_seminar_schedule", { id, schedule })`
  → SQL이 `p -> 'schedule'`을 **그대로** 적고 커밋한다(`atomic_flows.sql:393,414-420`). 파싱은 커밋 **뒤**
  `SeminarSchema.parse(out.seminar)`(`seminars.ts:179`)에서 처음 일어난다

인자 타입 `SeminarSchedule`은 `refine`을 표현하지 못하므로(`startTime: string | null`) 타입 검사도 막지 못한다.
ATOMIC-FLOWS §3.3은 "입력 값은 호출 전에 TS가 도메인 스키마로 검증한다"고 하지만, 도메인 폼 스키마
(`seminarScheduleInputSchema`)가 검증하는 것은 폼 필드이고, 저장될 값(`startTime`)은 라우트가 그 뒤에 조립한다
(`(admin)/admin/seminars/+page.server.ts:192-203`).

결과: 불변식을 어긴 일정이 이 경로로 들어오면 SQL이 커밋하고, 커밋 직후의 `parse`가 던지며(관리자는 500), 이후 모든
`getTable("seminars")`의 디코드가 실패한다(`tables.ts:73-81`) — `tables.ts:126-128`이 "테이블을 벽돌로 만든다"고 부른
바로 그 상태이고, 수리용 `mutate`도 읽기부터 실패한다. 아카이브·관리 화면·대시보드가 세미나 표를 읽는다.
현재 유일한 호출부는 올바른 값을 조립하지만, 그것은 README 판정 기준상 감면 근거가 아니다 — 게이트의 값어치가
바로 아직 없는 호출부를 막는 것이다.

처방: `updateSeminarSchedule`(과 일정을 받는 모든 흐름 호출 전)에서 `SeminarScheduleSchema.parse(schedule)`. 잘못된
입력이 커밋 전에 `VALIDATION_FAILED`가 된다 — 올바른 입력의 동작은 그대로.

## LA26-3 🟡 "검증 강도는 입력 폼과 맞춘다"는 주석과 달리 공백만의 장소가 통과한다

21-22행 주석과 53행 `location: z.string().min(1).max(160)`. 폼은 `.trim().min(1).max(160)`이다
(`domain/admin-seminars.ts:155-159`). 저장 스키마는 `trim`하지 않으므로 `"   "`가 통과한다 — 주석이 막겠다고 한
"유일한 자리가 빈 값으로 퇴화"가 공백 문자열로 일어난다. 테스트(`seminar.test.ts:118-133`)는 `""`만 본다.

처방: `z.string().trim().min(1).max(160)` — zod `trim`은 **값을 바꾸는 변환**이라, 앞뒤 공백이 있는 기존 행은 다음 쓰기에서
잘린다(동작 변경, 영향은 표시 공백뿐). 변환을 원치 않으면 `refine((v) => v.trim().length > 0)`.

## ~~LA26-4 🟡 제거된 이주 규칙이 SQL 두 곳에 남아 있고, 고정 테스트가 없다~~

> **검증 정정 — 철회(중복)**: 같은 결함을 SQL 파일 리뷰가 소유한다. `LA43-5`(`atomic_flows.md`)가 "`app_seminar_status`의
> '없으면 published'는 방어가 아니다 — TS는 거부, SQL은 공개로 간주", 커밋 후 파싱 실패, 215행 인라인 복제까지 다루고,
> `LA43-4`가 `ATOMIC-FLOWS.md:58-60`의 미러 열거와 `flow-rules.test.ts`의 실제 범위를 다룬다. 이 절이 더하는 것은 없다.
> 사실은 맞으나 인용 한 곳이 어긋난다 — 인라인 복사본은 `:213-214`가 아니라 214행(주석)·215행(식)이다.

88-96행: `publicationStatus`의 기본값(`published`)을 제거하고 규칙을 마이그레이션에 한 번 적었다 — "SQL 흐름의
`app_seminar_status`는 같은 규칙을 방어적으로 한 번 더 적용한다". 규칙은 SQL에 두 번 있다:

- `app_seminar_status`(`atomic_flows.sql:164-167`) `coalesce(p_sem ->> 'publicationStatus', 'published')`
- `flow_delete_seminar`의 인라인 복사본(`atomic_flows.sql:213-214`)

이제 TS와 SQL이 같은 사실에 반대로 답한다 — TS는 필드 없는 행을 **무효**로(`seminar.test.ts:30-35`, 테이블 디코드 실패),
SQL은 **공개됨**으로 읽는다. "방어"가 방어할 수 없다: 그런 행이 존재하는 순간 TS 읽기는 이미 실패하고 있고, SQL 흐름은
`'scheduled'`일 때만 상태를 적으므로(`:318-324`) 필드 없는 행을 필드 없는 채로 다시 쓴다.

또한 `docs/spec/ATOMIC-FLOWS.md:58-60`은 `app_seminar_status`를 "`flow-rules.test.ts`가 원본과 대조하는 미러"로 열거하지만,
그 테스트에는 `app_term_of`·`app_may_derive_semester`·`app_event_open`만 있다(`flow-rules.test.ts:18,36,57`). **고정되지
않은 미러이자 이미 표류한 미러**다(브리프 기준).

처방: 두 SQL 사본에서 `coalesce`를 걷고 `p_sem ->> 'publicationStatus'`를 그대로 쓰거나(필드 없는 행은 흐름이
`CONFLICT`), 남길 거라면 주석을 "TS와 다른 규칙"으로 고치고 테스트로 고정한다. ATOMIC-FLOWS.md의 열거도 바로잡는다.
전자는 SQL 동작 변경(마이그레이션 이후 해당 행이 없으므로 실효 없음 — 실측 확인 필요).

## LA26-5 🟡 `SeminarScheduleSchema`의 문서 주석이 아무것에도 붙어 있지 않다

10-23행의 JSDoc("확정된 세미나 일정. **소유권** … **장소는 중복이 아니다** … 검증 강도…")은 바로 뒤 24행의 JSDoc과
25행 `KST_TIME` 상수 앞에 놓여 있다. JSDoc은 바로 다음 선언에 붙으므로 이 블록은 고아가 되고, `SeminarScheduleSchema`
(37행)에 호버하면 아무 설명도 나오지 않는다. 이 파일에서 가장 중요한 설계 주석(일정의 소유 방향)이 그 대상에서
12줄 떨어져 있다. 처방: 블록을 37행 바로 위로 옮긴다. 동작 변경 없음.

## ~~LA26-6 🟡 5-6행 주석이 존재하지 않는 대칭을 근거로 든다~~

> **검증 정정 — 철회(인과 주장 불성립)**: 5-6행이 내세우는 대칭은 "닫힌 집합의 **원천**은 도메인이고 서버는 그것을
> 가져다 쓴다"이고, 그것은 두 파일 모두 사실이다 — `seminar-request.ts:12-13`의 주석이 바로 "선호 세미나 시점 옵션의 단일
> 소스는 domain 계층 — 서버는 재수출만 한다"이다. 5-6행은 `seminar-request.ts`가 그 목록으로 **강제한다**고 말하지 않는다.
> 이 절이 지적하는 비대칭(강제 여부)은 `LA25-3`이 이미 다루는 사실이고, 그 결함이 이 주석을 거짓으로 만들지 않는다.

"공개 상태의 닫힌 집합은 도메인이 단일 원천 … (seminar-request.ts가 SEMINAR_TIMING_OPTIONS를 다루는 방식과 동일)".
이 파일은 도메인 배열로 `z.enum`을 **만들어 강제한다**(7행). `seminar-request.ts`는 `SEMINAR_TIMING_OPTIONS`를
재수출만 하고 **아무것도 강제하지 않는다**(`LA25-3`). 같은 파일의 `preferredTiming`(83-84행)도 `z.string()`이다.
주석이 가리키는 선례는 이 파일 방식의 반례다. 주석 수정(또는 `LA25-3` 처방 후 사실이 된다).

## LA26-7 🟡 KST 벽시계 계산이 `core/time.ts`와 다른 방법으로 한 번 더 구현돼 있다

27-35행 `kstClock`는 `Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour12: false })`로 시각을 뽑는다.
`core/time.ts:5,10-17`은 같은 일을 고정 오프셋(`KST_OFFSET_MS`) 산술로 한다. `mail/announcements.ts:43,55`에 세 번째
`Intl` 사용이 있다. 스키마 모듈은 이미 `$lib/server/core/semester`를 가져오므로(`common.ts:2`) `core/time`을 가져오는 데
계층 문제가 없다.

결과: "KST"의 정의가 둘이다 — 한쪽은 IANA 시간대, 한쪽은 +9시간 고정. 한국은 1988년 이후 서머타임이 없어 결과가 같지만,
그 등가는 어디에도 적혀 있지 않고, 한쪽을 고치는 사람은 다른 쪽을 모른다(자정 표기는 Node 24에서 `"00:05"`로
실측 — 형식 자체는 문제없다). 처방: `core/time.ts`에 `kstClockOf(iso)`를 두고 여기와 메일이 쓴다. 동작 변경 없음.

## LA26-8 🟡 `safeParse`가 던진다 — 형식이 틀린 `startsAt`에서 59행 `refine`이 `RangeError`를 낸다 (검증 추가)

zod 3의 `refine`은 내부 객체 파싱이 **중단(aborted)** 됐을 때만 건너뛰고, 필드의 정규식·형식 실패처럼 **dirty**로 끝난
경우에는 그대로 실행된다. 그래서 `startsAt`이 `DateTime` 검사에 실패해도 59행이 `kstClock(s.startsAt)`을 부르고,
`Intl.DateTimeFormat#format(new Date("garbage"))`가 `RangeError: Invalid time value`를 던진다. 55행은 문자열 비교라 던지지 않는다.

실측(같은 zod 3.25.76, 스키마를 그대로 import):

| 입력                                        | `SeminarScheduleSchema.safeParse`                                        |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `startsAt: "garbage"`, `startTime: "19:00"` | **던짐** — `RangeError: Invalid time value`                              |
| `startsAt: "garbage"`, `startTime: null`    | `success: false` (`startsAt: Invalid datetime`) — 59행이 `null`에서 단락 |

결과: `safeParse`의 "던지지 않고 실패를 돌려준다" 계약이 이 스키마에서 깨진다. 쓰기 게이트(`tables.ts:129-138`)는
`VALIDATION_FAILED`로 바꾸지 못하고 날것의 `RangeError`(500)를 흘리며(쓰기 자체는 그 전에 멈추므로 표는 안전하다), 디코드
(`tables.ts:74`)에서 만나면 어느 행·어느 필드인지 알려 주는 `table envelope validation failed: …` 대신 위치 없는
`RangeError`가 된다. 처방: 59행을 `s.startTime === null || (Number.isFinite(Date.parse(s.startsAt)) && s.startTime === kstClock(s.startsAt))`로
감싸거나 `superRefine`에서 앞선 이슈가 있으면 건너뛴다. 올바른 입력의 동작은 그대로다.

## 확인했고 지적하지 않은 것

- **`startTime`을 `startsAt`과 따로 두는 설계(40-51행)** — "모르는 것은 null"이라는 이유가 타당하고, 두 자리가 어긋나지
  않게 59-62행에서 묶는다. 중복 저장의 대가를 스스로 지불하고 있다
- **`publicationStatus` 기본값 제거(85-97행)** — 결정 기록(2026-09-27)·마이그레이션(`20260928000100`)·테스트
  (`seminar.test.ts:30-35`)가 일치한다. 이 결정 자체는 재제기하지 않는다(`LA26-4`는 SQL에 남은 잔재에 관한 것)
- **`announcedAt`을 상태와 분리(100-107행)** — 주석의 두 실측 결함 서술이 공개 흐름(`atomic_flows.sql:369-371`)과
  `announce`의 되감기(`seminars.ts:151-157`)와 일치한다
- **`semesterPinned`(108-115행)** — `app_may_derive_semester`가 읽고 `flow-rules.test.ts:36`이 고정한다
- **`description` 기본값 `""`(70-75행)** — 없음과 빈 개요의 의미가 같다
- **`kstClock`이 호출마다 `Intl.DateTimeFormat`을 만든다** — 디코드는 문서 버전이 바뀔 때만 일어나고 세미나는 수십 행이다.
  비용 지적은 과도하다
- **`SeminarPublicationStatus` 타입 이름이 도메인(`domain/seminars.ts:55`)과 같다** — 같은 배열에서 파생되므로 표류할 수 없다
- **`s3Keys` 주석(78-79행)** — `LA13-4`에서 한 번에 다룬다

## 검증 (2026-09-28)

- LA26-1 — 확인 (Node 24 + zod 3.25.76으로 표의 두 사례를 재실측 — 문자열 판정 거부/통과, 실제 순서 반대. `LA26-2`와 겹치면 더 나쁘다: 혼합 오프셋의 **유효한** 일정이 공개 후 경로로 들어오면 SQL은 커밋하고 55행이 거부해 표가 벽돌이 된다)
- LA26-2 — 정정 (🟠 → 🔴: "현재 호출부는 올바른 값을 조립한다"가 거짓 — `T24:00`·`02-30` 입력으로 현존 액션이 공개된 세미나 표를 읽기 불능으로 만드는 것을 PGlite로 재현)
- LA26-3 — 확인 (`"   "`가 `SeminarScheduleSchema`를 통과함을 실측, 폼은 `domain/admin-seminars.ts:155-159`에서 `trim`)
- LA26-4 — 철회 (`LA43-5`·`LA43-4`와 중복. 인용 `:213-214` → 214-215행)
- LA26-5 — 확인 (10-23행 JSDoc 뒤에 24행 JSDoc과 25행 `KST_TIME`이 오고, 37행 `SeminarScheduleSchema` 직전에는 JSDoc이 없다)
- LA26-6 — 철회 (주석의 대칭은 "원천의 위치"이고 두 파일 모두 참이다. 강제 여부의 비대칭은 `LA25-3`)
- LA26-7 — 확인 (`core/time.ts:5,10-17`, `announcements.ts:42-43,54-55` 일치. `LA09-3`의 "KST 변환 분산"과 같은 부류이며 그 목록에 `Intl` 계열이 빠져 있다)
- LA26-8 — 추가 (59행 `refine`이 형식이 틀린 `startsAt`에서 `RangeError`를 던져 `safeParse`가 던진다 — 실측)
- 누락 점검: 120행 재독. `flow_update_seminar_schedule`의 `v_changed`가 `startTime`을 비교하지 않는 점(`atomic_flows.sql:410-413`)은 `startTime`이 `startsAt`에서 도출되므로 "시각 미정" 토글이 자정 일정에서만 공지를 생략한다 — 흐름의 것이고 영향이 작아 넘긴다
