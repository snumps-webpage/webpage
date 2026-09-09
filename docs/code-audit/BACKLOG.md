# 처리 사항 전체 목록

> **성격**: 한시적 작업 문서. [README](./README.md) 참조.
> **이 문서는 색인이다.** 위험 선행 11개에서 나온 지적 67건 전부를 한 표에 담고, 각각이
> 어디로 갔는지만 가리킨다. 판단 근거는 [REGISTER.md](./REGISTER.md), 순서는
> [PRIORITY.md](./PRIORITY.md), 파일별 원문은 `files/` 아래에 있다.
>
> 기준일: 2026-09-10 · 브랜치 `chore/code-audit-v2` (main 대비 15커밋)

## 요약

| 상태                        | 건수 |
| --------------------------- | ---- |
| ✅ 처리 완료                | 16   |
| P1 (삭제, 즉시)             | 6    |
| P2 (사용자에게 보이는 결함) | 5    |
| P3 (검증된 단일 소스 통합)  | 6    |
| P5 / 📌 계층 감사 이월      | 33   |
| ❌ 철회 · → 흡수            | 2    |

심각도 분포: 🔴 6 · 🟠 20 · 🟡 39 (+ ✅ 1, ❌ 1)

**🔴 6건은 전부 처리됐다.** 재검증에서 `CM-4`는 🟠로, `ZR-8`은 🟠로 내려갔고
`ZR-7`은 C-17 결정(프리렌더 전면 제거)으로 원인이 사라졌다.

---

## 전체 지적 — 67건

`상태` 열: ✅ 뒤는 근거 커밋 · `P*`는 [PRIORITY.md](./PRIORITY.md)의 항목 · 📌는 계층 감사 이월.

