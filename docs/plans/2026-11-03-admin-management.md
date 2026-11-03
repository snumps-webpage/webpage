# 관리자 스터디·세미나 관리 구현 계획

목표: 주최자·발표자가 아닌 관리자도 참가자·회차·출석을 관리하고, 회차 없는 스터디를 활동기록에서 찾는다.
Spec: [설계](../specs/2026-11-03-admin-study-seminar-management-design.md)

## 실행 계약

사용자의 구현 지시에 따라 기존 구조와 화면 관례로 세부를 구체화한다. 일반 주최자·발표자 권한을 확대하지 않는다. 기존 취소 회차 재활성화 금지는 유지한다. 세미나 상위는 제목·소개를 소유하고 기존 seminars는 회차를 소유한다. 새 세미나 회차 생성은 관리자에게 제공한다. 기존 개설 신청 경로에서 생기는 단독 세미나도 상위 항목에 연결한다.

화면은 `/admin/studies/[id]`, `/admin/seminar-series/[id]`로 추가한다. 기존 `/admin/seminars`의 회차 편집·일정·공개 기능은 보존하고 새 상위 관리에서 연결한다. 참가자·출석 편집은 실제 관리자 이름으로 기록하며 주최자 대리 실행을 하지 않는다.

## Task 1: 관리자 스터디 관리 (검토 묶음 A)

- 생성: `src/lib/server/services/studies-admin.ts` 및 테스트, `src/routes/(admin)/admin/studies/[id]/+page.server.ts`, `+page.svelte` 및 action 테스트, `supabase/migrations/20261103000000_admin_study_sessions.sql`.
- 수정: 기존 `AdminStudyRecordEditor.svelte`의 관리 진입 링크.
- 계약: admin service는 명시적인 관리자 actor id를 받고 서버에서 권한을 재확인한다. 종료 스터디 회차 변경은 관리자 전용 DB flow로 처리한다. 회차 제목·날짜·출석 연결 일치, 취소·없는 대상 및 타 스터디 이벤트 거절.
- RED: 비주최 관리자 접근·종료 스터디 생성/수정/취소·비관리자 거절·다른 스터디 이벤트 거절 테스트 실패 확인.
- GREEN: 관리자 route와 서비스·SQL 구현, 참가자 직접 편집 및 회차 출석 관리.
- 완료: 관련 PGlite·action 테스트 통과 및 명부 선택 UI 확인.

## Task 2: 세미나 상위 묶음과 관리자 관리 (검토 묶음 B)

- 생성: `src/lib/server/data/schemas/seminar-series.ts`, `src/lib/server/services/seminar-series.ts` 및 테스트, `src/routes/(admin)/admin/seminar-series/` 목록·`[id]` 상세 및 테스트, `supabase/migrations/20261103000100_seminar_series.sql`.
- 수정: seminar schema·TABLES registry, 기존 세미나 관리자에 상위 관리 진입 링크.
- 계약: 기존 seminars 행·ID·링크 유지, `seriesId` 및 `sessionNo` 추가. 상위 제목·소개 외 운영 필드는 회차 소유. 신규 standalone 세미나도 상위로 연결되는 읽기/생성 경로. 동시 생성과 전환 재실행 중복 방지. 기존 신청·출석·공지·실적은 기존 회차 ID로 유지.
- RED: 기존 자료/연결 보존·전환 멱등·회차별 독립성·비관리자 거절 테스트 실패 확인.
- GREEN: 상위 생성·수정·회차 추가, 회차별 기존 일정/공개 관리 진입과 관리자 출석 편집.
- 완료: 기존 세미나 생성·출석·공개 테스트와 새 PGlite/service/action 테스트 통과.

## Task 3: 관리자 활동기록 스터디 묶음 (검토 묶음 C)

- 생성: 활동기록 조회용 순수 grouping 모듈과 테스트.
- 수정: `src/routes/(admin)/admin/activities/+page.server.ts`, `+page.svelte` 및 render/load 테스트.
- 계약: 모든 스터디 상위 표시, 참가자·회차 수 및 관리 링크, 접기/펼치기. 회차 아닌 이주 연결 활동은 그 사실을 구분. 연결 안 된 활동은 기존 목록 유지. 데이터 추가 없이 조회 모델만 구성. 검색 시 상위명·회차명으로 찾기.
- RED: 회차 0 스터디 노출·다른 스터디 회차 미포함·취소 포함 표시·중복 없음·표시만으로 DB 쓰기 없음 테스트 실패 확인.
- GREEN: 기존 활동 카드 편집 기능을 유지하며 묶음 UI 적용.
- 완료: 관련 route/component/domain 테스트 통과.

## Checkpoint와 검토

각 task는 독립 파일 범위로 실행한다. 서비스 계약 변경은 메인에 공유하고 종속 작업을 순차 조정한다. 각 묶음 완료 후 독립 검토, 모든 묶음 후 통합 검토를 수행한다. task 구현자는 git 변경 없이 파일·테스트 증거를 보고한다. 메인이 diff와 검증 결과를 직접 확인한다.

## Task 4: 통합·릴리스 준비 (검토 묶음 D)

- 수정: `scripts/ops/release-prod.sh`, 필요 시 운영 문서의 migration·권한·flow·백필 검사 목록.
- 검증: 전체 Vitest, Svelte check, lint, build, migration 적용·재실행 검사, 운영 변경 없는 release dry-run, 로컬 실제 브라우저 관리자/일반 사용자 동선.
- 기존 운영 스키마와 새 스키마를 사용하는 배포 사이의 전환 및 재실행을 검사한다. 상위 metadata를 옛 writer가 제거하지 않도록 새 필드 백필을 재실행 가능하게 둔다.
- 완료 후 preview를 준비하고 사용자에게 기존 로그인·세미나 흐름·회원 명단·스터디/세미나 관리·활동기록 묶음을 대기형 질문으로 확인받는다.
- 확인 완료 뒤 백업→운영 빌드→migration→도메인 승격→main 동기화→확인 쿼리·공개 스모크·실로그인 확인을 기존 배포 절차에 따라 실행한다.

## 위험과 경계

운영 데이터 변경·메일 발송은 사용자 확인 전 실행하지 않는다. 실제 데이터 병합·승급·승인 일시 보정은 별도 기존 승인 절차를 유지한다. 기존 ID와 출석·자료 연결 보존, 일반 사용자 권한 유지, 관리자 실제 actor 감사 기록이 검토의 우선 항목이다.
