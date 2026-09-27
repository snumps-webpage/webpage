# `src/lib/server/services/studies.ts` (357줄)

**접두사 `LB31-`** · 스터디 생애주기 서비스 — 개설 신청(제출·철회·승인·반려), 참여(가입·탈퇴·수락·제거), 상태 전이, 회차(생성·정정·취소, 앞 둘은 `flow_*`), 주최자 2단계 전달, 출석부 조회·저장.

## LB31-1 🟠 회차 취소가 이벤트만 바꾸고 활동은 남긴다 — 열리지 않은 회차가 공개 기록·회원 이력에 남는다

> **검증 확인**: 🟠 유지. 가림 규칙이 세미나 전용임을 코드로 확정 — `visibility.ts:22-30` `hiddenActivityIds`는 `seminars`의 `publicationStatus`만 보고,
> `withoutHiddenActivities`(56-60)와 archive 레이아웃의 `hiddenActivityIds`(`archive/+layout.server.ts:102-108`) 둘 다 그 집합만 뺀다. 스터디 회차의 활동을
> 거르는 규칙은 어디에도 없다. 따라서 취소된 회차의 활동은 (a) 공개 아카이브(`publicActivities`), (b) `getActivitiesBetween`(대시보드, `repos.ts:33-45`),
> (c) `getActivitiesOf`(회원 이력, `repos.ts:47-56`) 셋 다에 남는다 — 확인. 주의: `getMemberVisibleEvents`(`visibility.ts:45-53`)는 취소 **이벤트**는 거르지만
> 아카이브·대시보드·이력이 세는 대상은 **활동**이고 그 활동은 가려지지 않는다. `saveStudyAttendance`(343-344)가 이벤트 상태를 안 보는 것도 확인. 인과 참.

