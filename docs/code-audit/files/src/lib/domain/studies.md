# `src/lib/domain/studies.ts` (220줄)

**접두사 `LC16-`** · 스터디의 브라우저 안전 규칙 — 상태·신청 상태 목록, 화면 DTO 타입, 개설 신청과 `/study/[id]/manage` 주최자 액션의 입력 스키마, 상태 전이표, 출석 병합 래퍼, KST 변환, 폼 읽기·검증.

## LC16-1 🟡 운영 규칙처럼 보이는 export 넷이 테스트 전용이고, 그중 둘은 실제로 도는 규칙과 다르게 말한다

> **검증 정정**: `operationIdSchema` 행을 고친다. `api.ts:49`의 `operationId: z.uuid()`는 **"실제로 도는 규칙"이 아니다** — 운영에서
> `presignRequestSchema`를 `parse`하는 곳이 없고, 본문 스키마는 61-63행에서 그 필드를 뺀다(`client/api.ts:106-108`). 이것은 이미
> `LC05-2`(`api.md`)·`REGISTER.md` `UP-3`이 판정했다. 따라서 "이쪽은 v7만, 운영은 아무 UUID"라는 **대비는 성립하지 않는다** — 둘 다 테스트만 고정하는
> 규칙이다(`studies.test.ts:19-25`, `client/api.test.ts:58-66`). 더 나아가 `operationId` 값 자체를 읽는 운영 코드가 없다 — `uploadAdminFile`이
> `AdminUploadResult.operationId`로 되돌려 줄 뿐(`client/api.ts:135-136`) 두 업로드 컴포넌트 어느 쪽도 읽지 않는다(`grep` 전수).
> 이 행에서 **새로 남는 것**은 "같은 (돌지 않는) 계약을 서로 다른 두 스키마가 v7 / 임의 UUID로 선언하고, 값을 만드는 두 컴포넌트도 v4 / v7로 갈렸다"는 것이다.
> "업로드 경로에 연결하면 포스터 업로드가 깨진다"는 가정형 결론은 여전히 참이다. 표 머리의 "그중 둘은 실제로 도는 규칙과 다르게 말한다"는
> `nextStudyStatuses` 하나로 줄어든다(`localKstDateTimeToIso`는 "무검증"이 차이). 🟡 유지.

`studies.test.ts`가 import하는 것 중 넷은 저장소의 운영 코드 어디에서도 호출되지 않는다(`grep` 전수).

| export                            | 테스트                  | 실제로 도는 규칙                                                               | 차이                                                                                                                                | 기존 ID  |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `nextStudyStatuses` (149-158)     | `studies.test.ts:13-17` | `services/studies.ts:159-172` `setStudyStatus` — "finished에서 못 나감"만 검사 | **다르다** — 운영은 `recruiting → finished`를 받는다(스펙 `API-SPEC.md:633`은 금지)                                                 | `LB31-3` |
| `mergeStudyAttendance` (160-180)  | `studies.test.ts:27-45` | `server/attendance.ts` `mergeAttendees`                                        | 같은 규칙, 실패 문구만 이쪽에 있다                                                                                                  | `LB01-1` |
| `localKstDateTimeToIso` (182-184) | `studies.test.ts:54-56` | `core/time.ts:24-33` `kstInputToIso` (manage 액션이 실제로 부름)               | 이쪽은 **무검증**                                                                                                                   | `LA09-3` |
| `operationIdSchema` (54)          | `studies.test.ts:19-25` | `domain/api.ts:49` `presignRequestSchema.operationId: z.uuid()`                | **다르다** — 이쪽은 v7만, 운영은 아무 UUID. 세미나 포스터 업로드는 v4를 보낸다(`PosterUploadField.svelte:36` `crypto.randomUUID()`) | **신규** |

앞의 셋은 이미 다른 문서가 지적했고 여기서 재등급하지 않는다. 이 파일 쪽에서 보이는 것은 **패턴**이다: 테스트 이름이
"only permits the documented … transitions", "accepts UUIDv7 operation IDs and rejects UUIDv4"처럼 **규칙을 선언**하는데
그 규칙은 운영 경로에 없다. 초록 테스트가 "규칙이 지켜진다"로 읽힌다.

`operationIdSchema`는 새로 드러난 경우다. 이름은 스터디와 무관하고(스터디에는 작업 식별자가 없다), 업로드의 멱등 키를 정의하는
실제 스키마는 `api.ts:49`에 따로 있다. 누군가 테스트를 믿고 이것을 업로드 경로에 연결하면 v4를 보내는 포스터 업로드가
"올바른 작업 식별자가 아닙니다."로 깨진다 — 두 업로드 컴포넌트가 이미 서로 다른 UUID 버전을 쓰기 때문이다
(`AdminDirectUploadForm.svelte:62`는 v7).

처방: `operationIdSchema`와 그 테스트를 지운다(v7을 계약으로 삼으려면 `api.ts:49`를 바꾸고 포스터 업로드를 v7로 — **동작 변경**).
나머지 셋은 각 ID의 처방을 따른다 — `nextStudyStatuses`는 서비스가 **쓰게** 하고(`LB31-3`), 다른 둘은 운영 쪽으로 합친다.
삭제만이면 **구조 변경**.

## LC16-2 🟡 `StudyMemberSummary`는 같은 모양의 여섯 번째 이름이다

