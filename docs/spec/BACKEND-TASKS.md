# 백엔드 구현 작업 목록 (v1.1)

> 기반: [`FUNCTIONAL-SPEC.md`](./FUNCTIONAL-SPEC.md) v0.8 / [`API-SPEC.md`](./API-SPEC.md) v0.4.
> 구현 브랜치는 `docs/feature-api-spec`에서 분기.
> 표기: **[선행]** = 착수 전 필수 의존. 괄호의 §는 API-SPEC 절 참조.

## 진행 원칙

1. **데이터 계층 → 가드 → 저장소 전환 → 신규 기능** 순. 신규 기능을 Notion 위에 만들지 않는다 — 두 번 만들게 된다.
2. Phase 내 병렬 가능, Phase 간 의존은 명시된 것만.
3. 각 태스크는 검증 기준을 포함해야 완료 (§10 검증 요구 매핑).
4. Notion 코드는 B4(읽기 전환) 전까지 삭제하지 않는다 — 전환 완료 후 일괄 제거.

---

## Phase 0 — 기반 (전부 병렬 가능)

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| BE-01 | 테스트 스크립트 정비 | `package.json`에 `test: vitest run` 추가, CI 기본 체계 | — |
| BE-02 | AWS 인프라 (Terraform `infra/`) | 버킷 2개(assets 공개/data 비공개), CloudFront+OAC, IAM 역할 2개(runtime/migration), 수명주기 규칙(비현재 버전 90일·미완료 멀티파트 7일·미등록 업로드 7일), SSE-KMS(비공개), CloudTrail 데이터 이벤트, Budgets | — |
| BE-03 | AWS SDK·인증 연결 | `@aws-sdk/client-s3` + presigner, Vercel↔AWS OIDC (권장) 또는 키. env 정리. **`adapter-vercel` ≥6.3.2 잠금 확인** (ISR 캐시 기만 취약점) | BE-02 |
| BE-04 | `CRON_SECRET` 설정 + fail-closed | §8-1. 미설정 시 501 | — |
| BE-05 | 공통 모듈 | 에러 코드 상수(§1-2), id 유틸(ULID/UUIDv7), **학기 파생 유틸 단일 정의**(§2), 전화번호 정규화 재사용 확인 | — |

## Phase 1 — S3 데이터 계층 (백엔드의 심장)

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| BE-10 | Zod 스키마 11종 | §2 전 테이블. 스키마 = 단일 원천 (검증·타입 공용). `{schemaVersion, rows}` 봉투 포함 | BE-05 |
| BE-11 | `getTable` / `mutate` | §1-3. If-Match 조건부 쓰기 + 지수 백오프 5회, If-None-Match 조건부 GET, gzip. **출석 큐는 이벤트당 객체 분할 지원** | BE-03, BE-10 |
| BE-12 | 캐시 연동 | `withCache` 페처 교체 규약, `mutate` 성공 시 `table_<name>` 자동 무효화 (§1-4) | BE-11 |
| BE-13 | 감사 로그 채널 | §1-5. 건당 S3 객체 append-only, 스키마·기록 헬퍼. `getTable/mutate` 밖 | BE-03 |
| BE-14 | 멱등 승인 헬퍼 | §1-6. `sourceRequestId` check-before-create 패턴 공용화 | BE-11 |
| BE-15 | **데이터 계층 검증** | mutate 경합 테스트(유실 0), 출석 큐 버스트(N 동시 체크인 전원 성공), 봉투 버전 분기 | BE-11 |

## Phase 2 — 인증·가드 재설계

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| BE-20 | 가드 재작성 | §1-1. 접두사 매칭 → 라우트 그룹/명시 목록. `ensureSession/Member/Presenter/Organizer/Admin`. `isAdmin`은 DB에서 (D4 — 하드코딩 명단 제거). `withdrawn` → `/withdraw/pending` 리디렉트 | BE-11 |
| BE-21 | 세션 훅 회원 매칭 전환 | §2-2. `private-info.email` 조회를 S3 경유로, 캐시 필수, 감사 비대상 명시 | BE-20 |
| BE-22 | `/login` 라우트 신설 | AUTH-04. `redirectTo` 복귀 | — |
| BE-23 | 공개 영역 레이아웃 분리 | 세션 미의존 공개 레이아웃 — prerender/ISR 성립 조건. `/` 세션 분기(§3) 캐시 경계 | BE-20 |
| BE-24 | 🔴 **가드 매트릭스 테스트** | 전 라우트 × 5역할. **Phase 2의 종료 조건** — 이후 라우트 추가 시마다 갱신 | BE-20~23 |

## Phase 3 — 기존 기능 저장소 전환 (Notion → S3)

