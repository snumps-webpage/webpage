# 코드 검토 결함 수정 계획

목표: `.tmp/code-review-20261104/findings.json`에 기록한 26건을 기존 기능 정책을 유지하며 수정한다.
기준: main c17e769. SvelteKit/Svelte, TypeScript, Supabase document CAS/SQL flows, Vitest/PGlite.

## 제약과 검증

- 운영 DB 쓰기·mail 발송·cron 호출·배포·push 없이 로컬 코드와 격리 synthetic 환경에서 검증한다.
- main 단일화 요청을 유지한다. 과거 migration을 수정하지 않고 새 SQL migration으로 보완한다.
- 각 동작 변경은 실제 대상을 실행하는 회귀 시험의 RED를 확인하고 최소 수정으로 GREEN을 만든다.
- 외부 서비스는 I/O 경계에서 대체한다. DOM 시험에 더해 격리 서버의 실제 브라우저를 확인한다.
- 서로 겹치는 파일은 한 묶음이 소유한다. 묶음별 검토와 별도의 최종 통합 검토 후 완료한다.
- dependency 수정은 발견된 parser/sanitizer의 보안 patch로 제한한다. 새 라이브러리는 추가하지 않는다.

## Task 1 / 묶음 UI: 화면 상태·설명 정합성

대상: FE-01~07. 파일: signup/edit page, admin event/attendance components+admin page, seminar request/poster components, presenter events/manage page, admin/seminars page server/editor, gallery page. 회귀: 실제 enhance 취소가 POST를 막음, 저장 후 최신 행 유지, 검증 실패 후 poster 유지, 업로드 완료 전 제출 차단, 설명 공개 반영, A 응답이 B 회차 상태를 바꾸지 않음. 갤러리 문구는 실제 최적화/원본 동작에 맞춘다.
의존: Task 2의 seminar description patch 지원. 크기: 관련 화면별 S/M slice. 검토: 원래 6개 UI 결함 재현의 반대 assertion 및 독립 UI 검토.

## Task 2 / 묶음 DATA: 저장 시점 불변식

대상: DATA-01~03 + FE-05 저장 계약. 파일: events.ts, records-admin.ts, 새 `supabase/migrations/20261104000000_audit_integrity.sql`, 관련 tests. 승인 트랜잭션에서 탈퇴 주최자를 거절하고, 활동 읽기와 이벤트 생성을 같은 잠금에 둔다. 연결 가능한 유형은 SQL 잠금 안에서 검사한다. 기존 description을 명시적으로 갱신 가능하게 한다.
의존: 없음. 크기: 불변식별 M slice. 검토: 실제 SQL/PGlite와 결정적 경합 회귀, 기존 flow 권한·touched 계약 유지.

## Task 3 / 묶음 OPS: 이주·백업·운영 검증

대상: MIG-01, OPS-01~~02, SEC-OPS-01, OPS-DATA-01~~03, OPS-FE-01~04. 파일: migration/20-export-tables.ts, ops release/backup/Notion backfill/setup/clean-names/RLS/Preview env/smoke/migration-audit scripts. 검사·쓰기는 같은 legacy 매핑을 사용한다. 수동 백업은 기존 flow_backup_snapshot을 쓴다. release는 main에서 안전 검사 후 실행한다. 실패/unknown을 성공·부재로 처리하지 않는다. 날짜를 이주와 같은 KST 규칙으로 정규화하고 pagination을 끝까지 처리한다. smoke는 현재 route 범위를 명시하고 새 동적 경로를 포함한다.
의존: Task 2 추가 migration/flow 수를 release 검사에 통합. 크기: 실제 작업 경로별 S/M slice. 검토: fake CLI/DB/HTTP로 actual script exit/부작용 시험, remote 명령은 실제 실행 금지.

## Task 4 / 묶음 CORE: 파일 승격·캐시·달력·메일 dependency

대상: SEC-01, PERF-01, SEC-DOMAIN-01, SEC-MAIL-01~02. 파일: seminar-requests/uploads/storage, cache, domain/members, package manifest/lock, 관련 tests. 권한·상태 확인 전 파일을 이동하지 않고 DB 실패 시 업로드 재시도 가능하게 한다. 캐시의 진행 중 동일 키 읽기를 공유하되 invalidation 이전 값은 재사용하지 않는다. 달력에 없는 날짜를 거절한다. 발견된 postal-mime/sanitize-html 결함은 공식 patch와 실제 payload로 검증한다.
의존: 없음. 크기: 독립 동작별 S/M slice. 검토: store 실패와 취소/권한 경계, 캐시 invalidation 경합, 윤년 날짜, 악성 EML/HTML 회귀.

## Checkpoint / 통합

- 각 묶음 targeted 회귀와 독립 검토 완료 후 전체 Vitest(maxWorkers=2), svelte-check, ESLint, Prettier, production build.
- 추가 migration은 격리 PGlite에서 전체 migration 순서·grants·flow touched 계약 검사. 운영 적용은 하지 않는다.
- 격리 memory 서버에서 취소/출석 회차 전환/포스터 상태/세미나 설명의 실제 브라우저 확인.
- 26개 ID 전부 수정·검증 결과를 `.tmp/code-fixes-20261104/status.json`으로 대조. 미해결/실환경 미검증을 명시.
