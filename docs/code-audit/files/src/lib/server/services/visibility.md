# `src/lib/server/services/visibility.ts` (61줄)

**접두사 `LB21-`** · 취소·미공개 세미나를 회원 면에서 가리는 규칙 — 가려진 활동 id 집합, 회원에게 보이는 이벤트,
활동 목록 필터. 소비자: `data/repos.ts:38,52`, `services/events.ts:62,224,262`, `(member)/events/[id]/[type]/+page.server.ts:17`,
`(public)/+page.server.ts:156,307`, `public/archive.ts:201`(죽은 접근자).

## LB21-1 🟠 "가려진 세미나" 판정식이 다섯 파일 일곱 곳에 있고, 그중 SQL 사본은 고정 테스트가 없다

> **검증 정정**: SQL 사본에 관한 주장을 좁힌다. 등급 🟠 유지(일곱 사본과 레이아웃의 재계산은 그대로 확인됐다).
> (1) **"고정 테스트가 없다"는 과장이다.** `flow-rules.test.ts`에 대조 케이스는 없지만, `v_hidden`의 결과는
> 행동 테스트가 일부 고정한다 — `records-admin.test.ts:429-444`가 `cancelled`·`unscheduled`에서 활동·세션·큐를 함께
> 지우는 것을 단언한다. 비어 있는 것은 **`scheduled`** 상태, **`published`에서 활동이 남는다는 단언**
> (`:586-592`는 세미나 행이 지워졌는지만 본다 — `v_hidden`이 참으로 뒤집혀도 통과한다), 그리고
> TS 판정식과 SQL 판정식을 같은 입력으로 맞대는 미러 테스트다.
> (2) 초판의 예시 "게시 예약 상태 추가"로는 사본이 갈라지지 않는다 — 새 상태는 TS(`!== "published"`)와
> SQL(`<> 'published'`) 양쪽에서 똑같이 "가려짐"이 된다. 갈라지는 것은 **판정의 모양**이 바뀔 때다
> (예: `published`인데 `publishAt`이 미래면 가림). 그때 SQL은 조용히 옛 규칙을 쓰고, 위 행동 테스트는 새 모양의
> 픽스처가 없으므로 깨지지 않는다 — 초판의 결론(고정이 사본 제거의 대용품일 뿐이다)은 이 형태로 유지된다.
> (3) `v_hidden`이 `app_seminar_status`(`:164-167`)를 쓰지 않고 같은 `coalesce`를 인라인한 것(`:215`)은 사실이다.
> 확인한 일곱 곳: `visibility.ts:26`, `archive/+layout.server.ts:100·104`(한 곳), `public/archive.ts:139,160,226`,
> `asset-access.ts:42`, `atomic_flows.sql:215`. (`seminars.ts:57`의 `=== "published"`는 "이미 치렀다" 판정이라 다른 규칙이다.)

규칙은 한 줄이다 — **`publicationStatus !== "published"`인 세미나는 가려지고, 그 `activityId`의 활동·이벤트도 가려진다.**
그 판정이 다음에 따로 적혀 있다:

| 위치                                                      | 형태                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 여기 26-27행                                              | `hiddenActivityIds()`                                                                         |
| `archive/+layout.server.ts:99-106`                        | 같은 집합을 인라인으로 다시 계산                                                              |
| `public/archive.ts:139,160,226`                           | `=== "published"` 필터 셋                                                                     |
| `services/asset-access.ts:42`                             | 같은 판정으로 파일 등급                                                                       |
| `supabase/migrations/20260928000000_atomic_flows.sql:215` | `flow_delete_seminar`의 `v_hidden` — `app_seminar_status`를 쓰지 않고 `coalesce`를 **인라인** |

7-10행 주석이 레이아웃 사본을 "알고 있는 빚"이라 부르고 페이로드 테스트로 묶었다고 적는다
(`cancelled-visibility.test.ts:124-142`). 그러나 **그 빚은 필요 없는 빚이다.** 레이아웃은 이미 `seminars` 행을
손에 들고 있다(`+layout.server.ts:66`). 이 모듈이 읽기를 품은 함수 대신 **행을 받는 순수 함수**
(`hiddenActivityIdsOf(seminars)`·`isPublished(seminar)`)를 내면 레이아웃·접근자·자산 판정이 모두 그것을 부를 수 있다.
테스트로 두 사본을 묶는 것은 사본을 없애는 것의 대용품이다 — 픽스처가 다루는 상태에 대해서만 일치를 보장한다.

**SQL 사본은 더 나쁘다.** `flow_delete_seminar`는 이 판정으로 "가려진 활동을 세션·큐와 함께 은퇴시킬지"를 정한다
(`atomic_flows.sql:182-186` 주석이 이 파일을 직접 가리킨다). 그런데 `flow-rules.test.ts`가 고정하는 미러는
`app_term_of`·`app_may_derive_semester`·`app_event_open` 셋뿐이다(`:18,36,57`). 판정 규칙이 TS에서 바뀌면
(예: 게시 예약 상태 추가) 삭제 흐름은 **아직 보이는 활동을 지우거나, 가려진 활동을 남긴다** — 어느 테스트도 깨지지 않는다.
미러 자체는 허용되지만 고정 테스트 없는 미러는 아니다. 게다가 같은 파일에 `app_seminar_status`(`:164-167`)가 있는데
쓰지 않았다.

