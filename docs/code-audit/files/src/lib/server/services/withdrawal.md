# `src/lib/server/services/withdrawal.ts` (58줄)

**접두사 `LB27-`** · 회원 쪽 탈퇴 수명주기(API-SPEC §4-7, MEM-07) — 탈퇴 신청(`flow_request_withdrawal`), 본인 철회(`flow_member_withdrawal` `cancel`), 유예 안내 페이지용 상태 조회. 자동 익명화는 보류됐다.

## LB27-1 🟠 유예 종료일의 규칙이 둘이고, 테스트된 쪽은 돌지 않는다

| 위치                                                | 규칙                                          | 쓰임                                                 |
| --------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| 이 파일 53-55행                                     | `requestedAt + WITHDRAWAL_GRACE_MS`(**30일**) | 본인 유예 페이지(`withdraw/pending/+page.svelte:49`) |
| `members-admin.ts:179-181`                          | 같은 식의 복사(30일)                          | 관리자 대시보드                                      |
| `domain/account.ts:129-133` `withdrawalGraceEndsAt` | `setUTCMonth(+1)`(**달력 1개월**)             | **운영 호출자 0** — `account.test.ts:44-48`만 부른다 |

스펙은 "1개월"이다 — 대상 판정 `requestedAt + 1개월`(`API-SPEC.md:522`), 보류 해제 "1개월 재기산"(`:717`).
사용자 문구도 "1개월"이다(`LA09-4`가 다섯 곳을 셌다). 즉 **스펙·문구·테스트가 가리키는 규칙은 도메인 함수이고,
화면에 나가는 날짜는 다른 규칙으로 계산된다.**

도메인 테스트의 예가 그대로 반례다 — 2026-08-28에 신청하면 도메인은 09-28, 이 파일은 09-27을 보여 준다.
1월 31일 00:00 KST 신청은 30일 규칙으로 3월 2일, 달력 규칙으로 3월 3일이다. 익명화가 구현되는 날 집행 기준을
스펙(달력 1개월)으로 잡으면 화면이 약속한 날짜와 하루씩 어긋나고, 화면(30일)으로 잡으면 고지한 "1개월"보다 **먼저** 파기된다 —
어느 쪽이든 파기 시점에 대해 회원에게 한 고지와 집행이 다르다.

게다가 두 서비스 사본은 `toISOString()`(UTC `Z`)으로 내보낸다 — 저장 형식(`core/time.ts:3` KST 오프셋)과 다르다.

**고침**: 규칙 하나(스펙대로면 달력 1개월)를 `$lib/domain`에 두고 두 서비스가 부른다. `WITHDRAWAL_GRACE_MS`는 그 함수 뒤로
숨기거나 지운다. **동작 변경**(표시 날짜가 하루 안팎 바뀐다) — 어느 규칙을 고를지는 스펙 문구로 이미 정해져 있다.

## LB27-2 🟡 "탈퇴 유예 중"의 판정이 세 벌이다

| 위치                                             | 판정                                                   |
| ------------------------------------------------ | ------------------------------------------------------ |
| 이 파일 50행 `getWithdrawalState`                | `member.withdrawal`이 있으면                           |
| `members-admin.ts:173` `getWithdrawnPending`     | `status === "withdrawn" && withdrawal`                 |
| `atomic_flows.sql:1077` `flow_member_withdrawal` | `status <> 'withdrawn' or withdrawal is null`이면 거부 |

`Member` 스키마는 `status`와 `withdrawal`을 묶지 않으므로 "`withdrawal`은 있는데 `status`는 withdrawn이 아닌" 행은 타입상 가능하다.
그 행에 대해 이 파일은 유예 페이지와 철회 버튼을 보여 주고(`withdraw/pending/+page.server.ts:10-13`), 버튼을 누르면
SQL은 `NOT_FOUND`를 낸다(`:1079`). 관리자 목록에는 나타나지 않는다. 세 곳이 같은 상태를 서로 다르게 본다.