`cancelSession`(231-243)은 `events` 한 문서에서 `status: "cancelled"`만 쓴다. 회차 생성은 활동과 이벤트를
**한 쌍으로** 만들고(`flow_create_study_session`, `20260928000000_atomic_flows.sql:931-960`: `type: '스터디'`,
`sourceRequestId = '<studyId>:<date>'`), 정정도 둘을 함께 옮긴다(`updateSession` 210-228 주석 — "archives and term
grouping key off the ACTIVITY's date"). 취소만 한쪽을 버린다.

활동을 읽는 쪽에는 스터디 회차를 거르는 규칙이 없다. 가림 규칙은 **세미나**의 `publicationStatus`뿐이다
(`visibility.ts:22-30`, `archive/+layout.server.ts:103-109`). 그래서 취소된 회차의 활동("해석학 3회차", 날짜)이

- 공개 아카이브 활동 목록에 실린다 — `archive/+layout.server.ts:107-109,151`, `public/archive.ts:200-211`
- 학기 대시보드 집계에 들어간다 — `getActivitiesBetween`(`repos.ts:33-45`, `(public)/+page.server.ts:301`)
- 취소 전에 출석한 회원의 활동 이력에 남는다 — `getActivitiesOf`(`repos.ts:47-56`)

같은 틈이 두 곳 더 있다.

- `saveStudyAttendance`(338-357)는 이벤트 상태를 보지 않는다. 출석부 화면이 취소 회차를 빼지만(316행) 그것은
  뷰의 규칙이다 — 취소된 `eventId`를 담은 POST는 그 활동에 출석을 쓴다.
- `updateSession`이 부르는 `flow_update_study_session`(sql:971-1002)도 상태를 보지 않는다. 화면은 취소 회차에서
  "정정" 버튼을 숨기지만(`StudySessionTimeline.svelte:182-187`) 서버는 취소 회차의 제목·일시를, **활동까지 함께** 고친다.

`ATOMIC-FLOWS.md` §7이 `cancelSession`을 "단일 문서 CAS라 이미 원자적"으로 분류한 것은 사실이지만,
단일 문서인 이유가 바로 활동을 건드리지 않기 때문이다.

처방: 취소를 흐름으로 옮겨 활동을 함께 처리(삭제하거나 숨김 표시)하고, 출석 저장·정정이 취소 회차를 거부하게 한다.
또는 "취소된 이벤트만 매달린 활동"을 가림 규칙에 넣는다. **동작 변경**.

## LB31-2 🟠 "종료된 스터디는 바꿀 수 없다"가 화면과 회차 생성에만 있다

> **검증 확인**: 🟠 유지. 서비스에서 `finished`를 읽는 곳은 `setStudyStatus`(167, "종료에서 나갈 수 없다"만)뿐임을 확인.
> `acceptParticipant`(128-141)·`removeParticipant`(143-157)·`leaveStudy`(112-126)·`proposeTransfer`(247-261)·`acceptTransfer`(268-290)·
> `updateSession`(217-228)·`cancelSession`(231-243)에 종료 검사 없음 — 표대로. `joinStudy`(98)는 `recruiting`을 요구해 사실상 종료를 막지만
> 나머지 명단·전달·회차 정정/취소는 종료 뒤에도 폼으로 통과한다. 인과 참.

화면은 종료 확인창에서 "스터디를 종료하면 새 회차를 만들거나 **참여자를 변경할 수 없습니다**"라고 약속하고
(`manage/+page.svelte:155`), `canMutate`(15-16행, 주석 "every organizer mutation locks with it")로 명단·전달 패널을 잠근다.
서버에서 이 규칙을 지키는 곳은 `flow_create_study_session`의 `finished` 검사(sql:913) **하나뿐**이다.

| 함수                                 | `finished` 검사 |
| ------------------------------------ | --------------- |
| `acceptParticipant` 128-141          | 없음            |
| `removeParticipant` 143-157          | 없음            |
| `leaveStudy` 112-126 (회원 본인)     | 없음            |
| `proposeTransfer` / `acceptTransfer` | 없음            |
| `updateSession` / `cancelSession`    | 없음            |
| `createStudySession` (flow)          | **있음**        |

폼을 직접 보내면 종료된 스터디의 명단이 바뀌고 주최자가 넘어간다. 화면 스스로도 일관되지 않다 — 주석은 "모든 주최자
변경"이라 하지만 회차 정정·취소 버튼은 `canMutate`와 무관하게 남는다(`StudySessionTimeline.svelte:182-192`).
164-166행 주석이 `setStudyStatus`에서 "종료는 되살릴 수 없다"를 서버에 둔 이유("sessions … treat it as closed")가
나머지 변경에도 똑같이 적용된다.

처방: `patchStudy`(81-91) 안에 "종료면 거부"를 두고, 종료 후에도 허용할 연산(예: 출석 정정)만 명시적으로 빼낸다.
**동작 변경**.

## LB31-3 🟠 상태 전이 규칙이 세 곳에 있고 서로 다르다

- **스펙** §6-4(`API-SPEC.md:633`): `recruiting ↔ ongoing → finished` — 모집 중에서 바로 종료할 수 없다.
- **도메인** `nextStudyStatuses`(`domain/studies.ts:149-158`): 같은 규칙. 그러나 **운영 코드 호출부가 없다**(테스트만).
- **화면**(`manage/+page.svelte:118-160`): 같은 규칙을 버튼 분기로 하드코딩.
- **이 파일** `setStudyStatus`(159-172): "finished에서 나가지 못한다"만 검사한다.

결과: `status=finished`를 담은 POST는 `recruiting`에서 바로 종료시키고, `recruiting→recruiting` 같은 자기 전이도 통과한다.
규칙의 유일한 서버 쪽 구현이 규칙의 일부만 구현하고, 온전한 구현(`nextStudyStatuses`)은 아무도 부르지 않는다.
전이 하나를 추가·변경하려면 네 곳을 봐야 하고, 실제로 강제되는 곳은 그중 가장 약한 곳이다.

처방: `setStudyStatus`가 `nextStudyStatuses(s.status).includes(status)`로 판정하고, 화면도 같은 함수로 버튼을 만든다.
**동작 변경**(지금 받아들이는 전이를 거부).

## LB31-4 🟠 `acceptParticipant`가 대기자가 아닌 id도 참여자로 넣는다

132-140행은 `pendingParticipantIds`에서 빼고 `participantIds`에 넣을 뿐, **그 id가 대기 중이었는지 보지 않는다**.
스펙은 "pending→participants"다(`API-SPEC.md:632`). 입력 검사는 1-200자 문자열뿐이고(`domain/studies.ts:120-124`),
쓰기 게이트의 `Id`도 `z.string().min(1)`이다(`schemas/common.ts:7`). 따라서 주최자는

- 신청한 적 없는 회원, 탈퇴 회원, 존재하지 않는 문자열을 참여자로 만들 수 있고
- 그 id는 곧바로 출석 풀이 된다 — `saveStudyAttendance`가 `study.participantIds`를 허용 풀로 쓰므로(351행)
  임의 id의 출석이 활동 `attendeeIds`에 기록되고, 실재 회원이면 그의 활동 이력(`getActivitiesOf`)에 오른다.

`joinStudy`(93-110)가 모집 중에만 대기열에 넣는 관문도 이 경로로 우회된다(모집이 끝난 뒤 직접 추가).

처방: `pendingParticipantIds.includes(memberId)`가 아니면(이미 참여자인 멱등 경우 제외) `NOT_FOUND`/`CONFLICT`.
**동작 변경**.

## LB31-5 🟠 `rejectStudy`가 캐시된 읽기로 존재를 판정하고, 없는 행을 성공으로 넘긴다

67-68행이 `getTable`(캐시, 다른 인스턴스에서 최대 15초 낡음 — `tables.ts:31-35`)로 신청을 찾고, `mutate` 안의
`map`(69-75)은 id가 없으면 **아무것도 하지 않는다.** 결과:

- 다른 인스턴스에서 방금 제출된 신청은 15초간 `NOT_FOUND`로 거부된다(관리자 화면에는 보이는데).
- 반대로 캐시에는 있고 저장소에는 없는 행이면 `mutate`가 no-op(`tables.ts:124`)으로 끝나고, 호출부는 반려 메일을
  보낸다(`admin/+page.server.ts:412-413`). 지금 신청 행을 지우는 경로가 없다는 것은 감면 근거가 아니다.
- 반환값은 **반려 전** 캐시 행이다 — `status: "pending"`. 타입은 `StudyRequest`인데 상태가 거짓이다.

같은 파일의 `withdrawStudyRequest`(41-53)는 찾기·권한·상태 검사를 모두 `mutate` 안에서 한다 — 올바른 형태가 바로 위에 있다.
그리고 `seminar-requests.ts:137-148` `rejectSeminar`가 이 함수의 **복사본**이다(같은 결함).
`approveStudy`(56-64)도 반환 상태가 거짓인 점은 같다 — `flow_approve_study_request`가 상태를 바꾸기 전의 `v_req`를
돌려준다(sql:884-886). 호출부가 `requesterId`·`title`만 읽어 지금은 드러나지 않을 뿐이다.

처방: `withdrawStudyRequest`처럼 `mutate` 안에서 찾고(없으면 `NOT_FOUND`) 바뀐 행을 반환. 세미나 쪽과 하나의 헬퍼로.
**동작 변경**(오류 코드·반환 상태).

## LB31-6 🟡 `leaveStudy`와 `removeParticipant`가 같은 함수다

116-125행과 147-156행이 바이트 단위로 같다(주최자면 `CONFLICT`, 두 목록에서 제거). 규칙 하나를 바꾸면
(예: LB31-2의 종료 검사, LB31-7의 주최자 판정) 둘을 함께 고쳐야 한다. 차이는 호출자(본인/주최자)뿐이다.
처방: 하나의 내부 함수로. **구조만**.

## LB31-7 🟡 "누가 주최자인가"를 두 방식으로 판정한다

> **검증 정정 — `LB02-6`(`auth-guards.md`)과 같은 결함, 교차 참조로 묶고 `removeParticipant` 행 철회**: 🟡 유지.
> `LB02-6`(🟠)이 이미 이 결함을 판정했다 — "주최자 신원 규칙이 `ensureOrganizer`(현재 id ∪ `legacyMemberId`) 한 곳에만 있고, `studies.ts:117`(`leaveStudy`)·
> `atomic_flows.sql:1039-1040`(`flow_request_withdrawal`)는 현재 id만 본다." LB31-7은 그 규칙을 이 파일 관점에서 다시 본 것이므로 **LB02-6의 서브뷰**다(등급은
> 탈퇴 게이트를 쥔 LB02-6의 🟠가 대표, 이 파일 국소 증상은 🟡).
>
> **`removeParticipant`(148행) 행 철회** — LB02-6 검증이 이미 같은 이유로 철회했다: 148행의 `memberId`는 호출자가 아니라 **제거 대상**(`manage/+page.server.ts`의 폼 `memberId`)이고,
> 그 값은 명단에 저장된 id에서 온다. 따라서 "저장값 대 저장값" 비교라 레거시 id로 저장된 주최자를 지목해도 `organizerIds.includes(legacyId)`가 참이 돼 CONFLICT가 난다 —
> "이 회원이 주최자인가"라는 **신원 질문이 아니다.** 이 파일 LB31-7 표에서 148행을 신원 판정으로 묶은 것은 과대 포함이었다.
>
> **`leaveStudy`(117행) 확인, 서술 보강** — 보호 미적용은 참이나 결과는 "주최자 빠진 스터디"가 아니라 **성공처럼 보이는 무동작**이다: 117행이 현재 id로만 보고 통과 →
> 120-123행 필터도 현재 id라 레거시 id 항목을 못 지움 → 아무것도 안 지운 채 성공 반환(스펙의 `CONFLICT` 대신). LB31-7 본문 서술과 일치.
> `acceptTransfer`의 `from = organizerIds[0]`(276행)은 신원 판정이 아니라 이력 기록 문제이므로 LB31-8 소관으로 둔다.

