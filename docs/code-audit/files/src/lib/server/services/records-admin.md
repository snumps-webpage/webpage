# `src/lib/server/services/records-admin.ts` (341줄)

**접두사 `LB28-`** · 관리자 기록 편집기(API-SPEC §7-4) — 활동·세미나·스터디·회식 갤러리의 생성·수정·삭제·파일, 출석 전권 덮어쓰기, 스터디 주최자 직권 변경. 여러 문서를 건드리는 삭제 셋은 `flow_delete_*`에 위임한다.

## LB28-1 🟠 `updateSeminar`가 공개된 세미나의 사본(활동·이벤트)을 따라 고치지 않는다

공개는 세미나의 값을 두 문서에 **복사**한다 — 활동의 `title`과 `attendeeIds`(= 발표자, `atomic_flows.sql:336,339`),
출석 이벤트의 `title`과 `presenterIds`(`:351,359`). 그 뒤 일정은 `flow_update_seminar_schedule`이 셋을 함께 맞추지만,
**제목과 발표자는 이 파일의 101-144행이 세미나 행 하나만 바꾼다.**

그런데 발표자 권한의 권위는 사본 쪽에 있다:

- `events.ts:47` `presentsEvent`와 `:264` `savePresenterAttendance`는 **`event.presenterIds`** 로 판정한다.
  `getManagedSeminars`(`events.ts:220-237`)도 같은 함수로 거르고 `e.title`을 보여 준다.
- 반면 취소 권한은 **`seminar.presenterIds`** 로 판정한다(`atomic_flows.sql:481-485`, 화면은 `manage/+page.server.ts:70`).

결과 — 관리자가 공개된 세미나의 발표자를 A→B로 바꾸면:

- B는 `/events/manage`에 그 세미나가 뜨지 않아 출석을 기록할 수 없고, A는 여전히 기록할 수 있다.
- A의 목록에는 떠 있지만 `canCancel`은 세미나 행 기준이라 false, B는 취소할 권한이 있는데 버튼이 있는 화면이 없다.
- `flow_delete_seminar`의 "발표자 몫을 넘는 출석 인정" 검사(`atomic_flows.sql:231-240`)가 활동의 참석자를
  **현재** 발표자와 비교하므로, 공개 때 자동으로 찍힌 A의 인정이 "출석 증거"로 읽혀 취소 뒤 삭제가 `CONFLICT`로 거부된다.
- 제목을 바꾸면 공개 아카이브 상세(세미나 행)와 회원 활동 목록·출석 페이지(활동·이벤트)가 다른 제목을 말한다.

처방: 공개된 세미나의 제목·발표자 수정을 흐름으로 옮겨 앵커(`seminar:<id>`)로 묶인 활동·이벤트의 `title`과
이벤트 `presenterIds`를 함께 고친다. 활동의 자동 인정(발표자 참석)을 옮길지는 따로 정할 일이다. **동작 변경.**

## LB28-2 🟠 `updateActivity`가 흐름이 함께 맞추는 날짜·제목의 한쪽만 바꾼다

38-48행은 어떤 활동이든 `title`·`date`·`type`을 바꾼다. 활동 편집기는 모든 활동을 구별 없이 나열한다
(`activities/+page.server.ts:28-34`). 그런데 두 종류의 활동은 다른 문서와 **짝으로** 관리된다:

- 세미나 활동 — `seminar.schedule` · `activity.date` · `event.date`를 `flow_update_seminar_schedule`이 한 트랜잭션에서
  맞춘다. 스키마가 방향까지 못박는다: "여기가 의도된 일정의 원천 … event에서 세미나 일정을 역산하지 않는다"(`seminar.ts:13-16`).
- 스터디 회차 활동 — `flow_update_study_session`이 이벤트와 활동의 제목·날짜를 함께 옮긴다. 이유가 주석에 있다:
  "archives and term grouping key off the activity's date (review M5)"(`atomic_flows.sql:966-970`).

이 함수로 활동 날짜를 옮기면 학기 묶음(`(public)/+page.server.ts:369-383` `termOfDateString(a.date.start)`)은 활동을,
출석 창은 이벤트를, 공개 상세는 세미나 일정을 따른다. 그리고 다음 세미나 일정 수정이 관리자의 편집을 **조용히 덮는다**
(`atomic_flows.sql:425-432`는 앵커로 찾은 활동의 `date`를 무조건 새 값으로 바꾼다).

처방: 이벤트가 매달린 활동(세미나 앵커 또는 `studyId` 있는 이벤트)의 날짜·제목 수정은 거부하고 소유 편집기를 안내하거나,
해당 흐름으로 보낸다. **동작 변경.**

