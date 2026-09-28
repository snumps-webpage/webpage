# 계층 감사 결과 (A-a · A-b · A-c · A-d) — 2026-09-28

> **성격**: 한시적 작업 문서. [README](./README.md) 참조. 파일별 근거는 `files/` 아래 문서 하나당 파일 하나.

## 범위와 방법

- **대상**: [SCOPE.md §9](./SCOPE.md)의 "안 나(계층 우선)" — 기준 커밋 `4fba767` 시점의 트리로 다시 셌다.
  P3~P5에서 픽스처·중복이 지워지고 SQL 흐름이 생겨 원래 목록(98파일)과 달라졌다.
  - A-a 데이터·코어 44개 — 코어 9, 저장 스키마 19, 데이터 계층 13, **SQL 마이그레이션 3**(흐름 함수가 운영 코드라서 편입)
  - A-b 서비스·가드·메일 32개
  - A-c 도메인 17개(짝 테스트와 함께 읽음)
  - A-d 진입점 4개
  - 테스트 전용 헬퍼(`expect-tables-valid`, PGlite 스냅숏·워밍업 설정)는 제외
- **절차**: 16개 묶음. 묶음마다 **검토 에이전트**가 파일 하나당 문서 하나를 쓰고, 별도의 **검증 에이전트**가
  각 문서의 지적을 코드와 대조했다(줄번호·인과·등급·중복·누락). 주장 다수는 PGlite 위 일회용 테스트로
  **실제로 재현**했다. 등급 판정은 README의 "판정 기준"(도달성·현재 데이터는 감면 근거가 아니다)을 따랐다.
- **접두사**: `L{A|B|C|D}{nn}-` — 계층 문자 + 파일 번호. 동결된 접두사와 겹치지 않는다(README 표).

## 숫자

|          | 🔴    | 🟠      | 🟡      | 계      |
| -------- | ----- | ------- | ------- | ------- |
| A-a      | 4     | 24      | 100     | 128     |
| A-b      | 3     | 59      | 122     | 184     |
| A-c      | 1     | 16      | 51      | 68      |
| A-d      | 0     | 1       | 18      | 19      |
| **합계** | **8** | **100** | **291** | **399** |

검증이 철회한 지적 15건은 문서에 취소선으로 남아 있고 위 숫자에서 뺐다. 교차 참조로 "새로 세지 않는다"고
표시한 중복 몇 건은 위 숫자에 들어 있다 — 숫자는 문서 제목 기준이고, **결함 기준으로는 더 적다**(아래).

## 🔴 — 결함 기준 5건 (문서 기준 8건)

| #   | 결함                                                                                                                                                                                                                                                                                                                                                     | 문서                                                                                         | 재현                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | **SQL 흐름이 zod 쓰기 게이트를 건너뛴다** — 공개된 세미나의 일정 수정·스터디 회차 생성이 검사 안 된 값을 커밋하고 그 뒤에 파싱한다. `24:00`, `02-30`(다른 날짜로 굴러감), 1000년 이전 연도(`toKstIso`가 네 자리로 채우지 않음)가 들어가면 **`seminars`/`activities`/`events` 표 전체가 읽히지 않는다.** 두 번째 경로는 일반 회원(스터디 개설자)이 닿는다 | `core/time.md` LA09-1·LA09-5, `schemas/seminar.md` LA26-2, `domain/admin-seminars.md` LC04-1 | PGlite + 실제 관리자 액션 |
| 2   | **관리자가 로그인 이메일을 중복으로 만들 수 있다** — 한 회원의 Google 로그인이 다른 회원 레코드(관리자 권한 포함)로 풀린다                                                                                                                                                                                                                               | `services/members-admin.md` LB25-1                                                           | 일회용 테스트             |
| 3   | **현 회장단의 전화 공개 거부가 legacy 번호로 우회된다** — 재가입한 임원이 공개를 거부해도 옛 아카이브의 번호가 모든 페이지에 나간다                                                                                                                                                                                                                      | `public/archive.md` LB16-1                                                                   | 일회용 테스트             |
| 4   | **메일 규칙 "제거"가 아무것도 바꾸지 않는다** — 이벤트의 마지막 규칙을 지우면 0행 = "기본값 사용"이 되어 기본 메일이 다시 나간다. 꺼 둔 규칙을 지워도 켜진 채로 되살아난다                                                                                                                                                                               | `services/mail-admin.md` LB23-1                                                              | 일회용 테스트             |
| 5   | **레거시 세미나에 "공지 재발송"을 누르면 활동·이벤트가 복제된다** — 공개 흐름이 앵커만 보고 `activityId` 연결을 무시해, 세미나가 새 활동을 가리키고 옛 이벤트는 취소에도 `active`로 남는다. 옛 TS에서 그대로 옮긴 결함                                                                                                                                   | `migrations/20260928000000_atomic_flows.md` LA43-1(= `services/seminars.md` LB30-5)          | PGlite                    |