`ensureOrganizer`(`auth-guards.ts:249-263`)는 재가입 회원의 **legacy id**도 주최자로 인정한다(S9). 이 파일의 주최자
검사 — 117행, 148행 — 와 `acceptTransfer`의 `from`(276행)은 현재 id와의 단순 일치다.

이주된 스터디에서 `organizerIds = [legacyId]`인 주최자가 `leaveStudy`를 부르면 117행 검사를 통과하고, 현재 id로
걸러(120-123행) 아무것도 지우지 않은 채 **성공**을 돌려준다 — 스펙이 요구하는 `CONFLICT`(`API-SPEC.md:621`) 대신.
같은 주최자의 `joinStudy`는 현재 id를 대기열에 추가한다(주최자가 자기 스터디에 가입 신청). `flow_request_withdrawal`의
"미종료 스터디 주최자는 탈퇴 불가" 검사도 현재 id만 본다(sql:1039-1040) — 이 파일의 범위 밖이지만 같은 규칙의 셋째 사본이다.

처방: 주최자 판정을 하나의 함수(현재 id + legacy id)로 두고 세 곳이 쓴다. **동작 변경**(legacy 주최자에 한해).

## LB31-8 🟡 `acceptTransfer`의 `?? ""` 폴백은 쓰기 게이트가 거부하는 값이다