| ID      | 등급 | 내용                                                                                       | 상태               | 대상                                 |
| ------- | ---- | ------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------ |
| `UP-1`  | 🔴   | 회원의 포스터 업로드가 프로덕션에서 항상 403이다                                           | ✅ 54ebf92         | `api/uploads/presign/+server`        |
| `UP-2`  | 🟡   | 인가 분기 입력이 요청 본문이다 — 구조 문제이지 취약점은 아니다                             | 📌 이월            | `api/uploads/presign/+server`        |
| `UP-3`  | 🟡   | 요청 스키마가 이미 있는데 실제 전송 형태와 어긋나 있다                                     | 📌 이월            | `api/uploads/presign/+server`        |
| `UP-4`  | 🟡   | sanctioned accessor를 우회한다                                                             | 📌 이월            | `api/uploads/presign/+server`        |
| `UP-5`  | 🟡   | 회원 경로에 인증이 없다                                                                    | 📌 이월            | `api/uploads/presign/+server`        |
| `UP-6`  | 🟡   | 업로드 제약이 서버·클라이언트 두 곳에 하드코딩돼 있다                                      | P3-2               | `api/uploads/presign/+server`        |
| `CS-1`  | 🟠   | Bearer 검사 블록이 세 엔드포인트에 그대로 복제돼 있다                                      | P3-1               | `api/cron/sync-events/+server`       |
| `CS-2`  | 🟡   | 시크릿 비교가 상수 시간이 아니다                                                           | P3-1               | `api/cron/sync-events/+server`       |
| `CS-3`  | 🟠   | 모듈 최상위 등록이 테스트와 프로덕션의 스텝 목록을 갈라놓았다                              | 📌 이월            | `api/cron/sync-events/+server`       |
| `CS-4`  | 🟡   | 501을 401보다 먼저 반환해 설정 상태를 노출한다                                             | 📌 이월            | `api/cron/sync-events/+server`       |
| `CS-5`  | 🔴   | 크론이 전부 실패해도 `success: true`를 반환하고 dead-man's switch를 누른다                 | ✅ d9f7bb6         | `api/cron/sync-events/+server`       |
| `CS-6`  | 🟡   | 스텝 결과 키가 한 평면에서 충돌한다                                                        | P5                 | `api/cron/sync-events/+server`       |
| `CM-1`  | 🟠   | `sync-events`의 인증 블록 복제본                                                           | P3-1               | `api/cron/maintenance/+server`       |
| `CM-2`  | 🟡   | 시크릿 비교가 상수 시간이 아니다                                                           | P3-1               | `api/cron/maintenance/+server`       |
| `CM-3`  | 🟡   | GET이 파괴적·비멱등 부수효과를 낸다                                                        | 📌 이월            | `api/cron/maintenance/+server`       |
| `CM-4`  | 🔴   | 세 작업이 전부 실패해도 `success: true`를 반환하고 dead-man's switch를 누른다              | ✅ d9f7bb6 030408f | `api/cron/maintenance/+server`       |
| `CM-5`  | 🟡   | 외부 스케줄러에 주는 응답의 모양이 고정돼 있지 않다                                        | 📌 이월            | `api/cron/maintenance/+server`       |
| `HL-1`  | 🟠   | 인증 블록 복제본 (셋 중 셋째)                                                              | P3-1               | `api/health/+server`                 |
| `HL-2`  | 🟡   | 주석이 이 엔드포인트를 실제보다 넓게 부른다                                                | 📌 이월            | `api/health/+server`                 |
| `HL-3`  | 🟡   | `ok:false` 500이 원인을 구분하지 않는다                                                    | 📌 이월            | `api/health/+server`                 |
| `HL-4`  | 🟡   | keep-alive가 두 잡에 중복돼 있다                                                           | 📌 이월            | `api/health/+server`                 |
| `HL-5`  | 🟡   | `keepAliveSelect()`의 반환값이 죽은 신호다                                                 | 📌 이월            | `api/health/+server`                 |
| `HL-6`  | 🟡   | 200 본문이 아무것도 증명하지 않는다                                                        | 📌 이월            | `api/health/+server`                 |
| `QA-1`  | 🟡   | 세 엔드포인트가 같은 골격의 복사본이다                                                     | 📌 이월            | `api/admin/applications/+server`     |
| `QA-2`  | ❌   | 철회 — 전제가 거짓이었다                                                                   | ❌ 철회            | `api/admin/applications/+server`     |
| `QA-3`  | 🟡   | 정적 의존을 동적으로 부른다 — 한 파일에 세 번                                              | 📌 이월            | `api/admin/applications/+server`     |
| `QA-4`  | 🟡   | 헬퍼가 두 호출 맥락을 하나의 반환형에 섞었다                                               | 📌 이월            | `api/admin/applications/+server`     |
| `QA-5`  | 🟠   | 응답의 절반이 아무도 읽지 않는 신청자 PII다                                                | P1-1               | `api/admin/applications/+server`     |
| `QA-6`  | 🟡   | 403이 소비자에게서 사라진다                                                                | 📌 이월            | `api/admin/applications/+server`     |
| `QS-1`  | 🟡   | `study-requests`와 이름만 다른 동일 파일                                                   | 📌 이월            | `api/admin/seminar-requests/+server` |
| `QS-2`  | 🟡   | 동적 import — 이 파일 3회, 전이적으로 4회                                                  | 📌 이월            | `api/admin/seminar-requests/+server` |
| `QS-3`  | 🟡   | 403 본문 수기 작성                                                                         | 📌 이월            | `api/admin/seminar-requests/+server` |
| `QS-4`  | 🟡   | `directorySummaryIndex()`를 대기 건수와 무관하게 매번 부른다                               | ✅ 7f58fdf         | `api/admin/seminar-requests/+server` |
| `QS-5`  | 🟠   | `seminarRequests:` (20행)는 죽은 페이로드다                                                | P1-1               | `api/admin/seminar-requests/+server` |
| `QD-1`  | 🟡   | `seminar-requests`와 이름만 다른 동일 파일                                                 | 📌 이월            | `api/admin/study-requests/+server`   |
| `QD-2`  | 🟡   | 동적 import 3회(심볼 4개) · 403 본문 수기 작성                                             | 📌 이월            | `api/admin/study-requests/+server`   |
| `QD-3`  | 🟠   | `studyRequests:` (20행)는 죽은 페이로드다                                                  | P1-1               | `api/admin/study-requests/+server`   |
| `QD-4`  | 🟠   | 이 큐의 item 형태는 세미나 큐와 대칭이 아니다                                              | 📌 이월            | `api/admin/study-requests/+server`   |
| `QD-5`  | 🟡   | `directorySummaryIndex()`가 이 큐에서는 목적과 무관하다                                    | ✅ 7f58fdf         | `api/admin/study-requests/+server`   |
| `ZA-1`  | 🟠   | `isAdmin: true`는 리터럴이고, `isMember: true`는 **지금 거짓이다**                         | P1-2               | `(admin)/+layout.server`             |
| `ZA-2`  | 🟡   | → ZA-1에 흡수                                                                              | → ZA-1             | `(admin)/+layout.server`             |
| `ZA-3`  | 🟠   | 이 파일은 루트 레이아웃과 중복이고, 소비자가 없으며, 유일한 효과가 오답이다                | P1-2               | `(admin)/+layout.server`             |
| `ZA-4`  | 🟡   | 같은 요청에서 세션을 세 번 해석한다                                                        | P1-2               | `(admin)/+layout.server`             |
| `ZP-1`  | 🟡   | 같은 요청에서 신청 테이블을 두 번(`/signup`에서는 세 번) 읽는다                            | 📌 이월            | `(applicant)/+layout.server`         |
| `ZP-2`  | 🟡   | 레이아웃 계층에 오류 처리 규약이 없다                                                      | 📌 이월            | `(applicant)/+layout.server`         |
| `ZP-3`  | 🟠   | `isMember`가 여섯 곳에서 생산되고 한 곳에서만 소비된다                                     | P2-1               | `(applicant)/+layout.server`         |
| `ZP-4`  | 🟠   | 재가입 신청자가 자기 대기 페이지에 들어갈 수 없다                                          | P2-1               | `(applicant)/+layout.server`         |
| `ZP-5`  | 🟡   | 세션과 email을 `locals` 대신 새로 구한다                                                   | 📌 이월            | `(applicant)/+layout.server`         |
| `ZM-1`  | 🟡   | 회원 페이지 로드마다 events 배열 전체를 훑는다                                             | ✅ 4692ce6         | `(member)/+layout.server`            |
| `ZM-2`  | 🟠   | 빈 catch가 데이터 계층의 의도적 시끄러움을 취소한다                                        | 📌 이월            | `(member)/+layout.server`            |
| `ZM-3`  | 🟠   | `isMember: true`가 가드가 보장하지 않는 것을 주장한다                                      | P2-1               | `(member)/+layout.server`            |
| `ZM-4`  | 🟡   | `memberId` 없음이 조용히 통과한다                                                          | ✅ 4692ce6         | `(member)/+layout.server`            |
| `ZM-5`  | 🔴   | `isPresenter`를 계산하는 블록 전체가 죽어 있고, 주석은 거짓이다                            | ✅ 4692ce6 030408f | `(member)/+layout.server`            |
| `ZM-6`  | 🟠   | 발표자 판정식이 서비스에서 복사돼 왔다                                                     | ✅ 4692ce6         | `(member)/+layout.server`            |
| `ZM-7`  | 🟡   | 상태 필터가 없어 발표자 자격이 만료되지 않는다                                             | ✅ 4692ce6 030408f | `(member)/+layout.server`            |
| `ZM-8`  | 🟡   | 세션 재해석                                                                                | ✅ 7f58fdf         | `(member)/+layout.server`            |
| `ZR-1`  | 🟠   | `dataAvailable: true`는 거짓이 될 수 없는 필드다                                           | 📌 이월            | `(public)/archive/+layout.server`    |
| `ZR-2`  | 🟠   | 갤러리 세 블록이 같은 모양의 복사본이다                                                    | 📌 이월            | `(public)/archive/+layout.server`    |
| `ZR-3`  | 🟠   | KST 오프셋이 **세 곳**에 있다                                                              | 📌 이월            | `(public)/archive/+layout.server`    |
| `ZR-4`  | 🟠   | `1970-01-01` 폴백은 데이터 결함이 아니라 **스키마 불일치가 정상 데이터에서 발동**한 것이다 | P2-2               | `(public)/archive/+layout.server`    |
| `ZR-5`  | 🟡   | 테이블 읽기 9회 / 고유 테이블 7개                                                          | P5                 | `(public)/archive/+layout.server`    |
| `ZR-6`  | 🟠   | 공개 로드가 `seminar-requests` 운영 테이블을 읽는다                                        | 📌 이월            | `(public)/archive/+layout.server`    |
| `ZR-7`  | 🔴   | 공개 스냅샷이 프리렌더 정적 HTML에 구워지고, 그것은 캐시 실드 밖이다                       | ✅ d0dbbdd         | `(public)/archive/+layout.server`    |
| `ZR-8`  | 🔴   | 공개 아카이브의 금지 키 테스트가 실제 렌더 경로를 덮지 않는다                              | ✅ e0def1b         | `(public)/archive/+layout.server`    |
| `ZR-9`  | ✅   | 탈퇴 필터가 세 이름 표면 중 하나만 덮는다                                                  | ✅ C-16            | `(public)/archive/+layout.server`    |
| `ZR-10` | 🟡   | 원시 S3 키를 요소 id로 게시한다                                                            | 📌 이월            | `(public)/archive/+layout.server`    |
| `ZR-11` | 🟡   | `project-${index}`는 불안정한 리스트 키다                                                  | 📌 이월            | `(public)/archive/+layout.server`    |

