# `src/lib/server/services/events.ts` (392줄)

**접두사 `LB20-`** · 이벤트(출석 세션) 수명주기, 체크인, 참여 신청, 발표자 출석 관리, 출석 큐 관리, 그리고 시간별 크론(`runCron`).
다문서 쓰기 셋(`checkIn`·`decideAttendance`·`deleteEventChecked`)은 plpgsql 흐름으로 간다.

## LB20-1 🟠 `setEventStatus("active")`는 날짜가 지난 이벤트를 다시 열 수 없는데 성공을 보고한다

상태의 진실은 게으르다 — 22-24행 "gates check `effectiveStatus()`, never the stored value".
`effectiveStatus`는 저장값이 `active`여도 만료 시각이 지났으면 `expired`를 낸다(36행).
그런데 `setEventStatus`(128-139행)는 **저장값만** 바꾼다.

관리자 대시보드는 유효 상태(`admin/+page.server.ts:92`)로 버튼을 정하고, `adminEventCapabilities`는
`expired`에 **재활성화를 허용한다**(`domain/admin-dashboard.ts:135`). 날짜가 지나 `expired`로 보이는 이벤트에서 누르면:

- 저장값이 아직 `active`(크론 전)면 136행이 같은 값을 쓰고, `mutate`가 무변경 쓰기를 건너뛴다(`data/tables.ts:124`)
- 저장값이 `expired`(크론 후)면 `active`로 쓰지만 `effectiveStatus`는 여전히 `expired`이고, 다음 크론(363-372행)이 되돌린다

두 경우 모두 액션은 `{}`로 성공하고 화면은 그대로 `expired`다. 체크인도 열리지 않는다(`app_event_open`, 162행).

뿌리는 **전이 규칙의 소유자가 둘**이라는 것이다 — 허용 전이는 UI용 capability(`admin-dashboard.ts:130-140`)에만 있고,
서비스는 "`cancelled`는 종단"(135행) 하나만 강제한다. 라우트(`admin/+page.server.ts:239-256`)는 capability를 보지 않으므로
POST 한 번으로 `draft → expired`도 된다(UI는 막는다).
**처방(동작 변경)**: 서비스가 전이 표를 소유하고, 만료 시각이 지난 이벤트의 활성화는 `CONFLICT`(또는 날짜 수정 요구)로 거절한다.
capability는 그 표에서 파생한다.

## LB20-2 🟠 발표자 출석 저장이 캐시된 이벤트로 판정하고 다른 문서에 쓴다 — 흐름 밖의 다문서 결정

> **검증 재현 (2026-09-28)**: 확인. 메모리 저장소 일회용 vitest(실행 후 삭제)로 재현했다 —
> 신청 → 승인 → 확정 → 공개(10일 뒤 시작)한 세미나에 회원 A가 신청하고, 이 인스턴스가
> `getMemberVisibleEvents()`로 캐시를 데운 뒤, **다른 인스턴스의 취소**를 `flow_cancel_seminar`를 저장소에 직접
> 호출하는 것으로 흉내 냈다(`callFlow`를 거치지 않으므로 이 인스턴스의 캐시 무효화가 일어나지 않는다).
> 이어서 `savePresenterAttendance(eventId, presenter, [A])`는 **성공했고**, 저장소를 새로 읽으면 세미나
> `cancelled`·이벤트 `cancelled`인데 활동 `attendeeIds`에 A가 들어 있었다. 그 뒤 `deleteSeminar`는
> **`CONFLICT`** 로 거절됐다(`atomic_flows.sql:231-240`의 "발표자 외 출석" 검사).
> 대조군(취소 후 캐시 무효화)에서는 저장이 `NOT_FOUND`로 거절되고 삭제가 성공했다.
> 거절은 영구적이지 않다 — 관리자가 `/admin/activities`의 `setAttendees`로 출석을 비우면 풀린다. 등급은 그대로 둔다:
> 261행 주석이 약속한 "취소된 세미나에는 기록을 남길 수 없다"가 캐시 창 안에서 깨지는 것이 결함 자체다.
> 같은 삭제 거절은 경쟁 없이도 생긴다 — LB20-8.

256-279행은 **`events` 문서를 읽고**(262행, `getMemberVisibleEvents` → `getTable` 캐시) 그 사본으로 세 가지를 정한 뒤
**`activities` 문서에 쓴다**(268행):

