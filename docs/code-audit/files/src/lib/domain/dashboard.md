# `src/lib/domain/dashboard.ts` (101줄)

**접두사 `LC07-`** · 회원 대시보드(`/`)의 행·결과 타입, 활동 신청/프로필 입력 스키마, 활동 행의 표시 상태 판정, 신청 실패 문구.
짝 테스트 `dashboard.test.ts`(87줄)를 규칙의 일부로 읽었다.

## LC07-1 🟠 활동 행 하나가 두 모양으로 정의되고, 두 경로가 각자 만든다

> **검증 정정**: 개수만 고친다. 아래 나열은 "두 타입 + 로드 두 곳 + 미리보기 + 페이지 개명 + `ledgerRowFor`"로
> **일곱 곳**이다(초판 "여섯 곳"). 표의 행 번호는 맞다(미리보기는 172-212, 지난 학기는 374-388). 등급·주장은 그대로다.

8-20행 `DashboardActivityItem`과 `(public)/+page.server.ts:43-55`의 `DashboardData["activities"]`는 같은 행이다.
이름만 다르다 — `title`/`name`, `startsAt`/`date`, `detailUrl`/`url`.

| 경로                  | 만드는 곳                                | 모양                         |
| --------------------- | ---------------------------------------- | ---------------------------- |
| 로드 (현 학기)        | `+page.server.ts:347-366`                | `DashboardData`              |
| 로드 (지난 학기 출석) | `+page.server.ts:375-388`                | `DashboardData`              |
| 개발 미리보기         | `+page.server.ts:172-210`                | `DashboardData`              |
| 페이지가 개명         | `(public)/+page.svelte:31-44`            | → `DashboardActivityItem`    |
| 신청/취소 액션 응답   | `ledgerRowFor` `+page.server.ts:135-145` | `DashboardActivityItem` 직접 |

행에 필드 하나를 더하려면 두 타입 + 로드 두 곳 + 미리보기 + 페이지 개명 + `ledgerRowFor`, **여섯 곳**을 고쳐야 한다.
원장(`DashboardActivityLedger.svelte:90-92`)은 로드한 행을 액션 응답 행으로 **통째로 교체**하므로,
두 생성 경로가 한 필드라도 다르게 채우면 신청 버튼을 누르는 순간 행이 바뀐다. 지금은 `detailUrl`이
양쪽 모두 `null`이라 드러나지 않을 뿐(LC07-2), 같은 값을 보장하는 구조가 없다.

같은 복제가 둘 더 있다:

- 22-28행 `DashboardProfile` = `+page.server.ts:76-82` `DashboardData["profile"]` (필드 다섯, 이름까지 같다)
- 30-31행 `DashboardRequestStatus` = `RequestStatus`(`schemas/seminar-request.ts:4-9`) `| "cancelled"`(`+page.server.ts:59`).
  저장 스키마에 상태가 늘면 페이지(`+page.svelte:50`)에서 타입 오류로 잡히긴 하지만, 고칠 곳은 여전히 둘이다

`487a8fb`가 "라우트 타입이 대체한 페이지 계약"을 지웠다. 이 파일의 행·프로필 타입은 그 부류의 생존자다 —
로드가 `./$types`로 이미 타입을 내므로 행을 하나의 모양으로 만들고(로드가 도메인 이름으로 직접 내거나 그 반대)
개명 단계를 없애면 된다. **구조만 바뀐다.**

## LC07-2 🟡 소비자가 그리지만 아무도 채우지 않는 필드

- 14행 `detailUrl` — 실제 로드는 `url: ""`(`+page.server.ts:354,382`) → 페이지가 `|| null`(`+page.svelte:39`),
  액션은 `null`(`+page.server.ts:141`). 값이 들어오는 것은 개발 미리보기(`:179,192,205`)뿐이다.
  원장의 상세 링크(`DashboardActivityLedger.svelte:175`)는 운영에서 그려지지 않는다
- 35행 `type: "seminar" | "study"` — 생산자는 `"seminar"`만 낸다(`+page.svelte:47`).
  `DashboardWorkSummary.svelte:68`의 `"스터디"` 분기는 죽어 있다
- 39행 `actionPath` — 항상 `null`(`+page.svelte:52`). `DashboardWorkSummary.svelte:74`의 "관리" 링크는 그려지지 않는다

어느 쪽이든 결정이 필요하다 — 상세 링크·스터디 신청·관리 경로를 실제로 채우거나, 필드와 분기를 지운다.
지우는 쪽은 **구조만 바뀐다.**

## LC07-3 🟡 신청한 행은 행사가 끝나도 "신청됨"에 머문다

71-80행의 판정 순서에서 시간은 맨 끝(78행)에만 등장한다. 76행 `isApplied`가 먼저 걸리므로:

