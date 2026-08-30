# 명세 검토 기록

## 4차 제품 결정 반영 (2026-08-28)

세미나 메일을 승인 단계 1회로 제한하던 정책을 수명주기 공지로 변경했다. 승인 시에는 일정 미정
개설 공지, 최초 공개 시에는 확정 일정, 공개 후 실제 일정 변경·취소 시에는 변경 공지를 보낸다.
비공개 일정 저장, 동일 값 재저장, 완료된 상태 전이 재시도에는 보내지 않아 중복을 방지한다.

## 3차 동기화 검토 (2026-08-28)

`origin/docs/feature-api-spec`의 세 후속 커밋을 프런트엔드 후속 결정과 대조했다. 원격의 구현
계층 결함 수정은 API v0.8·구현 v2.1에 재적용했고, 제품 결정에 의해 폐기된 반복 스터디 일정,
복합 `sourceRequestId`, 자동 익명화 모델은 되살리지 않았다. API schema의 실제 코드화 범위와
프런트엔드 구현 상태는 [`FRONTEND-IMPLEMENTATION-STATUS.md`](./FRONTEND-IMPLEMENTATION-STATUS.md)에 기록한다.

## 2차 구현 계층 검토 (2026-08-28, `72d2f2e`)

원격에서 API v0.4·백엔드 작업 v1·구현 스펙 v1을 플랫폼 실현성과 문서 의존 관계 관점으로
검토해 30건을 발견했다. 후속 제품 결정과 양립하는 수정은 현재 API v0.8에 재적용했다.

주요 confirmed-broken 수정:

- runtime IAM에 `ListBucket`, pending asset Delete, KMS 권한 추가
- presigned PUT 크기 제한을 등록 시 `HeadObject` 실측 검증으로 보완
- Vercel Hobby cron 한계를 `effectiveStatus` lazy 판정과 GitHub Actions 주 실행으로 보완
- 가입 승인으로 생성되는 `members`/`private-info`에 `sourceRequestId` 추가
- `/api/*`를 membership guard가 가로채지 않고 각 handler가 자체 인증하도록 분리
- withdrawn 사용자의 `/signup` 재진입 차단, 미매칭 `route.id === null`은 SvelteKit 404에 위임
- 관리자 편집 UI가 준비된 뒤 데이터 컷오버하도록 마일스톤 의존 관계 수정

주요 risky 수정:

- S3 조건부 쓰기 409·경합 404 재시도와 출석 큐 10회 상한
- warm instance 로컬 table cache TTL 15초 제한
- `adapter-vercel` 6.3.2 이상 요구
- 출석 큐 action에 `(eventId, queueId)` 필수화
- `/members`에서 withdrawn 제외, `/admin`에 탈퇴 유예 목록 추가
- 업로드 승격 전 실제 타입·크기 재검증과 Google Workspace 발송 계정 전제

원격의 복합 `sourceRequestId`, 반복 스터디 schedule, 자동 익명화 설계는 후속 결정으로 폐기했으며
그 대신 UUIDv7 `operationId`, 수동 회차, 정책 보류 계약을 사용한다.

## 1차 검토 (2026-08-25)

대상: `FUNCTIONAL-SPEC.md` v0.5 / `API-SPEC.md` v0.1
방법: 독립 검토 2회 병렬 — ① 완전성 (기능↔API 커버리지, 흐름 추적, 수명주기) ② 일관성·확장성 (스키마 규약, 정책 모순, 미래 변경 비용)
결과: 총 44건 (중복 제거 후 실질 ~35건) → **API-SPEC v0.2 / FUNCTIONAL-SPEC v0.6에 전부 반영**

2026-08-28 후속 제품·API 결정은 [`FRONTEND-DECISIONS.md`](./FRONTEND-DECISIONS.md)에 기록한다.

## High (5건) — 전부 수정

