# 명세 검토 기록

## 2차 검토 (2026-08-28) — 구현 계층

대상: API-SPEC v0.4 · BACKEND-TASKS v1 · IMPLEMENTATION-SPEC v1
방법: 독립 검토 2회 병렬 — ① 플랫폼 실현성(AWS·Vercel·SvelteKit 제약을 공식 문서로 실검증) ② 문서 간 정합·의존 그래프
결과: 30건 → **API v0.5 / TASKS v1.1 / IMPL v1.1 반영**

### Confirmed-broken (수정 완료)

| 발견 | 조치 |
|---|---|
| **IAM 권한 3종 누락** — `s3:ListBucket`(없으면 미존재 키 GET이 403이라 mutate 부트스트랩까지 깨짐), assets `uploads/pending/*` Delete, SSE-KMS 버킷용 `kms:Decrypt/GenerateDataKey` | BE-02에 런타임 권한 인벤토리 표 신설 — 코드 호출 전수 대응 |
| **presigned PUT은 크기 상한을 강제 못함** (`content-length-range`는 POST policy 전용) | 등록(승격) 시 `HeadObject` 실측 검증으로 강제 지점 이동 |
| **Vercel Hobby 크론은 일 1회 상한** — 시간당 스케줄 불가 | `effectiveStatus` lazy 판정을 1차 방어로 승격(크론은 표시 정리), Hobby 일1회 + GitHub Actions 대안 명기 |
| **승인→공지 메일 의존 역전** — BE-33(M3)이 BE-45(M4) 호출 | M3는 no-op 스텁, BE-45가 구현 채움 |
| **크론 의존 역전** — BE-35(M3)가 BE-41·49(M4·5) 함수 호출 | 크론을 단계 레지스트리로 — BE-35는 골격+expire만, 후속 태스크가 단계 등록 |
| **`members`/`private-info`에 `sourceRequestId` 부재** — 가입 승인 멱등 불성립 | 두 스키마에 필드 추가 |
| **`/api/*`가 어느 zone에도 없음** — fail-closed 스위치가 전부 500 | zone `"api"` 신설, 핸들러별 자체 인증 명시 |
| **`/`·`(applicant)`에서 withdrawn 리디렉트 구멍** — 유예 중 `/signup` 재신청 가능 | `/` 하이브리드 처리 + applicant 존 리디렉트 추가 |
| **M3 "Notion 읽기 전용" vs MIG-4 충돌 + BE-36 조기 삭제** | 컷오버 원칙 정리: M3는 코드 전환, 읽기 전용화·최종 델타·BE-36은 M8. M6을 M3 직후 우선 |

### Risky (수정 완료)

- `mutate` 재시도가 412만 처리 — S3는 동시 조건부 PUT에 **409**도 반환 → 409·404 재시도 편입, 큐는 10회
- `route.id === null`(미매칭 404)이 500으로 오염 → null이면 resolve 위임
- `adapter-vercel` <6.3.2 ISR 캐시 기만 취약점(SvelteSpill) → ≥6.3.2 잠금을 Phase 0 완료 조건化
- 로컬 캐시 크로스 인스턴스 스테일 최대 300s → `table_*` 로컬 TTL 15s 캡
- 소비자 Gmail 일 500 수신자 한도 → Workspace 계정 전제 명기
- 큐 액션 입력에 `eventId` 부재(이벤트당 객체라 필수) → 4종 전부 `(eventId, queueId)`
- `/members` 공개 페이지 withdrawn 미제외 → 제외 + 스냅샷 테스트 추가
- `/admin`에 탈퇴 유예 목록 부재(§4-7 약속 미이행) → §7-1 확장 + BE-53 편입
- `sourceRequestId` "ULID" 타입 vs 복합 키 → `string | null` + 형식 2종 문서화
- 익명화 keep/null 목록 모순 → 명시 목록으로 재작성 (`withdrawal` 객체는 파기 근거로 보존)
- 기타: previousStatus 기록 누락, §5-5 세미나 타입 필터, BE-48/49 액션 열거 누락, M4~M6 교차 엣지 3건, 버전 참조 정정

