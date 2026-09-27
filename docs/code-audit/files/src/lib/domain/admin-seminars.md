# `src/lib/domain/admin-seminars.ts` (210줄)

**접두사 `LC04-`** · 관리자 세미나 보드의 DTO 타입(신청·세미나·액션 결과), 일정 동일성 판정, 일정 폼 스키마와 검증기.

## LC04-1 🔴 일정 폼 스키마가 저장 스키마보다 헐겁고, 공개된 세미나에서는 그 차이가 `seminars` 표 전체를 막는다

> **검증 정정**: 사실·인과·등급(🔴)은 모두 확인했다. 고치는 것은 **소유 관계**다.
>
> **재현**: 메모리 백엔드(PGlite, 실제 마이그레이션 적용)에서 공개된 세미나를 만들었다. 그다음 폼 값을 이 파일의
> `validateSeminarScheduleForm`에 넣고, 액션과 같은 변환(`kstInputToIso` + `slice(11, 16)`)을 거쳐 `updateSeminarSchedule`에 넘겼다.
> `2027-03-05T24:00`과 `2027-02-31T18:00`/`2027-03-03T10:00` 두 경우 모두 도메인 검증을 통과했다. 이어서 `SeminarSchema.parse`가
> 던졌고, 캐시를 비운 뒤의 `getTable("seminars")`는 `table envelope validation failed`로 실패했다(임시 테스트는 실행 후 삭제).
>
> **중복**: 같은 사건을 이미 두 문서가 🔴로 소유한다. `schemas/seminar.md` **LA26-2**(흐름이 검사 없이 커밋, 처방 ②)와
> `core/time.md` **LA09-1** 결과 2(`kstInputToIso` 롤오버)다. LA09-1의 처방은 이 파일의 `localDateTime`에 달력 검사를 붙이라고 명시하므로
> 처방 ①도 거기 있다. 둘 다 같은 재현을 기록했다. **백로그에서는 표 벽돌화 한 건으로 센다.** 이 문서가 따로 맡는 것은 이 스키마의 수정이고,
> 그 수정은 새 검사를 쓰지 말고 `isCalendarDateTime`(`domain/studies.ts:88-100`)을 공용 자리로 옮겨 쓴다.

`ATOMIC-FLOWS.md` §3은 SQL 흐름이 쓴 행이 TS의 쓰기 게이트(`tables.ts:126-137`)를 **거치지 않는다**고 적고,
그 대신 "입력 값은 호출 전에 TS가 도메인 스키마로 검증한다"(§3.3)고 한다. 공개된 세미나의 일정 변경에서 그 도메인 스키마가 이 파일의
`seminarScheduleInputSchema`(145-169행)다 — 액션이 이것만 통과시키고 `updateSeminarSchedule` → `flow_update_seminar_schedule`로
보낸다(`seminars/+page.server.ts:181-213`). SQL 함수는 일정을 검사하지 않고 그대로 쓴다(`atomic_flows.sql:414-419`).

그런데 이 스키마가 통과시키는 값 중 저장 스키마(`schemas/seminar.ts:37-62` `SeminarScheduleSchema`)가 거부하는 것이 있다:

| 입력                                              | 이 파일                         | 액션이 만드는 저장값                                              | 저장 스키마                                                              |
| ------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `startsAtLocal=2026-10-01T24:00`                  | 통과(정규식만, 141행)           | `startsAt` 10-02 00:00, `startTime:"24:00"`(`:197` 문자열 자르기) | ✗ `KST_TIME`(25행)이 24시를 거부, `startTime ≠ kstClock(startsAt)`(59행) |
| 시작 `2026-09-31T18:00` · 종료 `2026-10-01T10:00` | 통과(문자열로 종료가 뒤, 162행) | 시작 10-01 18:00(굴림) · 종료 10-01 10:00                         | ✗ `endsAt > startsAt`(55행)                                              |

그 다음 일어나는 일:

1. 흐름이 커밋된다 — 잘못된 행이 `seminars` 문서에 들어간다
2. `updateSeminarSchedule`의 `SeminarSchema.parse(out.seminar)`(`services/seminars.ts:179`)가 ZodError를 던진다 → 500
3. 이후 모든 `getTable("seminars")`가 `decode`에서 실패한다(`tables.ts:73-81`, 표 전체를 한 envelope로 엄격 디코드).
   공개 아카이브·관리자 세미나 보드·발표자 화면이 모두 읽지 못하고, `mutate`로 고치려 해도 먼저 읽으므로 고칠 수 없다.
   `tables.ts:126-128` 주석이 "an invalid write would BRICK the table for every future read AND repair attempt"라고 경고한 그 상태다

