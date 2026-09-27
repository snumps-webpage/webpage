# `src/lib/server/data/schemas/seminar-request.ts` (46줄)

**접두사 `LA25-`** · `seminar-requests` 테이블 행 스키마 + 요청 공용 상태 enum(`RequestStatus`) + 선호 시점 옵션 재수출.

## LA25-1 🟡 `closedAs`의 `"cancelled"`는 쓰는 곳이 없는 enum 값이다

42행 `closedAs: z.enum(["cancelled", "deleted"]).nullable().default(null)`. 쓰는 곳은 하나뿐이고 항상 `'deleted'`다 —
`flow_delete_seminar`의 `jsonb_build_object('closedAs', 'deleted', …)`(`atomic_flows.sql:272`). 이력상으로도
`1dadf1f`(필드 도입)와 `ccf345c`(SQL 이관) 모두 `"deleted"`만 썼다. 읽는 곳(`(public)/+page.server.ts:342`)은
`r.closedAs ||`로 참/거짓만 본다.

35-41행 주석이 그 이유를 스스로 말한다 — 취소는 세미나 행 자체로 알아보고(`cancelledRequestIds`), 표시는 행이 **삭제될 때**
남는다. 그런데 삭제는 취소된 세미나든 공개 전 세미나든(`v_hidden`, `atomic_flows.sql:214,263`) `'deleted'`로 적으므로
`"cancelled"`가 들어갈 경로가 없다.

결과: 앞으로 두 값을 구분해 표시하려는 사람은 `closedAs === "cancelled"`인 행을 기대하지만 하나도 없다. 취소된 뒤 삭제된
세미나의 신청은 `"deleted"`로 남아 "취소됐었다"는 사실을 잃는다 — 그 구분이 필요 없다면 enum 값이 불필요하고, 필요하다면
흐름이 틀렸다. 처방: 값 하나로 줄이거나(`closedAs: z.literal("deleted")` 또는 불리언) 흐름이 취소 여부를 보고 두 값을
나눠 쓴다. 전자는 저장된 행에 `"cancelled"`가 없으므로 동작 변경 없음(이관 스크립트가 쓰지 않았는지 확인 필요).

## LA25-2 🟡 두 요청 테이블이 공유하는 `RequestStatus`가 세미나 요청 모듈에 있고, 도메인에 복사본이 있다

4-10행 `RequestStatus`를 `study-request.ts:3,12`가 가져간다 — 스터디 요청의 상태 정의가 세미나 요청 파일에 산다.
같은 목록이 `domain/studies.ts:8-13` `STUDY_REQUEST_STATUSES`, `domain/dashboard.ts:30-31` `DashboardRequestStatus`(+
`"cancelled"`)에 있다. `(public)/+page.server.ts:59`는 `RequestStatus | "cancelled"`로 대시보드 타입을 또 조립한다.

결과: 상태를 하나 더하면(예: 보류) 세 곳 + 조립 한 곳. 세미나 요청만 상태를 바꾸려 하면 스터디 요청이 따라 바뀐다 —
공유가 의도라면 공유 원시형이 모인 `common.ts`가 제자리이고, 의도가 아니라면 둘로 나눠야 한다. 구조 변경만.

## LA25-3 🟡 `preferredTiming`의 닫힌 집합을 주석은 약속하고 스키마는 강제하지 않으며, 재수출은 이 파일이 쓰지 않는다

22-23행 주석: "SEMINAR_TIMING_OPTIONS 중 하나 또는 빈 문자열". 스키마는 `z.string().default("")` — 아무 문자열이나
통과한다. 닫힌 집합은 서비스(`seminar-requests.ts:18-22` `normalizeTiming`)와 도메인 입력(`domain/seminars.ts:114`)이
각자 강제한다. 같은 파일의 `kind`(32행)는 `z.enum(SEMINAR_KINDS)`로 **도메인 상수를 써서 강제한다** — 한 파일 안에서
두 닫힌 집합이 다르게 다뤄진다.