1. 취소되지 않았다(261행 주석 "취소된 세미나에는 기록을 남길 수 없다")
2. 호출자가 발표자다(264행)
3. 선택 가능한 신청자 풀(273행 `event.applicantIds`)

캐시 사본은 다른 인스턴스의 쓰기를 최대 15초(로컬), Redis 무효화 소실 시 300초까지 모른다
(`data/tables.ts:31-37`, W-13). 이 파일의 다른 두 판정은 그 이유로 흐름으로 갔다 —
`checkIn`(152-157행 "the cached copy may be up to 15s old, and a delete or cancel may have committed since"),
`decideAttendance`(284-287행 "decided on the row as it is then, not as a page load showed it").
`ATOMIC-FLOWS.md` §7은 이 함수를 흐름 목록에도, "옮기지 않은 것(단일 문서 CAS)" 목록에도 넣지 않았다 —
두 문서에 걸치므로 단일 문서 CAS가 아니다.

결과: 취소 직후(다른 인스턴스)의 저장이 **가려진 활동에 출석을 기록한다.** 그 기록은 발표자 외 출석이므로
`flow_delete_seminar`가 그 세미나의 삭제를 `CONFLICT`로 거절하게 만든다(`atomic_flows.sql:231-240`).
신청을 방금 취소한 회원도 낡은 풀 안에서 인정될 수 있다.
**처방(동작 변경 없음 — 원자성만)**: `flow_decide_attendance`처럼 이벤트를 `FOR SHARE`로 읽는 흐름으로.

## LB20-3 🟠 "신청 가능" 규칙과 "세미나 종류" 판정이 라우트에 복제돼 있다

**신청 가능**: 178-182행 `assertOpenForApplication`(유효 상태 `active` + 시작 전)은 비공개 함수다.
그래서 대시보드가 같은 규칙을 다시 적었다 — `(public)/+page.server.ts:98,105-109`
(`effectiveStatus(event, now) === "active" && !started`). 그 주석이 목적을 말한다:
"must not advertise an apply button it will reject". 즉 두 사본은 **일치해야 하는 한 규칙**인데,
정원·신청 마감 같은 조건을 하나 더하면 두 곳을 고쳐야 하고, 한쪽만 고치면 버튼이 거절될 신청을 광고한다.

**세미나 종류**: 40-45행은 `presentsEvent`를 "the single owner of that rule"이라 부르고
172-176행 `isSeminarType`이 종류 판정을 가진다. 그런데 같은 대시보드의 `pendingAttendance`가
`activity.type === "세미나"`로 판정을 다시 적는다(`(public)/+page.server.ts:111`). 44행이 예고한
"두 번째 세미나 종류"가 생기면 그 줄은 조용히 빠진다.

**처방(구조만)**: `isOpenForApplication(event, now)`를 export해 서비스의 assert와 라우트가 같이 쓰고,
라우트의 종류 비교를 `isSeminarType`으로.

## LB20-4 🟡 `updateAttendanceTime`이 시각 순서 불변식을 모른다

318-329행은 `{ startTime?, endTime? }` **부분 패치**를 받아 그대로 덮는다. "시작 ≤ 끝"은 라우트의 폼 스키마
(`adminAttendanceTimeInputSchema`, `domain/admin-dashboard.test.ts:36-47`이 고정)에만 있다.
지금 호출부(`admin/+page.server.ts:354-357`)는 둘을 다 보내지만, 시그니처는 `startTime`만 보내는 호출을 허용하고
그 경우 기존 `endTime`보다 늦은 시작이 저장된다. README 판정 기준대로 "그런 호출부가 아직 없다"는 감면이 아니다.
**처방**: 병합 후의 행에서 순서를 검사하거나(동작 변경 — 거절 추가), 시그니처를 둘 다 필수로(구조만).

## LB20-5 🟡 크론 `expire` 스텝이 만료 판정을 두 번 더 적고, 센 수와 쓴 수가 다를 수 있다

- 만료 판정 `e.status === "active" && expiryOf(e) < now`가 36·364·368행에 세 번 있다.
  `effectiveStatus(e, now) === "expired" && e.status === "active"`, 혹은 술어 하나로 모을 수 있다