**처방(구조만)**: 순수 판정 함수 하나 + SQL은 `app_seminar_status` 경유 + `flow-rules.test.ts`에 대조 케이스.

## LB21-2 🟠 `isVisibleToMembers`는 이름이 약속하는 규칙의 절반만 구현한 채 export돼 있다

33-35행은 이벤트 자신의 상태만 본다. 규칙의 나머지 절반(가려진 활동에 매달린 이벤트)은 45-53행
`getMemberVisibleEvents` 안에만 있다. 37-44행 주석이 바로 그 절반을 빠뜨리면 생기는 우회로를 실측으로 적는다 —
`/admin/events/connect`로 취소된 세미나의 활동에 새 세션을 붙이면 `status: "active"` 이벤트가 되살아난다.

`src` 전체에서 이 함수를 import하는 곳은 없다. 그러므로 export는 **다음 호출자에게 우회로를 공개된 이름으로
건네는 것** 외에 하는 일이 없다 — `events.filter(isVisibleToMembers)`는 누가 봐도 올바른 코드처럼 읽힌다.
README 판정 기준의 "오염을 일으키는 호출부가 현재 없다"는 감면 근거가 아니다.
**처방(구조만)**: export를 내리거나 이름을 `isNotCancelled`로. 동작 변화 없음.

## LB21-3 🟡 주석이 이 모듈의 범위를 서로 다르게 말한다

- 4행 "취소·미공개 세미나를 **회원 면에서** 가리는 자리", 7행 "게스트 면은 여기를 거치지 않는다"
- 21행 `hiddenActivityIds` "**회원·게스트**에게서 가려야 할", 55행 `withoutHiddenActivities` "(**공개·회원 공용**)"

실제로는 게스트용 접근자 `getPublicActivities`(`public/archive.ts:201`)가 55행 함수를 쓴다(죽은 코드지만, LB16-5).
게스트가 실제로 받는 레이아웃은 쓰지 않는다. 어느 문장이 계약인지 읽는 사람이 정할 수 없다.
LB21-1을 하면 "게스트 면도 같은 판정 함수를 쓴다"로 하나가 된다.

## LB21-4 🟡 데이터 계층이 서비스 계층을 import한다

`data/repos.ts:2`가 `services/visibility`를 import하고, 이 모듈은 `data/tables`를 import한다(1행).
`ARCHITECTURE.md:28-30`은 `data/`를 저장 경계, `services/`를 도메인 서비스로 나눈다.
이 모듈의 규칙은 세미나 행에 대한 순수 판정이라(LB21-1) 아래 계층이나 `domain/`에 둘 수 있는 것인데,
읽기를 품은 탓에 서비스에 있고, 그 탓에 데이터 계층이 위를 본다. 구조만.

## 확인했고 지적하지 않은 것

- **판정 방향** — `!== "published"`는 모르는 새 상태를 **가림** 쪽으로 보낸다. 닫힌 실패 방향이 맞다
- **`activityId` 없는 세미나(27행)** — 가릴 활동이 없다. 공개 전 세미나는 아직 활동이 없는 것이 보통 경로다
  (`flow_publish_seminar`가 만든다, `atomic_flows.sql:329-366`)
- **`sourceRequestId` 앵커로만 이어진 이벤트** — `app_is_seminar_event`(`atomic_flows.sql:171-176`)는 앵커와
  `activityId` 둘로 소속을 보지만 여기는 `activityId`만 본다. 앵커로 이어진 이벤트는 `flow_cancel_seminar`가
  `cancelled`로 바꾸므로(`:498-503`) 33-35행이 가린다. 빈틈 없음
- **관리자 경로가 이 모듈을 쓰지 않는 것** — 18행 주석의 의도(취소된 세미나는 관리자에게 남는다)
- **읽기 비용** — `getMemberVisibleEvents`는 표 둘, `withoutHiddenActivities`는 하나를 캐시로 읽는다.
  한 요청이 둘을 다 부르면 `seminars`를 두 번 캐시 조회하지만 무시할 만하다
- **테스트** — `cancelled-visibility.test.ts`가 회원 면 세 경로와 되살아나는 경로(`connect`)를 페이로드로 단언한다

## 검증 (2026-09-28)

- LB21-1 — 정정 (등급 유지. SQL 사본은 `cancelled`·`unscheduled`에 대해 행동 테스트가 있으므로 "고정 테스트 없음"을 "미러 테스트 없음 + `scheduled`·`published` 미고정"으로 좁혔고, "새 상태 추가" 예시는 사본을 가르지 않으므로 "판정 모양 변경"으로 바꿨다)
- LB21-2 — 확인 (`isVisibleToMembers`의 비테스트·테스트 import 모두 없음. 51행 내부 사용뿐)
- LB21-3 — 확인
- LB21-4 — 확인 (`data/repos.ts:2` → `services/visibility`, `ARCHITECTURE.md:28-30`)
- 누락 점검: 파일을 `flow_delete_seminar`·`flow_cancel_seminar`·아카이브 레이아웃과 맞대어 다시 읽었다. 가림은 `seminars.activityId`만 보지만 앵커(`seminar:<id>`)로만 이어진 이벤트는 취소 흐름이 `cancelled`로 바꾸므로 빈틈이 없다는 초판 판단에 동의한다. 이 모듈의 캐시 읽기에 기대는 쓰기 판정(`savePresenterAttendance`)은 `events.ts` 문서 LB20-2가 다룬다. 추가 지적 없음.