276행 `const from = s.organizerIds[0] ?? ""`. `transferHistory[].from`은 `Id`(`min(1)`)이므로(`schemas/study.ts:29-31`)
폴백이 쓰이는 순간 `mutate`의 게이트가 `VALIDATION_FAILED`를 던진다 — 전달 대상자에게는 입력 오류처럼 보인다.
`organizerIds`가 `min(1)`이라 지금은 닿지 않지만, 닿았을 때의 결과가 틀렸다(폴백이 아니라 늦은 오류).

같은 줄은 스키마 주석("Array by design (extensibility)", `study.ts:14`)과도 어긋난다 — 주최자가 둘이면 280행이 둘째를
기록 없이 지우고 이력에는 첫째만 남는다. 제안에 제안자를 기록하지 않아(`pendingTransfer`에 `from` 없음) 수락 시점에
`[0]`으로 추정하는 구조가 원인이다.

처방: 제안 시 `from`을 `pendingTransfer`에 기록하거나, 최소한 폴백 대신 명시적 오류. **동작 변경 없음**(현 데이터).

## LB31-9 🟡 전달 대상의 자격을 캐시로, 제안 시점에만 확인한다

`proposeTransfer` 253-255행이 대상 회원의 존재·탈퇴 여부를 캐시된 `getTable("members")`로, CAS 밖에서 본다.
`acceptTransfer`(268-290)는 다시 보지 않는다. 제안 뒤 대상이 탈퇴를 신청하면 `flow_request_withdrawal`은 막지 않는다
(대상은 아직 주최자가 아니다, sql:1039-1041). 남은 `pendingTransfer`는 탈퇴 회원을 가리킨 채 새 제안을 `CONFLICT`로
막는다(258행) — 주최자가 직접 취소할 때까지. 탈퇴 회원의 수락은 지금 capability 계층이 막지만, "주최자는 탈퇴 회원이
아니다"라는 불변식을 서비스가 스스로 지키지는 않는다.

처방: `acceptTransfer`에서 수락자 상태 재확인. **동작 변경**(좁음).

## LB31-10 🟡 없어진 기능의 흔적 — `autoGenerated` 인자와 두 주석