#1과 #5는 이 브랜치의 P4(원자적 흐름)와 직접 얽혀 있다 — #1은 흐름이 쓰기 게이트 밖에 있다는 구조에서,
#5는 옛 코드의 결함을 충실히 옮긴 데서 나왔다.

## 🟠 — 주제별로 본 100건

파일 문서를 다 읽지 않고 방향을 잡기 위한 묶음이다. 대표 지적만 적는다.

- **운영 안전**: 메모리 백엔드(PGlite, 실행 파일 17MB)가 운영 번들에 들어가고 운영에서 `memory`를 거부하는
  장치가 없다(LA40-1·LA35-1). 주간 백업이 출석 큐·감사 로그를 빠뜨리고, 표를 하나씩 읽어 스냅숏이 아니며,
  일요일을 놓치면 따라잡지 않는다(LB24-1·2·4). `assets` 버킷이 새 환경에서 공개로 만들어진다(LA42-1).
- **보안·개인정보**: 관리자 테스트 발송 주소로 헤더 주입(Bcc 추가, LB23-6 = LB10-1). 탈퇴 중인 회원의
  capability 계산 오류(LA02-1 = LB05-1). 탈퇴한 회원을 임원으로 지정 가능 → 공개 명단·전화(LB22-2).
  공개 프로젝트 링크·관리자 첨부 링크에 스킴 검사 없음(`javascript:`, LC13-1·LA29-7).
- **메일 정확성**: 부분 실패 후 재시도가 전원에게 다시 보낸다(LB11-1). 규칙·템플릿 읽기 실패 시 꺼 둔 메일이
  나간다(LB11-2·LB13-1). `announcedAt`이 "보냄"과 "지난 일정이라 생략"을 겸해 엉뚱한 변경·취소 메일이 나간다(LB30-1).
- **흐름 계약**: SQL 가드가 인자 누락 시 가장 파괴적인 분기로 간다(LA43-2). 출석 거절이 다른 근거로도 정당한
  출석 인정을 지운다(LA43-3). `ATOMIC-FLOWS.md`가 "고정됐다"고 한 SQL 미러 중 실제로 TS와 대조되는 것은 둘뿐(LA43-4).
- **캐시 읽기로 판단 후 통째로 쓰기**: 임원 지정, 메일 규칙 편집, 스터디 반려·인계, 자산 정리, 발표자 출석
  저장 — 결정이 CAS 밖에서 낡은 캐시로 내려진다(LB22-1·LB23-2·LB31-5·LB18-1·LB20-2).
- **규칙이 화면·도메인에만 있고 서비스 쓰기 경로에는 없음**: 끝난 스터디의 불변, 상태 전이, 취소된 회차의
  활동 숨김, 체크인 폼 가드(LB31-1·2·3, LB06-1·LB06-5).
- **가드와 SvelteKit 프로토콜**: 가드의 303/403 응답이 액션 결과 형식이 아니라 enhance 폼이 오류 페이지나
  무반응으로 끝난다(LD01-1, 재현).

