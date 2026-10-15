# 스터디 기록 편집 + 멤버별 활동 정도 구현 계획

**목표:** 스터디 주최자·참가자 기록을 관리자가 고칠 수 있게 하고, 노션 회원 DB처럼 멤버별 활동 정도(주최·참석·활동회원 여부·임원 이력)를 공개 명단과 관리자 화면에서 보이게 함.
**구조:** 활동에 스터디 연결(`activity.studyId`)을 더해 스터디↔출석 관계를 복원(노션 relation 보강 포함) → 그 위에 스터디 참가자 편집기·주최자 규칙 → 순수 집계 함수 하나로 공개 명단·관리자 화면이 같은 활동 정도를 그림.
**기술 스택:** SvelteKit 2 / Svelte 5 / TS(checkJs), zod, Supabase JSONB 문서 저장소 + plpgsql `flow_*`, vitest + PGlite, `scripts/measure` 실측 하네스.
**Spec:** 결정 로그 snumps-webpage/D-000041~~046, D-000049~~057 (`show.py snumps-webpage <번호>`).

## 전역 제약

- 저장 행은 schema 기본값에 기대지 않음(`expect-tables-valid.ts`): 새 필드는 migration backfill + 모든 writer(SQL flow·TS)가 직접 씀.
- 운영 로직(로그인·참여·권한)은 legacy를 읽지 않음, 표시·기록 정정만 통합 디렉터리(`getMemberDirectory`/`getDirectoryIndex`) 사용(`data/directory.ts` 원칙).
- 공개 집계는 숨김 활동 제외(`withoutHiddenActivities`), 탈퇴 회원은 공개 명단에서 제외(기존 `getPublicMembers`).
- 활동회원 규칙(D-000042): 세미나·스터디 활동 중 `일정 끝(없으면 시작)`이 지금으로부터 183일 이내(미래 포함) 1건 이상 → 활동회원. 노션 공식 `dateBetween(now(), dateEnd(일정), "days") <= 183`과 같음.
- 재가입 회원은 새 id + `legacyMemberId` 두 id의 기록을 합쳐 한 사람으로 셈.
- 출석·발표자 편집기 선택지 규칙(D-000049)은 그대로. 스터디 참가자 편집기만 옛 회원 추가 허용(D-000043).
- prod 쓰기는 ops 스크립트로, 스터디별 질문·확인 후(D-000045).
- 커밋 메시지 `<type>: <요약>` 영어, attribution 줄 없음, 홈 경로 금지(git 규칙).

## 위험

| 위험                                                                    | 영향 | 완화                                                                                                                   |
| ----------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| 새 필드가 기존 테스트 fixture(활동 행 10개 파일)와 PGlite 검사를 깨뜨림 | 중   | Task 1에서 fixture 일괄 갱신, `expect-tables-valid` 테스트로 확인                                                      |
| SQL flow가 `studyId`를 빠뜨려 기본값 의존 행 생성                       | 상   | Task 1 PGlite 테스트가 두 생성 flow의 결과 행에 `studyId` 키 존재를 검사, release check 쿼리에 `act_no_study_key` 추가 |
| 공개 명단 payload 증가(약 310명 × 출석 505건)                           | 하   | 활동은 id·제목·날짜·종류만, 측정 서버에서 응답 크기 기록                                                               |
| 공개 범위 확대(출석 이력·활동 여부)                                     | 중   | 사용자 결정(D-000041·046), 명단 안내 문구 갱신                                                                         |
| 노션 relation 짝짓기 실패                                               | 하   | 사전 측정: 스터디 17건 모두 relation 1개, 앱 활동과 제목+시작일로 17/17 유일 일치(2026-10-14 읽기 전용 조회)           |

## 해소된 질문

| 질문                    | 답                                                                | 결정     |
| ----------------------- | ----------------------------------------------------------------- | -------- |
| 연결 저장 위치          | `activity.studyId`                                                | D-000050 |
| 공개 명단 표현          | 회원별 공개 페이지 `/members/[id]`, 명단 표는 이름·활동·주최·임원 | D-000051 |
| `/members` 기본 보기    | '활동 회원'                                                       | D-000052 |
| 스터디 연결 지정 대상   | 종류 '스터디' 활동만                                              | D-000053 |
| 종료 스터디 주최자 후보 | 통합 명부 전원(탈퇴자 포함)                                       | D-000054 |
| 참가자 편집기 후보      | 통합 명부 전원(탈퇴자 포함)                                       | D-000057 |
| 실행 방식               | task별 subagent + 메인 세션 검토                                  | D-000055 |

