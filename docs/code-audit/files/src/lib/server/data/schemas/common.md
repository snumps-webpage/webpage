# `src/lib/server/data/schemas/common.ts` (35줄)

**접두사 `LA13-`** · 저장 테이블 스키마가 공유하는 필드 원시형 — Id·날짜·시각·학기·활동 종류·기간·멱등 앵커.

## LA13-1 🟡 `ACTIVITY_TYPES`라는 같은 이름이 가져오는 경로에 따라 다른 집합이다

> **검증 정정**: 🟠 → 🟡. 사실(두 집합·가져오는 곳 표·타입이 막지 못함)은 모두 맞다. 그러나 이 지적이 스스로
> 세운 결과는 **fail-closed**다 — 잘못 가져온 드롭다운의 `문제 창작`은 쓰기 게이트까지 가지도 못하고 도메인 입력
> 스키마 `z.enum(RECORD_ACTIVITY_TYPES, { message: "활동 유형을 선택해 주세요." })`(`admin-records.ts:75-77`,
> `admin-dashboard.ts:104-106`)가 필드 오류로 거부한다(본문의 "`VALIDATION_FAILED`로 거부"는 게이트가 아니라 이 층이다).
> 잘못된 데이터도, 조용한 손실도 없다. 같은 배치의 이름·목록 중복(`LA12-2`·`LA14-2`·`LA20-1`)이 모두 🟡이고
> 처방도 "동작 변경 없음(구조만)"이다 — 🟠는 이 지적의 결과에서 나오지 않는다.
> 참고(이 파일 밖): 7종 집합의 현존 소비자인 공개 필터(`(public)/archive/activities/+page.svelte:75`)는 `activities`
> 행만 거르는데(`archive/+layout.server.ts:69,107`) 저장 게이트가 5종만 받으므로 `문제 창작`·`문제 풀이`는 **항상 0건**이다.
> 두 어휘의 혼선이 이미 화면에 나타난 사례이고, 귀속은 그 페이지 리뷰다.

23행 `export const ACTIVITY_TYPES = RECORD_ACTIVITY_TYPES;` — 저장 가능한 5종(`세미나·스터디·회의·회식·기타`,
`constants.ts:18-24`)에 **`$lib/constants`의 다른 상수와 똑같은 이름**을 붙인다. `constants.ts:1-9`의
`ACTIVITY_TYPES`는 표시용 7종(`문제 창작`·`문제 풀이` 포함)이고, `constants.ts:13-17`의 주석이 "저장되는 입력은 5종에서
골라야 하며 아니면 쓰기 게이트가 거부한다"고 경고한다.

현재 가져오는 곳:

| 가져오는 곳                                      | 경로                       | 받는 집합 |
| ------------------------------------------------ | -------------------------- | --------- |
| `(admin)/admin/activities/+page.server.ts:12,36` | `$lib/server/data/schemas` | 5종       |
| `(admin)/admin/events/new/+page.server.ts:3,12`  | `$lib/server/data/schemas` | 5종       |
| `(public)/archive/activities/+page.svelte:5,75`  | `$lib/constants`           | 7종       |

결과: 관리자 폼의 import 한 줄을 `$lib/constants`로 바꾸면(자동 완성이 두 후보를 같은 이름으로 내놓는다) 드롭다운에
`문제 창작`이 나타나고, 그것을 고른 저장은 `VALIDATION_FAILED`로 거부된다. 타입도 막지 못한다 — 둘 다
`readonly string[]` 호환이라 `activityTypes: [...ACTIVITY_TYPES]`가 어느 쪽이든 컴파일된다. 도메인 입력 스키마들은
이미 `RECORD_ACTIVITY_TYPES`를 이름 그대로 쓴다(`admin-dashboard.ts:104`, `admin-records.ts:75`).

처방: 별칭을 지우고 두 관리자 라우트가 `RECORD_ACTIVITY_TYPES`를 가져오게 한다. 24행의 `ActivityType`(zod 값)도
`constants.ts:11`의 `type ActivityType`(7종)과 이름이 같다 — 값/타입 이름공간이 달라 지금은 충돌하지 않지만
같은 함정이다. 동작 변경 없음(구조만).

## LA13-2 🟡 `DateTime` 주석은 "KST 오프셋으로 저장"이라 하지만 스키마는 아무 오프셋이나 받는다

12-13행: `/** Instant, ISO 8601 with offset — stored with the KST offset. */ z.string().datetime({ offset: true })`.
실측(zod 3.25.76): `…T19:00:00+09:00`, `…T10:00:00Z`, `…T19:00:00+0900`, `…T19:00+09:00`(초 생략) 모두 통과한다.
`seminar.test.ts:105-115`는 `Z`를 명시적으로 "유효한 instant"로 고정한다.

