# M1–M6 구현 평가 (2026-08-30)

방법: 독립 리뷰 2계열 병렬 — ① 정확성(멀티 테이블 흐름 전수 추적·경합·가드) ② 설계 품질(중복·응집·비대칭).
판정 원칙: **"콩팥 하나로 생존한다고 콩팥 하나가 정상은 아니다"** — 미사용이라는 이유만으로 제거 판정하지 않고,
의도된 구조 장기 / 누락 장기 / 중복 장기를 구분해 평가.

## 총평

**골격은 건전하다. 재설계 불요.** 단일 데이터 계약(getTable/mutate + 조건부 쓰기 + 시끄러운 봉투 검증),
이름 있는 단일 병합 규칙, 단일 멱등 관용구(ensureCreated), 순수 함수 존 가드 + 레지스트리 테스트,
스펙 정합 감사 커버리지, 최소 권한 인프라 — 전부 제자리에 있다.

문제는 **경계 패혈증**: 결함 대부분이 라우트가 계약과 만나는 지점에 몰려 있다. 그리고 치명 1건 —
**쓰기 경로의 스키마 미검증** — 은 데이터 계층 자체의 방어선 구멍이다.

## 🔴 치명 (즉시 수정)

| # | 결함 | 위치 | 실패 시나리오 |
|---|---|---|---|
| C1 | **포이즌 필 쓰기** — `mutate`가 PUT 전에 스키마 검증을 안 함. 읽기는 엄격 검증하므로 **불량 쓰기 1회가 테이블을 영구 브릭** (앱 경로로 복구 불가) | `data/tables.ts` encode vs decode 비대칭 | ① 편집 액션들의 `{...row, ...patch}` 스프레드가 `undefined`로 필수 필드 삭제 ② 관리자가 이름 빈칸 저장 → `min(1)` 위반 → **members 테이블 전면 500 + resolveMember가 조용히 레거시로 강등** ③ `kstInputToIso`가 오입력에 `NaN-NaN-...` 배출 — 일정 textarea 한 줄 오타로 studies 브릭 |
| C2 | 스터디 승인/거절 통지가 **세미나용 템플릿** 재사용 — "신청하신 세미나 '<스터디명>'" | admin `notifyRequester` → `sendSeminarStatusNotification` | 사용자 가시 오문구 |
| C3 | assets 버킷 **`s3:ListBucket` 누락** → 미존재 pending 키 HeadObject가 404 아닌 403 → 승격이 `NOT_FOUND` 대신 **raw 500**. 7일 수명주기가 이 케이스를 보장 발생시킴 | `infra/iam.tf` (data 버킷엔 동일 함정 문서화·수정돼 있음 — assets 쪽이 누락 콩팥) | 정리된 업로드 등록 시 500 |
| C4 | `/admin/events/new`의 **레거시 레이아웃 가드** — env 명단 `isAdmin`으로 D4 관리자를 차단 | `events/new/+layout.server.ts` | `setAdmin`으로 권한 받은 관리자가 이벤트 생성 불가 |

## 🟠 중요 (M8 전 수정)

- **M1** finished 스터디 부활 가능 — `setStudyStatus` 전이 가드 없음 (`finished` 이탈 차단 필요). 스펙 §6-4 위반.
- **M2** 취소 회차가 그 일시를 **영구·조용히 봉쇄** — `ensureCreated` 복합 키가 cancelled 이벤트를 반환, 재생성 성공처럼 보고. → cancelled 발견 시 `CONFLICT` 또는 키 솔트.
- **M3** `approveSeminar` **동시 이중 실행 → 전 회원 공지 2회** — pending 검사가 캐시 읽기라 15s 스테일 창에서 둘 다 통과. → 상태 플립을 mutate 내부 CAS로 먼저, 실제 전이했을 때만 발송.
- **M4** 가입 거절 통지 미발송 — `rejectApplication`이 email을 반환하는데 액션이 버림. **행 삭제 후엔 영구 발송 불가.**
- **M5** `updateSession`이 이벤트만 수정 — 짝 activity·schedule·복합 키 비동기화 → 아카이브 학기 오분류 + 이동 일시 중복 생성.
- **M6** `setOrganizer` 대상 미검증 — 유령/탈퇴 유예 회원을 단독 주최자로 지정 가능 → 관리 불능 스터디 + 탈퇴 불변식 역방향 붕괴.
- **M7 오류 계약 혼합** — 한국어 `throw new Error`가 `fail(500, {error: "<문장>"})`로 (signup·apply 최다 트래픽 폼), connect는 `fail()` 없는 success-shaped 에러, events/new는 래퍼 없는 액션(AppError가 raw 500). §1-2 "클라이언트가 코드 매핑" 약속 파손.
- **M8 원시 row 유출** — `{...r, speakerIds: …}` 스프레드 8곳이 `attachment`·`requesterId` 등 내부 필드를 클라이언트로. 부록 3(pick 파생 강제) 위반. → 레코드별 `toLegacyView()` 단일화로 중복 제거 겸 봉인.
- **M9 발표자 가드 중복 장기** — `ensurePresenter`(auth-guards, 호출 0) vs 서비스 인라인 검사(더 강함 — isSeminarType 포함). 권한 깊이도 비대칭(발표자=서비스, 주최자=라우트). → 소유자 1곳 확정(서비스 레벨 권장), 주최자도 동일 규약.
- **M10 쌍둥이 래퍼** — `handleUserAction`/`handleAdminAction` 60줄 동일 본문. 오류 계약 수정마다 2회 반영 강제. + `fail` 동적 import 6회 노이즈.
- **M11 기계적 정리 묶음** — 파일 필드 setter 삼중(`setSeminarFiles`/`setStudyPhotos`/`setGalleryPhotos`), 액션 컨텍스트 수기 주석 ~30곳(`Actions` 타입 미사용), 동적 import 무규칙(같은 파일 정적+동적 동시 존재 1건), `/diag` 레거시 admin 판정, 30일 상수 2곳.
- **M12 테스트 구멍** — `records-admin`(setAttendees·참조 무결성 삭제)·`uploads`(승격 거부 로직) 테스트 부재.
- **M13 인프라** — `outputs.tf` 부재(운영자가 콘솔 발굴 강제 — ROLE_ARN·버킷명), trail 버킷 수명주기 없음(무한 누적), state 버킷 미결.