- 363-365행은 개수를 **캐시된 `getTable`** 에서 세고, 366행 `mutate`는 **저장소를 직접** 읽는다(`tables.ts:120`).
  두 읽기가 다른 시점·다른 출처이므로 보고되는 `expired`는 실제로 바뀐 행 수와 다를 수 있다
  (다른 인스턴스가 방금 활성화·만료시킨 이벤트)
- 361-362행의 근거 "counting inside the fn would double on conditional-write retries"는 틀린 이유다 — 시도마다
  카운터를 다시 대입하면 된다. 이 저장소가 이미 그렇게 한다(`seminar-requests.ts:86-90`,
  `records-admin.ts:123-127` "CAS 재시도마다 다시 센다")

집계값만 틀린다. 동작 변경 없음.

## LB20-6 🟡 크론 등록 구조의 잔재 — 낡은 주석, 소비자 없는 export, 소비자 없는 신호

`registerCronStep`은 `b692e91`에서 삭제됐다(유일한 사용자가 `40891fd`에서 사라졌다). 남은 것:

- 349행 "later tasks register their own steps" — 등록 API가 없다
- 351-354행 `export type CronStep` — import하는 곳이 없다(`maintenance.ts:16`은 주석에서 이름만 언급)
- 388-390행 `steps_total` — 주석은 "라우트가 부분 실패와 전체 실패를, 빈 레지스트리와 전부 초록을 구별하려면 필요하다"고
  하지만 **아무도 읽지 않는다.** `cronFailures`(`cron-status.ts:18-30`)는 이 키를 보지 않고, 라우트
  (`api/cron/sync-events/+server.ts:16-25`)는 펼쳐서 내보낼 뿐이다. 주석이 막겠다는 "빈 레지스트리 = 초록"은
  그대로 초록이고 heartbeat도 울린다. 게다가 루프 **뒤** 대입이라 스텝이 같은 키를 반환하면 덮는다(PRIORITY W-12 ①, 미처리)
- 크론 실행기 자체가 이벤트 서비스에 산다. 스텝은 이벤트 하나뿐이고 형제 크론(`maintenance.ts`)은 따로 있다

**처방(구조만)**: 주석 정리, `CronStep` export 제거. `steps_total`은 집계가 쓰게 하거나(`=== 0`이면 실패 — 동작 변경) 지운다.

## LB20-7 🟡 파일 밖 소비자가 없는 export

`expiryOf`(26)·`presentsEvent`(46)·`isSeminarType`(174)은 이 파일 안에서만 쓰인다
(테스트 포함 `src` 전체 검색). 특히 `presentsEvent`는 "the single owner of that rule"(41행)인데,
정작 규칙을 다시 적은 라우트(LB20-3)는 그것을 쓰지 않는다 — 공개 표면만 넓고 쓰이지 않는다.
LB20-3을 하면 `isSeminarType`은 소비자가 생긴다. 나머지는 export를 내린다. 구조만.

## LB20-8 🟡 (검증 추가) 발표자 출석 저장에 시간 조건이 없어, 열리기 전의 "출석"이 취소된 세미나의 삭제를 막는다

55-58행은 "attendance is recorded AFTER the seminar"라고 적고 **상태** 조건을 일부러 두지 않았다. 그러나 256-279행에는
**시각** 조건도 없다 — 시작 전에도 신청자를 출석으로 저장할 수 있다. 일어나지 않은 세미나의 출석은 논리적으로 성립하지 않는다.

이것이 다른 규칙과 맞물린다: 발표자는 **시작 전에만** 자기 세미나를 취소할 수 있고(`flow_cancel_seminar`, `atomic_flows.sql:476-486`),
취소는 활동과 출석을 **남긴다**(`:446-449` 주석). 그러면 `flow_delete_seminar`의 "발표자 외 출석" 검사(`:231-240`)가
그 가짜 출석을 "출석 증거"로 읽어 삭제를 `CONFLICT`로 거절한다. 흐름의 전제(취소된 세미나에 남은 출석은 실제로 치른 흔적)를
이 함수가 지키지 않는 것이다. 경쟁이 필요 없는 경로다.

재현(일회용 테스트, 삭제함): 10일 뒤 시작하는 공개 세미나에서 시작 전에 `savePresenterAttendance`로 신청자를 저장 →
발표자 취소(성공) → `deleteSeminar`가 `CONFLICT`. 관리자가 `/admin/activities`에서 출석을 비우면 풀린다.