| 행                                         | `pendingAttendance` (`+page.server.ts:110-111`) | 결과                       |
| ------------------------------------------ | ----------------------------------------------- | -------------------------- |
| 지난 세미나, 신청, 출석 미확인             | true (세미나 한정)                              | `pending` "출석 확인 대기" |
| 지난 **회식·회의·기타**, 신청, 출석 미기록 | false — `type === "세미나"` 조건                | **`applied` "신청됨"**     |
| 지난 행사, 미신청, 미출석                  | false                                           | `absent` "미출석"          |

비세미나 행사도 신청할 수 있다(`canApply`는 종류를 보지 않는다, `+page.server.ts:104-108`; `EventSchema.type`은
`RECORD_ACTIVITY_TYPES` 전체). 그런 행사가 끝나면 "신청됨"은 시작 전과 같은 문구로 영원히 남는다 —
**신청하지 않은 사람은 "미출석", 신청한 사람은 "신청됨"** 이라는 역전이 생긴다.
테스트(`dashboard.test.ts:41-48`)의 제목도 "applied … **future** events"다 — 과거 행에 대한 의도는 적혀 있지 않다.

판정이 두 시계로 갈라져 있는 것도 같은 뿌리다: `pending`·`canApply`는 서버의 `now`(로드 시각)로,
`absent`/`scheduled`는 브라우저의 `Date.now()`(78행)로 정한다. "지났는가"를 한쪽에서 한 번만 판정하면
위 표의 빈칸도 함께 채워진다. **동작 변경**(표시 문구).

## LC07-4 🟡 오류 문구 표가 오류 코드 집합과 묶여 있지 않다

86행 `code: string | undefined` — `ApiErrorCode`(`domain/api.ts:10-22`)가 아니다. `switch`가 망라적인지
컴파일러가 확인할 수 없고, 실제로 이 액션이 낼 수 있는 코드가 빠져 있다:

- `UNAUTHORIZED` — 세션이 만료되면 `handleUserAction`이 401로 낸다(`auth-guards.ts:223`). 사용자는
  "참여 상태를 변경하지 못했습니다."(95행)만 보고 다시 로그인하라는 안내를 받지 못한다.
  같은 코드를 `SeminarPublicationCard.svelte:27-28`은 "로그인이 풀렸습니다…"로 옮긴다 — 코드→문구 표가 컴포넌트마다 따로 있다
- `EVENT_NOT_OPEN`(88-89행 "신청 가능한 시간이 지났습니다.") — `assertOpenForApplication`(`services/events.ts:178-182`)은
  **시간이 지났을 때**와 **관리자가 마감했거나 만료된 상태**(`effectiveStatus !== "active"`) 모두에 같은 코드를 낸다.
  시작 전에 마감된 행사에도 "시간이 지났다"고 원인을 단정한다. 취소(`cancelEventApplication` :208)에도 같은 문구가 나간다

처방: 인자를 `ApiErrorCode | undefined`로 좁히고 `UNAUTHORIZED` 분기를 더하고, 88행 문구를 원인 중립적으로
("지금은 신청·취소할 수 없는 활동입니다."). **동작 변경**(문구).

## LC07-5 🟠 전화번호·배경지식 규칙의 사본 (셋 중 하나)

> **검증 정정**: **`LC11-4`의 중복 — 이 문서에서 세지 않는다.** 항목 스스로 "상세는 `LC11-4`"라고 하고, 아래 세 사실
> (정규식·문구의 글자 복사, `2000` 세 번, 정규화가 호출부에 있음)은 모두 `LC11-4`의 표와 목록에 이미 있다.
> `LC11-8`·`LC08-2`가 따른 "새로 세지 않는다" 규약을 여기에도 적용한다. 사실 자체는 맞다 —
> 정규화 호출 행만 `+page.server.ts:572` → **`:573`**.

61-68행은 `members.ts:89-94,181-184`·`membership-applications.ts:5-15`와 같은 `private-info.phone`/`background`를
검증한다. 상세는 **`LC11-4`**. 이 파일 쪽 사실만 적는다:

- 64행 정규식·문구는 `members.ts:89,94`와 글자까지 같다 — `members.ts`에는 `phoneSchema`라는 이름이 이미 있는데 다시 썼다
- 65-68행은 세 파일 모두에 같은 상수 `2000`과 같은 문구로 있다
- 정규화(`normalizePhoneNumber`)는 스키마 밖, 호출부(`+page.server.ts:572`)에 있다

규칙을 하나 바꾸면(예: `011` 허용) 세 파일과 정규화 호출부 넷을 함께 고쳐야 한다. **구조만 바뀐다.**

## LC07-6 🟡 id 스키마가 다섯 번째 사본이고, 스칼라라서 호출부가 오류를 손으로 옮긴다

> **검증 정정**: 사본 목록의 한 항목이 "같은 형태"가 아니다. `admin-records.ts:70` `pickedIdSchema`는
> `trim · max 200`뿐이고 **`min(1)`이 없다**(빈 값 = "선택 안 함"이 그 스키마의 의미다, 69행 주석).
> 같은 `200`을 근거 없이 쓰는 사본이라는 점은 그대로이므로 등급·처방은 유지한다.

