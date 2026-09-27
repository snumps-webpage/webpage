# `src/lib/server/core/time.ts` (44줄)

**접두사 `LA09-`** · KST 시각 유틸 — instant ↔ `+09:00` ISO 문자열, `datetime-local` 입력 해석, KST 하루 끝, 탈퇴 유예 기간 상수.

## LA09-1 🔴 `kstInputToIso`가 존재하지 않는 날짜를 거부하지 않고 다른 날짜로 저장한다

> **검증 정정**: 🟠 → 🔴. 호출부 목록은 좁히고, 결과는 넓힌다.
>
> **호출부 — 어느 입력 스키마가 먼저 막는가.** 표의 롤오버(Node v24.19로 재확인)는 맞다. 경로마다 앞에 선 도메인 스키마를
> 확인했다(스키마를 직접 실행해 확인).
>
> | 호출부                                          | 입력 스키마                                                                            | `2026-02-30T10:00`·`T24:00` |
> | ----------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------- |
> | `study/[id]/manage/+page.server.ts:162,177`     | `startedAtLocalSchema` + `isCalendarDateTime`(`domain/studies.ts:85-107`)              | **거부**                    |
> | `admin/+page.server.ts:303-304` (updateEvent)   | `adminEventInputSchema` → `localDateTimeSchema`(`admin-dashboard.ts:95-98`, 모양만 봄) | 통과                        |
> | `admin/+page.server.ts:355-356` (출석 시간)     | `adminAttendanceTimeInputSchema`(같은 정규식)                                          | 통과                        |
> | `admin/events/new/+page.server.ts:44`           | `adminEventInputSchema`                                                                | 통과                        |
> | `admin/activities/+page.server.ts:70-71,99-100` | `adminActivityRecordSchema`(`admin-records.ts:78-84`, 같은 정규식)                     | 통과                        |
> | `admin/seminars/+page.server.ts:194-201`        | `seminarScheduleInputSchema`(`admin-seminars.ts:137-153`, 모양만 봄)                   | 통과                        |
>
> 따라서 초판의 "스터디 운영자의 일정 입력 전부"는 틀렸다. 스터디 경로는 도메인이 이미 막는다. 막히지 않는 것은 관리자 경로 다섯 곳이다.
> 같은 레포 안에서 달력 검사가 세 개의 datetime-local 정규식 중 하나에만 붙어 있다(→ LA09-3).
>
> **결과 — "그럴듯한 다른 날짜"로 끝나지 않는다.** 두 가지가 더 따라온다.
>
> 1. **도메인의 순서 검사가 무력해진다.** `adminEventInputSchema`·`seminarScheduleInputSchema`는 `end <= start`를 **문자열**로 비교한다.
>    `start=2026-02-30T10:00`, `end=2026-03-01T12:00`은 이 검사를 통과한다. 롤오버 뒤에는 시작이 03-02 10:00, 종료가 03-01 12:00이
>    된다. `events`·`activities`의 `DateRange`(`common.ts:26-29`)에는 순서 검사가 없어서 종료가 시작보다 앞선 행이 조용히 저장된다.
> 2. **공개된 세미나에서는 테이블이 벽돌이 된다.** 공개된 세미나의 일정 수정은 `updateSeminarSchedule` → `flow_update_seminar_schedule`
>    (`atomic_flows.sql`)로 간다. SQL flow는 TS 쓰기 게이트(`tables.ts:126-137`)를 거치지 않는다. 그런데 저장 스키마
>    `SeminarScheduleSchema`(`schemas/seminar.ts:37-62`)는 `endsAt > startsAt`와 `startTime === kstClock(startsAt)`를 요구한다.
>    롤오버된 값은 둘 중 하나를 깨뜨린다. `T24:00`이면 라우트가 원문에서 `startTime: "24:00"`을 떼어 내고 `startsAt`만 다음 날 00:00이 되어
>    어긋난다. 02-30+종료면 종료가 시작보다 앞선다. flow는 커밋하고, 그다음 `getTable("seminars")`는 매번
>    `table envelope validation failed`로 실패한다. `mutate`도 쓰기 전에 먼저 디코드하므로(`tables.ts:121-122`) 앱 안에서는 고칠 수 없다.
>    `tables.ts:126-128` 주석이 막겠다고 한 "BRICK"이 그대로 일어난다.
>    **실측**: 메모리 백엔드(PGlite + 실제 마이그레이션)에서 공개된 세미나에 라우트와 같은 변환(`kstInputToIso` + `slice(11,16)`)을 거친
>    `2027-10-01T24:00`과 `2027-02-30T10:00`/`2027-03-01T12:00`을 넣었다. 두 경우 모두 `seminars` 테이블을 읽을 수 없게 됐다
>    (재현: `seminars.test.ts:283-289`의 `published()` 설정에 이어 `updateSeminarSchedule`을 부른 뒤 캐시를 비우고 `getTable`을 호출).
>
> 25-26행 주석이 이 함수의 존재 이유로 든 "poisoning the stored table (review C1)"이 이 함수를 통과한 값으로 실제로 일어난다.
> 그래서 🔴이다. flow가 쓰기 게이트 없이 저장하는 것은 별개의 결함이다(`data/flows`·`atomic_flows.sql` 문서의 몫). 이 함수를 고치면
> 이 입력 부류는 flow에 닿기 전에 막힌다. 처방에 더할 것: 도메인에는 이미 올바른 검사(`isCalendarDateTime`)가 있으니
> `localDateTimeSchema`·`admin-seminars`의 `localDateTime`도 그것을 쓰게 한다.