- `createStudySession`의 `opts.autoGenerated`(186, 194행)는 **필수** 인자인데 모든 호출부가 `false`를 넘긴다
  (`manage/+page.server.ts:164`, 테스트). 일정 기반 자동 생성은 제거됐다(`40891fd`, `schemas/study.ts:22-25`).
  flow도 없으면 `false`로 채운다(sql:958).
- 164-166행 주석 "sessions/**cron** treat it as closed" — 스터디를 읽는 크론은 더 이상 없다.
- 273행 주석 "withdrawn/**expired** proposal" — `pendingTransfer`를 만료시키는 코드는 어디에도 없다(`requestedAt`은 표시용).

다음 사람이 "자동 생성 경로가 어딘가 있다", "제안은 만료된다"고 읽게 된다. 처방: 인자 제거, 주석 정정. **구조만**.

## LB31-11 🟡 출석부의 회차·참여자 투영이 관리 페이지와 중복이고 이미 갈라졌다

`getAttendanceSheet` 315-326행(회차 행: 정렬·`effectiveStatus`·`attendPath` 템플릿)과 328-332행(참여자 이름 해석, `"Unknown"`
폴백)이 `manage/+page.server.ts:74-86`·`45-50`에 다시 쓰여 있다. 둘은 이미 다르다.

- 이름 해석: 여기는 `getDirectoryIndex()`(legacy 인식, 311행 주석이 이유를 적었다), 관리 페이지는 `memberPickers()`
  (현 회원·비탈퇴만, `repos.ts:11-18`) — **같은 이주 참여자가 출석부에서는 이름으로, 관리 페이지에서는 "Unknown"으로** 나온다.
- 취소 회차: 여기는 뺀다(316행), 관리 페이지는 상태와 함께 보인다(의도된 차이로 보인다).

`attendPath` 형식(`/events/${pathId}/${attendCode}`)을 바꾸려면 두 곳을 고쳐야 한다. 처방: 서비스가 회차 행과 참여자
해석을 내주고 두 페이지가 쓴다. **구조만**(관리 페이지 표시는 고쳐진다).

## LB31-12 🟡 `Study` 객체를 받는 두 함수 — 하나는 id만 쓰고, 하나는 낡은 명단으로 판정한다

- `createStudySession(study: Study, …)`은 `study.id`만 쓴다(191행). 그 탓에 호출부가 `ensureOrganizer`를 한 액션에서
  두 번 부른다(`manage/+page.server.ts:102`, `158-161`). id를 받으면 된다.
- `saveStudyAttendance(study, …)`는 호출부가 `ensureOrganizer`로 읽은 **캐시된** 스터디의 `participantIds`를 허용 풀로 쓴다
  (351행; `auth-guards.ts:250`). 활동 CAS 안에서 쓰지만 풀은 CAS 밖의 값이다 — 다른 인스턴스에서 방금 제거된 참여자를
  15초간 출석 처리할 수 있다. 343행의 이벤트 조회도 캐시지만 이벤트→활동 연결은 바뀌지 않으므로 그쪽은 무해하다.

**구조**(첫째) / **동작 변경, 좁음**(둘째).

## 확인했고 지적하지 않은 것

- **`joinStudy`·`setStudyStatus`·전달 3종의 판정은 `patchStudy` 안(최신 행 위)에서 한다** — 캐시 위의 결정이 아니다. `patchStudy`의 `updated!`는 `fn`이 던지지 않으면 반드시 설정된다
- **`withdrawStudyRequest`**(41-53) — 찾기·본인 확인·상태 검사가 모두 CAS 안. 세미나 쪽(`seminar-requests.ts:104-116`)과 같은 형태의 복사본이지만 둘 다 옳고 짧아 별도 지적하지 않는다(반려 쌍은 LB31-5에서 지적)
- **`approveStudy`·`createStudySession`·`updateSession`의 flow 위임** — `ATOMIC-FLOWS.md` §7 대로. 회차 번호가 잠금 아래 계산되고(sql:925-927), 취소 슬롯 재사용 거부가 사용자 문구로 매핑된다(201-204행). 정정이 합성 키의 원래 날짜를 유지하는 것은 주석(213-215)이 밝힌 의도다
- **`updateSession`의 `?? ""` 센티널** — flow가 빈 값을 "유지"로 읽는다(sql:978-980). 제목을 비우는 입력과 구분되지 않지만, 호출부의 스키마가 제목·일시를 모두 필수로 요구하므로(`domain/studies.ts:114-117`) 비우기는 표현될 수 없는 동작이다. 선택 인자 시그니처가 넓을 뿐이다
- **출석 병합** — `mergeAttendees`(`attendance.ts:9-20`) 단일 규칙을 쓴다. 도메인의 `mergeStudyAttendance`/`mergeManagedAttendance`가 같은 규칙의 둘째 구현이고 운영 호출부가 없지만, 그것은 `domain/studies.ts`·`domain/attendance.ts` 문서의 지적 대상이다
- **`submitStudyRequest`가 행을 스키마로 파싱하지 않는다** — `mutate`의 쓰기 게이트가 한다(`tables.ts:125-137`). 입력 규칙은 `studyRequestInputSchema`가 호출 전에 검사한다
- **`proposeTransfer`의 자기 전달 검사가 "대상 ≠ 호출자"** — 화면 후보 목록은 "대상 ∉ organizerIds"로 거른다(`manage/+page.svelte:17-19`). 주최자 1인 불변식 아래에서 같다. 다만 LB31-7의 legacy 경우에는 다를 수 있다
- **`cancelTransfer`에 제안 존재 검사가 없다** — 멱등 취소로 옳다

