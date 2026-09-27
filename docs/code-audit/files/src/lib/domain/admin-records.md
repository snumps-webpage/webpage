# `src/lib/domain/admin-records.ts` (129줄)

**접두사 `LC03-`** · 기록 편집기(활동·갤러리·세미나·스터디)의 DTO 타입과 `?/create`·`?/update` 입력 스키마.

## LC03-1 🟠 활동의 날짜 구간에 순서 규칙이 없다 — 이벤트 스키마가 막는 역순 구간이 활동을 거쳐 이벤트로 들어간다

> **검증 정정**: 등급(🟠)과 기전은 그대로 두고, 결과 한 줄을 좁힌다. "그 세션은 `active`로 만들어지는 순간 `expired`다"는
> 종료 시각이 이미 지났을 때에만 맞는 말이다. 그리고 그 경우라면 역순이 아닌 과거 활동도 똑같이 즉시 종료된다.
> `effectiveStatus`는 `expiryOf < now`로 판정하므로(`events.ts:36`) 역순 구간 고유의 결과는 따로 있다. **출석 창이 활동의 시작 시각
> 이전에 닫혀서, 시작 시각 이후에는 한 번도 열리지 않는다**는 것이다. 나머지는 확인했다. `connectActivity`가 `status: "active"`로
> 활동의 `date`를 그대로 복사한다(`events.ts:95,109`). update 액션은 `start`가 비면 `date: undefined`를 보내고, `updateActivity`의
> `definedOnly`가 그것을 떨궈 보낸 `end`가 버려진다(`activities/+page.server.ts:97-102`, `records-admin.ts:38-48`).

73-80행 `adminActivityRecordSchema`는 `start`·`end`를 각각 형식만 본다. "종료 > 시작"이 없다.
같은 날짜 쌍을 다루는 이벤트 스키마는 그것을 막는다(`admin-dashboard.ts:110-118`). 저장 계층도 막지 않는다
(`schemas/common.ts:26-29` `DateRange`는 두 `DateTime`뿐).

결과:

- 관리자는 종료가 시작보다 앞선 활동을 저장할 수 있다
- 그 활동에 출석 세션을 붙이면(`events/connect` → `connectActivity`, `services/events.ts:90-96`) 이벤트가 활동의 `date`를
  **그대로 복사**한다(`events.ts:109`). 이벤트 편집 폼이라면 400이었을 구간이 이 경로로는 들어가고,
  `expiryOf`(`events.ts:26-30`)가 종료를 쓰므로 그 세션은 `active`로 만들어지는 순간 `expired`다
- 83-85행의 update 스키마는 `start: ""`와 `end: "<값>"`을 함께 통과시킨다. 액션은 `start`가 비면 `date` 전체를
  `undefined`로 보내므로(`activities/+page.server.ts:97-102`) **보낸 종료 시각이 소리 없이 버려진다** — 스키마가 받아들인 입력을 액션이 무시한다

처방: 두 스키마에 `superRefine`으로 (a) `end && start && end <= start` 거부, (b) update에서 `end`만 있고 `start`가 없으면 거부.
순서 비교는 `admin-dashboard.ts`의 LC02-2(형식만 보는 `localDateTimeSchema`) 위에서 돌므로 그 수정과 함께 가야 한다.
**동작 변경**(지금 저장되는 입력이 400이 된다).

## LC03-2 🟡 학기 형식 정규식이 서버 상수의 손 사본이다 — 도메인에만 세 벌

> **검증 정정**: 사실은 맞고 등급(🟡)도 유지한다. 다만 **이미 센 결함이다.** `core/semester.md`의 **LA06-1**(🟡, 검증)이 복사본
> 표에 `domain/admin-records.ts:67`을 올렸다. 그 표에는 `studies.ts:80`, `public-content.ts:78`, `TERM_PATTERN` 사본 셋,
> SQL `app_may_derive_semester`까지 있어서 이 문서의 "네 곳"보다 넓다. 처방(`domain/term.ts`로 옮기기)도 같다. 백로그에서는 LA06-1 한 건으로 센다.
> 이 문서에 남는 것은 "67행이 그 사본 중 하나"라는 위치 기록뿐이다.

67행 `/^\d{2}-(?:[12SW])$/`는 `server/core/semester.ts:17` `SEMESTER_PATTERN`과 같다. 같은 식이
`domain/studies.ts:80`, `domain/public-content.ts:78`(캡처 그룹만 다름)에도 있다. 네 곳을 묶는 테스트가 없다.

도메인이 서버를 import할 수 없으니 사본이 생겼는데, 방향이 거꾸로다 — `termOf`는 이미 도메인(`domain/term.ts`)에 두고
서버가 다시 내보낸다(`semester.ts:19-21`). 학기 형식도 그렇게 하면 된다.
방학 학기 표기가 바뀌면(예: `YY-S1`) 저장 스키마(`schemas/common.ts:17`)만 고쳐도 테스트는 초록이고,
편집기는 새 형식을 "학기는 YY-1·YY-2·YY-S·YY-W 형식이어야 합니다."로 거절한다.
처방: 패턴을 `domain/term.ts`로 옮기고 나머지가 import한다. 구조 변경.

## LC03-3 🟡 `description`이 같은 파일 안에서 서로 다른 저장 필드를 가리킨다

- 세미나(93-105행): 주석대로 "description (posted as `note`)". 액션은 이것을 **`note`**(비고)에 쓴다(`seminars/+page.server.ts:150,266,289`),
  DTO의 `AdminSeminarRecord.description`(19행)도 `s.note`로 채워진다(`:107`)