25-26행 주석: "Malformed input must fail loudly here … poisoning the stored table (review C1)."
27행 정규식은 **자릿수**만 보고, 31행은 `NaN`만 거른다. 그런데 V8은 범위 안의 잘못된 날을 `NaN`이 아니라
**다음 달로 넘긴다**(Node로 확인):

| 입력               | 결과                                |
| ------------------ | ----------------------------------- |
| `2026-02-30T10:00` | `2026-03-02T10:00:00+09:00`         |
| `2026-04-31T10:00` | `2026-05-01T10:00:00+09:00`         |
| `2026-01-01T24:00` | `2026-01-02T00:00:00+09:00`         |
| `2026-02-32T10:00` | `VALIDATION_FAILED` (여기만 잡힌다) |

즉 주석이 막겠다고 한 "조용한 오염"이 NaN 대신 **그럴듯한 다른 날짜**의 형태로 통과한다. 같은 레포가 이 현상을 이미
알고 막는다 — `domain/term.ts:35-36` "a bare date must name a real day (2026-02-29 rolls over otherwise)".
이 함수에는 그 왕복 검사가 없다.

호출부는 관리자·스터디 운영자의 일정 입력 전부다(`admin/events/new/+page.server.ts:44`, `admin/+page.server.ts:303-304,355-356`,
`admin/activities/+page.server.ts:70-71,99-100`, `admin/seminars/+page.server.ts:194-201`,
`study/[id]/manage/+page.server.ts:162,177`). 브라우저의 `datetime-local` 위젯은 이런 값을 만들지 않지만
서버는 폼 POST를 신뢰할 근거가 없다.

처방: 파싱한 결과를 `toKstIso(d).slice(0, raw.length)`로 되돌려 `raw`와 비교하고 다르면 `VALIDATION_FAILED`
(`term.ts:36`과 같은 왕복 검사).
**동작 변경**(지금 통과하는 불가능한 날짜가 거부된다).

## LA09-2 🟡 `endOfKstDay`는 잘못된 입력에서 조용히 "만료되지 않음"이 된다