16-20행 `StudyMemberSummary { id; name; department }`. 같은 세 필드가 `domain/seminars.ts:59` `MemberPickerItem`,
`domain/admin-seminars.ts:15` `SeminarRequesterSummary`, 그리고 서버 투영 셋(`repos.ts:11-17`, `admin-queue-views.ts:23,35-43`)에 있다 —
`LA29-4`·`LA34-3`이 다섯을 셌고 이것은 거기에 빠져 있다. 소비자는 `StudyRosterPanel.svelte:4`, `StudyTransferPanel.svelte:3`와
이 파일의 `StudyRequestItem.requester`(31행)다.

결과: 회원 요약에 필드 하나(예: 동명이인 구분용 입학년도)를 더하려면 여섯 곳을 찾아야 하고, 이 이름은 앞선 두 문서의 목록에도 없어서
그 목록대로 고치면 스터디 화면만 빠진다.

처방: `LA34-3`의 통합 대상(`MemberPickerItem`)으로 별칭 처리. **구조 변경**.

## LC16-3 🟡 폼 검증 조립의 복제 (`LC15-4` 참조)

207-220행 `validateStudyRequestForm`은 `seminars.ts:200-214`와 이름 외에 같은 조립이다. 198행 `studyRequestIssues`는
`seminarFormIssues`와 달리 `z.ZodError`를 제네릭 없이 받는다 — 같은 역할의 두 래퍼가 타입 엄밀성도 다르다. 처방은 `LC15-4`.

## 확인했고 지적하지 않은 것

- **`StudyRequestFormField = keyof StudyRequestFormValues | "_form"`(49행)** — 필드 타입을 값 타입에서 얻는다. `seminars.ts`가 손으로 두 번
  적다가 필드를 빠뜨린 것(`LC15-2`)과 대조되는 좋은 형태다
- **`isCalendarDateTime`(88-100행)** — 모양이 틀리면 `true`를 돌려 정규식 쪽 문구 하나만 나오게 한다(zod v4에서 regex 실패는
  계속 가능한 issue라 refine이 이어서 돈다). `24:00`은 `Date.UTC`가 다음 날로 굴려 날짜 비교에서 걸린다. `studies.test.ts:59-72`가
  `02-30`·`13월`·`24:00`을 고정한다. 이 도메인 검사가 `kstInputToIso`의 날짜 굴림(`LA09-1`)을 앞에서 막아 준다 — manage 액션 경로에서는
- **주최자 액션 스키마 여섯(131-147행)** — 모두 `study/[id]/manage/+page.server.ts:128-196`이 쓴다. 126-130행 주석(폼의 `date` → `startedAtLocal`)이 정확하다
- **`studyTargetIdSchema`의 `max(200)`(120-124행)** — `LC07-6`이 센 id 스키마 사본 중 하나다. 재등급하지 않는다.
  `seminars.ts:128`의 발표자 id는 같은 개념에 `64`를 쓴다 — 근거 없는 상한이 두 값이라는 점까지 `LC07-6`의 처방(공용 id 스키마 하나)이 함께 푼다
- **`STUDY_STATUSES`(5행)·`STUDY_REQUEST_STATUSES`(8-13행)가 저장 스키마와 별개 목록** — `LA28-3`·`LA25-2`가 이미 셌다
  (`seminars.ts`의 `SEMINAR_KINDS`처럼 스키마가 도메인 배열을 쓰면 하나가 된다). `STUDY_REQUEST_STATUSES`는 이 파일 안의 타입 정의 말고는 쓰이지 않는다
- **`StudyRequestItem.canWithdraw`, `AdminStudyRequestItem.canApprove`/`canReject`** — 생산자가 상수만 넣고 화면이 읽지 않는다.
  `QD-4`와 `admin-queue-views.md`의 판정이 있다. 재등급하지 않는다
- **학기 정규식(79-82행)** — `SEMESTER_PATTERN`의 사본. `LA06-1`·`LC03-2`가 셌다
- **`studyRequestInputSchema`가 모르는 키(`schedule`)를 버린다** — zod 객체의 기본 동작이고 `studies.test.ts:74-87`이 의도로 고정한다

## 검증 (2026-09-28)

- LC16-1 — 정정 (`operationIdSchema` 행: `api.ts:49`도 운영에서 돌지 않는다 — `LC05-2`. 대비를 "두 스키마·두 생성기가 서로 다른 버전을 선언"으로 좁힘. 🟡 유지. 나머지 세 행과 "운영 호출 0건"은 `grep`으로 확인)
- LC16-2 — 확인 (`admin-seminars.ts:15-19`, `repos.ts:12,17`, `admin-queue-views.ts:23,40` 같은 모양)
- LC16-3 — 확인 (`LC15-4`의 참조 항목 — 한 번만 센다. 198행 비제네릭 `z.ZodError`는 이 항목의 고유분)
- 누락 점검: 220줄을 원문만으로 다시 읽었다. `studyStatusSchema`는 이 파일 안(`studyStatusInputSchema`)에서만 쓰이고 그것은 manage 액션이 쓴다. `isCalendarDateTime`의 `Date.UTC`가 0~99년을 1900년대로 읽어 `0099-…`를 "존재하지 않는 날짜"로 거절하는 것은 메시지만 부정확한 계약 밖 입력이라 세지 않는다. 추가 없음
