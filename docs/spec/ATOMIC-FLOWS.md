# Atomic multi-document flows — plpgsql + PGlite

> 결정 2026-09-27 (옵션 B): 여러 테이블 문서를 함께 바꾸는 흐름을 Postgres 함수(plpgsql) 한 트랜잭션으로
> 옮기고, 메모리 백엔드를 PGlite(인프로세스 Postgres)로 바꿔 **같은 SQL을 테스트·로컬에서도 실행**한다.
> 목적은 두 가지 — 원자성(부분 실패 제거)과 로직 일원화(같은 흐름의 구현을 한 곳에).
>
> **상태 (2026-09-27): 구현 완료.** 16개 쓰기 흐름과 백업 스냅숏(`flow_backup_snapshot`, 읽기 전용)이 `supabase/migrations/20260928000000_atomic_flows.sql`에 있고
> TS 쪽 중복 구현은 지워졌다(§7). 운영·dev 적용은 아직이다 — 순서는 [OPERATOR-TODO](../OPERATOR-TODO.md) §2-2.

## 1. 왜

저장 모델은 "테이블 하나 = `app_tables` 행 하나(JSONB 문서)"이고, 앱은 Supabase JS(PostgREST)로 문서를
하나씩 읽고 `version` 조건부로 쓴다(`tables.ts`의 `mutate`). PostgREST 요청 하나가 트랜잭션 하나이므로
**여러 문서를 바꾸는 흐름은 원자적이지 않았다.** 읽기와 결정, 쓰기가 여러 요청에 걸쳐 있어 그 사이에 다른
커밋이 끼어든다. 실측(`scripts/measure`)·감사·이번 이전 작업의 테스트가 재현한 것:

| 흐름                           | 끼어들 때                                           | 결과                                |
| ------------------------------ | --------------------------------------------------- | ----------------------------------- |
| 세미나 삭제 ↔ 게시·취소        | 삭제가 낡은 상태로 "숨김/공개"를 판정               | 고아 이벤트, 취소된 세미나 재공개   |
| 세미나 게시 ↔ 취소             | 게시가 이벤트를 만드는 사이 취소가 먼저 이벤트 정리 | 취소된 세미나에 살아 있는 출석 링크 |
| 이벤트 삭제 ↔ 체크인           | 대기 행 확인 후 체크인이 들어옴                     | 사라진 이벤트의 대기 행             |
| 출석 승인 ↔ 거절·삭제          | 두 액션이 활동과 큐를 따로 씀                       | 거절된 행인데 출석 인정이 남음      |
| 가입 승인 ↔ 반려               | 승인이 낡은 캐시로 회원 행부터 만듦                 | **반려된 신청자가 회원으로 남음**   |
| 세미나·스터디 신청 승인 ↔ 철회 | 기록을 만든 뒤에야 신청 상태를 확인                 | 철회된 신청의 세미나·스터디         |
| 스터디 회차 동시 생성          | 회차 번호를 캐시에서 계산                           | 같은 "N회차"가 둘                   |
| 탈퇴 신청                      | 상태 변경 커밋 후 감사 로그 삽입 실패               | 감사 기록 없는 탈퇴(파기 증거 누락) |

앱 쪽 재확인(WRITE_CONFLICT 거부)으로는 좁힐 수만 있었다. 함수는 필요한 행을 잠그고 한 트랜잭션에서
끝내므로 그 틈이 없다. 가입·신청 승인, 출석 결정, 체크인, 회차 번호, 기록 삭제는 새 테스트가
옛 코드에서 실패하는 것을 확인했다(커밋 메시지에 기록). 세미나 흐름은 옛 코드의 틈을 훅으로 벌리던
테스트를 두 커밋 순서 + 동시 실행 검사로 바꿨다.

## 2. 구조