> **검증 정정**: 등급은 그대로이고 결함이 있는 자리를 바로잡는다. fail-open은 `endOfKstDay`만의 성질이 아니다.
> `expiryOf`(`events.ts:26-30`)의 다른 갈래 `new Date(event.date.end)`도 똑같이 Invalid Date를 만들고, 열림을 만드는 것은
> `effectiveStatus`의 `expiryOf(event) < now`(36행)다. NaN과의 비교는 항상 false이기 때문이다. 처방대로 `endOfKstDay`만 throw하게
> 바꾸면 `date.end` 갈래는 그대로 열려 있다. 두 갈래를 모두 닫으려면 비교하는 쪽(`effectiveStatus`)이 NaN을 만료로 다뤄야 한다.

35-44행은 입력을 검사하지 않는다. `new Date("garbage")`는 Invalid Date이고 이후 연산도 전부 `NaN`이다.
유일한 호출부 `events.ts:26-38`에서 `expiryOf(event) < now`가 `NaN < now` → `false` → `effectiveStatus`가
`"active"`를 유지한다. **출석 게이트가 영원히 열린다(fail-open).** 같은 파일의 `kstInputToIso`가 25-31행에서 세운
"잘못된 입력은 크게 실패한다" 원칙과 반대 방향이다.

저장 스키마(`schemas/common.ts:13` `DateTime`)가 쓰기 시점에 형식을 막지만, 그것은 이 함수의 계약이 아니다 —
`string`을 받는 순수 함수가 자기 출력의 의미(만료 시각)를 입력 유효성에 기대고 있다.

처방: `Number.isNaN(d.getTime())`이면 throw. **동작 변경**은 비정상 데이터에서만 일어난다(열림 → 오류).

## LA09-3 🟡 "KST 변환"이 여러 곳에 흩어져 있다

> **검증 정정**: 등급은 그대로이고 범위를 넓힌다. (1) 중복이던 `LA06-2`를 흡수한다. `core/semester.ts:54-56`의
> "instant → KST 날짜 문자열"(오프셋을 더하고 `toISOString().slice(0,10)`)과 같은 모양이 `scripts/seed-dev.ts:39`, `scripts/migration/lib.ts:349`에도 있다.
> (2) datetime-local 입력 정규식이 도메인에 세 벌 있고(`domain/studies.ts:85`, `admin-dashboard.ts:95-98`, `admin-seminars.ts:137-143`),
> 달력 검사(`isCalendarDateTime`)는 그중 하나에만 붙어 있다. "새 코드가 다시 쓸 때마다 검증 규칙이 빠진다"는 이 지적의 비용이
> 이미 현실이 됐다. 그것이 LA09-1의 관리자 경로다.

- 오프셋 상수: 5행, `core/semester.ts:8`, `domain/term.ts:10`, `services/maintenance.ts:202` — 서버·도메인에 네 벌
- `"+09:00"` 리터럴: 15·30행, `domain/term.ts:32`, `domain/studies.ts:183`
- `toKstIso`의 재구현: `scripts/seed-dev.ts:31-35`, `scripts/migration/lib.ts:322-326` — **다른 알고리즘**
  (`toISOString().slice(0,19)`)이고, 같은 스크립트가 `src/lib/domain/term`은 이미 import한다(`seed-dev.ts:14`, `lib.ts:24`)
- `kstInputToIso`의 무검증 재구현: `domain/studies.ts:182-184` `localKstDateTimeToIso` — 테스트(`studies.test.ts:54`)
  말고는 호출부가 없다

KST에는 서머타임이 없어 상수 값이 바뀔 일은 없다. 비용은 "KST 시각을 어떻게 다루는가"가 한 곳에 없어서
새 코드가 매번 다시 쓰고, 그때마다 LA09-1·LA09-2 같은 검증 규칙이 빠진다는 데 있다.
이 파일의 순수 함수들(`toKstIso`, `kstInputToIso`, `endOfKstDay`)은 서버 의존이 `AppError` 하나뿐이다 —
`domain/term.ts` 옆(브라우저 안전)으로 옮기면 스크립트·도메인이 import할 수 있다. **구조만 바뀐다.**

## LA09-4 🟡 탈퇴 유예 "단일 정의"가 숫자에만 적용되고, 문구와 계산은 따로 산다

