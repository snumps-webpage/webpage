# `src/lib/server/services/seminars.ts` (240줄)

**접두사 `LB30-`** · 승인된 세미나의 공개 수명주기(FRONTEND-DECISIONS §3-1) — 일정 확정(단일 문서 CAS), 공개·일정 변경·취소(`flow_publish_seminar`·`flow_update_seminar_schedule`·`flow_cancel_seminar`), 그리고 커밋 뒤의 전 회원 메일.

## LB30-1 🟠 `announcedAt`이 "보냈다"와 "보내지 않기로 했다"를 함께 뜻하는데, 변경·취소 공지는 그것을 "알렸다"로 읽는다

네 곳이 같은 필드를 다르게 읽는다:

- 스키마: "전 회원 공지를 **실제로 보낸** 시각"(`seminar.ts:100-107`).
- `announce` 139-144행: 지난 일정으로 공개하면 메일을 보내지 않고 **선점을 남긴다** — "되살아나지 않게"
  (`seminars.test.ts:266-279`가 `announcedAt`이 찍힌 채 메일 0건임을 고정한다).
- 취소: `flow_cancel_seminar`가 `announcedAt`으로 `wasAnnounced`를 정하고(`atomic_flows.sql:491`) 236-238행이 그것으로 취소 메일을 보낸다.
- 일정 변경: 186-195행은 `announcedAt`을 **보지도 않는다** — `published`·`changed`·미래면 보낸다.

232-234행이 취소 쪽 원칙을 적는다 — "알린 적 없는 것의 취소를 알리면 '있었는지도 몰랐던 세미나가 취소됐다'가 된다."
그 원칙이 변경 쪽에는 없고, 취소 쪽도 "알렸다"를 틀린 필드로 판정한다. 결과:

1. 관리자가 연도를 잘못 넣어 **지난 날짜로 공개** → 메일 없음, 선점 남음 → 날짜를 미래로 고침 → 전 회원에게
   **"일정 변경"** 메일이 간다. 공개 공지는 영영 나가지 않는다 — 보드의 재발송 버튼은 `announcedAt === null`일 때만 켜진다
   (`seminars/+page.server.ts:91-92`). 시작 전에 취소하면 `wasAnnounced`가 참이라 **"취소"** 메일도 간다.
2. `published`인데 한 번도 공지되지 않은 행(`createSeminar`가 만드는 기록, 이주 행 — `LB28-3`)에 미래 일정을 넣으면
   `changed`가 참(`atomic_flows.sql:409-412`, 옛 일정이 null)이라 "일정 변경" 메일이 간다.

처방: "보냈다"와 "보내지 않기로 했다"를 분리한다(예: `announcedAt`은 발송 시에만, 억제는 별도 값). 변경 공지는 취소처럼
"보낸 적 있음"을 조건에 넣는다. 지난 날짜 공개의 억제는 날짜가 미래로 옮겨질 때 풀려야 한다. **동작 변경.**

## LB30-2 🟡 "이미 시작했나"가 네 곳에 살고, SQL 미러를 고정하는 테스트가 없다

| 자리                                             | 식                                                       |
| ------------------------------------------------ | -------------------------------------------------------- |
| `seminarHasStarted` 54-58                        | 일정 있으면 `startsAt <= Date.now()`, 없으면 `published` |
| `announce` 144                                   | `startsAt <= Date.now()` → 기록 정정                     |
| `updateSeminarSchedule` 189                      | `startsAt > Date.now()` → 공지                           |
| `flow_cancel_seminar` `atomic_flows.sql:477-479` | 54-58행과 같은 식, `p.now` 기준                          |

51-52행이 "취소 판정은 flow_cancel_seminar가 같은 규칙으로 SQL 안에서 한다 — 규칙을 바꾸면 둘을 함께 바꾼다"고 적는다 —
**미러라는 자인**이다. 그런데 `flow-rules.test.ts`가 고정하는 것은 `app_term_of`·`app_may_derive_semester`·`app_event_open`뿐이다(18·36·57행).
`seminars.test.ts:704-721`은 SQL 쪽, `manage.test.ts:98-107`은 TS 쪽 결과를 각각 볼 뿐 둘을 **같은 입력으로 대조하지 않는다**
(경계 `startsAt == now` 포함).

한쪽만 바꾸면 43-45행이 경고한 "눌러도 거절당하는 버튼"이 그대로 생긴다(`manage/+page.server.ts:67-71`은 TS 판정으로 버튼을 그린다).
144·189행은 같은 판정을 인라인으로 다시 적어 `seminarHasStarted`를 거치지 않는다.

처방: `app_seminar_started(sem, now)` SQL 헬퍼를 꺼내 `flow-rules.test.ts`에서 `seminarHasStarted`와 대조하고,
144·189행은 `startsInFuture(schedule)` 같은 한 함수를 쓴다. 구조만 바뀐다.