12-14행은 `SEMINAR_TIMING_OPTIONS`를 재수출하지만 이 파일은 그것을 쓰지 않는다. 재수출의 유일한 소비자는
`services/seminar-requests.ts:10`이고, 그 파일은 도메인에서 직접 가져올 수 있다(`seminar.ts:2`가 그렇게 한다).
`import`(14행)가 `export … from`(13행) 뒤, 선언 사이에 끼어 있는 것도 이 우회의 흔적이다.

결과: 저장 게이트가 목록 밖의 값을 막지 못한다 — 서비스를 거치지 않는 쓰기(운영 스크립트, 향후 SQL 흐름)는 아무 값이나
남긴다. 그리고 `seminar.ts:5-6` 주석은 "seminar-request.ts가 SEMINAR_TIMING_OPTIONS를 다루는 방식과 동일"하게 도메인
원천을 쓴다고 말하지만, 실제로 이 파일은 그 목록으로 **아무것도 검증하지 않는다**(`LA26-6`). 처방: `refine`으로
`"" | SEMINAR_TIMING_OPTIONS`를 강제하고 재수출을 지운다 — 저장된 행에 목록 밖 값이 있으면 디코드가 실패하므로 먼저
실측(**동작 변경**). 재수출 제거만은 구조 변경.

## LA25-4 🟡 `attachment` 주석이 일어나지 않은 미래를 예고한다

25행 `// external material link (upload path arrives with SYS-03)`. SYS-03(서명 업로드)은 이미 들어왔고
(`routes/api/uploads/presign`, 같은 파일 26-27행 `posterKey`가 그 결과), `attachment`는 여전히 외부 링크다
(`domain/seminars.ts:119` `attachmentUrl`). 주석은 "곧 업로드 경로가 된다"고 읽히지만 그렇게 되지 않았다. 주석 수정만.

## 확인했고 지적하지 않은 것

- **`kind: … .nullable().default(null)`(28-32행)** — null이 "도입 전 행 = 모름"이고 새 행은 폼이 항상 채운다.
  기본값이 "없음"과 명시적 결정을 섞지 않는다(`seminar.ts:88-96`이 기본값을 뺀 경우와 다르다)
- **`closedAs`와 `status`의 조합 불변식**("closedAs가 있으면 status는 approved", 37-38행) — 스키마가 막지 않지만 교차 필드
  불변식을 저장 스키마에 두지 않는 기준(`LA10`)에 따른다. 쓰는 곳이 승인된 요청에만 쓴다(`atomic_flows.sql:263-273`)
- **`presenterIds`와 `requesterId`의 관계** — 서비스 몫

## 검증 (2026-09-28)

- LA25-1 — 확인 (`closedAs` 쓰는 곳 전수 grep: `atomic_flows.sql:272`의 `'deleted'`와 `seminar-requests.ts:43`의 `null`뿐. 이관·운영 스크립트에도 없다)
- LA25-2 — 확인 (`domain/studies.ts:8-13`, `domain/dashboard.ts:30-31`, `(public)/+page.server.ts:59` 일치. 같은 사실을 스터디 쪽에서 다시 적은 `LA27-1`은 이 지적의 중복으로 철회했다)
- LA25-3 — 확인 (재수출의 유일한 소비자 `seminar-requests.ts:9-13`이 배럴 `$lib/server/data/schemas`를 거쳐 가져온다. SQL `atomic_flows.sql:828`은 신청서 값을 그대로 세미나로 옮긴다). 단 결과 문단의 곁가지 — `seminar.ts:5-6` 주석이 이 파일을 강제의 선례로 든다는 읽기(`LA26-6`) — 는 철회됐다: 그 주석은 원천의 위치를 말할 뿐이다. 이 지적의 본체(저장 게이트가 닫힌 집합을 강제하지 않는다)는 그대로다
- LA25-4 — 확인
- 누락 점검: 46행 재독. 공개된 세미나를 지우면 `v_hidden`이 거짓이라 신청에 표시가 남지 않는다(`atomic_flows.sql:263`) — 활동 기록이 남는 경우라 "승인됨" 유지가 의도와 맞는다고 판단해 추가하지 않는다