지금의 쓰기 경로(두 흐름, `setStatus`의 withdrawn 거부)는 그런 행을 만들지 않는다 — 그러나 그것은 호출부의 성질이고,
판정이 세 벌인 것은 코드의 성질이다.

**고침**: `isInWithdrawalGrace(m)`(= SQL과 같은 조건) 하나를 도메인에 두고 두 서비스가 쓴다. 스키마에서 둘을 묶을 수 있으면
(`status: "withdrawn"`일 때만 `withdrawal` 허용) 더 좋다. **구조만 바뀐다**(판정을 SQL 쪽에 맞추면 50행은 동작 변경).

## LB27-3 🟡 `deleteAfter`는 삭제 시각이 아니다

53행 필드 이름은 "이 시각 뒤에 삭제된다"를 말한다. 그러나 9-10행 모듈 주석대로 자동 익명화는 **보류**됐고
("past-deadline members simply persist"), 화면도 그렇게 적는다 — "유예 종료 · 이후 처리 정책은 확정 전"
(`withdraw/pending/+page.svelte:49`). 관리자 쪽 소비자는 이미 이름을 바꿔 쓴다: `graceEndsAt`
(`admin/+page.server.ts:146`, 도메인 타입 `domain/admin-dashboard.ts:65`). 같은 값에 두 이름이 있고, 서비스 쪽 이름이 틀린 쪽이다.

**고침**: `graceEndsAt`으로 통일(`members-admin.ts:179`도). **구조만 바뀐다.**

## LB27-4 🟡 `TripleConfirmation`이 도메인의 같은 타입을 다시 선언한다

> **검증 정정**: 등급 유지, 결과 주장을 좁힌다. "넷째 확인 요소를 더하면 이 함수가 컴파일 오류 없이 버린다"는 참이지만,
> **처방(타입 import)으로도 그대로다** — 27-34행은 필드를 하나씩 골라 흐름에 넘기므로, 공유 타입에 필드가 늘어도
> 이 호출은 여전히 셋만 보내고 컴파일러는 아무 말도 하지 않는다. 그러니 이 지적의 결함은 "같은 타입의 중복 선언"까지이고,
> "서버 재검증이 세 요소에 머문다"를 막으려면 흐름 입력을 `satisfies Record<keyof WithdrawalFormValues, unknown>` 같은
> 형태로 묶거나 SQL이 받는 키 목록과 대조하는 테스트가 필요하다.

13-17행 `TripleConfirmation { ackInfo; ackDataPolicy; confirmName }`은 `domain/account.ts:10-14` `WithdrawalFormValues`와
필드까지 같다. 도메인은 스스로를 "the single source"라 부른다(`account.ts:78`). 라우트는 도메인 검증 결과를 그대로 넘긴다
(`settings/withdraw/+page.server.ts:33-36`).

구조적 타이핑이라 도메인에 넷째 확인 요소를 더해도 이 함수는 **컴파일 오류 없이 그것을 버린다** — 서버 재검증이
"세 요소"에 머문다.

**고침**: `import type { WithdrawalFormValues }`로 대체. **구조만 바뀐다.**

## LB27-5 🟡 모듈 주석이 검증 위치를 틀리게 적는다

8행: "Triple confirmation is verified HERE, atomically". 이 파일은 검증하지 않는다 — 값을 흐름에 넘길 뿐이고(27-34),
검증은 `flow_request_withdrawal`이 한다(`atomic_flows.sql:1034-1038`). 같은 파일 23-26행 주석은 그것을 정확히 말한다.
한 파일 안에서 두 주석이 서로 다른 위치를 가리킨다.

이름 비교의 `trim`도 세 층에 흩어져 있다 — 도메인 `.trim()`(`account.ts:97`), 이 파일 31행, SQL은 "trimmed"를 전제로 정확 비교
(`atomic_flows.sql:1019` 입력 주석, `:1036`). 서버 쪽 계약("이름은 다듬어서 비교한다")이 SQL이 아니라 TS 호출자에게 있다.