| #   | 발견                                                                                                                                     | 조치 (v0.2)                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | **임원 연락처 공개 확정 vs "공개 응답에 private-info 금지" 모순** — 연락처가 비공개 테이블에만 존재해 확정 기능이 구현 불가              | `members.publicContact`(동의 기반 공개 연락처, 임원용) 신설. 공개 금지 규칙의 유일한 명시 예외로 규정 |
| 2   | **`/` 라우트 이중 모드 충돌** — 같은 경로가 공개 ISR과 회원 PII 응답으로 병기. 순진한 ISR이면 회원 데이터가 게스트 캐시에 혼입될 수 있음 | 세션 없는 분기만 ISR, 회원 분기는 캐시 금지 명시 + 검증 항목 추가                                     |
| 3   | **승인 흐름 멱등성 미보장** — "멱등"이라 썼지만 중간 실패 후 재실행 시 중복 생성을 감지할 수단이 없었음                                  | §1-6 멱등성 규약 신설: 생성 레코드 전부에 `sourceRequestId` + check-before-create                     |
| 4   | **감사 로그 계약 부재** — 요구만 있고 저장소·스키마 없음. 단일 JSON 테이블에 넣으면 경합                                                 | §1-5 신설: 건당 S3 객체(append-only), 스키마·대상·비대상 명시                                         |
| 5   | **스터디 상태 전이 주인 없음** — recruiting→finished를 바꿀 액션이 없고, finished에도 join 가능                                          | `?/setStudyStatus` 신설, `join`에 `STUDY_NOT_RECRUITING`, `createSession`에 finished 차단             |

## Medium (주요) — 전부 수정

- **회원 피커 데이터 경로 부재** → `/seminar/apply`·`/seminar/edit`·관리자 편집 로드가 피커 목록(id·name·department) 반환 명시
- **GET 로드 누락** (`/admin/*` 편집, `/seminar/edit`, `/signup` 프리필, "내 신청" 목록) → 전부 명세. 대시보드가 `myRequests` 반환
- **출석 큐 무결성** — dangling 참조, 이벤트 삭제 시 잔존 큐, approved 행 취소의 역반영 미규정 → deleteEvent는 pending 존재 시 `CONFLICT`, approved 취소는 attendees 역반영 명시
- **크론 회차 자동 생성 미상세** — v0.2에서는 `generatedEventId` 규칙을 추가했으나, 2026-08-28 제품 결정으로 반복 일정과 자동 생성을 모두 제거하고 입력 없는 수동 회차 생성으로 대체
- **전달 에지** — 자기 전달 차단, 직권 `setOrganizer` 시 `pendingTransfer` 자동 해제
- **상태 enum 불일치** (`accepted` vs `approved`) → `approved` 통일. **발표자 명칭** (`speakerIds` vs `presenterIds`) → `presenterIds` 통일
- **이벤트 만료 판정 불능** — 단일 시각만 있어 "시간 경과" 정의 불가 → `date: {start, end}` + 만료 규칙(`end ?? 당일 24:00 KST`) 명시
- **학기 파생 규칙 부재** → 단일 정의 신설 (3~~8월 = 1학기, 9~~익2월 = 2학기)
- **회차 취소가 expired 재사용** — 관리자가 부활시킬 수 있음 → `cancelled` 상태 분리(재활성화 불가)
- **캐시 무효화 목록 불완전** → "`mutate` 시 자체 테이블 키 자동" 원칙 + ISR TTL(60s) 재검증 방식 확정
- **권한 변경 감사 누락** — `setAdmin`·`setStatus`·`setRoles`가 로그 밖 → 전부 감사 대상 편입. 본인 접근·세션 훅은 명시 제외 (기능 명세 MEM-04 문구도 정정)
- **박탈 우회** — 강등 후 재승격이 `isAlumni`를 되살림 → `alumniRevoked` sticky 플래그
- **양방향 관계 중복** (`members.privateInfoId` ↔ `private-info.memberId`) → 후자 단방향 단일 원천

## 확장성 (전부 반영 — 지금 싸고 나중 비싼 것만)

- `organizerId` 단수 → **`organizerIds` 배열** (현 불변식 1명, 공동 주최 대비)
- `mailOptOut` boolean → **`mailPrefs: {announcements}`** (메일 유형 추가 대비)
- 테이블 봉투 **`{schemaVersion, rows}`** (형상 변경 대비)
- **출석 큐 이벤트당 객체 분할** — 동시 체크인 버스트가 유일한 실경합 지점
- `hasProject` boolean → **`project: {title, url?}`** (보드에 내용 표시 가능)
- `statusChangedAt` + **`withdrawn` 상태값 예약** (탈퇴 표현 불가 문제. 정책 자체는 미결로 등록)
- `seminars.activityId` 연결 (아카이브↔활동 내비게이션 대비)

## 신규 미결 (기능 명세 §10 등록)

- **PII 보존·탈퇴 정책** — 탈퇴/제명 절차, 처리 완료 가입 신청의 보존 기간

## 검토에서 문제없음 확인된 것

출석 병합 규칙 적용 범위(관리자 덮어쓰기 예외 포함), Bcc·옵트아웃 정책 정합, 옵트아웃 비로그인 흐름, 공용 체크인 라우트 분기, 가드의 재조회 판정(locals 불신), 기능 ID 커버리지(전 ID 매핑 존재).