## 교차 패턴 (여러 묶음이 독립적으로 짚은 것)

1. **테스트가 지키는 죽은 사본** — 운영은 다른 규칙으로 돌고, 초록 테스트는 쓰이지 않는 사본을 지킨다:
   유예 기간(30일 vs 1개월), `mergeManagedAttendance`, `nextStudyStatuses`, `seminarSchedulesEqual`,
   `route-policy.ts`, `upload-validation.ts`.
2. **같은 규칙의 여러 사본** — 세미나 숨김 판정 7곳, 회원 상태 집합 4곳, 이메일 정규화 7곳,
   `{id,name,department}` 투영 6곳, KST 오프셋 상수 4곳, 학기 패턴 사본.
3. **legacy id 매핑** — S9 재가입 회원의 옛 id를 아는 곳(가드·디렉터리)과 모르는 곳(서비스·SQL)이 갈려
   개인정보(#3)·권한(LB02-6)·표시(LB16-4) 결함이 한 뿌리에서 나온다.
4. **닫힌 집합을 `Record<string,…>`과 `in`으로 다룸** — `constructor`·`toString`이 키로 통과(LB23-4·LB32-1).
5. **주석이 코드보다 많이 약속** — "단일 정의", "항상 `{error}`", "zone.test가 강제", "생성 순서" 등.

## 다음 (이 문서를 닫는 조건)

- ~~🔴 5건은 결함 기준으로 이번 세션에서 고친다~~ — 처리됨(아래 표).
- ~~🟠 중 이 브랜치의 변경이 만든 것도 함께 고친다~~ — 처리됨. 🔴·🟠 110건 모두 처리했다(결정 대기였던 것은 2026-09-28 사용자 결정대로).
- 🟡 291건은 손대지 않았다 — [PRIORITY.md](./PRIORITY.md)의 W-작업으로 옮길 후보다.

## 처리 현황 (2026-09-28, `6ab4f33..HEAD`)

🔴·🟠 110건 중 **110건 처리**. 커밋 메시지가 ID를 인용하지 않은 처리(중복·함의)는 수작업으로 대조해 넣었다.
결정 대기였던 9건은 2026-09-28 사용자 결정대로 처리했다(`2f84aee`·`73d44f3`·`cc30746` — LA01-3은 결정대로 문서만).

| ID     | 등급 | 문서                                                 | 처리 커밋            | 상태 |
| ------ | ---- | ---------------------------------------------------- | -------------------- | ---- |
| LD01-1 | 🟠   | `src/hooks.server.md`                                | `2ad2f5a`            | 처리 |
| LC01-1 | 🟠   | `src/lib/domain/account.md`                          | `7a38677`            | 처리 |
| LC01-3 | 🟠   | `src/lib/domain/account.md`                          | `70aa027`            | 처리 |
| LC02-1 | 🟠   | `src/lib/domain/admin-dashboard.md`                  | `c1d863e`            | 처리 |
| LC02-2 | 🟠   | `src/lib/domain/admin-dashboard.md`                  | `c1d863e`            | 처리 |
| LC03-1 | 🟠   | `src/lib/domain/admin-records.md`                    | `c1d863e`            | 처리 |
| LC04-1 | 🔴   | `src/lib/domain/admin-seminars.md`                   | `d124b96`            | 처리 |
| LC04-2 | 🟠   | `src/lib/domain/admin-seminars.md`                   | `6f1eaa0`            | 처리 |
| LC07-1 | 🟠   | `src/lib/domain/dashboard.md`                        | `70aa027`            | 처리 |
| LC07-5 | 🟠   | `src/lib/domain/dashboard.md`                        | `70aa027`            | 처리 |
| LC08-1 | 🟠   | `src/lib/domain/executive-roster.md`                 | `e734279`            | 처리 |
| LC09-3 | 🟠   | `src/lib/domain/form-data.md`                        | `449ea27`            | 처리 |
| LC11-1 | 🟠   | `src/lib/domain/members.md`                          | `2f84aee`            | 처리 |
| LC11-2 | 🟠   | `src/lib/domain/members.md`                          | `2f84aee`            | 처리 |
| LC11-3 | 🟠   | `src/lib/domain/members.md`                          | `2f84aee`            | 처리 |
| LC11-4 | 🟠   | `src/lib/domain/members.md`                          | `70aa027`            | 처리 |
| LC10-1 | 🟠   | `src/lib/domain/membership-applications.md`          | `70aa027`            | 처리 |
| LC13-1 | 🟠   | `src/lib/domain/public-content.md`                   | `1812d39`            | 처리 |
| LC15-1 | 🟠   | `src/lib/domain/seminars.md`                         | `5112ccf`            | 처리 |
| LB02-1 | 🟠   | `src/lib/server/auth-guards.md`                      | `8d9e3ef`            | 처리 |
| LB02-2 | 🟠   | `src/lib/server/auth-guards.md`                      | `8d9e3ef`            | 처리 |
| LB02-6 | 🟠   | `src/lib/server/auth-guards.md`                      | `fdd06e3`            | 처리 |
| LB03-1 | 🟠   | `src/lib/server/cache.md`                            | `70e359e`            | 처리 |
| LB03-2 | 🟠   | `src/lib/server/cache.md`                            | `70e359e`            | 처리 |
| LB03-3 | 🟠   | `src/lib/server/cache.md`                            | `70e359e`            | 처리 |
| LB03-4 | 🟠   | `src/lib/server/cache.md`                            | `70e359e`            | 처리 |
| LB03-5 | 🟠   | `src/lib/server/cache.md`                            | `70e359e`            | 처리 |
| LA01-3 | 🟠   | `src/lib/server/core/admin-bootstrap.md`             | `cc30746`            | 처리 |
| LA02-1 | 🟠   | `src/lib/server/core/capabilities.md`                | `3e6b3ab`            | 처리 |
| LA09-1 | 🔴   | `src/lib/server/core/time.md`                        | `d124b96`            | 처리 |
| LA09-5 | 🔴   | `src/lib/server/core/time.md`                        | `d124b96`            | 처리 |
| LA29-1 | 🟠   | `src/lib/server/data/admin-queue-views.md`           | `449ea27`            | 처리 |
| LA29-2 | 🟠   | `src/lib/server/data/admin-queue-views.md`           | `03c4374`            | 처리 |
| LA30-1 | 🟠   | `src/lib/server/data/audit.md`                       | `2f84aee`            | 처리 |
| LA32-1 | 🟠   | `src/lib/server/data/flows.md`                       | `849d33b`            | 처리 |
| LA32-2 | 🟠   | `src/lib/server/data/flows.md`                       | `849d33b`            | 처리 |
| LA21-1 | 🟠   | `src/lib/server/data/schemas/member.md`              | `70aa027`            | 처리 |
| LA21-2 | 🟠   | `src/lib/server/data/schemas/member.md`              | `03925bb`, `1812d39` | 처리 |
| LA22-3 | 🟠   | `src/lib/server/data/schemas/private-info.md`        | `6c9a334`            | 처리 |
| LA26-1 | 🟠   | `src/lib/server/data/schemas/seminar.md`             | `52c2bbc`            | 처리 |
| LA26-2 | 🔴   | `src/lib/server/data/schemas/seminar.md`             | `d124b96`            | 처리 |
| LA38-1 | 🟠   | `src/lib/server/data/storage.md`                     | `8bbf956`            | 처리 |
| LA38-2 | 🟠   | `src/lib/server/data/storage.md`                     | `8bbf956`            | 처리 |
| LA40-1 | 🟠   | `src/lib/server/data/store.md`                       | `565e461`            | 처리 |
| LA40-2 | 🟠   | `src/lib/server/data/store.md`                       | `54b0881`            | 처리 |
| LA35-1 | 🟠   | `src/lib/server/data/supabase.md`                    | `565e461`            | 처리 |
| LA41-1 | 🟠   | `src/lib/server/data/tables.md`                      | `849d33b`            | 처리 |
| LA41-2 | 🟠   | `src/lib/server/data/tables.md`                      | `849d33b`            | 처리 |
| LA41-3 | 🟠   | `src/lib/server/data/tables.md`                      | `849d33b`            | 처리 |
| LA36-1 | 🟠   | `src/lib/server/data/views.md`                       | `23692a4`            | 처리 |
| LB05-1 | 🟠   | `src/lib/server/guards/resolve-member.md`            | `3e6b3ab`            | 처리 |
| LB06-1 | 🟠   | `src/lib/server/guards/zone.md`                      | `8b34553`            | 처리 |
| LB06-5 | 🟠   | `src/lib/server/guards/zone.md`                      | `8b34553`            | 처리 |
| LB10-1 | 🟠   | `src/lib/server/mail/client.md`                      | `496126c`            | 처리 |
| LB11-1 | 🟠   | `src/lib/server/mail/dispatch.md`                    | `529665f`            | 처리 |
| LB11-2 | 🟠   | `src/lib/server/mail/dispatch.md`                    | `26f3bdf`            | 처리 |
| LB11-3 | 🟠   | `src/lib/server/mail/dispatch.md`                    | `710e3d0`            | 처리 |
| LB12-1 | 🟠   | `src/lib/server/mail/events.md`                      | `336d036`            | 처리 |
| LB13-1 | 🟠   | `src/lib/server/mail/template-store.md`              | `26f3bdf`            | 처리 |
| LB14-1 | 🟠   | `src/lib/server/mail/templates.md`                   | `73d44f3`            | 처리 |
| LB16-1 | 🔴   | `src/lib/server/public/archive.md`                   | `a1f3949`            | 처리 |
| LB16-2 | 🟠   | `src/lib/server/public/archive.md`                   | `a1f3949`            | 처리 |
| LB16-3 | 🟠   | `src/lib/server/public/archive.md`                   | `2f84aee`            | 처리 |
| LB16-4 | 🟠   | `src/lib/server/public/archive.md`                   | `e734279`            | 처리 |
| LB16-5 | 🟠   | `src/lib/server/public/archive.md`                   | `64c4d5d`            | 처리 |
| LB17-1 | 🟠   | `src/lib/server/services/asset-access.md`            | `ddd5e35`            | 처리 |
| LB18-1 | 🟠   | `src/lib/server/services/asset-cleanup.md`           | `849d33b`            | 처리 |
| LB19-1 | 🟠   | `src/lib/server/services/cron-status.md`             | `91fbdd8`            | 처리 |
| LB20-1 | 🟠   | `src/lib/server/services/events.md`                  | `c1d863e`            | 처리 |
| LB20-2 | 🟠   | `src/lib/server/services/events.md`                  | `6f1eaa0`            | 처리 |
| LB20-3 | 🟠   | `src/lib/server/services/events.md`                  | `6f1eaa0`            | 처리 |
| LB22-1 | 🟠   | `src/lib/server/services/executives-admin.md`        | `fa2a051`            | 처리 |
| LB22-2 | 🟠   | `src/lib/server/services/executives-admin.md`        | `449ea27`            | 처리 |
| LB22-3 | 🟠   | `src/lib/server/services/executives-admin.md`        | `70aa027`            | 처리 |
| LB23-1 | 🔴   | `src/lib/server/services/mail-admin.md`              | `e46e535`            | 처리 |
| LB23-2 | 🟠   | `src/lib/server/services/mail-admin.md`              | `b1d1246`            | 처리 |
| LB23-3 | 🟠   | `src/lib/server/services/mail-admin.md`              | `b1d1246`            | 처리 |
| LB23-4 | 🟠   | `src/lib/server/services/mail-admin.md`              | `496126c`            | 처리 |
| LB23-5 | 🟠   | `src/lib/server/services/mail-admin.md`              | `b1d1246`            | 처리 |
| LB23-6 | 🟠   | `src/lib/server/services/mail-admin.md`              | `496126c`            | 처리 |
| LB23-7 | 🟠   | `src/lib/server/services/mail-admin.md`              | `b1d1246`            | 처리 |
| LB24-1 | 🟠   | `src/lib/server/services/maintenance.md`             | `45183cb`            | 처리 |
| LB24-2 | 🟠   | `src/lib/server/services/maintenance.md`             | `cf96bbd`            | 처리 |
| LB24-3 | 🟠   | `src/lib/server/services/maintenance.md`             | `cf96bbd`, `45183cb` | 처리 |
| LB24-4 | 🟠   | `src/lib/server/services/maintenance.md`             | `45183cb`            | 처리 |
| LB25-1 | 🔴   | `src/lib/server/services/members-admin.md`           | `6c9a334`            | 처리 |
| LB25-2 | 🟠   | `src/lib/server/services/members-admin.md`           | `c16f7c4`            | 처리 |
| LB28-1 | 🟠   | `src/lib/server/services/records-admin.md`           | `7b082f7`            | 처리 |
| LB28-2 | 🟠   | `src/lib/server/services/records-admin.md`           | `c1d863e`            | 처리 |
| LB28-3 | 🟠   | `src/lib/server/services/records-admin.md`           | `529665f`, `2f84aee` | 처리 |
| LB28-4 | 🟠   | `src/lib/server/services/records-admin.md`           | `0258c28`            | 처리 |
| LB30-1 | 🟠   | `src/lib/server/services/seminars.md`                | `529665f`            | 처리 |
| LB30-5 | 🟠   | `src/lib/server/services/seminars.md`                | `ce27719`            | 처리 |
| LB31-1 | 🟠   | `src/lib/server/services/studies.md`                 | `fc7a90e`, `d678f75` | 처리 |
| LB31-2 | 🟠   | `src/lib/server/services/studies.md`                 | `2f84aee`            | 처리 |
| LB31-3 | 🟠   | `src/lib/server/services/studies.md`                 | `2f84aee`            | 처리 |
| LB31-4 | 🟠   | `src/lib/server/services/studies.md`                 | `fc7a90e`            | 처리 |
| LB31-5 | 🟠   | `src/lib/server/services/studies.md`                 | `fc7a90e`            | 처리 |
| LB32-1 | 🟠   | `src/lib/server/services/uploads.md`                 | `496126c`            | 처리 |
| LB32-2 | 🟠   | `src/lib/server/services/uploads.md`                 | `ac30f91`            | 처리 |
| LB32-3 | 🟠   | `src/lib/server/services/uploads.md`                 | `0376223`            | 처리 |
| LB32-4 | 🟠   | `src/lib/server/services/uploads.md`                 | `0376223`            | 처리 |
| LB21-1 | 🟠   | `src/lib/server/services/visibility.md`              | `d678f75`            | 처리 |
| LB21-2 | 🟠   | `src/lib/server/services/visibility.md`              | `0ebc2f2`            | 처리 |
| LB27-1 | 🟠   | `src/lib/server/services/withdrawal.md`              | `7a38677`            | 처리 |
| LA42-1 | 🟠   | `supabase/migrations/20260901000000_documents.md`    | `06b7627`            | 처리 |
| LA43-1 | 🔴   | `supabase/migrations/20260928000000_atomic_flows.md` | `ce27719`            | 처리 |
| LA43-2 | 🟠   | `supabase/migrations/20260928000000_atomic_flows.md` | `ce27719`            | 처리 |
| LA43-3 | 🟠   | `supabase/migrations/20260928000000_atomic_flows.md` | `2f84aee`, `ce27719` | 처리 |
| LA43-4 | 🟠   | `supabase/migrations/20260928000000_atomic_flows.md` | `ce27719`            | 처리 |