> 이주 스크립트(Phase 6)로 데이터가 S3에 실재해야 전환 검증 가능. B4/B5 순서 준수: 읽기 먼저.

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| BE-30 | 읽기 경로 전환 | 회원·활동·세미나·이벤트·큐 조회 전부 `getTable` 기반 Repository로. 기존 `notion/*` 모듈 대체 | BE-11, MIG-2 |
| BE-31 | 쓰기 경로 전환 | 기존 10개 라우트의 17개 쓰기 호출부 → `mutate` 경유 | BE-30, BE-14 |
| BE-32 | 가입 흐름 전환 | §4-1~4-3, §7-2 — **전환 방식**(신청 행 제거) + `/wait` 철회 액션 신설 | BE-31 |
| BE-33 | 세미나 승인 흐름 전환 | §7-2 `approveSeminar` — activities+events+seminars 생성, `presenterIds`·`activityId` 기록, `sourceRequestId`. **공지 메일 단계는 no-op 스텁** — 실 발송은 BE-45가 채움 (M3가 M4에 의존하지 않도록) | BE-31 |
| BE-34 | 출석 흐름 전환 | §5-4 공용 체크인(이벤트당 큐 객체), §7-2 큐 승인·**역반영** 규칙 | BE-31 |
| BE-35 | 크론 전환 | §8-1 — 크론 골격(단계 레지스트리) + **expire 단계만** + `effectiveStatus` **lazy 판정 유틸**(신청·출석 검증의 1차 방어 — Hobby 플랜 일1회 크론 제약 대응). 회차 생성·익명화 단계는 BE-49·BE-41이 등록 | BE-31 |
| BE-36 | Notion 코드 제거 | `notion/*`, `/notion`, `/diag`, 포스터 410 엔드포인트 삭제 (§8-4). **프로덕션 컷오버(MIG-4 읽기 전용화+최종 델타) 이후 실행** — 컷오버 전 롤백 경로 보존 | MIG-4 |

## Phase 4 — 신규 기능 백엔드

### 4a. 회원 (병렬)

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| BE-40 | 메일 수신 설정 | §4-6 `mailPrefs` + `/settings/notifications` | BE-31 |
| BE-41 | 탈퇴 수명주기 | §4-7 — 삼중 확인 서버 검증, 회장단 통지(메일 템플릿 자체 포함 — BE-45 무관), `/withdraw/pending` 철회, **익명화 단계를 크론에 등록**(private-info 삭제 + members keep/null 목록), 감사 로그 | BE-31, BE-13, BE-35 |
| BE-42 | 회원 지위 로직 | status 축 + `isAlumni`/`alumniRevoked` sticky 규칙 (§7-3). 경과 조치: status는 권한 미개입 | BE-30 |

### 4b. 세미나·이벤트 (F1/F2/F3 — seminar-events.md 함정 A~E 반영)

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| BE-43 | 참가 신청/취소 | §5-3 `applyActivity`/`cancelActivity` + 대시보드 `isApplied`·`canApply`·`pendingAttendance` | BE-31 |
| BE-44 | 발표자 출석 관리 | §5-5·5-6 `/events/manage` — 🔴 **병합 규칙** + 부분집합 검증 + 캐시 무효화(활동·회원별) | BE-43 |
| BE-45 | 공지 메일 | §5-7 — **Bcc 전용**·배치 분할·옵트아웃 제외·옵트아웃 링크. `dispatchEmail` Bcc 확장(기존 4개 호출부 회귀 확인) | BE-40 |
| BE-46 | 세미나 신청 철회·수정 | §5-2 `?/update`/`?/withdraw` + 대시보드 `myRequests` | BE-31 |

### 4c. 스터디 (전부 신규)

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| BE-47 | 개설 신청·승인 | §6-2, §7-2 `approveStudy` — `organizerIds` 지정 | BE-31 |
| BE-48 | 참여·인원·상태 전이 | §6-1 `/study` 목록 로드, §6-3 join/leave(`STUDY_NOT_RECRUITING`), §6-4 `acceptParticipant`/`removeParticipant`/`setStudyStatus`, 대시보드 `myStudies` | BE-47 |
| BE-49 | 회차 관리 | §6-4 수동 생성(활동+이벤트 쌍, sessionNo)·`updateSession`/`cancelSession` + 일정 등록, **크론에 자동 생성 단계 등록**(`generatedEventId` 멱등, **events 먼저 schedule 나중**) | BE-47, BE-35 |
| BE-50 | 주최자 전달 | §6-4·6-5 — 2단계 합의, 자기 전달 차단, 철회, `previousStatus`류 복원 규칙 | BE-47 |
| BE-51 | 스터디 출결 관리 | §6-6 — 회차 검증 + 병합 규칙 (BE-44 공용 함수 재사용) | BE-49, BE-44 |

### 4d. 관리자 편집 + 업로드

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| BE-52 | 업로드 파이프라인 | §8-2 presign(purpose별 제한) + s3Key 등록 + 이미지 파생본(thumb/display) + 고아 정리 | BE-03 |
| BE-53 | 회원 편집 | §7-3 전 액션 — status·roles·admin·publicContact·개인정보 + **탈퇴 보존 집행(`holdWithdrawal`/`releaseWithdrawalHold`) + `/admin` 탈퇴 유예 목록**, **감사 로그 전면**, 열람 로그 | BE-42, BE-13, **BE-41** |
| BE-54 | 레코드 편집 4종 | §7-4 activities/seminars/studies/gallery — CRUD + 파일 등록 + 참조 무결성 `CONFLICT` + `setAttendees` 예외(확인 다이얼로그) + `setOrganizer` 직권 전달 | BE-52 |
| BE-55 | 이벤트 편집 | §7-2 `updateEvent`, `deleteEvent` pending 큐 검증, §7-5 connect 필드 복사 규칙 | BE-34 |
| BE-56 | 관리자 폴링 3종 | §8-3 `/api/admin/*` (study-requests 신설 포함) | BE-47 |