---

## 지적 밖의 처리 사항

파일별 지적으로는 잡히지 않았지만 처리 대상인 것들.

### 교차 발견 (`CROSS-CUTTING.md`)

| ID      | 내용                                                                               | 상태                                    |
| ------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| `XC-0`  | 이전 감사 `X-1`(빌드 불가)은 이관으로 해소                                         | ✅ 확인만                               |
| `XC-1`  | **`main`이 자기 CI lint를 통과하지 못한다** (14 errors / 8 파일)                   | **P0-1 · P0-2**                         |
| `XC-2`  | CI가 `check`·`build`를 돌리지 않는다. `prettier`는 추적 파일 131개 실패            | **P0-3**                                |
| `XC-3`  | `pnpm-lock.yaml`은 gitignore인데 안 쓰는 `package-lock.json` 4,459줄이 커밋돼 있다 | 📌 A3 설정 감사                         |
| `XC-4`  | `sync-events` 스케줄러가 문서상 미완 상태로 하루 1회                               | 📌 운영 항목(결함 아님)                 |
| `XC-5`  | `.claude/`가 lint 기준선을 220배 부풀렸다                                          | ✅ `3cf649a`                            |
| `XC-6`  | api 존이 주체를 해석하지 않는데 엔드포인트가 `locals.member`를 읽는다              | ✅ `54ebf92`                            |
| `XC-7`  | 엔드포인트 계층에 공통 래퍼가 없다                                                 | **P3-1** (403 부분은 REGISTER A-1 참조) |
| `XC-8`  | 크론이 아무것도 못 해도 성공을 보고하고 dead-man's switch를 누른다                 | ✅ `d9f7bb6` `030408f`                  |
| `XC-9`  | 소비자 없는 계산·페이로드 5곳                                                      | ✅ 3곳 / **P1** 2곳                     |
| `XC-10` | 레이아웃 데이터 필드가 부모–자식 체인 안에서 다르게 정의된다                       | **P2-1**                                |
| `XC-11` | `skipLibCheck`가 `app.d.ts`를 검사 밖에 둔다 — 삭제된 모듈 참조가 살아 있다        | 📌 A3 설정 감사                         |

