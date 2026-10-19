# 재가입 회원 id 통합 설계 검토

- 상태: 검토용 초안 — 결정 전 (snumps-webpage/D-000096)
- 범위: 재가입한 사람이 id 두 개(옛 legacy id + 새 운영 id)를 갖는 구조(S9)를 유지할지, 하나로 모을지
- 근거: 코드 조사(2026-10-16, 읽기 전용, HEAD 83bed62), prod 개수 조회(2026-10-16, 이름 없이 개수만), 백업 `backups/supabase-2026-10-14T05-39-32.json` 개수

## 1. 현재 구조 (S9, `docs/spec/SUPABASE-MIGRATION-SPEC.md:15`)

- 노션 이주 회원은 `legacy-members`·`legacy-private-info`(읽기 전용 보관)로 분리.
- 운영 `members`는 재가입 승인으로만 채워짐. 재가입자는 **새 ULID**를 받고 `legacyMemberId`로 옛 행을 가리킴.
- 과거 기록(출석·발표·주최)은 옛 id 그대로. 이름 표시는 통합 디렉터리(`src/lib/server/data/directory.ts`)가 두 id를 한 사람으로 해석.
- 연결은 승인 시 **이메일 일치 한 번**(`flow_approve_application`, `atomic_flows.sql:1016-1041`). 고유성 검사·관리자 연결/해제 경로 없음.

### 1-1. 규모 (prod 2026-10-16)

| 항목                             | 값                                                                        |
| -------------------------------- | ------------------------------------------------------------------------- |
| 운영 회원                        | 83명, 그중 재가입(legacyMemberId 있음) 60명                               |
| legacy 행                        | 232명 → 재가입 안 한 사람 172명                                           |
| 재가입자의 옛 id를 가리키는 기록 | 244건 (출석 227 · 발표 12 · 주최 5)                                       |
| 재가입자의 옛 id로 주최된 스터디 | 5건, 그중 진행 중 2건 (백업 기준)                                         |
| audit_log                        | 93행(백업 기준), 옛 id를 actor로 가진 행 1건. **트리거로 수정·삭제 불가** |

### 1-2. 지금 구조의 비용

- "두 id 중 하나면 그 사람" 규칙이 TS·SQL 약 15곳에 복제됨. 일부 판정은 새 id만 봄(불일치, 감사 LB02-6):
  - `studies.ts` join/leave/accept/remove(`leaveStudy`의 주최자 판정 포함)
  - 회원 스터디 화면(`(member)/study/*`)
  - 대시보드 일부(`(public)/+page.server.ts:81, 386-389, 404`)
  - `events.ts:47` `presentsEvent`
  - `flow_cancel_seminar`(676), `flow_save_presenter_attendance`(882)
  - `seminar-requests.ts:82,111`
- 관리자 편집기는 저장된 옛 id를 그대로 다시 씀(`recorded-people.ts`) → 재가입 뒤에도 옛 id 기록이 계속 생김.
- 개인정보가 두 곳(`private-info` + `legacy-private-info`). 탈퇴 익명화는 미구현이고 정책 미결(`FRONTEND-DECISIONS.md` §6-7(c)).
- 재가입 시 옛 행의 `isAlumni`·`alumniRevoked`를 물려받지 않음(`atomic_flows.sql:1013-1035`) → 동문이 재가입하면 `associate`·`isAlumni:false`로 시작. 계산 지위는 옛 id 기록을 세므로 화면은 맞게 나오지만 저장값과 어긋남.

## 2. 선택지

### A. 두 id 유지 + 규칙 한곳으로

- 할 일:
  - 사람 id 집합 헬퍼 하나(`personIdsOf`)로 위 불일치 지점을 모두 교체(TS 약 8곳, SQL flow 2곳)
  - 편집기는 재가입자를 새로 넣을 때 새 id를 쓰고, 기존 옛 id는 보존(현행 유지)
  - 재가입 승인 시 옛 행의 동문 상태(`isAlumni`·`alumniRevoked`)를 물려받기
- 데이터 이동: 없음.
- 장점: 위험 가장 낮음. 되돌리기 쉬움. 백업·id-map·audit와 충돌 없음.
- 단점: 두 id 개념은 그대로라 새 코드마다 헬퍼를 써야 함(실수 여지). 개인정보 이중 보관 그대로.
- 규모(추정, 근거: 조사한 지점 수): 파일 약 12개 + flow 2개 + 테스트. 마이그레이션은 flow 재정의만.