## 커버리지

`studies.test.ts`·`study-session-flow.test.ts`가 가입·수락·전달·회차 생성/정정·출석 병합을 덮는다. **`rejectStudy`,
`withdrawStudyRequest`, `removeParticipant`, `cancelTransfer`, `getAttendanceSheet`는 테스트가 없다.**
`studies.test.ts:217`의 제목은 "unknown/withdrawn targets"지만 탈퇴 대상 케이스를 실행하지 않는다(자기 전달·미존재만).

## 검증 (2026-09-28)

- LB31-1 — 확인 (가림 규칙 세미나 전용 확정: `visibility.ts:22-30`·archive 레이아웃 모두 `publicationStatus`만. 취소 회차 활동이 아카이브·대시보드·이력 3곳에 잔존)
- LB31-2 — 확인 (서비스에서 `finished`를 읽는 곳은 `setStudyStatus`뿐. 명단·전달·회차 정정/취소 무검사)
- LB31-3 — 확인 (`nextStudyStatuses`는 운영 호출부 없음 — `domain/studies.ts:149` 정의·테스트뿐. `setStudyStatus`는 "종료 이탈 금지"만; 라우트도 전이 미검증)
- LB31-4 — 확인 (`acceptParticipant` 132-140이 대기 여부 안 봄; 입력은 `min(1)` 문자열뿐)
- LB31-5 — 확인 (`rejectStudy` 67-77이 캐시로 존재 판정, `map`이 미존재 id에 no-op, 반려 전 `status:"pending"` 캐시 행 반환. `seminar-requests.ts` 복사본·`approveStudy` 반환도 같은 형태)
- LB31-6 — 확인 (116-125 = 147-156 바이트 동일)
- LB31-7 — 정정 (LB02-6과 동일 결함 → 교차 참조로 묶음. `removeParticipant`(148행) 행 철회 = 저장값 대 저장값 비교라 신원 질문 아님. `leaveStudy` 확인·서술 보강)
- LB31-8 — 확인 (`organizerIds`가 `min(1)`이라 현재 미도달, 도달 시 늦은 게이트 오류; 둘째 주최자 유실 서술도 코드와 일치)
- LB31-9 — 확인 (`proposeTransfer` 253-255가 CAS 밖 캐시로 대상 확인, `acceptTransfer`는 재확인 안 함)
- LB31-10 — 확인 (`autoGenerated` 필수 인자·모든 호출부 `false`; "cron"·"expired" 주석은 죽은 기능 흔적)
- LB31-11 — 확인 (이름 해석이 `getDirectoryIndex` vs `memberPickers`로 갈려 같은 이주 참여자가 한쪽 "Unknown")
- LB31-12 — 확인 (`createStudySession`은 `study.id`만; `saveStudyAttendance`는 CAS 밖 캐시 `participantIds`를 허용 풀로)
- 누락 점검: `patchStudy`가 최신 행 위에서 판정·`updated!` 보장, `withdrawStudyRequest`의 CAS 내 검사, flow 위임(§7), `updateSession`의 `?? ""` 센티널, `cancelTransfer` 멱등 등 "확인했고 지적하지 않은 것" 항목 모두 코드와 일치. 추가 지적 없음.