### H 3관점 교차 검토가 부수로 찾은 것

파일별 지적 번호가 없다. 전부 A-a·A-b 계층 감사에서 만난다.

| 발견                          | 요지                                                                       | 상태     |
| ----------------------------- | -------------------------------------------------------------------------- | -------- |
| `withCache` 무효화 유실       | 읽기가 삭제된 뒤 낡은 값을 Redis에 다시 쓴다 → 최대 300초 전 인스턴스 오염 | **P5**   |
| `cleanupStaging` 무효         | 비재귀 `.list(prefix)`라 실제로는 아무것도 안 지울 수 있다                 | **P5**   |
| `maxDuration` 부재            | 주간 백업이 중간에 죽는 경로                                               | **P5**   |
| `uploadToBackups` lost update | `upsert: true`, CAS 없음                                                   | **P5**   |
| 크론·헬스 라우트 3개 테스트 0 | §5-3 불변식("성공 경로에서만 ping")이 미검증                               | **P4-1** |
| 발표자 판정 상태 축 미검증    | 이 공백이 실제로 회귀를 통과시켰다                                         | **P4-2** |

### 이미지 서빙 (`REGISTER.md` K절)

| ID          | 내용                                                                                                                                                                 | 상태         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `K-1`       | 포스터가 최적화를 통과하지 않았다 (공개·관리자 2곳)                                                                                                                  | ✅ `0d6b2af` |
| `K-2`       | `ASSETS_CDN_URL` 미설정 시 플레이스홀더 대신 깨진 이미지                                                                                                             | **P5**       |
| `ZR-1` 형제 | `/members`·`/about/executives`가 데이터 계층 장애 시 오류 페이지 — 각 로드가 try 없이 읽고 `dataAvailable: true` 리터럴을 반환한다. **배포 상태와 동일한 기존 결함** | **P2-3**     |
| 폴백 문구   | 5개 소비자의 else가 "데이터 이관 후 기록이 표시됩니다" — 이관을 말하지 장애를 말하지 않는다                                                                          | 📌           |

### 결정 대기

| #        | 질문                                                | 막는 것        |
| -------- | --------------------------------------------------- | -------------- |
| **C-15** | `src/lib/client/**`·`src/lib/domain/**`의 분리 기준 | A-c 리뷰, P3-2 |
| C-12     | `scripts/migration/**` 존치 여부                    | A4 범위        |
| C-13     | `docs/**` 중 이관 전 작성분의 현행성                | 별도 트랙      |
| C-14     | `.env.example` 대 실제 사용 변수                    | 별도 트랙      |

### 감사 자체의 남은 범위

| 계층                    | 규모             | 상태        |
| ----------------------- | ---------------- | ----------- |
| A-a 데이터·코어         | 38파일 / 1,837줄 | ⏸ 미착수    |
| A-b 서비스·가드·메일    | 27파일 / 4,590줄 | ⏸           |
| A-c 도메인 (+테스트 12) | 26파일 / 2,873줄 | ⏸ C-15 선행 |
| A-d 진입점              | 4파일 / 231줄    | ⏸           |

**진행률 11/98 (11.2%).**