### B. 재가입 때 기록의 옛 id를 새 id로 바꿈 + 기존 60명 일괄 이전

- 할 일:
  - `flow_approve_application`이 연결을 만들 때 같은 트랜잭션에서 기록의 옛 id → 새 id로 교체
    - 대상: activities.attendeeIds, seminars.presenterIds, seminar-requests.presenterIds/requesterId, studies.organizerIds/participantIds/pendingParticipantIds/transferHistory, events.applicantIds/presenterIds, executive-profiles.memberId
    - 테이블 7개 잠금
  - 기존 60명·244건은 일회 마이그레이션(멱등, 전후 개수 검사)
  - `legacyMemberId`는 남김: 옛 URL 301, legacy 행의 이력(roles 등) 참조용
- 남는 것:
  - 재가입 안 한 172명은 여전히 legacy id(통합 디렉터리는 계속 필요)
  - audit_log의 옛 id는 바꿀 수 없음(1건)
- 장점: 재가입자의 기록이 한 id로 모여 "두 id" 판정이 재가입자에겐 불필요해짐(legacy-only 사람 표시는 그대로).
- 단점·위험:
  - 이메일 오연결이면 남의 기록이 합쳐지고 되돌리기 어려움 — 교체 내역을 별도 표로 남겨야 되돌릴 수 있음
  - 마이그레이션 전 백업은 옛 배치라 복원 시 다시 이전 필요
  - 앞으로 탈퇴 익명화를 한다면 합쳐진 기록 전체가 그 한 id로 지워지거나 남게 됨(정책 미결과 맞물림)
- 규모: flow 1개 대폭 수정 + 마이그레이션 1개 + ops 검사 + 테스트(두 id 행동을 쓰는 테스트 약 24개 중 상당수 수정).

### C. 재가입자의 운영 행이 옛 id를 그대로 씀

- 할 일:
  - 승인 시 새 ULID 대신 legacy id로 운영 행 생성
  - 기존 60명은 반대 방향 이전(새 id → 옛 id): registrations, private-info, events, queues, executive-profiles, holdBy·updatedBy, studies
  - 통합 디렉터리의 중복 제거 규칙 변경(두 표에 같은 id)
- 남는 것: audit_log에서 이 60명의 새 id를 가리키는 행(전체 93행 중 몇 행인지는 미확인)은 바꿀 수 없어, 과거 감사 기록이 더 이상 없는 id를 가리킴.
- 장점: 사람당 id 하나, 옛 URL 그대로.
- 단점·위험:
  - 이전 범위가 가장 넓고 audit와 정면 충돌
  - 운영 id에 ULID·비ULID가 섞임(`core/id.ts` 주석과 어긋남)
  - 오연결이면 해제할 층이 없음
  - 옛 설계 메모 `API-SPEC.md:547`("익명화 뒤 재가입은 새 회원, 과거와 연결 안 함")과 충돌
- 규모: 셋 중 가장 큼.

## 3. 비교

| 기준                   | A 유지+정리                     | B 기록 이전                | C 옛 id 재사용                                |
| ---------------------- | ------------------------------- | -------------------------- | --------------------------------------------- |
| 데이터 이동            | 없음                            | 244건 + 앞으로 재가입마다  | 60명 전 운영 데이터                           |
| audit_log 충돌         | 없음                            | 1건 옛 id 남음             | 새 id 행들이 사라진 id를 가리킴(행 수 미확인) |
| 되돌리기               | 쉬움                            | 교체 내역 표가 있으면 가능 | 어려움                                        |
| 오연결 영향            | 표시만 합쳐짐(연결 해제로 복구) | 기록이 합쳐짐              | 이력 전체 상속                                |
| "두 id" 규칙 남는 범위 | 전부(헬퍼로 일원화)             | legacy-only 172명 표시만   | 거의 없음                                     |
| 익명화 정책과의 관계   | 독립                            | 맞물림                     | 맞물림                                        |

## 4. 결정이 필요한 것

1. 방향: A / B / C
2. (공통) 재가입 승인 시 옛 행의 동문 상태(`isAlumni`·`alumniRevoked`) 상속 여부 — 지금은 상속 안 함(1-2 마지막 항목)
3. (공통) 관리자 연결·해제 경로가 필요한지(오연결 정정, 다른 이메일로 재가입한 사람 연결)
4. (B·C) 탈퇴 익명화 정책(FRONTEND-DECISIONS §6-7(c))을 먼저 정할지
5. (B) 교체 내역 보관 방식(되돌리기용 표)