**고침**: 8행을 "verified in flow_request_withdrawal, atomically"로. `trim`을 SQL 쪽으로 옮기면 TS 두 곳이 지워진다(구조).

## 확인했고 지적하지 않은 것

- **신청·철회와 감사 행이 한 트랜잭션이다** (27-34, 39-45) — `withdrawal-flow.test.ts:87-140`이 감사 삽입 실패 시 회원 행이 그대로임을 고정한다
- **주최자 인계 선행 검사가 SQL에서 `studies`를 공유 잠금으로 읽는다**(`atomic_flows.sql:1029,1039-1043`) — 인계 수락과의 경합을 막는다. 옳다. 다만 **라우트의 미러**(`settings/withdraw/+page.server.ts:12-15`)는 "Mirrors the organizer guard in services/withdrawal.ts"라 적는데 그 규칙은 이제 SQL에 있고, 미러와 SQL을 대조하는 테스트가 없다 — 그 라우트 리뷰의 몫이다
- **본인 철회의 `actorId`가 본인이다** (42) — 감사 대상(본인 행위지만 파기 트리거, `API-SPEC.md:150-154`)이고 행위자가 맞다
- **자동 익명화 보류** (9-10) — 스펙 결정(API-SPEC §4-7 🔶 2026-08-28)
- **탈퇴해도 `isAdmin`을 지우지 않는다** — C-18 결정(`SCOPE.md:644`)
- **`getWithdrawalState`가 회원 표 전체를 읽고 `find`한다** (49) — `LA34-2`가 이 줄을 포함한 인라인 조회 열 곳을 다뤘다

## 커버리지

`withdrawal.test.ts`가 삼중 확인 거부·`previousStatus` 보존·주최자 차단·이중 신청·철회를, `withdrawal-flow.test.ts`가 감사 원자성을 본다.
**`getWithdrawalState`의 `deleteAfter` 값은 어디서도 검증되지 않는다** — `members-admin.test.ts:139-145`는 "미래이다"만 본다.
LB27-1의 불일치가 테스트 스위트를 통과하는 이유다.

## 검증 (2026-09-28)

- LB27-1 — 확인 (🟠 유지. 화면에 나가는 것은 30일 규칙이다 — 본인 유예 페이지는 `getWithdrawalState().deleteAfter`를 `Asia/Seoul`로 포맷해 보이고(`withdraw/pending/+page.svelte:10-16,49`), 관리자 대시보드는 `getWithdrawnPending().deleteAfter` → `graceEndsAt`(`admin/+page.server.ts:146`)을 `AdminReviewInbox.svelte:107-110`에서 보인다. 달력 1개월의 `withdrawalGraceEndsAt`은 `account.test.ts:45`만 부른다. 탈퇴 폼은 "1개월간 유예"를 고지한다(`settings/withdraw/+page.svelte:91,103`). 1월 31일 예는 평년 기준으로 맞다(윤년이면 30일 규칙이 3월 1일). 덧붙여 관리자 쪽 `toLocaleDateString("ko-KR")`은 시간대 인자가 없어 SSR(UTC)에서 KST 날짜와 하루 어긋날 수 있다 — 그 컴포넌트 리뷰의 몫)
- LB27-2 — 확인 (`atomic_flows.sql:1077,1079` 확인)
- LB27-3 — 확인
- LB27-4 — 정정 (등급 유지. 처방이 주장한 결과를 막지 못한다 — 결함을 중복 선언으로 좁힘)
- LB27-5 — 확인 (`atomic_flows.sql:1019,1034-1038`, `account.ts:78,97` 확인)
- 누락 점검: 58줄을 문서 없이 다시 읽었다 — 흐름 두 호출의 입력, `cancel`의 `actorId`, `getWithdrawalState`가 `status`를 보지 않는 점(LB27-2), 해제 후 `requestedAt`이 해제 시각으로 바뀌어 유예 페이지의 "신청" 시각도 바뀌는 점(스펙 `API-SPEC.md:717`의 결정). 새 지적은 없다.