`mutate` 경로(공개 전 `scheduleSeminar`)는 같은 입력을 쓰기 게이트가 `VALIDATION_FAILED`로 막으므로 표가 안전하다 — 차이는 흐름 경로에만 있다.
브라우저 `datetime-local`은 이런 값을 보내지 않지만, 관리자 폼 POST를 직접 보내면 된다. 판정 기준상 도달 경로의 좁음은 감면 근거가 아니다.
`schemas/seminar.ts:21-22`는 "저장 계층이 폼보다 헐거우면" 안 된다고 한 방향만 적었다 — 이 결함은 **반대 방향**이다.

처방(둘 다):

- 이 스키마에 달력 유효성(재조합한 날짜가 입력과 같은지, 시 00-23)을 넣고 순서 비교를 정규화 뒤에 한다 — **동작 변경**(지금 저장되는 입력이 400)
- 흐름 결과를 파싱하는 곳이 커밋 **뒤**라는 구조를 고친다 — 흐름 호출 전에 액션이 만든 `schedule`을 `SeminarScheduleSchema`로 검사하면
  "도메인 스키마 ⊆ 저장 스키마"가 어긋나도 표는 지켜진다. 구조 변경(서비스 한 줄)

## LC04-2 🟠 `seminarSchedulesEqual`은 지금 운영 호출부가 없고(`startTime` 비교는 운영에 닿은 적이 없고), 운영의 "바뀌었나" 판정은 이것과 다르다

> **검증 정정**: 등급(🟠)과 결과는 그대로 두고, 역사 주장 하나를 고친다.
>
> **"도입(`b39ec62`)부터 현재까지 운영 호출부가 한 번도 없었다"는 거짓이다.** `b39ec62`에는 운영 호출부가 있었다.
> `src/routes/admin/seminars/+page.server.ts:343`의 `const scheduleChanged = !seminarSchedulesEqual(existing.schedule, schedule);`이다.
> 그 호출은 라우트 트리 병합 `1e27926`에서 사라졌다. `startTime` 비교와 테스트 주석은 그 **뒤** `1a7e17f`에서 더해졌다.
> 그러니 정확한 서사는 "호출부를 잃은 뒤에 규칙이 추가돼, 추가된 규칙이 운영에 닿은 적이 없다"이다. 제목은 그에 맞게 고쳤다
> (초판: "운영에서 한 번도 불린 적이 없고").
>
> 결과는 확인했다. 범위가 자정으로 좁혀지지 않는다는 것도 확인했다. 저장 스키마의 묶음(`schemas/seminar.ts:59`)은 `startTime`이 null이 **아닐 때만**
> `kstClock(startsAt)`와 같기를 요구한다. 그래서 `startTime: null`에 자정이 아닌 `startsAt`을 가진 행이 허용된다. `1a7e17f` 이전에
> 일정이 잡힌 행이 바로 그 모양이다. `startTime` 키가 없어 `default(null)`로 읽힌다(운영 데이터에 몇 건이 있는지는 확인하지 않았다. 판정과는 무관하다). 그런 행에서 관리자가 `시각 미정`을 풀고 같은 시각을 저장하면 `startsAt`·`endsAt`·`location`이
> 모두 같으므로 공지가 나가지 않는다. 하지만 회원 화면과 공지 문구는 "날짜만"에서 "날짜 + 시각"으로 바뀐다.
> 메모리 백엔드(PGlite)에서 재현했다. 공개된 세미나(`startsAt` 자정, `startTime: null`)에 `startTime: "00:00"`만 바꿔 넣으면 저장은 되고 메일은 0건이다.

48-59행은 일정 네 필드(`startsAt`·`startTime`·`endsAt`·`location`)를 모두 비교한다. 테스트가 그 이유를 적는다
(`admin-seminars.test.ts:20-26`): "시각 미상(null)과 시각 있음은 다른 일정이다 — 아니면 … '바뀐 것 없음'으로 읽혀 **변경 공지가 나가지 않는다**."

그런데 이 함수의 호출부는 테스트뿐이다. `git grep`으로 도입(`b39ec62`)부터 현재까지 운영 호출부가 한 번도 없었다.
운영의 판정은 SQL에 있고 **`startTime`을 보지 않는다**:

```sql
-- supabase/migrations/20260928000000_atomic_flows.sql:410-413
v_changed := v_old is null
  or v_old ->> 'startsAt' is distinct from v_new ->> 'startsAt'
  or v_old ->> 'endsAt'   is distinct from v_new ->> 'endsAt'
  or v_old ->> 'location' is distinct from v_new ->> 'location';
```