## LB28-3 🟠 `createSeminar`가 "공지 실패 후 되돌려진 공개 세미나"와 구별되지 않는 행을 만든다

86-88행: `publicationStatus: "published"`, `schedule: null`, `announcedAt: null`, `activityId: null`.

- `seminars.ts:47-49`는 `published` + 일정 없음을 **"이주 사고"** 로 부른다. 이 함수는 그 상태를 매번 새로 만든다.
- 관리자 보드는 `published && announcedAt === null`을 "메일이 실패하고 되돌려진 상태"로 읽어 **공지 재발송** 버튼을 켠다
  (`seminars/+page.server.ts:90-92`, `SeminarPublicationCard.svelte:234`). 이 함수로 만든 모든 기록에 그 버튼이 뜬다.
  - 일정이 없으면 눌러도 `flow_publish_seminar`가 `CONFLICT`(`atomic_flows.sql:314-315`).
  - 84-85행 주석은 "이 경로에는 일정 입력 칸이 없다"고 하지만 보드는 `published`에 **일정 입력**을 켠다(`seminars/+page.server.ts:85-88`).
    입력하면 라우트가 `updateSeminarSchedule`로 보내고(`:212-213`), 미래 날짜면 **알린 적 없는 세미나의 "일정 변경" 메일이
    전 회원에게 나간다**(`LB30-1`). 그 뒤 재발송을 누르면 활동·이벤트가 생기고 공개 공지가 **두 번째로** 나간다.
- 89행 "관리자가 학기를 직접 입력하는 유일한 경로"는 사실이 아니다 — `updateSeminar` 132-137행도 학기를 고정한다.

처방: 이 행이 "공지 대상이 아닌 기록"임을 표현할 자리가 필요하다(`LB30-1`의 `announcedAt` 의미 분리와 같은 처방).
최소한 보드의 `canResendNotice`가 이 행을 제외해야 한다. 주석 두 곳 정정. **동작 변경.**

## LB28-4 🟠 스터디 주최자 규칙이 입구마다 다르고, 인수인계 쓰기가 복제돼 있다

같은 불변식 "주최자는 유효한 회원이고 참가자이기도 하다"를 네 입구가 다르게 지킨다:

| 입구                                  | 대상 검증                        | 주최자를 참가자로               |
| ------------------------------------- | -------------------------------- | ------------------------------- |
| `createStudy` 200-221                 | **없음** (빈 배열만 거부, 206)   | **안 넣는다** (210)             |
| `setOrganizer` 255-294                | 존재·비탈퇴 (262-266, 캐시 읽기) | 넣는다 (277-279)                |
| `acceptTransfer` `studies.ts:268-290` | 제안 시 `studies.ts:252-255`     | 넣는다 (`:282-284`)             |
| `flow_approve_study_request`          | 신청자                           | 넣는다 (`atomic_flows.sql:873`) |

결과:

- 관리자가 만든 스터디의 주최자는 출석부에 없다 — `getAttendanceSheet`는 `participantIds`만 나열한다(`studies.ts:327-331`).
  주최자가 참여 신청을 누르면 대기 명단에 들어간다(`studies.ts:99-108`의 멱등 검사가 `participantIds`만 본다).
- 262-266행의 근거("유령·유예 회원이 유일한 주최자면 스터디를 관리할 수 없다", review M6)는 `createStudy`에 **그대로 적용되는데** 검사가 없다.
- `createStudy`는 `organizerIds` 배열을 받지만 나머지 경로는 단일 주최자를 가정한다 — `setOrganizer`는 `[newOrganizerId]`로
  통째로 바꾸고 `from`에 `[0]`만 남긴다(272-275).
- 268-286행의 인수인계 쓰기(`organizerIds`·`pendingTransfer: null`·참가자 추가·`transferHistory`)는 `acceptTransfer`와
  `byAdmin` 한 값만 다르다. 262-266행의 대상 검증도 `proposeTransfer`와 같은 문장이다. 규칙을 바꾸려면 두 파일을 고친다.
- (경미) 262행의 회원 조회는 캐시를 탄다 — 다른 인스턴스에서 15초 안에 탈퇴한 회원이 통과한다(`cache.ts:51`).

처방: `studies.ts`에 순수 함수 `handOver(study, to, { byAdmin })`와 `assertOrganizerCandidate(member)`를 두고 셋이 쓴다.
`createStudy`는 같은 검증을 하고 주최자를 참가자로 넣는다. 검증·참가자 추가는 **동작 변경**, 나머지는 구조.

## LB28-5 🟡 포스터 승격이 기록 쓰기 전에 일어나고, 쓰기가 실패하면 승격된 파일이 고아가 된다