결과: "한 오프셋"은 쓰기 쪽(`core/time.ts` `toKstIso`)의 관례일 뿐 게이트가 보장하지 않는데, 문자열 비교가 그것을
전제한다 — `seminar.ts:55`의 `endsAt > startsAt`(→ `LA26-1`, 실제로 틀린 결과를 낸다), `events.ts:232`와
`public/archive.ts:205`의 `localeCompare` 정렬. 초 생략 형식도 같은 instant를 다른 문자열로 만든다.

처방 둘 중 하나: (a) `+09:00` 고정 형식으로 좁힌다 — **동작 변경**, 저장된 행 중 다른 형식이 있으면 테이블 디코드가
실패하므로 먼저 실측해야 한다. (b) 비교하는 쪽이 `Date.parse`로 비교하고 주석을 "관례"로 낮춘다 — 구조 변경.

## LA13-3 🟡 `SourceRequestId` 주석이 형식 둘을 적지만 셋이다

31-34행은 "요청/큐 행 id, 또는 스터디 세션 복합 키 `<studyId>:<date>`"만 적는다. 세 번째 형식 `seminar:<id>`가
있다 — 세미나 공개가 활동·이벤트에 심는 앵커(`atomic_flows.sql:296`, 비교는 `:173`, `:428`),
`(member)/events/manage/+page.server.ts:32-37`이 이 형식으로 세미나를 역참조한다.

결과: 세 형식은 관례로만 구분되고(`<studyId>:<date>`와 `seminar:<id>`는 둘 다 `x:y` 모양이다) 이 주석이 그
이름공간의 유일한 목록인데 불완전하다. 새 앵커 종류를 추가하는 사람은 충돌을 이 목록으로 확인할 수 없다.
주석 수정만.

## LA13-4 🟡 파일 머리 주석이 이관 이전 저장소를 가리킨다

5행 "Shared field primitives for the S3 table schemas". 저장소는 Postgres JSONB 문서다(`store.ts:4-13`).
같은 잔재가 `index.ts:20`(`LA16-3`), `attendance-record.ts:5`(`LA12-1`), `gallery-dinner.ts:7`, `seminar.ts:78-79`에 있다.
주석 수정만.

## 확인했고 지적하지 않은 것

- **`Term`·`Semester`(15-17행)** — 패턴을 `core/semester.ts:10,17`에서 가져온다. 단일 원천을 올바르게 쓴다.
  같은 정규식의 **복사본**은 도메인에 네 개 있다(`admin-records.ts:67`, `studies.ts:80`, `public-content.ts:78`,
  `members.ts:213`) — 이 파일의 결함이 아니라 도메인이 `$lib/server`를 못 가져오는 데서 온 것이고, 원천을 도메인으로
  옮기는 것이 맞는 방향이다(교차 관찰)
- **`DateOnly`(10행)가 달력 유효성(02-30)을 보지 않는다** — 형식 게이트다. 입력 쪽이 달력 검사를 한다
  (`domain/studies.ts` `isCalendarDateTime`). 저장 게이트까지 올릴 근거가 약하다
- **`Id = z.string().min(1)`(7행)** — uuid로 좁히지 않는 것은 노션 이관 id 때문에 옳다
- **`DateRange`(26-29행)의 `end ≥ start` 미검사** — `LA10` 확인 항목 참조

## 검증 (2026-09-28)

- LA13-1 — 정정 (🟠 → 🟡: 결과가 fail-closed 필드 오류라 등급이 결과에서 나오지 않는다)
- LA13-2 — 확인 (zod 3.25.76에서 `Z`·`+0900`·초 생략 통과를 재실측, `events.ts:232`·`public/archive.ts:205` `localeCompare` 일치)
- LA13-3 — 확인 (`atomic_flows.sql:173,296,428`, `events/manage/+page.server.ts:32-37` 일치)
- LA13-4 — 확인 (단, 여기 열거된 `gallery-dinner.ts:7`을 `LA15-2`가 따로 번호를 매겨 이중 계상했다 → `LA15-2` 철회)
- 누락 점검: 35행 재독 — `SourceRequestId`가 `Id`와 달리 빈 문자열을 받는 점, `DateRange` 교차 검사 부재를 검토했고 둘 다 문서의 기준(형식 게이트, 교차 불변식은 쓰기 쪽)으로 설명된다. 추가 없음
