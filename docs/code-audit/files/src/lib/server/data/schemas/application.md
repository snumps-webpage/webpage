# `src/lib/server/data/schemas/application.ts` (21줄)

**접두사 `LA11-`** · `applications` 테이블 행 스키마 — 처리 전 가입 신청만 담는다(상태 필드 없음).

지적 없음.

## 확인했고 지적하지 않은 것

- **상태 필드가 없다(4-8행)** — 승인·거절·철회가 모두 행을 지운다. 승인은 `flow_approve_application`
  (`atomic_flows.sql:662-790`)이 회원·개인정보·등록 행으로 바꾸고 신청을 지운다(`:782`). 주석과 코드가 일치한다
  (pre-migration `QA-2` 철회의 근거가 바로 이 사실이었다)
- **`studentId: z.string().default("")`(16행)** — 15행 주석은 "필수 수집"이라 하지만 형식·필수 검증은 액션 계층에
  있다고 스스로 밝힌다. 기본값은 키가 없는 옛 행을 읽기 위한 것이고, SQL이 같은 기본값을
  `coalesce(v_app -> 'studentId', '""')`(`atomic_flows.sql:760`)로 채운다 — ATOMIC-FLOWS §3.1이 요구하는 미러다.
  기존 회원 갱신 경로(`:716`)는 `nullif(…, '')`로 빈 값이 기존 학번을 지우지 않게 막는다. 옳다
- **이메일 정규화가 저장 시점에 없다** — `hasApplication`(`resolve-member.ts:71-74`)과 SQL(`atomic_flows.sql:692`)이
  각자 소문자화한다. 같은 구조의 문제를 `private-info`에서 한 번만 지적한다 — `LA22-1`
- **`phone: z.string()` 형식 무검증** — 입력 스키마(도메인)가 맡는다. 저장 게이트가 형식까지 강제하면 이관된 옛 번호
  형식이 테이블을 막을 수 있다
- `z.infer` 별칭(21행) — 유지 관례

## 검증 (2026-09-28)

- 지적 없음 — 확인. `atomic_flows.sql:662`(흐름 시작)·`:692`·`:716`·`:760`·`:782`, `resolve-member.ts:71-74` 인용이 맞다
- 누락 점검: 21행 재독. 확인 항목 "이메일 정규화가 저장 시점에 없다"는 **이 테이블에 대해서는 사실이 아니다** — `submitApplication`이 `email: norm(input.email)`로 소문자화해 저장한다(`services/membership.ts:18,43`). 결론(지적 없음)은 바뀌지 않으며, 이 사실이 `LA22-1`의 표를 고친다(그쪽 검증 정정 참조). 추가 없음