92행(`createSeminar`)과 116-118행(`updateSeminar`)은 `promoteSeminarPoster`로 파일을 assets 버킷과 백업 미러에 **먼저** 올리고
(`uploads.ts:143-152`) 그다음 `mutate`한다. 122행 `NOT_FOUND`나 쓰기 게이트 실패로 `mutate`가 던지면 승격된 키는
어느 기록도 가리키지 않는데, 정리는 호출자가 넘긴 키만 한다(`asset-cleanup.ts:36-49`) — assets를 훑는 청소는 없다(grep).

`setFileArray`도 같은 모양이다: 라우트가 `promotePendingUpload`로 승격한 뒤 부르고(`seminars/+page.server.ts:321-326`),
173행 `NOT_FOUND`면 그 키는 버려진다. `seminar-requests.ts`의 같은 문제는 `LB29-2`.

처방: 승격 뒤 쓰기를 `try`로 감싸 실패 시 `forgetUnreferencedAssets([promoted])`. 저장소 정리만 바뀌는 **동작 변경**.

## LB28-6 🟡 `activityId` 참조를 아무 검증 없이 받는다 — 문서는 "동시성 한계"라고 적는다

- `createGalleryEntry`·`updateGalleryEntry`(305-323)는 받은 `activityId`를 그대로 쓴다. 라우트도 `formText`를 넘길 뿐이다
  (`gallery/+page.server.ts:56,75,97`). 존재하지 않는 id가 그대로 저장된다.
- `ATOMIC-FLOWS.md` §7 "알려진 한계"는 이를 "`flow_delete_activity`의 잠금 아래서 **다시** 확인하지 않는다 —
  관리자 ↔ 관리자 동시 조작에서만 생기는 끊긴 참조"라고 적는다. **처음 확인 자체가 없다.** 동시성이 없어도 끊긴 참조가 생긴다.
- `updateSeminar`의 patch 타입이 `activityId`를 받는다(111). 호출자는 넘기지 않는다(`seminars/+page.server.ts:283-298`).
  넘기면 공개 흐름의 앵커를 우회하고, 비공개 세미나가 기존 활동을 가리키는 순간 `visibility.ts:22-29`가
  그 활동을 회원·공개 면에서 **지운다**. 쓰이지 않는 입구가 가장 위험한 쓰기를 열어 두고 있다.

처방: `updateSeminar`의 Pick에서 `activityId` 제거(구조). 갤러리는 쓰기 전 존재 확인(**동작 변경**). ATOMIC-FLOWS §7 문구 정정.

## LB28-7 🟡 삭제 거절 사유가 하나의 `CONFLICT`로 뭉쳐진다

`deleteSeminar`(156-162)가 받는 `CONFLICT`는 다섯 가지 이유 중 하나다 — 다른 세미나가 같은 활동을 가리킴, 갤러리가 가리킴,
스터디 회차가 매달림(`atomic_flows.sql:222-230`), 발표자 몫을 넘는 출석 인정(`:231-240`), 대기·승인된 체크인(`:247-253`).
`deleteActivity`(50-54)도 이벤트·갤러리·세미나 세 가지다(`:1116-1121`). 어느 것도 `DETAIL`이 없고 이 파일은 `messages`를 넘기지 않는다.

활동 화면의 힌트는 이벤트만 센다(`activities/+page.server.ts:30-33`). 갤러리나 세미나 때문에 막힌 관리자는 이유를 알 방법이 없다.
같은 저장소의 `studies.ts:200-205`는 `DETAIL` + `messages`로 사유를 문구로 바꾼다 — 선례가 있다. `81a23f6`이 고친 부류다.

처방: SQL에 `USING DETAIL`을 달고 여기서 `messages`를 넘긴다. 문구만 바뀌는 **동작 변경**.

## LB28-8 🟡 같은 "id로 찾아 없으면 NOT_FOUND, 병합" 블록이 일곱 번

43-46 · 62-65 · 121-122 · 171-173 · 233-235 · 269-270 · 318-320. `studies.ts:81`의 `patchStudy`와
`members-admin.ts:14`의 `patchMember`가 같은 일을 표마다 따로 한다. `mutate` 위에 `patchRow(table, id, fn)` 하나면 된다.

곁가지:

- `setFileArray`의 `field: string`(168)과 174-175행 캐스트 — 표와 필드의 짝을 타입이 묶지 않는다. 공개 래퍼 셋이 막고 있을 뿐이다.
- 206행 `VALIDATION_FAILED`에 사용자 문구가 없다(`LB22-6`과 같은 부류).
- 157·243행 `callFlow<FlowResult & { assets: string[] }>`가 두 번 — 타입 별칭 하나.