54-58행 "trim · min 1 · max 200 문자열"은 `admin-dashboard.ts:83`, `admin-records.ts:70`, `studies.ts:124`,
`attendance.ts:15`에 같은 형태로 있다(문구만 다르다). `200`의 근거는 어디에도 적혀 있지 않다.

또 이 스키마만 객체가 아니라 스칼라여서 `fieldIssues`로 필드에 붙일 수 없다(경로가 비어 `_form`으로 간다).
그래서 라우트가 `issues: { eventId: parsed.error.issues[0].message }`를 **두 번** 손으로 쓴다
(`+page.server.ts:476,508`). 같은 파일의 프로필 쪽은 `dashboardProfileIssues`(99-101행)가 그 일을 한다 — 비대칭이다.
**구조만 바뀐다.**

## LC07-7 🟡 액션 결과 계약이 캐스트로만 성립한다

42-52행 `DashboardOperationResult`는 액션이 **반환한다고 선언되지 않는다** — `+page.server.ts:482-485,514-517,595`는
리터럴 객체를 돌려주고, 컴포넌트가 `result.data as DashboardOperationResult`로 단언한다
(`DashboardProfilePanel.svelte:47`, `DashboardActivityLedger.svelte:85`). 액션이 `operation` 이름이나 `profile` 모양을
바꿔도 어느 쪽도 컴파일 오류가 나지 않고, 화면은 성공 알림 없이 조용히 넘어간다(두 컴포넌트 모두 `operation`이 안 맞으면 아무것도 하지 않는다).

`487a8fb`가 "액션이 그 모양으로 반환하지 않는 operation result" 셋(`AdminDashboardOperationResult` 등)을 지운 이유가
바로 이 표류였다. 남긴다면 액션 반환에 `satisfies`를 걸어 계약을 양쪽에서 강제한다. **구조만 바뀐다.**

## 확인했고 지적하지 않은 것

- **`dashboardActivityState`가 `Date.now()`를 직접 읽는다** — 순수 함수가 아니지만 테스트가 가짜 타이머로 고정한다
  (`dashboard.test.ts:51-58`). 시계 주입은 과하다. 두 시계 문제는 LC07-3에 포함했다
- **`available`이 `canApply`만 본다** — `canApply`는 이미 참여 권한·행사 상태·시작 여부를 서버에서 합친 값이다
  (`+page.server.ts:104-108`). 신청한 행에서도 `canApply`가 참인 것은 원장이 같은 버튼으로 취소를 보이기 위해서다
  (`DashboardActivityLedger.svelte:184-201`) — 76행이 77행보다 먼저라 표시 상태는 `applied`로 맞게 나온다
- **로드 후 시작 시각이 지난 행의 신청 버튼** — `canApply`는 로드 시각 기준이라 버튼이 남지만, 서버가 `EVENT_NOT_OPEN`으로
  거절하고 문구가 나온다. 쓰기는 막혀 있다(문구 문제는 LC07-4)
- **`NOT_FOUND` 문구(91행)와 82-85행 주석** — 취소된 행사가 회원에게 404인 것은 `assertLedgerTarget`
  (`+page.server.ts:154-163`)과 가시성 규칙이 일치한다. 주석이 코드와 맞다
- **`dashboardProfileIssues`가 필드 목록을 넘긴다** — `fieldIssues`의 안전한 형태를 쓰는 소수의 호출부다(LC09-2 참조)
- **`background`의 `trim` 후 `max`** — 앞뒤 공백을 길이에서 빼는 순서가 맞다

## 검증 (2026-09-28)

- LC07-1 — 정정 (고칠 곳 여섯 → 일곱, 등급 유지)
- LC07-2 — 확인
- LC07-3 — 확인 (`participationState`의 `activity.type === "세미나"`와 `canApply`의 종류 무관을 코드로 대조)
- LC07-4 — 확인 (`handleUserAction` 401 `UNAUTHORIZED`, `assertOpenForApplication` 두 조건 모두 `EVENT_NOT_OPEN`)
- LC07-5 — 정정 (`LC11-4`의 중복, 집계 제외)
- LC07-6 — 정정 (`admin-records.ts:70`은 `min(1)` 없음, 등급 유지)
- LC07-7 — 확인. 표류의 실례가 이미 있다: 개발 미리보기 분기 `+page.server.ts:569`가 `{ success: true, preview: true }`를
  돌려주고 `operation`이 없어 `DashboardProfilePanel.svelte:48`이 아무것도 하지 않는다(저장 알림 없음)
- 누락 점검: 파일 전체(101줄)를 틀 없이 다시 읽고 소비자(`+page.svelte`, 원장·요약·프로필 컴포넌트, 액션 넷)를 대조했다.
  `dashboardActivityState`의 bare date 해석(UTC 자정 = KST 09시)은 서버 `participationState`의 `started` 판정과
  같은 규칙이라 새 결함이 아니다. 새로 추가할 지적 없음