(`0856601` 이전의 TS 구현 `services/seminars.ts`도 같은 세 필드였다.) 그 `changed`가 공지 발송을 가른다(`services/seminars.ts:186-189`).
공지 본문은 `startTime`에 따라 달라진다 — `null`이면 날짜만, 있으면 시각까지(`mail/announcements.ts:40-51`).

결과:

- 공개된 세미나의 시각이 "미정"↔"확정"으로만 바뀌고 `startsAt`·`endsAt`·`location`이 같으면 공지가 나가지 않는다.
  예: 이주된 행(`startsAt` 자정, `startTime: null`)에 관리자가 "00:00"을 확정하거나, 반대로 "00:00"을 `시각 미정`으로 되돌리는 경우
  (`seminars/+page.server.ts:191-201`은 `시각 미정`이면 날짜의 자정을 쓰고 `endsAt`을 비운다 — 종료가 원래 없었다면 세 필드가 모두 그대로다).
  테스트 주석이 경고한 바로 그 실패다
- 규칙을 적어 둔 곳(도메인 함수+테스트)과 규칙이 도는 곳(SQL)이 다르고, 둘을 묶는 테스트가 없다(`flow-rules.test.ts`에 이 판정이 없다).
  일정에 필드를 더하면 도메인 함수는 컴파일러가 알려 주지만 SQL 목록은 아무도 알려 주지 않는다
- 초록인 `seminarSchedulesEqual` 테스트는 운영이 지키지 않는 규칙을 인증한다

처방: SQL의 비교에 `startTime`을 더하고(`v_old ->> 'startTime' is distinct from v_new ->> 'startTime'`),
`flow-rules.test.ts`에 "시각만 바뀐 일정은 changed"를 고정한 뒤 이 함수를 지운다. SQL 쪽은 **동작 변경**(공지가 한 경우 더 나간다),
함수 삭제는 구조 변경.

## LC04-3 🟡 종료 시각의 정규식이 두 번 걸리고, 사용자는 둘 다 못 본다

150-153행은 `localDateTime`(이미 141행에서 같은 정규식을 건 스키마)에 **같은 정규식**을 다시 건다. 그리고 전체가
`z.union([z.literal(""), …])` 안에 있다. 형식이 틀린 종료 시각의 결과(실측, zod v4):

- union 실패 하나로 보고되고 메시지는 `"Invalid input"`이다 — `fieldIssues`(`form-data.ts:31-37`)는 이것을 `endsAtLocal`에 싣는다
- 안쪽의 두 한국어 문구("날짜와 시작 시간을 입력해 주세요." · "올바른 종료 시간을 입력해 주세요.")는 union 내부 오류로만 남는다.
  union이 없었어도 zod v4는 검사를 멈추지 않으므로 첫 문구(**시작** 시간 문구)가 종료 칸에 먼저 뜬다 — 두 번째 정규식은 어느 경우에도 보이지 않는다

`SeminarScheduleDialog.svelte:73`이 `issues`를 받아 필드 옆에 그린다. 처방: 종료는 `z.string().trim().refine(v => v === "" || RE.test(v), "올바른 종료 시간을 입력해 주세요.")` 하나로.
표시만 바뀐다.

## LC04-4 🟡 날짜 원시값과 순서 규칙의 셋째 사본

- 137-143행 `localDateTime`은 `admin-dashboard.ts:95-98` `localDateTimeSchema`와 정규식이 같고 문구만 다르다. `admin-records.ts:3`은 그것을 import하는데 이 파일은 복사했다
- 161-169행의 "종료 > 시작"은 `admin-dashboard.ts:110-118`과 같은 규칙, 다른 문구("늦어야" / "뒤여야")다
- 그리고 둘 다 같은 결함을 공유한다 — 형식만 보고(달력 유효성 없음), 정규화 전 문자열로 순서를 비교한다.
  이 파일에서는 그 결과가 표 전체의 파손이고(LC04-1), 이벤트에서는 역순 구간의 조용한 저장이다(`admin-dashboard.ts` LC02-2)

한 곳을 고치면(예: 달력 검증 추가) 나머지는 그대로다. 처방: 날짜 원시값과 구간 규칙을 `form-data.ts` 같은 공용 자리에 하나로. 구조 변경 +
달력 검증은 **동작 변경**.

## LC04-5 🟡 `value()`는 `formText`의 사본이다