## Phase 5 — 공개 영역 로드 (프론트 병행 가능)

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| BE-60 | 공개 읽기 로드 | §3 전 라우트 — 공개 필드 필터링(`publicContact` 유일 예외), ISR(60s)/prerender 구분 | BE-23, BE-30 |
| BE-61 | 스터디 아카이브 모듈 | PUB-10 — 읽기 코드 자체가 신설 | BE-30 |
| BE-62 | 마크다운 파이프라인 | mdsvex 도입 (단독 커밋 — 빌드 전반 영향 회귀 확인) | — |
| BE-63 | SEO 기반 | 라우트별 `<svelte:head>`(전역 title 하드코딩 해체), `sitemap.xml`, `lang="ko"`. `robots.txt` 개방은 **전환 완료 후** | BE-60 |
| BE-64 | 🔴 공개 응답 스냅샷 테스트 | §10 — PII·운영 필드 부재, `/` 게스트 캐시 회원 데이터 미혼입 | BE-60 |

## Phase 6 — 데이터 이주 실행 (Phase 1 완료 후 착수, Phase 3과 맞물림)

> 상세는 `docs/notion-migration-plan` 브랜치 트랙 A/B 문서 준수. 여기는 백엔드 관점 요약.

| ID | 작업 | 내용 | 선행 |
|---|---|---|---|
| MIG-0 | 선행 조치 | 프로덕션 env 확보(EVENTS/QUEUE 실측), 전 DB 원본 덤프 백업, 개인정보 누수 선차단(`getLatestExecutives` 레이아웃 제거), 정합성 이상 정리(고아 PII 11건 등) | — |
| MIG-1 | 자산 이주 | 90개 열거(토글 재귀)·다운로드·정규화·업로드·파생본·`assets-manifest.json` | BE-02 |
| MIG-2 | 레코드 익스포터 | Notion → `tables/*.json` — §9 변환 규칙 전부 (status 전원 associate, `Seminar`→`세미나`, roles 파싱, id-map, applications 미이주, file→s3Key) | BE-10, MIG-0, MIG-1 |
| MIG-3 | 정합 검증 | 행 수·relation dangling 0·자산 90·sha256 (API-SPEC §10 + db-to-s3 §7) | MIG-2 |
| MIG-4 | 전환 | Notion 읽기 전용화 → 최종 델타 → 공개 해제·아카이브. **편집 UI(BE-53~54) 완성이 전제** | 전체 |

## Phase 7 — 종합 검증 (§10 전 항목)

| ID | 작업 | 선행 |
|---|---|---|
| BE-70 | 멱등성 통합 테스트 — 전 승인 액션 중간 실패 재실행 | Phase 3·4 |
| BE-71 | 병합 규칙·출석 회귀 시나리오 (체크인 출석자가 발표자 저장에 살아남는지) | BE-44, BE-51 |
| BE-72 | 탈퇴 수명주기 E2E (신청→통지→보존/철회→익명화→기록 잔존) | BE-41 |
| BE-73 | 메일 검증 (Bcc 헤더, 옵트아웃 제외) | BE-45 |
| BE-74 | 감사 로그 전수 확인 | BE-53 |

---

## 권장 마일스톤 (커밋·PR 단위)

```
M1  Phase 0 + 1          "S3 데이터 계층"          — BE-15 통과가 게이트
M2  Phase 2              "가드 재설계"             — BE-24 통과가 게이트
M3  MIG-0~3 + Phase 3    "저장소 전환(코드)"        — 코드가 S3 경로로 전환, 스냅샷 데이터로 검증.
                                                    프로덕션 컷오버는 아직 아님 (아래 M8)
M4  Phase 4a+4b          "회원·세미나 신기능"
M5  Phase 4c             "스터디"
M6  Phase 4d             "관리자 편집·업로드"       — 🔴 컷오버의 전제. M3 직후 우선 권장
M7  Phase 5              "공개 영역"
M8  Phase 7 + MIG-4      "검증·컷오버"             — Notion 읽기 전용화 → 최종 델타 → 전환 →
                                                    BE-36(Notion 코드 제거) → robots 개방 → 아카이브
```

- **컷오버 시점 원칙**: Notion 읽기 전용화(운영상 편집 중단)는 편집 UI(M6) 완성 후에만 —
  그 전에 닫으면 임원진이 아무것도 못 고친다. 권장 순서: M1→M2→M3→**M6**→(M4·M5·M7 병렬)→M8
- 병렬 여지: M4·M5·M7 상호 독립. **교차 엣지 3건 주의**: BE-44(M4)→BE-51(M5),
  BE-47(M5)→BE-56(M6), BE-41(M4)→BE-53(M6)