구조만 바뀐다.

## 확인했고 지적하지 않은 것

- **`setAttendees`가 병합 없이 덮어쓰고 감사 로그가 없다** — API-SPEC §7-4가 "병합 미적용 명시적 예외"로 정했고,
  §1-5 감사 대상 목록에 없다. 출석 큐의 `approved` 행과 어긋날 수 있는 것도 그 예외에 포함된 결과다
- **참조 없는 활동을 지우면 출석 인정이 함께 사라진다** — §7-4의 참조 무결성 정의는 "이벤트·큐"다. 스펙 준수
- **`flow_delete_activity`가 `NOT_FOUND`보다 `CONFLICT`를 먼저 본다** — 없는 id에는 참조도 없으므로 결과가 같다
- **`updateSeminar`의 `replacedPoster`** — CAS 재시도마다 다시 계산한다(123행 주석대로). 신청에서 물려받은 포스터는
  `referencedAssetKeys`가 신청 행을 보고 남긴다(`asset-cleanup.ts:17`)
- **학기 고정은 값이 실제로 바뀔 때만** — 이유가 주석에 있고 `records-admin.test.ts:113-153`이 두 방향을 고정한다
- **`setFileArray`가 기록이 갖지 않은 키의 삭제를 거부** — 클라이언트가 고른 키로 남의 파일을 지우던 길을 막는다. 테스트 있음
- **`deleteGalleryEntry`는 흐름이 아니다** — 갤러리를 가리키는 문서가 없어 단일 문서 CAS로 충분하다
- **`updateStudy`가 `finished`를 되살릴 수 있다** — `studies.ts:163-165`가 "관리자 직권은 제한 없음"으로 적은 결정
- **`flow_delete_seminar`의 215행이 `app_seminar_status`를 쓰지 않고 같은 식을 다시 적는다** — SQL 파일의 문제라
  마이그레이션 리뷰로 넘긴다. 공개된 세미나 삭제가 활동·이벤트를 남기고 신청을 닫지 않는 것도 그 함수의 결정이다

## 커버리지

`records-admin.test.ts`·`record-delete-flow.test.ts`·`records-admin.race.test.ts`가 삭제·파일·학기 고정을 덮는다.
LB28-1(공개 후 발표자 변경), LB28-2(세미나·회차 활동 날짜 편집), LB28-4(관리자 생성 스터디의 주최자 참가자 여부)는 미검증이다.

## 검증 (2026-09-28)

- LB28-1 — 확인. 임시 vitest로 재현: 공개 뒤 `updateSeminar(presenterIds: [B], title)` → 이벤트 `title`·`presenterIds`, 활동 `title`·`attendeeIds`가
  옛 값 그대로 → 취소 → `deleteSeminar`가 `CONFLICT`(`atomic_flows.sql:232-240`, 옛 발표자 A의 자동 인정이 "출석 증거"로 읽힘)
- LB28-2 — 확인
- LB28-3 — 확인. 재현: `createSeminar` 행에 재발송 → `CONFLICT`; `updateSeminarSchedule`(미래) → `seminar.schedule-changed`;
  재발송 → 활동·이벤트 생성 + `seminar.published`. 메일 결과는 `LB30-1` 2항과 같은 사건을 다른 원인(행 모양)에서 본 것이라
  두 문서가 서로 가리키는 것은 맞다. 같은 재발송 판정식이 이주 행 전부에도 켜지는 문제는 `LB30-5`(검증 추가)
- LB28-4 — 확인. 행 번호 미세 오차: `acceptTransfer`의 참가자 추가는 `studies.ts:281-283`(문서 `:282-284`)
- LB28-5 — 확인. assets를 훑는 청소 경로 없음(grep)
- LB28-6 — 확인. `ATOMIC-FLOWS.md` §7은 "기록 편집기(세미나·갤러리)와 `/admin/events/connect`"를 한데 묶어 "다시 확인하지 않는다 —
  동시 조작에서만"이라고 적는데, 갤러리 라우트(`gallery/+page.server.ts:73-76,95-98`)와 이 파일(305-323) 어디에도 첫 확인이 없다.
  connect만 첫 확인이 있다(`connect-action.test.ts:103`). 세미나 편집기는 `activityId`를 아예 넘기지 않는다
- LB28-7 — 확인
- LB28-8 — 확인
- 누락 점검: 파일 전체를 문서 없이 다시 읽었다. `setOrganizer`의 "grace-period" 주석은 유예 회원이 `status: "withdrawn"`이므로
  (`members-admin.ts:169`) 코드와 맞는다. 새 지적 없음