```
route action ─▶ service (TS)                       ─▶ callFlow(fn, args) ─▶ store.rpc ─▶ Postgres function
               · 입력 검증 (domain zod)                · supabase: PostgREST .rpc(fn, { p })
               · id·시각 생성 (ULID, KST ISO)          · memory:   PGlite  select fn($1::jsonb)
               · 결과로 캐시 무효화, 메일·파일 정리 ◀── { touched, touchedQueues, ...result }
```

- **SQL 함수** `flow_<name>(p jsonb) returns jsonb`: 필요한 문서 행을 잠금(표는 이름순 `FOR UPDATE`, 그다음
  큐 — 교착 방지) → 규칙 검사 → 문서 수정·`version` 증가 → 감사 로그 삽입(필요한 흐름) → 결과 반환.
  규칙 위반은 `RAISE EXCEPTION 'CODE'`(`NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `VALIDATION_FAILED`,
  `EVENT_NOT_OPEN`)로 알리고 트랜잭션 전체가 롤백된다. 이유를 사용자 문구로 구분해야 하면
  `USING DETAIL = '<reason>'`을 붙인다(예: `session-slot-cancelled`).
- **읽기만 하는 문서는 `FOR SHARE`** — 체크인은 이벤트 문서를, 탈퇴 신청은 스터디 문서를 공유 잠금으로 읽는다.
  같은 문서를 읽는 흐름끼리는 서로 기다리지 않고, 그 문서를 바꾸는 흐름만 기다린다.
- **TS** (`src/lib/server/data/flows.ts`의 `callFlow`): 오류 코드를 `AppError`로 변환(`messages`로 DETAIL →
  `userMessage`), `touched`/`touchedQueues`의 캐시 무효화. 호출하는 서비스는 입력 검증, id·시각 생성
  (SQL이 id를 만들지 않아 TS와 형식이 같다), 그리고 **트랜잭션 밖 부수효과**(메일, Storage 파일 정리)를 맡는다.
  메일은 트랜잭션 안에서 보내지 않는다 — 공지는 트랜잭션이 `announcedAt`을 선점하고, 커밋 뒤 이긴 쪽만 보낸다.
- **감사 로그를 같은 트랜잭션에**: 파기 증거인 `withdrawal.*` 항목은 `app_audit`로 흐름 안에서 삽입한다.
  나머지 감사(`member.set-*` 등)는 설계상 best-effort라 TS의 `audit()`에 둔다.
- **단일 문서 흐름**은 `mutate`(CAS)로 둔다 — 이미 원자적이다(§7 "옮기지 않은 것").
- **공용 SQL 헬퍼**: `app_rows`, `app_lock`, `app_put`, `app_find`, `app_without`, `app_replace`,
  큐용 `app_queue_lock/rows/put/delete`, `app_nullable`, `app_audit`, `app_require`.
- **인자 검사**: 모든 흐름이 첫 줄에서 `app_require(p, [...])`로 필수 인자를 확인한다(없음·null·빈 문자열 →
  `VALIDATION_FAILED`). 가드는 값을 비교하는데 NULL과의 비교는 참이 되지 않아, 인자가 빠지면 가장 파괴적인
  분기로 빠졌다(감사 LA43-2).
- **TS 규칙의 SQL 미러**와 고정 방식 (감사 LA43-4가 이 목록의 과장을 지적해 바로잡음):

  | SQL                       | TS 원본                           | 고정                                        |
  | ------------------------- | --------------------------------- | ------------------------------------------- |
  | `app_term_of`             | `$lib/domain/term` `termOf`       | 경계값에서 TS와 대조 (`flow-rules.test.ts`) |
  | `app_event_open`          | `events.ts` `effectiveStatus`     | 경계값에서 TS와 대조 (`flow-rules.test.ts`) |
  | `app_seminar_started`     | `seminars.ts` `seminarHasStarted` | TS와 대조 (`flow-contracts.test.ts`)        |
  | `app_may_derive_semester` | (TS 쪽 사본 없음 — SQL만 씀)      | 고정 값표 (`flow-rules.test.ts`)            |
  | `app_seminar_status`      | (이주 규칙 — 스키마 기본값 제거)  | 고정 값표 (`flow-contracts.test.ts`)        |
  | `app_is_seminar_event`    | (TS에 단일 함수 없음)             | 고정 값표 (`flow-contracts.test.ts`)        |

## 3. 검증(zod)과 SQL 사이

SQL이 쓴 행은 TS의 쓰기 게이트(zod)를 거치지 않는다. 대신:

1. 함수는 행을 **명시적 필드로** 만든다(스키마의 기본값도 SQL에서 채운다).
2. 흐름 테스트는 매 케이스 뒤 `expectTablesValid()`(`src/lib/server/data/expect-tables-valid.ts`)로 **저장된
   문서 전체를 엄격하게 다시 디코드**한다 — 모르는 키 거부(`.strict()`), 그리고 **기본값에 기댄 행 거부**
   (파싱 결과의 키가 저장된 행에 없으면 실패). 스키마와 SQL이 어긋나면 테스트가 깨진다.
3. 입력 값은 호출 전에 TS가 도메인 스키마로 검증하고, **흐름이 그대로 저장할 값은 저장 스키마의 규칙으로 한 번
   더** 확인한다(`updateSeminarSchedule`의 `SeminarScheduleSchema`, 회차 날짜의 `isKstInstant`). 흐름이 쓴 행은
   커밋 뒤에야 파싱되므로, 스키마가 거부할 값이 들어가면 그 표 전체가 읽히지 않게 된다 — 감사 🔴
   LA26-2·LA09-5가 재현한 경로다.

## 4. 백엔드

| `DATA_BACKEND`              | 저장소                              | 함수 호출                       |
| --------------------------- | ----------------------------------- | ------------------------------- |
| `supabase` (운영·dev)       | Supabase Postgres, PostgREST        | `supabase.rpc(fn, { p: args })` |
| `memory` (테스트·로컬·실측) | PGlite, 같은 마이그레이션 파일 적용 | `select fn($1::jsonb)`          |

PGlite에는 Supabase의 `storage` 스키마가 없어서, 마이그레이션 전에 `storage.buckets` 대역 테이블만 만든다
(`pglite-bootstrap.ts`). 테스트는 실행당 한 번 만든 스냅숏을 파일마다 불러온다(`pglite-snapshot.setup.ts`).
테스트 제어(`__reset`, `__putRawDoc`, `__docs`, `__sql`, 장애 주입)는 `store-memory.ts`에 있다.
두 백엔드 모두 RAISE의 DETAIL을 오류 객체의 `detail`로 넘긴다.

## 5. 보안

함수는 `public` 스키마에 두되 `SECURITY INVOKER`, `search_path` 고정, **`PUBLIC`·`anon`·`authenticated`의
실행 권한을 회수**하고 `service_role`에만 부여한다(마이그레이션 §99, 반드시 마지막). 테이블 RLS(deny-all)는
그대로이므로 공개 키로 호출해도 어떤 행도 읽거나 쓸 수 없다. 부트스트랩 관리자 명단은 이메일이 아니라
**sha256 해시**로 넘긴다(`bootstrapAdminEmailHashes`) — 주소가 RPC 인자·구문 로그에 남지 않는다.

## 6. 마이그레이션·배포

| 파일                                            | 내용                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `20260901000000_documents.sql` (기존)           | 표·큐·감사 로그. 수정하지 않는다                                                 |
| `20260928000000_atomic_flows.sql`               | 헬퍼 + 흐름 17개(쓰기 16 + 백업 스냅숏) + 권한. 확장만 — 옛 코드는 부르지 않는다 |
| `20260928000100_seminar_publication_status.sql` | `publicationStatus`가 없는 세미나 행에 `"published"`를 명시                      |

- 순서는 **마이그레이션 둘 적용 → 코드 배포**. 새 코드는 흐름 함수를 부르고, `SeminarSchema`에서
  `publicationStatus` 기본값을 뺐으므로 보정 전 행이 있으면 세미나 표 읽기가 실패한다.
- 두 파일 모두 재실행 안전하다(`create or replace`, 보정은 문자열 값이 없는 행이 있을 때만 쓴다).
- 되돌리기: 코드만 되돌리면 된다(옛 코드는 함수를 부르지 않고, 명시된 `publicationStatus`는 옛 기본값과 같다).
- 축소(contract) 단계(예: `studies.schedule` 필드 제거)는 새 코드 배포 뒤 별도 마이그레이션으로.

## 7. 구현 현황

| 흐름                     | 함수                               | TS 호출부 (`src/lib/server/services/`)               |
| ------------------------ | ---------------------------------- | ---------------------------------------------------- |
| 세미나 기록 삭제         | `flow_delete_seminar`              | `records-admin.deleteSeminar`                        |
| 세미나 게시              | `flow_publish_seminar`             | `seminars.publishSeminar` (+ 커밋 뒤 공지)           |
| 세미나 일정 변경         | `flow_update_seminar_schedule`     | `seminars.updateSeminarSchedule`                     |
| 세미나 취소              | `flow_cancel_seminar`              | `seminars.cancelSeminar`                             |
| 체크인                   | `flow_check_in`                    | `events.checkIn`                                     |
| 출석 승인·거절·삭제      | `flow_decide_attendance`           | `events.approve/reject/deleteAttendance…`            |
| 이벤트 삭제              | `flow_delete_event`                | `events.deleteEventChecked`                          |
| 가입 승인                | `flow_approve_application`         | `membership.approveApplication`                      |
| 세미나 신청 승인         | `flow_approve_seminar_request`     | `seminar-requests.approveSeminar`                    |
| 스터디 신청 승인         | `flow_approve_study_request`       | `studies.approveStudy`                               |
| 스터디 회차 생성·정정    | `flow_create/update_study_session` | `studies.createStudySession`, `updateSession`        |
| 탈퇴 신청                | `flow_request_withdrawal`          | `withdrawal.requestWithdrawal`                       |
| 탈퇴 취소·보류·보류 해제 | `flow_member_withdrawal`           | `withdrawal.cancelWithdrawal`, `members-admin.*Hold` |
| 활동·스터디 기록 삭제    | `flow_delete_activity/study`       | `records-admin.deleteActivity`, `deleteStudy`        |

이전으로 사라진 TS: `ensureCreated`(`data/idempotency.ts`), `deleteQueue`/`deleteQueueDoc`,
`retireHiddenActivity`, 공개 도중 취소를 사후 수습하던 `cancelledDuringPublish` 경로.

**옮기지 않은 것** (단일 문서 CAS라 이미 원자적): `scheduleSeminar`, 이벤트 참여 신청·취소,
`setEventStatus`, 각종 반려·철회, `cancelSession`, 회원 관리 설정자(감사는 best-effort).

**알려진 한계** (의도적으로 남김):

- 활동을 가리키는 `activityId`는 세 곳에서 쓰이는데 존재 확인이 고르지 않다. `/admin/events/connect`는
  캐시로 한 번 확인한다(그래도 `flow_delete_activity`의 잠금 밖이다). **갤러리 기록 편집기와
  `records-admin`의 세미나 갱신은 아예 확인하지 않는다** — 동시 조작 없이도 없는 활동을 가리킬 수 있다
  (감사 LB28-6; 초판은 이것을 "동시 조작에서만"이라고 잘못 적었다). 읽는 쪽은 없는 활동을 `NOT_FOUND`로
  다룬다. 남은 과제로 둔다.
- `createEventWithActivity`는 활동과 이벤트를 두 번에 쓴다 — 중간 실패는 이벤트 없는 활동을 남길 뿐이다.
- `tables.ts`의 버전 캐시는 인스턴스 로컬이다. 흐름이 지운 큐 문서가 다른 인스턴스에서 버전 1로
  다시 만들어지면 낡은 캐시와 버전 번호가 겹칠 수 있다(이벤트 id가 유일하므로 이론상의 경우).
