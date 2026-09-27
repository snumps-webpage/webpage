# `src/lib/server/data/schemas/study-request.ts` (16줄)

**접두사 `LA27-`** · `study-requests` 테이블 행 스키마 — 스터디 개설 신청(승인 시 신청자가 주최자가 된다).

## ~~LA27-1 🟡 상태 enum을 형제 테이블 모듈에서 빌려 오고, 도메인에 같은 목록이 따로 있다~~

> **검증 정정 — 철회(중복)**: `LA25-2`와 같은 지적이다. `LA25-2`가 이미 "`RequestStatus`를 `study-request.ts:3,12`가
> 가져간다 — 스터디 요청의 상태 정의가 세미나 요청 파일에 산다", `domain/studies.ts` `STUDY_REQUEST_STATUSES` 복사본,
> "세미나 요청만 상태를 바꾸려 하면 스터디 요청이 따라 바뀐다", 처방(`common.ts`로 옮기거나 둘로 나눈다)까지 모두 적었고,
> 이 절의 처방도 "`LA25-2`와 같다"고 스스로 말한다. 같은 결함을 두 번 세지 않는다. 사실은 맞다.

3행 `import { RequestStatus } from "./seminar-request"`, 12행 `status: RequestStatus`. 스터디 요청의 상태 정의가 세미나
요청 파일(`seminar-request.ts:4-10`)에 산다. 도메인은 스터디 요청 상태를 따로 선언한다 — `domain/studies.ts:8-14`
`STUDY_REQUEST_STATUSES`, 이 목록으로 관리자·신청자 화면 타입(`StudyRequestItem.status`, `:32`)을 만든다.

결과: 세미나 요청에만 상태를 더하면 스터디 요청의 저장 게이트도 넓어지고, 스터디 쪽 도메인 목록과는 어긋난다.
두 요청이 같은 상태 기계를 공유한다는 것이 의도라면 그 사실이 `common.ts`에 드러나야 한다. 처방은 `LA25-2`와 같다.
구조 변경만.

## LA27-2 🟡 스터디가 삭제되면 신청은 "승인됨"으로 남는다 — 세미나 요청이 `closedAs`로 푼 문제가 여기엔 그대로 있다

세미나 요청은 연결된 세미나가 삭제되면 `closedAs: "deleted"`를 남겨 신청자 화면이 "취소됨"으로 보인다
(`seminar-request.ts:35-42`, `1dadf1f`, 쓰기 `atomic_flows.sql:263-273`). 스터디 삭제 흐름 `flow_delete_study`
(`atomic_flows.sql:1132-1150`)는 `studies`만 잠그고 지운다 — `study-requests`를 건드리지 않는다. 이 스키마에는 그런
표시를 담을 자리도 없다.

결과: 신청자의 `/study/apply` 목록(`(member)/study/apply/+page.server.ts:17-23`)은 존재하지 않는 스터디의 신청을 계속
"승인됨"으로 보여 준다. 같은 부류의 두 테이블이 같은 사건에 다르게 반응한다. 처방은 세미나 요청과 같은 필드·흐름 처리
(**동작 변경** — 스키마 필드 추가 + `flow_delete_study` 수정 + 표시). 스터디 삭제는 세션이 없을 때만 허용되므로
(`:1140-1142`) 빈도는 낮지만, 그것은 우선순위의 문제다.

## 확인했고 지적하지 않은 것

- **`semester: Semester`(10행)** — 방학 학기를 받는 것이 도메인 입력(`domain/studies.ts:76-82`)과 일치한다
- **`requesterId`가 승인 시 주최자가 된다(11행)** — 승인 흐름이 `organizerIds`·`participantIds`에 넣는다
  (`atomic_flows.sql:872-873`). 주석과 일치
- **`closedAs` 외 필드 비대칭**(세미나 요청의 `kind`·`posterKey` 등) — 스터디에 해당 개념이 없다. 비대칭 자체는 결함이 아니다
- `z.infer` 별칭(16행) — 유지 관례

## 검증 (2026-09-28)

- LA27-1 — 철회 (`LA25-2`와 중복)
- LA27-2 — 확인 (`flow_delete_study`가 `events`·`studies`만 잠그고 `studies`만 쓴다 `atomic_flows.sql:1132-1150`, 세션이 있으면 거부 `:1140-1142`, 신청 목록 `study/apply/+page.server.ts:17-23` 일치)
- 누락 점검: 16행 재독. 추가 없음
