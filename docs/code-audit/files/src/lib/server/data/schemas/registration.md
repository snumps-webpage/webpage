# `src/lib/server/data/schemas/registration.ts` (17줄)

**접두사 `LA23-`** · `registrations` 테이블 행 스키마 — 학기별 등록(S9 재등록 게이트)의 한 행.

지적 없음.

## 확인했고 지적하지 않은 것

- **`term: Term`(12행)** — 방학 학기(`YY-S/YY-W`)를 받지 않는 `TERM_PATTERN`(`core/semester.ts:10`)을 쓴다. 주석 6-7행
  "1학기+여름 / 2학기+겨울 = Term 단위"가 도메인 규칙(`domain/term.ts:20-22` — 3~~8월은 `-1`, 9~~2월은 `-2`)과 일치한다
- **"승인 시점의 currentTerm()"(12행 주석)** — SQL은 `p ->> 'term'`을 쓰고(`atomic_flows.sql:776`) TS가 그 값을 넘긴다.
  학기 도출이 TS 한 곳에 남아 있으므로 미러가 아니다
- **`(memberId, term)` 유일성 미표현** — 승인 흐름이 `sourceRequestId`로 멱등을 보장한다(`atomic_flows.sql:771-772`).
  같은 학기의 두 번째 신청 승인이 두 번째 등록 행을 만드는지는 서비스·흐름의 판단이고, 스키마로 표현할 수 없는 행 간
  불변식이다
- **"등록은 승인으로만 생성"(7행)** — 쓰는 곳이 `flow_approve_application`뿐임을 확인했다(`atomic_flows.sql:773`,
  이관·운영 스크립트 제외)
- `z.infer` 별칭(17행) — 유지 관례

## 검증 (2026-09-28)

- 지적 없음 — 확인. `TERM_PATTERN` 사용, `domain/term.ts:20-22` 학기 규칙, `atomic_flows.sql:771-778` 멱등·쓰기가 문서 서술과 일치한다
- 누락 점검: 17행 재독. 추가 없음