- 스터디(107-124행): `description`은 저장 필드 **`description`**이고, `note`는 따로 있다(`studies/+page.server.ts:83-85,120-122`)

그런데 세미나에도 별도의 저장 필드 `description`(소개글, 공개 상세의 "1. 개요")이 있고, 스키마 주석이 그것을
"`note`(비고)와는 다른 글"이라고 못박는다(`schemas/seminar.ts:71-75`). 이 파일의 세미나 `description`은 그 필드가 아니다.
결과: 세미나 편집기의 "세미나 설명" 칸(메시지 "세미나 설명은 2400자 이하로…", 100행)은 비고를 고치고,
누군가 진짜 소개글 편집을 붙이려 하면 이름이 이미 점유돼 있다. 같은 파일에서 같은 단어가 두 의미를 가진다.
처방: 세미나 쪽 필드를 `note`로 개명(편집기 `issues` 키 포함). 구조 변경. 소개글을 편집기에 노출할지는 별도 결정.

## LC03-4 🟡 사용자에게 zod 영어 기본 문구가 나가는 자리

- 메시지 없는 상한: 74·95·113행 `.max(160)`(제목 셋), 89행 `.max(20)`(연도). 초과 시 `"Too big: expected string to have <=160 characters"`
- 79·84행 `z.union([z.literal(""), localDateTimeSchema])` — 형식이 틀린 값은 `invalid_union`의 `"Invalid input"`으로 보고되고
  `localDateTimeSchema`의 한국어 문구는 union 내부에 묻힌다(`admin-dashboard.ts` LC02-3에서 실측)

같은 스키마의 다른 제약은 모두 한국어 메시지를 단다. 편집기들은 `issues`를 필드 옆에 렌더한다.
처방: 문구 추가, union은 `refine`으로. 표시만 바뀐다.

## 확인했고 지적하지 않은 것

- **본문 필드를 필수로 하지 않음**(56-62행 주석) — 이주된 행에 설명·자료가 없어도 편집할 수 있게 한 의도. 상한은 모두 있다
- **`pickedIdSchema`가 빈 값을 허용**(70행) — "선택 안 함"이 정상값인 칸(갤러리 `activityId`)용이다. 필수인 곳은 `.min(1, …)`을 덧붙인다(128행). `admin-dashboard.ts`의 id 스키마와 의미가 달라(빈 값 허용) 중복으로 보지 않는다
- **스터디 제목 `min(2)` vs 세미나 `min(1)`** — 하한 2는 스터디 신청 스키마(`domain/studies.ts:60-64`)와 같다. 상한은 신청 120·기록 160으로 기록이 넓지만, 저장 스키마(`schemas/study.ts:9` `min(1)`)를 벗어나는 값을 만들지는 않는다
- **`localDateTimeSchema`를 `admin-dashboard.ts`에서 가져옴**(3행) — 사본을 만들지 않은 것은 옳다(`admin-seminars.ts`는 만들었다). 범용 원시값이 화면 전용 모듈에 사는 위치 문제는 있지만 결함은 아니다
- **`AdminStudyTransferHistoryEntry`의 필드 개명**(34-39행: `from/to/at` → `fromMemberId/toMemberId/changedAt`) — DTO가 저장 모양을 화면 어휘로 옮기는 자리다. 의도된 번역이다
- **`adminActivityRecordUpdateSchema`의 `start` 선택화**(82-85행) — "보내지 않으면 날짜를 건드리지 않는다"는 편집기 계약과 일치한다(문제는 LC03-1의 `end` 단독 입력뿐)
- **레코드 타입이 쓰기 가능한 `RECORD_ACTIVITY_TYPES`로 제한**(75-77행) — 표시 전용 어휘("문제 풀이")를 거부한다. 테스트가 고정한다(`admin-records.test.ts:13-25`)

## 검증 (2026-09-28)

- LC03-1 — 정정 (🟠 유지. "만들어지는 순간 expired"를 "시작 시각 이후에는 출석 창이 한 번도 열리지 않는다"로 좁혔다. `start` 없이 `end`만 보내면 조용히 버려진다는 것은 `definedOnly`까지 따라가 확인했다)
- LC03-2 — 정정 (🟡 유지. LA06-1이 이미 센 사본이므로 한 건으로 센다)
- LC03-3 — 확인 (세미나 `description`은 폼 `note` → 저장 `note`로 간다(`seminars/+page.server.ts:150,266,289`). 스터디 `description`은 저장 `description`이다(`studies/+page.server.ts:83-85`). 편집기 칸 이름은 "설명"(`AdminSeminarRecordEditor.svelte:151,274`)이고, "세미나 설명"은 100행의 메시지 문구다. 같은 어긋남이 `admin-seminars.ts:66` `AdminSeminarItem.description`에도 있다. 로드가 `s.note`로 채운다(`seminars/+page.server.ts:73`). 개명 처방이 그 DTO도 함께 덮어야 한다)
- LC03-4 — 확인 (union과 메시지 없는 `.max`의 영어 문구는 LC02-3과 같은 방식으로 실측했다. 코드는 이 파일의 79·84행에 따로 있으므로 LC02-3의 중복이 아니다)
- 누락 점검: 129줄을 문서 없이 다시 읽었다. 갤러리 `year`에 형식이 없는 것은 이주값 "미상" 때문에 의도된 것이다(87행 주석). `adminStudyRecordCreateSchema`의 `pickedIdSchema.min(1)`은 빈 값 허용을 필수로 바꾸는 올바른 합성이다. 새 지적은 없다.