## LB30-3 🟡 일정 쓰기 입구가 둘이고 겹치며, 호출자가 캐시된 상태로 고른다

- `scheduleSeminar`(64-83): `unscheduled`·`scheduled`를 받는다.
- `updateSeminarSchedule`(172-197) → 흐름: `cancelled`·`unscheduled`만 거부한다(`atomic_flows.sql:407`) — `scheduled`와 `published`를 받는다.

`scheduled`는 **양쪽이 다 처리한다**(`seminars.test.ts:291` "공개 전에는 세미나만 고친다"가 흐름 쪽을 쓴다). 그래서 어느 쪽을 부를지는
규칙이 아니라 호출자의 선택이고, 유일한 호출자는 **캐시된** 상태로 고른다(`seminars/+page.server.ts:207-216`).
다른 인스턴스에서 방금 공개된 세미나는 캐시에 아직 `scheduled`라 `scheduleSeminar`로 가고 75-77행에서 `CONFLICT`가 난다 —
흐름으로 갔다면 활동·이벤트까지 맞춰 성공했을 요청이다.

처방: 흐름이 `unscheduled`도 받아(→ `scheduled`) 입구를 하나로 하거나, 서비스가 최신 행으로 분기한다. 경합 시 거짓 `CONFLICT`가
사라지는 **동작 변경**. (ATOMIC-FLOWS §7이 `scheduleSeminar`를 "단일 문서 CAS라 이미 원자적"으로 둔 판단은 옳다 — 문제는 원자성이 아니라 입구의 중복이다.)

## LB30-4 🟡 공개 공지 본문에 `note`(비고)를 싣는다

148행 `description: seminar.note`. 스키마는 둘을 **다른 글**로 정의한다 — `description`은 "세미나 소개글 … `note`(비고)와는 다른 글이라
자리를 따로 둔다"(`seminar.ts:70-75`). 승인은 신청 설명을 두 칸에 똑같이 복사하므로(`atomic_flows.sql:821-822`) 지금은 같은 글이 나간다.
그러나 관리자 보드와 기록 편집기도 `note`를 "설명"으로 부르고(`seminars/+page.server.ts:73,107,143-150`), `createSeminar`는
`description`을 비워 둔다(`records-admin.ts:81`). **공지 본문이 어느 칸인지** 코드가 스키마와 반대로 답하고 있다.

처방: 공지 본문의 원천을 한 칸으로 정하고 이름을 맞춘다(스키마 주석 또는 148행 중 하나를 고친다). 어느 쪽이냐에 따라 구조 또는 **동작 변경**.

## LB30-5 🟠 공개 재실행의 "수렴"이 앵커만 보고 `activityId` 연결을 보지 않는다 — 앵커 없는 공개 행에 재발송을 누르면 활동·이벤트가 하나 더 생긴다 (검증 추가)

> **정리 교차 참조**: `supabase/migrations/20260928000000_atomic_flows.md` **LA43-1(🔴)**과 같은 결함이다 —
> 그쪽이 결함이 사는 SQL을 소유하고 🔴로 센다. 여기는 호출 측 관찰로 남기고 새로 세지 않는다.

93-96행은 "이미 `published`인 세미나로 다시 들어오면 **빠진** 활동·이벤트만 채운다"고 약속한다. 그런데 `flow_publish_seminar`는
있는 활동·이벤트를 **앵커(`sourceRequestId = 'seminar:<id>'`)로만** 찾는다(`atomic_flows.sql:330-331,346-347`). 세미나 행이
`activityId`로 가리키는 활동은 보지 않고, 찾지 못하면 새로 만든 뒤 368행에서 `activityId`를 **새 활동으로 덮는다.**

같은 파일의 다른 흐름은 이 연결을 안다 — `flow_update_seminar_schedule`은 `a.id = activityId or 앵커`(`:427-428`),
`app_is_seminar_event`는 "앵커, 또는 — 앵커 없는 이주 행이면 — 그 활동에 매달린 이벤트"(`:169-176`). 공개만 모른다.

앵커 없이 공개된 행은 이주된 세미나 전부다(`app_seminar_status`의 규칙, 이주 마이그레이션 `20260928000100`). 그 행들은
`announcedAt`도 비어 있으므로 보드가 **모두에 "공지 재발송"을 켠다**(`seminars/+page.server.ts:91-92`, `LB28-3`과 같은 판정식).
일정이 없으면 `atomic_flows.sql:314-315`의 `CONFLICT`로 끝나지만, 169-170행 주석이 안내하는 대로 `updateSeminarSchedule`로 일정을 되살린 뒤 누르면:

- 두 번째 활동(발표자 자동 인정 포함)과 두 번째 출석 이벤트가 생긴다. 세미나는 새 활동을 가리키고 옛 활동·이벤트는 연결을 잃는다
  (옛 활동은 아카이브·출석 목록에 그대로 남아 같은 세미나가 두 번 보인다).