171-174행은 `form-data.ts:6-9` `formText`와 본문이 같다. 그 헬퍼 주석이 "Shared by every action that validates with a domain schema"이고,
같은 파일이 2행에서 `form-data`를 이미 import한다. 필드 읽기 규칙(예: File을 ""로)이 바뀌면 이 폼만 옛 규칙을 따른다.
부수: `seminarScheduleValuesFromFormData`(176행)·`seminarScheduleIssues`(186행)는 export돼 있지만 파일 밖 호출부가 없다.
처방: `formText`로 교체. 구조 변경, 동작 동일.

## LC04-6 🟡 쓰이지 않는 재수출

9-13행은 `SEMINAR_PUBLICATION_STATUSES`와 `SeminarPublicationStatus`를 다시 내보낸다. 이 경로로 가져가는 곳이 없다 —
유일한 값 사용처(`schemas/seminar.ts:2`, `seminar.test.ts:2`)는 `domain/seminars`에서 직접 가져온다.
9행 주석("관리자 화면 계약이 저장 값의 원천이 되지 않게 한다")의 의도대로라면 이 재수출은 **두 번째 import 경로**를 열어 둘 뿐이다.
처방: 삭제(3-7행의 type import는 유지). 구조 변경.

## LC04-7 🟡 액션 결과 타입이 여전히 `as` 캐스트로만 묶여 있다

100-122행 `AdminSeminarOperationResult`의 주석(94-99행)은 이 타입이 한 번 **실제 반환과 어긋났고 `as` 캐스트가 그것을 가렸다**고 기록한다.
고친 뒤에도 묶는 장치는 그대로다 — 소비처는 전부 캐스트(`SeminarPublicationCard.svelte:180,214,244,268`, `SeminarScheduleDialog.svelte:68`)이고,
생산처인 액션은 반환에 타입을 달지 않는다(`seminars/+page.server.ts:217,229-235,252`, `satisfies` 없음; `success: true`는 래퍼가 붙인다 — `auth-guards.ts:149`).
액션이 필드 하나를 바꾸면 다시 주석이 말한 상태가 된다.
처방: 액션 반환에 `satisfies Omit<Extract<AdminSeminarOperationResult, {operation: "…"}>, "success">`. 구조 변경.

## LC04-8 🟡 같은 세미나의 두 DTO가 같은 필드를 다르게 적는다

- `AdminSeminarItem.sourceRequestId: string`(63행) — 레거시 세미나는 `null`인데 타입이 허용하지 않아 로드가 `""`로 바꾼다(`seminars/+page.server.ts:70`)
- 같은 로드의 `AdminSeminarRecord.sourceRequestId: string | null`(`admin-records.ts:15`)은 `null`을 그대로 둔다(`:103`)

같은 행의 같은 값이 한 화면 안에서 `""`와 `null` 두 표기로 다닌다. "직접 신청분인가"를 판별하는 코드가 어느 DTO를 받느냐에 따라
`!== null`과 truthiness 중 하나를 골라야 하고, 틀린 쪽을 고르면 레거시 행이 신청분으로 읽힌다.
처방: `string | null`로 통일. 구조 변경.

## LC04-9 🟡 (검증 추가) 일정 스키마가 `시각 미정` 칸을 모른다 — 종료 시각이 버려질 입력으로 검증되고, 통과하면 조용히 버려진다

폼은 네 필드를 보낸다. `startsAtLocal`, `endsAtLocal`, `location`, 그리고 체크박스 `startTimeUnknown`이다(`SeminarScheduleDialog.svelte:103-107`).
체크해도 종료 칸은 활성 상태로 남아 함께 전송된다(`:132-140`). 이 파일의 검증기(176-184·196행)는 앞의 셋만 읽는다.
"시각을 모르면 종료도 없다"는 규칙은 라우트에만 있다(`seminars/+page.server.ts:198-202`: `!timeUnknown && endsAtLocal ? … : null`,
주석 "시작 시각을 모르는데 종료 시각만 있는 일정은 앞뒤가 맞지 않는다").

결과. 둘 다 코드만으로 따라간 것이다.

- `시각 미정` + 종료 입력이 162행의 순서 검사를 통과하면 액션은 성공하고 `endsAt: null`을 저장한다. **관리자가 입력한 종료 시각이 아무 안내 없이 사라진다.**
  스키마가 받아들인 입력을 액션이 무시하는 것으로, `admin-records.ts` LC03-1의 셋째 줄과 같은 모양이다
- 반대로 종료가 시작 칸의 시각보다 이르면 400 "종료 시간은 시작 시간보다 늦어야 합니다."를 받는다. 그런데 비교 대상인 시작 시각은 어차피 자정으로 바뀌고
  종료도 버려질 값이다. **버려질 두 값의 순서 때문에 거절된다**