**처방(동작 변경)**: 저장 조건에 `new Date(event.date.start) <= now`를 더한다(`assertOpenForApplication`의 반대 조건).
LB20-2의 흐름화를 하면 그 흐름 안에서 같이 판정한다.

## 확인했고 지적하지 않은 것

- **`effectiveStatus` ↔ `app_event_open`** — `expiryOf < now`면 만료, SQL은 `>= p_now`면 열림. 같은 경계다.
  `flow-rules.test.ts:57-124`가 경계값에서 대조한다. 끝 시각 없는 이벤트의 KST 자정도 `endOfKstDay`와 SQL이 같다
- **`hasPresenterEvents`에 상태 필터가 없는 것(60-64행)** — 53-59행이 이유를 적은 의도이고 PRIORITY W-10이 그 방향을 확정했다.
  재제기하지 않는다
- **`checkIn`의 TS 선검사(162행)** — 흐름이 잠금 아래서 다시 판정한다(`atomic_flows.sql:535`). 선검사는 빠른 거절일 뿐
  정확성을 책임지지 않는다. 가려진 활동 판정은 흐름에 없지만, 가림의 원인인 취소는 이벤트를 `cancelled`로 바꾸므로
  `app_event_open`이 막는다
- **`createEventWithActivity`의 두 번 쓰기(85·122행)** — `ATOMIC-FLOWS.md:135`가 알려진 한계로 기록했다(이벤트 없는 활동만 남는다)
- **`connectActivity`가 가려진 활동에도 세션을 붙이는 것** — `visibility.ts`가 회원 면에서 막고
  `cancelled-visibility.test.ts`의 "되살아나는 경로"가 고정한다
- **`applyToEvent`·`cancelEventApplication`** — 단일 문서 CAS 안에서 판정한다(188·205행). §7 "옮기지 않은 것"에 있다
- **`decideAttendance`의 세 래퍼(297-316행)** — 라우트 액션 이름과 1:1이고 얇다. 과하지 않다
- **`getPendingAttendance`의 `"(삭제된 이벤트)"`·`"Unknown"`** — 관리자 화면의 표시용 폴백이다
- **`runCron`의 스텝 격리(380-387행)** — 한 스텝 실패가 다른 스텝을 굶기지 않고, 실패는 `_failed`로 집계에 닿는다(`cron-status.ts`)

## 검증 (2026-09-28)

- LB20-1 — 확인 (`admin-dashboard.ts:135` `canActivate`가 `expired`를 허용, `setEventStatus`는 저장값만 바꾸고 `mutate`의 무변경 생략은 `tables.ts:124`)
- LB20-2 — 확인 (일회용 테스트로 재현: 다른 인스턴스 취소 후 캐시 창 안의 저장이 성공해 취소된 세미나의 활동에 출석이 남고, `deleteSeminar`가 `CONFLICT`. 대조군은 `NOT_FOUND`·삭제 성공)
- LB20-3 — 확인 (`(public)/+page.server.ts:98,105-109,111`)
- LB20-4 — 확인
- LB20-5 — 확인
- LB20-6 — 확인 (`CronStep` import 없음, `steps_total`을 읽는 비테스트 코드 없음, `b692e91` 확인)
- LB20-7 — 확인 (`expiryOf`·`presentsEvent`·`isSeminarType`의 파일 밖 참조 없음)
- LB20-8 — 추가 (🟡 발표자 출석 저장에 시각 조건 없음 → 시작 전 저장 + 발표자 취소로 삭제 거절, 일회용 테스트로 재현)
- 누락 점검: 파일 전체를 흐름 SQL(`flow_cancel_seminar`·`flow_delete_seminar`·`flow_check_in`·`flow_decide_attendance`)과 맞대어 다시 읽었다. `applyToEvent`·`cancelEventApplication`은 가려진 활동 여부를 보지 않지만, 취소는 이벤트를 `cancelled`로 바꾸고 두 함수가 직접 읽기로 `effectiveStatus`를 보므로 막힌다(`connect`로 가려진 활동에 붙인 새 세션은 라우트의 `assertLedgerTarget`이 캐시로 거른다 — 라우트 문서의 영역). LB20-8을 추가했다.