---

## 파일 구조

| 파일                                                                                                                | 책임                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20261015000000_activity_study_link.sql` (생성)                                                 | `studyId` backfill, 두 생성 flow 재정의, `flow_set_activity_study`                                     |
| `src/lib/server/data/schemas/activity.ts` (수정)                                                                    | `studyId: Id.nullable()`                                                                               |
| `src/lib/server/services/records-admin.ts` (수정)                                                                   | `createActivity`·`updateActivity`의 `studyId`, `setStudyParticipants`, `setOrganizer` 종료 스터디 규칙 |
| `src/lib/server/services/events.ts:74-85` (수정)                                                                    | 활동 생성 시 `studyId: null`                                                                           |
| `scripts/ops/lib-notion-study-links.mjs` (생성)                                                                     | 노션 relation ↔ 앱 활동 짝짓기, SQL 생성(순수)                                                         |
| `scripts/ops/ops-notion-backfill-study-links.mjs` (생성)                                                            | 스터디별 확인 CLI                                                                                      |
| `src/lib/domain/member-activity.ts` (생성)                                                                          | 순수 집계: 주최·참석·종류별 횟수·활동회원 여부                                                         |
| `src/lib/server/public/member-activity.ts` (생성)                                                                   | 디렉터리 신원 합치기 + 공개/관리자 집계 로드                                                           |
| `src/routes/(public)/members/*` (수정)                                                                              | 활동/전체 보기, 주최·임원 칸, 참석 목록                                                                |
| `src/routes/(admin)/admin/members/*` (수정)                                                                         | 목록에 활동 여부·필터, 상세에 활동 정도                                                                |
| `src/routes/(admin)/admin/activities/*` (수정)                                                                      | 활동에 스터디 지정                                                                                     |
| `src/routes/(admin)/admin/studies/+page.server.ts`, `src/lib/components/admin/AdminStudyRecordEditor.svelte` (수정) | 참가자 편집기·출석자에서 채우기, 종료 스터디 주최자 선택지                                             |
| `scripts/ops/release-prod.sh`, `scripts/ops/README.md` (수정)                                                       | 마이그레이션 목록·check 쿼리, 새 ops 스크립트 행                                                       |

의존: Task 1 → (2, 3, 4) ; Task 4 → 5 ; Task 6 → (7, 8). Task 5와 6~8은 서로 독립.

---

### Task 1: 활동↔스터디 연결 필드 (risk-first)

**파일:**

- 생성: `supabase/migrations/20261015000000_activity_study_link.sql`
- 수정: `src/lib/server/data/schemas/activity.ts`, `src/lib/server/services/records-admin.ts:27-36`, `src/lib/server/services/events.ts:74-85`, `scripts/ops/release-prod.sh`(`EXPECTED_MIGRATIONS`, `BACKFILLS`, check 쿼리 `act_no_study_key`, `want`), 활동 fixture가 있는 테스트 10개(`grep -rln "attendeeIds:" src --include=*.test.ts`)
- 테스트: `src/lib/server/data/activity-study-link.test.ts`(생성, PGlite)

**Interfaces:**

- 제공: `Activity.studyId: string | null`; SQL `flow_set_activity_study(p {activityId, studyId|null}) → {touched}` — studyId가 있으면 그 스터디 존재 확인(NOT_FOUND), 활동 없으면 NOT_FOUND

**Acceptance criteria:**

- [ ] migration 후 모든 활동 행에 `studyId` 키 존재, 이벤트(`studyId`·`activityId`)로 이어진 활동은 그 studyId, 나머지 null
- [ ] `flow_create_study_session`이 만든 활동은 `studyId = p.studyId`, `flow_publish_seminar`가 만든 활동은 `studyId: null`
- [ ] `expect-tables-valid` 테스트와 전체 테스트 통과

**의존:** 없음 **크기:** M

- [ ] 실패하는 테스트: PGlite에 migration 전체 적용 → (a) 스터디 세션 이벤트가 가리키는 활동·이주 활동이 든 문서에 backfill 적용 후 `studyId` 값 검사 (b) 두 생성 flow 호출 결과 행 `? 'studyId'` (c) `flow_set_activity_study` 연결·해제·없는 스터디 NOT_FOUND
- [ ] 실패 확인: `npx vitest run src/lib/server/data/activity-study-link.test.ts` → FAIL(함수·키 없음)
- [ ] 구현: migration — backfill `update app_tables set doc = ... jsonb_set(row, '{studyId}', coalesce(to_jsonb(<event.studyId>), 'null'))`, 두 flow를 `create or replace`로 재정의해 `jsonb_build_object`에 `'studyId', ...` 추가(나머지 본문은 20260928000000과 동일), 권한 revoke/grant는 20261014000000과 같은 형식
- [ ] TS writer: `createActivity`·`createEventWithActivity`의 활동 행에 `studyId: null`
- [ ] 통과 확인: 위 테스트 + `npx vitest run` 전체 → PASS, `npm run check` 0 오류

### Task 2: 관리자 활동 화면에서 스터디 지정

**파일:** 수정 `src/routes/(admin)/admin/activities/+page.server.ts`, `+page.svelte`, `src/lib/server/services/records-admin.ts:70-95`(`updateActivity`) / 테스트 `src/routes/(admin)/admin/activities/study-link-actions.test.ts`(생성)

**Interfaces:** 사용 `Activity.studyId`(Task 1) / 제공 action `?/setStudy` (`id`, `studyId` 빈 값 = 해제)

**Acceptance criteria:**

- [ ] 스터디 선택(학기·제목) → 저장 시 `studyId` 갱신, 빈 값이면 null
- [ ] 없는 스터디 id는 VALIDATION_FAILED, 아무것도 쓰지 않음
- [ ] 종류가 '스터디'인 활동에만 선택 칸이 보이고, 다른 종류에 `?/setStudy`를 보내면 VALIDATION_FAILED(D-000053)

**의존:** 1 **크기:** S

- [ ] 실패하는 테스트: action 호출 후 `getTable("activities")` 행의 studyId, 없는 id 거부
- [ ] 실패 확인 → 구현(load에 스터디 목록 `{id, title, semester}`, 활동 카드에 select) → 통과 확인

### Task 3: 노션 relation으로 스터디 연결 보강(ops)

**파일:** 생성 `scripts/ops/lib-notion-study-links.mjs`, `scripts/ops/ops-notion-backfill-study-links.mjs` / 수정 `scripts/ops/README.md` / 테스트 `src/lib/server/data/ops-notion-study-links.test.ts`

**Interfaces:**

- 제공: `matchStudyLinks(notionStudies, notionActivities, appStudies, appActivities) → {pairs: [{studyId, activityId, notionStudy, notionActivity}], unmatched: [{title, reason}]}` — 스터디는 제목+학기, 활동은 제목+시작일(YYYY-MM-DD), 양쪽 유일할 때만; `linkSql(activityId, studyId)` = `select flow_set_activity_study(${jsonOf({activityId, studyId})}) as result;`
- 사용: `queryFor`(`lib-supabase-cli.mjs`), `jsonOf`(`lib-add-member.mjs`), `loadDotenv`

**Acceptance criteria:**

- [ ] 이미 studyId가 있는 활동은 후보에서 제외(빈 칸만)
- [ ] CLI는 `--target dev|prod`, `--dry-run`, prod는 ref 입력 확인(`ops-fix-approval-dates.mjs`와 같은 방식)
- [ ] 이번 세션 적용은 Claude가 후보를 뽑아 스터디별 질문 → 고른 대로 `linkSql` 적용 → 재조회(D-000045)

**의존:** 1 **크기:** M

- [ ] 실패하는 테스트: 유일 일치·중복·누락·이미 연결 4경우, PGlite에서 `linkSql` 실행 후 행 확인
- [ ] 실패 확인 → 구현 → 통과 확인

### Checkpoint: Task 1~3 이후

- [ ] `npx vitest run` 전체 통과, `npm run check` 0 오류, eslint·prettier 통과
- [ ] 측정 서버(수정본 :5199 / HEAD :5198)에서 스터디 세션 생성 → 활동 studyId 확인, 관리자 지정·해제
- [ ] 릴리스 dry-run(`SKIP_PREVIEW=1`) check 쿼리 `act_no_study_key` 0

### Task 4: 관리자 스터디 참가자 편집기

**파일:** 수정 `src/lib/server/services/records-admin.ts`(추가 `setStudyParticipants`), `src/routes/(admin)/admin/studies/+page.server.ts`, `src/lib/components/admin/AdminStudyRecordEditor.svelte` / 테스트 `src/routes/(admin)/admin/studies/participant-actions.test.ts`(생성)

**Interfaces:**

- 제공: `setStudyParticipants(studyId: string, participantIds: string[], actorId: string): Promise<void>` — 관리자 전권(종료 스터디도), 중복 제거, 주최자가 빠진 목록은 `AppError("VALIDATION_FAILED")`(기존 `removeParticipant`의 주최자 보호와 같은 규칙), id는 통합 디렉터리에 있어야 함, 대기 목록(`pendingParticipantIds`)에서 같은 id 제거, `audit({action: "study.set-participants"})`
- action `?/setParticipants` (`id`, `participantIds`[])
- load 추가: 스터디별 `participantPeople`(이름), `attendeeCandidates`(그 스터디에 연결된 활동 출석자 합집합, Task 1), 디렉터리 선택지 `directoryPickers: {id, name, department, former: boolean}[]`(통합 명부 전원, 탈퇴자 포함 D-000057, 재가입은 새 행 하나로)

**Acceptance criteria:**

- [ ] 종료 스터디에 옛 회원 추가·제거 후 저장값 반영
- [ ] '출석자에서 채우기' 버튼이 후보를 체크만 하고 저장은 관리자가 누를 때
- [ ] 주최자 제외 시 거부, 아무것도 쓰지 않음

**의존:** 1 **크기:** M

- [ ] 실패하는 테스트: 서비스 3경우(정상·주최자 누락·없는 id) + load의 `attendeeCandidates`
- [ ] 실패 확인 → 구현(편집기: 검색 입력 + 체크 목록, 기존 참가자 위) → 통과 확인

### Task 5: 종료 스터디 주최자에 옛 회원 허용

**파일:** 수정 `src/lib/server/services/records-admin.ts:326-349`(`setOrganizer`), `src/routes/(admin)/admin/studies/+page.server.ts`, `AdminStudyRecordEditor.svelte` / 테스트 `src/lib/server/services/set-organizer-closed.test.ts`(생성)

**Interfaces:** 사용 `assertOrganizerCandidates`(`studies.ts:332`), `getDirectoryIndex` / 제공 변경된 `setOrganizer`(시그니처 그대로)

**Acceptance criteria:**

- [ ] 종료·취소 스터디: 통합 디렉터리 전원(탈퇴자 포함, D-000054) 허용, `handOver` 그대로(참가자에 추가, 이력 기록)
- [ ] 모집·진행 스터디: 기존 규칙 그대로(legacy-only id 거부)
- [ ] 편집기 주최자 선택지가 스터디 상태에 따라 디렉터리/운영 명단

**의존:** 4(같은 편집기 파일) **크기:** S

- [ ] 실패하는 테스트: 종료 스터디 legacy id 허용, 진행 스터디 legacy id 거부
- [ ] 실패 확인 → 구현 → 통과 확인

### Task 6: 활동 정도 순수 집계

**파일:** 생성 `src/lib/domain/member-activity.ts`, `src/lib/domain/member-activity.test.ts`

**Interfaces:**

- 제공:
  ```ts
  export const ACTIVE_WINDOW_DAYS = 183;
  export type ActivityRef = {
    id: string;
    title: string;
    type: string;
    start: string;
    end: string | null;
  };
  export type MemberActivity = {
    hostedSeminars: { id: string; title: string; semester: string }[];
    hostedStudies: { id: string; title: string; semester: string }[];
    attended: ActivityRef[]; // 최신순
    countsByType: Record<string, number>;
    active: boolean;
  };
  export function memberActivity(
    ids: ReadonlySet<string>, // 새 id + legacyMemberId
    data: {
      seminars: { id; title; semester; presenterIds }[];
      studies: { id; title; semester; organizerIds }[];
      activities: ActivityRef & { attendeeIds: string[] }[];
    },
    now: Date,
  ): MemberActivity;
  ```
- `active`: `attended` 중 type `세미나`·`스터디`이고 `(now - (end ?? start))`가 183일 이하(미래 포함)인 것 1건 이상

**Acceptance criteria:**

- [ ] 183일 경계(183일 = 활동, 184일 = 비활동), 미래 활동 = 활동, 회식·회의만 있으면 비활동
- [ ] 두 id의 기록 합산, 같은 활동 중복 없음

**의존:** 없음 **크기:** S

- [ ] 실패하는 테스트(위 경계 포함) → 실패 확인 → 구현 → 통과 확인

### Task 7: 공개 회원 명단에 활동 정도

**파일:** 생성 `src/lib/server/public/member-activity.ts`, `src/routes/(public)/members/[id]/+page.server.ts`, `src/routes/(public)/members/[id]/+page.svelte` / 수정 `src/lib/server/public/archive.ts:65-76`(`getPublicMembers`), `src/routes/(public)/members/+page.svelte`, `src/routes/(public)/sitemap.xml/+server.ts`(다른 공개 상세 페이지와 같은 규칙) / 테스트 `src/lib/server/public/member-activity.test.ts`

**Interfaces:**

- 제공: `memberActivityIndex({ publicOnly: boolean }): Promise<(member: Member) => MemberActivity>` — `publicOnly`면 `withoutHiddenActivities` 적용, 공개되지 않은 세미나 제외(아카이브와 같은 기준)
- `getPublicMembers()` 행에 `id`(공개 페이지 경로용)와 `activity: { active, hostedSeminars, hostedStudies, countsByType }` 추가(명단에는 참석 목록을 싣지 않음)
- 제공: `getPublicMember(id): Promise<{ member, activity: MemberActivity } | { redirectTo: string } | null>`

**Acceptance criteria:**

- [ ] `/members`: 기본 '활동 회원' 보기 + '전체 회원' 전환(D-000052), 칸은 이름·활동 여부·주최 세미나·주최 스터디·임원(기존 학과·가입일 유지), 이름이 `/members/[id]`로 연결
- [ ] `/members/[id]`(생성 `src/routes/(public)/members/[id]/+page.server.ts`, `+page.svelte`): 주최 세미나·주최 스터디·임원 이력·참석 활동 목록·종류별 횟수·활동 여부(D-000051). id는 운영 회원 id 또는 legacy id, 재가입 회원의 legacy id로 오면 새 id로 301, 탈퇴·없는 id는 404
- [ ] 숨김 활동·비공개 세미나는 공개 명단에 안 나옴
- [ ] 안내 문구를 공개 항목에 맞게 갱신
- [ ] 측정 서버에서 폭 1280·390 화면, 콘솔 오류 없음

**의존:** 6 **크기:** M

- [ ] 실패하는 테스트: 숨김 활동 제외, 재가입 회원 합산 → 실패 확인 → 구현 → 통과 확인

### Task 8: 관리자 회원 화면에 활동 정도

**파일:** 수정 `src/routes/(admin)/admin/members/+page.server.ts`, `+page.svelte`, `[id]/+page.server.ts`, `[id]/+page.svelte` / 테스트 `src/routes/(admin)/admin/members/member-activity-load.test.ts`(생성)

**Interfaces:** 사용 `memberActivityIndex({ publicOnly: false })`(Task 7)

**Acceptance criteria:**

- [ ] 목록: 활동 여부 칸 + 활동/전체 필터
- [ ] 상세: 주최·참석 목록·종류별 횟수·활동 여부(숨김 활동 포함, 표시)

**의존:** 6, 7 **크기:** S

- [ ] 실패하는 테스트: load 결과의 `activity` → 실패 확인 → 구현 → 통과 확인

### Checkpoint: Task 4~8 이후

- [ ] 전체 테스트·`npm run check`·eslint·prettier
- [ ] 측정 서버 수정본/HEAD 대조: 참가자 편집, 종료 스터디 주최자, 공개 명단·관리자 화면(실데이터 스냅숏 `real.mjs`는 개수·id만 출력)
- [ ] 배포는 사용자 질문 후(마이그레이션 포함 릴리스)

---

## 개정 2026-10-15 — 회칙 기준 회원 지위

현행 회칙(사이트 `charter-text.ts`, 라이브 `/about/charter` 대조 일치)에 '활동회원'이 없어 183일 규칙을 폐기(D-000070, D-000042 대체). Task 6~~8(v1, 커밋 2c1abe6·2305c5a·505ad3e)을 아래 Task 6b~~8b로 고쳐 쓰고, Task 9·10을 더함. 기존 Task 1~5는 그대로.

### 전역 제약 (추가·변경)

- 활동 기록(회칙 제18~20조, D-000071·075·076):
  - 인정 종류: 세미나·스터디·회식·회의·기타 전부.
  - 세미나 활동: 참석자 또는 그 세미나(`seminar.activityId`)의 발표자면 활동 1건당 1회(둘 다여도 1회).
  - 스터디 세션 활동(`studyId`가 있고 `sourceRequestId`가 `<studyId>:<date>` 형식): 스터디별로 묶어, 취소되지 않은 세션이 4개 이상이고 그 과반에 참석했으면 그 스터디로 1회.
  - 그 밖의 스터디 활동(이주된 활동: `sourceRequestId` null 등): 출석 명단에 있으면 1회.
  - 회식·회의·기타: 참석 1건당 1회.
  - 숨김 활동(`hiddenActivityIds`: 취소·미게시 세미나 활동)은 열리지 않은 활동이라 세지 않음. 관리자 화면 목록에는 표시만.
- 지위(D-000070·074·078):
  - 이번 학기(`currentTerm()`) 등록(`registrations`, 사람의 id 어느 쪽이든)이 있으면 현재 회원: 저장 지위가 `regular`이거나 활동 기록 3회 이상이면 '정회원', 아니면 '준회원'.
  - 등록이 없으면: 활동 기록 3회 이상이었거나 `isAlumni`면 '동문', 아니면 '이전 회원'.
  - 탈퇴 회원은 공개에서 제외(기존).
- 자동 승급(D-000073·078·079): 매일 maintenance cron이 운영 `members`(legacy 제외, 읽기 전용)에서 이번 학기 등록·`associate`·활동 기록 3회 이상인 회원을 `regular`로. `setStatus`와 같은 필드(`statusChangedAt`, `isAlumni`: `alumniRevoked`가 아니면 true), audit `member.auto-promote`. 강등 없음.
- 공개 명단 보기(D-000077): 기본 '현재 회원'(정회원+준회원), '정회원'·'전체' 전환. 관리자 회원 목록은 기본 '전체'(D-000065), 같은 세 보기.

### Task 6b: 활동 기록·지위 순수 집계 (Task 6 대체)

**파일:** 수정 `src/lib/domain/member-activity.ts`, `src/lib/domain/member-activity.test.ts`

**Interfaces (제공):**

```ts
export const REGULAR_RECORD_THRESHOLD = 3; // 회칙 제4조 ②
export const STUDY_MIN_SESSIONS = 4; // 회칙 제20조 ②
export type MemberStanding = "regular" | "associate" | "alumni" | "former";
export type MemberActivity = {
  hostedSeminars: HostedRef[];
  hostedStudies: HostedRef[];
  attended: ActivityRef[]; // 최신순, 숨김 제외는 부르는 쪽
  records: number; // 회칙 활동 기록 수
  recordsByType: Record<string, number>;
};
export function memberActivity(
  ids,
  data: MemberActivityData,
  now: Date,
): MemberActivity;
export function memberStanding(input: {
  registeredThisTerm: boolean;
  storedStatus: "associate" | "regular";
  isAlumni: boolean;
  records: number;
}): MemberStanding;
```

- `MemberActivityData`에 `seminars[].activityId`, `activities[].studyId`·`sourceRequestId`·`cancelled?`(세션 이벤트 취소 여부) 추가.

**Acceptance criteria:**

- [ ] 세미나: 발표자이자 참석자면 1회, 발표자만이어도 1회
- [ ] 스터디 세션: 4세션 중 3 참석 → 1, 4세션 중 2 참석 → 0, 3세션 전부 참석 → 0, 취소 세션은 셈에서 뺌
- [ ] 이주 스터디 활동 출석 → 1, 회식·회의·기타 각 1
- [ ] `memberStanding` 네 지위 경계(기록 2/3, 저장 regular 유지, isAlumni)

**의존:** 1(studyId) **크기:** S

### Task 7b: 공개 명단·회원 페이지 갱신 (Task 7 수정)

**파일:** 수정 `src/lib/server/public/member-activity.ts`, `src/lib/server/public/archive.ts`, `src/routes/(public)/members/+page.svelte`, `src/routes/(public)/members/[id]/+page.svelte`, 테스트 2개 + `docs/spec/FUNCTIONAL-SPEC.md`(D2·PUB-15), `docs/spec/API-SPEC.md`(GET /members, GET /members/[id]) (D-000063)

- 공개에서 취소 스터디는 주최 스터디 제외(D-000064), 미게시 세미나 제외(기존).
- 명단 칸: 이름·지위·주최 세미나 수·주최 스터디 수·임원(+학과·가입일), 0은 '—'(D-000068). 보기 3개(D-000077). 안내 문구에서 183일 문장을 회칙 기준 설명으로 교체.
- 회원 페이지: 지위, 활동 기록 수·종류별, 주최·임원·참석 목록.

**Acceptance criteria:**

- [ ] 이번 학기 등록 회원 정회원/준회원, 미등록 동문/이전 회원 표시
- [ ] spec 문서가 새 공개 범위와 결정 ID를 적음

**의존:** 6b **크기:** M

### Task 8b: 관리자 회원 화면 갱신 (Task 8 수정)

**파일:** 수정 `src/routes/(admin)/admin/members/+page.server.ts`, `+page.svelte`, `[id]/+page.server.ts`, `[id]/+page.svelte`, `member-activity-load.test.ts`

- 목록: 계산 지위 칸 + 보기 3개(기본 전체). 상세: 활동 기록 수·종류별, 공개 명단에서 빠지는 주최 세미나(미게시)·주최 스터디(취소)·숨김 활동에 '공개 면 숨김'(D-000069), 저장 지위와 계산 지위가 다르면 둘 다 표시.

**의존:** 6b **크기:** S

### Task 9: 매일 자동 승급

**파일:** 생성 `src/lib/server/services/member-standing.ts`, `src/lib/server/services/member-standing.test.ts` / 수정 `src/lib/server/services/maintenance.ts`(`runMaintenance`에 `promote` 단계, `runIsolated`, 실패 코드 `promote_failed`)

**Interfaces (제공):** `promotionCandidates(now): Promise<string[]>`(운영 members id), `promoteQualifiedMembers(now): Promise<number>`(위 후보를 `associate`일 때만 `regular`로, 한 번의 `mutate("members")`, 각자 audit)

**Acceptance criteria:**

- [ ] 등록·associate·기록 3 → 승급, 기록 2·미등록·이미 regular·탈퇴 → 그대로, `alumniRevoked`면 isAlumni 유지
- [ ] 한 단계 실패가 다른 단계를 막지 않음(기존 maintenance 테스트 형식)

**의존:** 6b **크기:** S

### Task 10: 첫 일괄 승급 미리보기·적용(ops)

**파일:** 생성 `scripts/ops/ops-promote-regular.ts`(`npx tsx`로 실행, `src/lib/domain/member-activity.ts`를 상대 경로로 import — `scripts/seed-dev.ts`와 같은 방식), 수정 `scripts/ops/README.md`

- `--target prod|dev`, 기본 dry-run: 승급 대상 수와 회원 id 목록(이름 없음) 출력. `--apply`는 ref 입력 확인 후, 같은 후보를 다시 계산해 `associate`인 행만 SQL로 갱신(`setStatus`와 같은 필드) + audit 행, 재조회.
- 이번 세션 적용은 Claude가 dry-run 결과를 보여 주고 질문 후(D-000080).

**의존:** 6b, 배포 **크기:** S

### Checkpoint: Task 2~~5, 6b~~10 이후

- [ ] 전체 테스트·`npm run check`·eslint·prettier
- [ ] 측정 서버 수정본/HEAD 대조(참가자 편집, 종료 스터디 주최자, 명단·회원 페이지·관리자, cron 승급)
- [ ] 배포 여부 질문(마이그레이션 20261015000000 포함)