규칙이 둘로 갈라진 원인은 이 검증기가 폼 필드 하나를 모르는 데 있다. 처방은 `startTimeUnknown`을 스키마에 들이는 것이다. 참이면
(a) `endsAtLocal`이 비어 있지 않을 때 필드 오류를 내거나 조용히 비우는 규칙을 **스키마가** 정하고, (b) 순서 검사를 건너뛴다.
라우트는 파싱 결과만 쓴다. (a)를 오류로 택하면 **동작 변경**(지금 성공하는 입력이 400)이다.

## 확인했고 지적하지 않은 것

- **`SeminarSchedule` 인터페이스(40-46행)와 저장 스키마의 이중 선언** — `schemas/seminar.test.ts:215-228`이 양방향 대입으로 컴파일 시점에 묶는다. 고정된 미러다(모양만 묶고 값의 제약은 묶지 않는다 — 그 차이가 LC04-1)
- **`canResendNotice`·`canReapplyCancel`의 존재** — 주석(77-91행)이 복구 경로로서의 필요를 설명하고, 로드가 저장 상태에서 계산한다(`seminars/+page.server.ts:91-97`). 불필요한 필드가 아니다
- **장소 상한 160**(155-159행) — 저장 스키마 `location: z.string().min(1).max(160)`(`schemas/seminar.ts:53`)과 같다
- **`validateSeminarScheduleForm`의 `{...result, failure}` 반환**(202-209행) — `account.ts` LC01-2에서 모양 불일치로 다뤘다. 여기서는 호출부가 `parsed.failure`만 쓴다(`seminars/+page.server.ts:184`)
- **공개 전 경로의 안전성** — `scheduleSeminar`는 `mutate`를 거치므로(`services/seminars.ts:64-83`) 같은 입력이 쓰기 게이트에서 막힌다. LC04-1은 공개 후 경로에 한정된다

## 검증 (2026-09-28)

- LC04-1 — 정정 (🔴 유지. PGlite로 두 입력 모두 재현했다. 공개된 세미나에서 표를 읽을 수 없게 된다. LA26-2·LA09-1과 같은 사건이므로 한 건으로 센다. 이 문서는 스키마 수정을 맡고 처방은 `isCalendarDateTime` 재사용)
- LC04-2 — 정정 (🟠 유지. "도입부터 운영 호출부가 한 번도 없었다"는 거짓이다. `b39ec62`에 운영 호출이 있었고 `1e27926`에서 사라졌다. 제목을 고쳤다. `startTime`만 바뀐 일정에 공지가 나가지 않는 것은 PGlite로 재현했다. `startTime: null`과 자정이 아닌 `startsAt`이 저장 스키마상 허용되므로 범위는 자정에 한정되지 않는다)
- LC04-3 — 확인 (zod v4 실측: union 실패는 `"Invalid input"` 하나이고 안쪽 두 한국어 문구는 묻힌다)
- LC04-4 — 확인 (첫 줄의 정규식 사본은 `time.md` LA09-3 (2)도 센다. 이 문서의 몫은 순서 규칙 사본과 `admin-records`는 import하는데 여기는 복사했다는 비대칭이다. 통합 기준은 달력 검사를 가진 넷째 변형 `domain/studies.ts:85-107`이어야 한다)
- LC04-5 — 확인 (`value()`는 `formText`와 본문이 같다. 두 export의 외부 호출 0)
- LC04-6 — 확인 (`SEMINAR_PUBLICATION_STATUSES`·`SeminarPublicationStatus`를 이 경로로 가져가는 곳 0. 6행의 type import는 71행이 쓴다)
- LC04-7 — 확인 (소비처는 캐스트 다섯 곳이고, 액션 반환에 `satisfies`가 없다. `success: true`는 `runAction`이 붙인다(`auth-guards.ts:149`))
- LC04-8 — 확인 (`seminars/+page.server.ts:70`은 `?? ""`, `:103`은 `null`을 그대로 둔다. 같은 두 DTO는 `duration`(요청 원문 문자열)과 `durationMinutes`(`parseInt || 60`)로도 같은 원천을 다르게 적는다. 같은 부류다)
- LC04-9 — 추가 (🟡. 스키마가 `startTimeUnknown`을 읽지 않아 종료 시각의 운명을 라우트가 정한다. 통과한 종료 입력이 조용히 버려진다)
- 누락 점검: 210줄을 문서 없이 다시 읽었다. `AdminSeminarItem.description`이 `s.note`로 채워지는 것은 `admin-records.md` LC03-3 검증 줄에 적었다. 흐름이 `scheduled` 상태도 받는 것(`atomic_flows.sql:407`)은 액션이 `published`에서만 부르므로 이 파일의 결함이 아니다.