> **검증 정정**: 등급은 그대로이고 하위 주장 하나를 좁힌다. `deleteAfter`는 저장값이 아니라 두 서비스가 그때그때 계산해
> 보여 주는 값이다. 그래서 "3행(저장 형식은 KST 오프셋)과 다르다"는 계약 위반이 아니라 표시 형식이 일관되지 않다는 문제일 뿐이다. 나머지 세 항목(문구 "1개월",
> 계산 두 벌 — `withdrawal.ts:53-55`·`members-admin.ts:179-181` —, 정책 상수의 위치)은 확인했다.

8행 `WITHDRAWAL_GRACE_MS = 30일`, 7행 주석 "single definition". 그러나

- **사용자 문구는 "1개월"이다** — `settings/withdraw/+page.svelte:91,103`, `admin/members/[id]/+page.svelte:73`,
  `components/admin/MemberRecordSections.svelte:314`, `mail/template-store.ts:229`. 상수를 바꿔도 다섯 곳의 문구는
  그대로이고, 애초에 "1개월"과 30일은 같은 기간이 아니다(28-31일)
- **마감 계산이 두 벌이다** — `withdrawal.ts:53-55`와 `members-admin.ts:179-181`이 `requestedAt + WITHDRAWAL_GRACE_MS`를
  각각 계산한다. 둘 다 `toISOString()`(UTC `Z`)으로 내보내 3행 "instants are stored as ISO 8601 with the KST offset"과도 다르다
- **정책 상수가 시간 유틸 모듈에 있다** — MEM-07 탈퇴 정책은 `withdrawal.ts`의 관심사다

처방: `withdrawal.ts`에 `deleteAfter(requestedAt)` 하나를 두고 상수를 함께 옮긴다. 문구는 기간을 "30일"로 맞추거나
상수에서 파생한다. 계산 통합은 **구조만**, 문구·출력 형식 정리는 **동작 변경**(표시)이다.

## LA09-5 🔴 (검증 추가) `toKstIso`가 연도를 네 자리로 채우지 않는다 — 1000년 이전 연도 입력이 ISO가 아닌 문자열로 저장돼 테이블을 벽돌로 만든다

14행 `${t.getUTCFullYear()}`는 월·일·시와 달리 `pad`를 거치지 않는다. 27행 정규식 `\d{4}`는 `0202`처럼 0으로 시작하는 연도를 받는다.
따라서 `kstInputToIso("0202-10-01T10:00")`은 `"202-10-01T10:00:00+09:00"`을 돌려준다. ISO 8601도 아니고 저장 스키마 `DateTime`도 거부하는 값이다
(zod `datetime({offset:true})`로 확인). 25-26행이 "새지 않게 한다"고 한 바로 그 부류다.

- **입력 스키마가 막지 않는다.** 관리자 쪽 `localDateTimeSchema`·`admin-seminars`의 `localDateTime`은 모양만 본다. 스터디 쪽 `isCalendarDateTime`
  (`domain/studies.ts:88-100`)은 `Date.UTC`가 0-99년을 1900년대로 바꾸므로 0000-0099년만 우연히 막고, **0100-0999년은 통과시킨다**
  (스키마를 직접 실행해 확인).
- **`mutate` 경로**(관리자의 이벤트·활동 편집)는 쓰기 게이트가 `VALIDATION_FAILED`로 막는다 — 크게 드러나는 실패다.
- **SQL flow 경로는 막히지 않는다.** Postgres는 `'202-10-01T10:00:00+09:00'::timestamptz`를 0202년으로 받아들여(PGlite로 확인) 오류 없이 커밋한다.
  - **스터디 회차**: `study/[id]/manage`의 `createSession`·`updateSession` → `flow_create_study_session`·`flow_update_study_session`.
    **관리자가 아니라 스터디 운영자(일반 회원)가 닿는 경로다.** `createStudySession`으로 실측한 결과, 커밋 뒤 `activities`·`events` 두 테이블을 읽을 수 없게 됐다(`updateSession`은 같은 모양의 flow를 거치므로 같은 결과로 추정하며, 실측하지는 않았다).
  - **공개된 세미나 일정 수정**: `flow_update_seminar_schedule`. 실측 결과 `seminars`·`activities`·`events` 세 테이블을 모두 읽을 수 없게 됐다.

