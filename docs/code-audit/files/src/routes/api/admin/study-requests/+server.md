# `src/routes/api/admin/study-requests/+server.ts` (26줄)

**접두사 `QD-`** · 관리자 폴링용 대기 스터디 신청 목록 (§8-3 / BE-56).

> **초판 전면 개정.** 초판은 본문 전체가 `QA-`·`QS-` 참조였고 "고유한 지적이 없다는 것 자체가
> 중복의 증거"라고 적었다. **그 방법이 틀렸다** — 파일이 무엇을 내보내는지 묻지 않았기 때문에
> 아래 셋을 놓쳤다. 말미 "정정 기록" 참조.

## QD-3 🟠 `studyRequests:` (20행)는 죽은 페이로드다

`QA-5`·`QS-5`와 동일. 계약으로 증명된다 — `queueResponseEnvelopeSchema`가 스트립하고
소비자는 `.items`만 읽는다(`admin/+page.svelte:65`, `admin/studies/+page.svelte:27-31`).

## QD-4 🟠 이 큐의 item 형태는 세미나 큐와 대칭이 아니다

`adminStudyRequestItem`(`admin-queue-views.ts:92-112`)은 `status`와 `canWithdraw`를 반환하고,
`adminSeminarRequestItem`(`:63-90`)은 **둘 다 반환하지 않는다.**

| 필드                 | 문제                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status: r.status`   | 17행이 `status === "pending"`으로 필터하므로 **항상 `"pending"`인 상수**다. SSR 로드도 같다(`admin/studies/+page.server.ts:36`). 값이 하나뿐인 계약 필드                              |
| `canWithdraw: false` | **회원용 affordance**다(`domain/studies.ts:116-124`, `dev-dashboard-fixtures.ts:168`). 스터디 도메인이 회원·관리자 두 청중에 한 item 타입을 재사용하고, 세미나 도메인은 그러지 않는다 |

**이것이 `QA-1`의 처방에 대한 반증이다.** 세 큐는 계약 수준에서 교환 가능하지 않으므로
단순한 `adminQueueEndpoint({...})` 추출은 큐별 item 형태를 인자로 실어야 한다.

## QD-5 🟡 `directorySummaryIndex()`가 이 큐에서는 목적과 무관하다

`directorySummaryIndex`의 존재 이유는 legacy id를 담은 이주 행이다 —
자기 주석이 "이주된 요청(**seminar-requests** 등)"이라고 적는다(`admin-queue-views.ts:29-33`).

`study-requests`는 **신설 테이블**이고(BE-56: "study-requests 신설 포함",
`BACKEND-TASKS.md:101`), 유일한 writer `submitStudyRequest`(`services/studies.ts:20-35`)가
호출자의 운영 member id를 찍는다. **legacy id가 들어올 경로가 없다.**

즉 18행은 legacy∪운영 디렉터리를 만들어 legacy가 아닌 id를 푼다.
균일성을 위해서라면 정당하나, 그것은 선택이지 필연이 아니다. `QS-4`의 비용이 여기서는 근거를 잃는다.

## QD-1 🟡 `seminar-requests`와 이름만 다른 동일 파일

`QA-1`·`QS-1` 참조. `diff` 기준 26줄 중 다른 줄은 6개.

## QD-2 🟡 동적 import 3회(심볼 4개) · 403 본문 수기 작성

12-16행 / 9행. `QA-3` · `QA-4` 참조. (초판이 "4회"로 셌다 — 호출은 3회다.)

## 확인했고 지적하지 않은 것

- ~~"BE-56 주석이 셋 중 유일하게 스펙 항목을 단다 — 셋의 규약이 다르다는 뜻"~~ → **거꾸로 읽었다.**
  `BACKEND-TASKS.md:101`: `| BE-56 | 관리자 폴링 3종 | §8-3 /api/admin/* (study-requests 신설 포함) |`
  **BE-56은 세 엔드포인트 공통 과업이다.** 규약 차이의 증거가 아니라 나머지 둘이 같은 과업 id를
  덜 인용한다는 뜻이다. (`API-SPEC.md:601`도 셋을 한 항목으로 다루며 "전부 `ensureAdmin`"이라 적는데
  실제로는 셋 다 `requireAdminAction`을 쓴다 — 스펙 편차이나 셋 공통이라 QD 지적은 아니다)

## 정정 기록

초판은 지적 전부를 다른 문서로 미루고, 그 공백을 `QA-1`의 증거로 제시했다.

**순환 논증이었다.** `QD-1`이 `QA-1`에서 권위를 빌리고, 그 결과 생긴 공백을 다시 `QA-1`의 증명으로 썼다.
게다가 README는 "한 파일 = 한 문서 = 한 검증. 묶지 않는다. 묶으면 검증 품질이 떨어진다"고 적는다 —
전부가 교차 참조인 문서는 **파일 이름을 쓴 묶음**이고, 검증 에이전트에게 검증할 것을 주지 않는다.
그 규칙이 막으려던 실패가 정확히 일어났다: QD-3·QD-4·QD-5가 전부 이 파일 안에서 보이는 것이었다.

그리고 "다른 데 이미 적혀 있다"는 **문서 위치 논증이지 논리 논증이 아니다** —
README가 금지한 "상위 계층이 어차피 막아준다"에 가깝다.

> **교훈**: 교차 참조는 지적을 옮기는 도구다. **문서를 대신할 수는 없다.**