## 🟡 낮음

체크인 코드 불일치 시 404보다 403 선반환(존재 누출) · cron expire 카운트가 재시도 시 인플레 ·
대시보드 `canApply`가 `effectiveStatus` 미사용(lazy 만료 이벤트에 신청 버튼 노출→에러) ·
`?semester=` 쿼리 미구현(§4-5) · Bcc 모드 `To:` 헤더 생략(스팸 점수) · `sessionNo` 동시 생성 중복 가능(표시용) ·
템플릿 메일 실패가 `mailFailed`로 미표면 · `acceptTransfer` 오류 코드 NOT_FOUND(스펙 FORBIDDEN).

## ✅ 콩팥 판정 — 보존 (제거 금지)

| 장기 | 판정 |
|---|---|
| `resolve-member` 레거시 폴백 | 의도된 전환기 장기. M3 컷오버 TODO 명시됨 |
| `invalidateAttendanceCaches`의 레거시 키 | 레거시 대시보드가 읽는 키 — 전환기 장기. approveSeminar의 "미호출"은 신 스택에서 무해 — **고치지 말 것**. 컷오버 때 함수째 제거 |
| `withdrawal.auto-anonymize` 감사 액션 예약 | 보류 기능의 계획된 장기 |
| `data/repos.ts` | 계층이 아니라 헬퍼 — 서비스의 getTable 직접 사용은 규약 준수. 강제 경계로 키우지 말 것 |
| `services/events.ts` 382줄 | 밴딩 양호·공유 불변식 — 지금 분할하면 순환. 차기 크론 스텝 작성 시 `services/cron.ts`만 분리 |
| mail 3층(templates/announcements/client) | 경계 문서화 완료 — 건전 |
| 스터디 신청 수정 부재 | 스펙이 의도한 비대칭(§6-2 withdraw만 대칭) — 누락 장기 아님 |
| `getPendingAttendance`의 큐 N+1 | 현 규모 무해. 이벤트 수백 개 도달 전 정리 훅/인덱스 — **지금 만들지 말 것** (성장 곡선만 마킹) |

## ✅ 추적 후 정상 확인

mutate/mutateQueue 재시도 전체(409/412/404·부트스트랩·no-op 스킵) · ensureCreated 동시성(mutate 내부 재검사) ·
승인 체인 3종 중간 크래시 재실행 · 회차 복합 키 멱등(수동+크론) · 병합 규칙과 역반영 · lazy 만료 게이트 ·
탈퇴 수명주기 전체(리디렉트 루프 없음) · 존 가드·레지스트리 · 전달 경합의 mutate 직렬화 ·
신청 이메일 정규화 일관성 · Bcc 배치·옵트아웃 · 크론 fail-closed · 업로드 검증 체인 · 캐시 계층.

## 권고 수순

1. **즉시**: C1(mutate 쓰기 검증 — 한 줄 방어선 + 라우트 undefined 정리) · C2 · C3 · C4
2. **정리 패스 (1~2일, M7 전 권장)**: M1~M13 — 특히 오류 계약 스윕과 뷰 매핑 단일화는 **이후 라우트가 복제할 관용구를 바로잡는 것**이라 빠를수록 이득
3. 낮음 그룹은 해당 파일 다음 접촉 시