- 이후 일정 변경은 새 쌍만 맞춘다(`:427-428`의 `activityId`가 새 값이므로). 옛 쌍은 영구히 낡는다.
- 일정이 미래면 몇 해 전 기록일 수도 있는 세미나의 **공개 공지**가 전 회원에게 나간다(과거면 139-144행이 억제).

실측(임시 vitest, pglite에서 실제 SQL 실행): 공개 → 활동·이벤트의 앵커를 지우고 `announcedAt: null`로 이주 행 모양을 만든 뒤
`publishSeminar` 재호출 → 활동 2 · 이벤트 2 · `activityId` 변경 · `seminar.published` 메일 1건.

처방: 공개 흐름이 활동을 `v_sem.activityId`로도 찾고(없을 때만 생성), 이벤트는 `app_is_seminar_event`로 찾는다. 보드의 재발송은
"공지 대상이었는데 실패한 행"만 켜야 한다(`LB30-1`·`LB28-3`의 `announcedAt` 의미 분리와 같은 뿌리). **동작 변경.**

## 확인했고 지적하지 않은 것

- **공개의 원자성과 재실행 수렴** — 상태 전이·학기 도출·활동/이벤트 생성·선점이 한 흐름이고, 앵커(`seminar:<id>`)로 재실행이
  수렴한다. `seminars.test.ts:202-236`이 재실행·동시 실행·메일 실패 후 재시도를 고정한다
  — **검증 정정**: 앵커로 공개된 행에서만 참이다. 앵커 없이 `activityId`로 연결된 공개 행에서는 수렴하지 않는다(`LB30-5`)
- **흐름 출력을 `SeminarSchema.parse`로 검증한다(119·179·230)** — SQL이 쓴 행이 zod 게이트를 거치지 않는 틈을 반환 경로에서 막는다
- **선점 되돌리기 전 프로세스가 죽는 창(134-137)** — 중복 발송보다 누락을 택한 이유가 적혀 있다. 되돌리기 `mutate`가 던지면
  커밋된 공개가 오류로 보이는 것도 같은 창의 변형이다. 결정된 절충이라 지적하지 않는다
- **발송 실패를 삼키지 않는다** — 세 경로 모두 `mailFailed`를 돌려준다(`seminars.test.ts:590-640`)
- **취소 공지의 조건(`flipped && wasAnnounced && !started`)** — 논리 자체는 맞다. 틀린 것은 `wasAnnounced`의 원천이다(LB30-1)
- **`scheduleSeminar`의 `saved!`** — `mutate`는 이긴 시도 뒤에만 반환하므로 마지막 대입이 저장된 행이다
- **관리자 취소에 `memberId: ""`가 올 수 있다**(라우트 248) — 흐름은 관리자일 때 `memberId`를 보지 않는다
- **`seminarHasStarted`가 일정 없는 `published`를 "이미 열림"으로 읽는다** — 이주 행 보호 근거가 47-49행에 있고 SQL과 같다.
  다만 `createSeminar`가 그 상태를 새로 만드는 것은 `LB28-3`

## 커버리지

`seminars.test.ts`(869줄)·`publish-cancel-race.test.ts`·`manage.test.ts`가 수명주기 대부분을 덮는다. LB30-1의 "지난 날짜 공개 → 미래로
정정" 경로, LB30-2의 TS·SQL 대조, LB30-3의 캐시 분기는 미검증이다.

## 검증 (2026-09-28)

- LB30-1 — 확인. 임시 vitest(pglite에서 실제 흐름 실행, 메일 모듈 모의)로 재현: 지난 날짜 공개 → 메일 0건·`announcedAt` 찍힘 →
  미래로 일정 수정 → `seminar.schedule-changed` 1건 → 재공개(재발송 경로) 공지 0건(선점이 남아 `claimed` 거짓) → 관리자 취소 →
  `seminar.cancelled` 1건. 인용 행(`atomic_flows.sql:369-372,409-413,491`, `seminars/+page.server.ts:91-92`) 일치
- LB30-2 — 확인. `flow-rules.test.ts`는 `app_term_of`·`app_may_derive_semester`·`app_event_open`만 대조한다
- LB30-3 — 확인. 흐름 407행은 `cancelled`·`unscheduled`만 거부하고, 라우트 207-216행은 `getTable`(캐시) 상태로 분기한다
- LB30-4 — 확인
- LB30-5 — 추가. 공개 재실행이 앵커만 보고 `activityId` 연결을 무시해 이주 행 재발송 시 활동·이벤트를 복제한다(재현함)
- 누락 점검: 파일 전체와 세 흐름(`flow_publish_seminar`·`flow_update_seminar_schedule`·`flow_cancel_seminar`)을 문서 없이 다시 읽었다.
  선점 되돌리기(153-158)가 상태를 보지 않는 것은 취소 뒤 `announcedAt`만 비우는 무해한 쓰기라 지적하지 않았다