### 검증 통과 (문제 없음 확인)

S3 If-Match/If-None-Match(SSE-KMS 포함) · Vercel OIDC 전 플랜 GA(`awsCredentialsProvider`) ·
adapter-vercel ISR 문법과 `/` ISR 미적용 결정 · sharp Vercel 동작 · `route.id` 훅 가용성 ·
Bcc 배치 수치 · 큐 비-TableName 처리 일관성 · 재가입=신규 경로 · deleteEvent↔IAM 예외 정합.

---

## 1차 검토 (2026-08-25)

대상: `FUNCTIONAL-SPEC.md` v0.5 / `API-SPEC.md` v0.1
방법: 독립 검토 2회 병렬 — ① 완전성 (기능↔API 커버리지, 흐름 추적, 수명주기) ② 일관성·확장성 (스키마 규약, 정책 모순, 미래 변경 비용)
결과: 총 44건 (중복 제거 후 실질 ~35건) → **API-SPEC v0.2 / FUNCTIONAL-SPEC v0.6에 전부 반영**

## High (5건) — 전부 수정

| # | 발견 | 조치 (v0.2) |
|---|---|---|
| 1 | **임원 연락처 공개 확정 vs "공개 응답에 private-info 금지" 모순** — 연락처가 비공개 테이블에만 존재해 확정 기능이 구현 불가 | `members.publicContact`(동의 기반 공개 연락처, 임원용) 신설. 공개 금지 규칙의 유일한 명시 예외로 규정 |
| 2 | **`/` 라우트 이중 모드 충돌** — 같은 경로가 공개 ISR과 회원 PII 응답으로 병기. 순진한 ISR이면 회원 데이터가 게스트 캐시에 혼입될 수 있음 | 세션 없는 분기만 ISR, 회원 분기는 캐시 금지 명시 + 검증 항목 추가 |
| 3 | **승인 흐름 멱등성 미보장** — "멱등"이라 썼지만 중간 실패 후 재실행 시 중복 생성을 감지할 수단이 없었음 | §1-6 멱등성 규약 신설: 생성 레코드 전부에 `sourceRequestId` + check-before-create |
| 4 | **감사 로그 계약 부재** — 요구만 있고 저장소·스키마 없음. 단일 JSON 테이블에 넣으면 경합 | §1-5 신설: 건당 S3 객체(append-only), 스키마·대상·비대상 명시 |
| 5 | **스터디 상태 전이 주인 없음** — recruiting→finished를 바꿀 액션이 없고, finished에도 join 가능 | `?/setStudyStatus` 신설, `join`에 `STUDY_NOT_RECRUITING`, `createSession`에 finished 차단 |

## Medium (주요) — 전부 수정

- **회원 피커 데이터 경로 부재** → `/seminar/apply`·`/seminar/edit`·관리자 편집 로드가 피커 목록(id·name·department) 반환 명시
- **GET 로드 누락** (`/admin/*` 편집, `/seminar/edit`, `/signup` 프리필, "내 신청" 목록) → 전부 명세. 대시보드가 `myRequests` 반환
- **출석 큐 무결성** — dangling 참조, 이벤트 삭제 시 잔존 큐, approved 행 취소의 역반영 미규정 → deleteEvent는 pending 존재 시 `CONFLICT`, approved 취소는 attendees 역반영 명시
- **크론 회차 자동 생성 미상세** — sessionNo·활동 연결 규칙 없음 → `?/createSession`과 동일 규칙 + `generatedEventId` 멱등
- **전달 에지** — 자기 전달 차단, 직권 `setOrganizer` 시 `pendingTransfer` 자동 해제
- **상태 enum 불일치** (`accepted` vs `approved`) → `approved` 통일. **발표자 명칭** (`speakerIds` vs `presenterIds`) → `presenterIds` 통일
- **이벤트 만료 판정 불능** — 단일 시각만 있어 "시간 경과" 정의 불가 → `date: {start, end}` + 만료 규칙(`end ?? 당일 24:00 KST`) 명시
- **학기 파생 규칙 부재** → 단일 정의 신설 (3~8월 = 1학기, 9~익2월 = 2학기)
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