위젯도 이런 값을 원천 차단하지 않는다. 레포의 `datetime-local` 입력 8곳 가운데 `min`을 준 곳이 없어, 1000년 이전 연도도 형식상 유효한 입력이다(연도 오타 하나로 만들어진다).
그러면 출석·활동·세미나를 읽는 모든 화면이 500이 되고, `mutate`도 먼저 디코드하므로(`tables.ts:121-122`) 앱 안에서는 복구할 수 없다.
LA09-1과 원인이 다르다(롤오버가 아니라 서식 결함). 그러나 결과와 등급이 같아 따로 적는다.

처방: 14행을 `String(t.getUTCFullYear()).padStart(4, "0")`로 고친다(**동작 변경**: 1000년 이전 값의 서식). 또는 입력 정규식을 `^(19|20)\d{2}-…`처럼
쓸 수 있는 연도로 좁힌다(**동작 변경**: 입력 거부). LA09-1의 왕복 검사(`toKstIso(d).slice(0, raw.length) === raw`)를 넣으면
`"202-…" ≠ "0202-…"`이므로 이 부류도 함께 막힌다 — 두 지적을 한 번에 닫는 처방이다.

## 확인했고 지적하지 않은 것

- **`toKstIso`가 밀리초를 버린다** (13-16행) — `API-SPEC §2`의 저장 형식(초 단위 + `+09:00`)과 맞다
- **`kstInputToIso`가 초 있는 입력도 받는다** (27행 `(:\d{2})?`, 30행) — `datetime-local`의 `step`에 따라 초가 붙을 수 있다
- **`endOfKstDay`가 "다음 날 00:00 KST"를 돌려준다** — 배타적 상한이고 호출부가 `<`로 비교한다(`events.ts:36`). 이름과 쓰임이 맞다
- **`nowKstIso()`** — `toKstIso(new Date())`의 한 줄 래퍼지만 테스트 밖 호출이 40곳 남짓이고 의도를 이름으로 말한다

## 검증 (2026-09-28)

- LA09-1 — 정정 🟠 → 🔴 (롤오버를 재확인했다. 스터디 경로는 `isCalendarDateTime`이 막으므로 호출부 목록에서 뺐고, 관리자 경로 다섯 곳은 모양만 검사한다. 결과를 넓혔다. 문자열 순서 검사가 무력해지고, 공개된 세미나 flow 경로에서 `seminars` 테이블이 벽돌이 된다. PGlite 메모리 백엔드로 실측)
- LA09-2 — 정정 (등급 유지. fail-open은 `effectiveStatus`의 NaN 비교에 있고, `date.end` 갈래도 같다. `endOfKstDay`만 고치는 처방으로는 닫히지 않는다)
- LA09-3 — 정정 (등급 유지. LA06-2를 흡수했다. datetime-local 정규식 세 벌 가운데 한 벌에만 달력 검사가 있음을 더했다)
- LA09-4 — 정정 (등급 유지. `deleteAfter`는 저장값이 아니므로 "3행과 다르다"는 표시 형식의 불일치로 좁혔다)
- LA09-5 — 추가 🔴 (연도를 네 자리로 채우지 않음. 0100-0999년 입력이 스터디 운영자 경로로도 들어가 flow가 `activities`·`events`를 벽돌로 만든다. 실측)
- 누락 점검: `kstInputToIso` 호출 13곳(5개 파일)과 각 앞단 도메인 스키마, 쓰기 경로(`mutate` 게이트 대 SQL flow)를 따라갔다. 스키마를 실행했고, 공개된 세미나·스터디 회차 flow를 메모리 백엔드에서 실제로 돌려 확인했다. `toKstIso`의 외부 호출부는 없다(`nowKstIso`·`kstInputToIso`만 쓴다).
