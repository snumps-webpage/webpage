# System Architecture

> 코드 기준 요약이다. 결정의 근거는 `docs/spec/`(특히 `API-SPEC`, `SUPABASE-MIGRATION-SPEC`)에 있다.

## 📂 Project Structure

```text
src/
├── auth.ts                  # Auth.js — Google, @snu.ac.kr 제한
├── hooks.server.ts          # cacheShield → auth → devPreview → zoneGuard, handleError
├── routes/
│   ├── (public)/            # 공개 존 — 랜딩/대시보드(/), about, archive, members, login, media
│   ├── (applicant)/         # 신청 존 — signup, wait
│   ├── (member)/            # 회원 존 — seminar, study, events, settings, withdraw
│   ├── (admin)/             # 관리자 존 — admin/**
│   └── api/                 # REST — cron, health, admin 큐 폴링, 업로드 presign
└── lib/
    ├── domain/              # 순수 로직·뷰 타입·입력 스키마 (브라우저 안전, $lib/server 금지)
    ├── client/              # 브라우저 전용 — REST 호출, 관리자 큐 폴러
    ├── components/          # UI (Svelte 5 runes)
    ├── manuscript.css       # 전역 LaTeX/논문형 스타일
    └── server/
        ├── core/            # 에러 코드, HTTP 헬퍼, 학기, 시간, id, capability
        ├── guards/          # zone.ts(순수 판정), resolve-member.ts(세션 → 회원)
        ├── auth-guards.ts   # 액션·로드 가드와 runAction 래퍼
        ├── data/            # store(Supabase 경계), tables(getTable/mutate), schemas, storage, audit
        ├── services/        # 도메인 서비스 — membership, seminars, studies, events, uploads …
        ├── mail/            # Gmail 전송, 이벤트 카탈로그, 규칙·템플릿 해석
        ├── public/          # 공개 아카이브 읽기 모델
        └── cache.ts         # 2단 캐시 (메모리 + 선택적 Redis)
```

## 🔁 Request Lifecycle

`handle = sequence(cacheShield, authHandle, devPreviewHandle, zoneGuard)`

1. **cacheShield** — 모든 SSR 응답에 `private, no-store` + Vercel/CDN no-store. 2026-09-01 엣지가
   개인화 페이지를 다른 사용자에게 재생한 사고 이후의 규칙이다. ISR·프리렌더는 쓰지 않는다.
2. **authHandle** — Auth.js. DB 어댑터 없는 JWT 세션.
3. **devPreviewHandle** — `dev`에서만. `?dev_preview=member|admin`으로 가짜 회원 컨텍스트.
4. **zoneGuard** — 라우트 그룹이 곧 접근 존이다 (`guards/zone.ts`의 `decide()`).

| 존             | 규칙                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `(public)`     | 익명은 세션 조회 없이 통과. `/`는 하이브리드 — 로그인한 비회원은 `/signup`·`/wait`로                 |
| `(applicant)`  | 세션 필요. 이번 학기 등록 회원은 `/`로, 탈퇴 유예 회원은 `/withdraw/pending`으로                     |
| `(member)`     | 세션 + 회원 행 + `member.view` capability. POST는 라우트별 capability(`MEMBER_POST_CAPABILITY`) 필요 |
| `(admin)`      | `isAdmin`이 아니면 **404** — 존재 자체를 숨긴다                                                      |
| `api`          | 존은 통과시키고 핸들러가 직접 인증 (Bearer `CRON_SECRET`, `requireAdminRest` 등)                     |
| 어느 존도 아님 | 500 (fail closed)                                                                                    |

`handleError`는 예외 원문을 로그로만 남기고 클라이언트에는 코드만 보낸다.

## 🔐 Identity & Capabilities (결정 S9)

매 요청 `email → private-info → members → registrations(현재 학기)`를 읽어 `MemberContext`를 만든다.
권한은 지위가 아니라 파생된 capability로 판정한다 (`core/capabilities.ts`).

| 상태            | capability                                         |
| --------------- | -------------------------------------------------- |
| 이번 학기 등록  | `member.view`, `member.participate`, `member.self` |
| 미등록 + 동문   | `member.view`, `member.self` (열람 + 본인 관리)    |
| 미등록 + 비동문 | 없음 — 재가입 신청 필요                            |

- 관리자 권한의 유일한 원천은 `members.isAdmin` (결정 D4). `ADMINS_EMAILS`는 회원 행이 생기기 전
  부트스트랩과 운영 알림 수신에만 쓴다.
- Notion 이주분은 `legacy-members`·`legacy-private-info`(읽기 전용)에 있고 로그인에 쓰지 않는다.
  재가입 회원은 `legacyMemberId`로 과거 기록과 이어진다 (`data/directory.ts`).

## 💾 Data Layer

- **저장 형식**: Postgres `app_tables(name, version, doc jsonb)` — 테이블당 문서 1개
  `{schemaVersion: 1, rows: [...]}`. 출석 큐만 이벤트별 `app_queues(event_id, …)`. 약 600행 규모에서
  의도한 선택이며, 정규화는 별도 과제다.
- **경계**: Supabase 클라이언트는 `data/supabase.ts`에서만 만들고, 데이터 접근은 `data/store.ts`,
  파일은 `data/storage.ts`만 한다. RLS는 켜져 있고 정책 0개(deny-all) — 서버의 `sb_secret` 키가 유일한 경로.
- **읽기** `getTable(name)`: 캐시 → version 조회 → 바뀐 경우에만 문서 읽기 → zod 검증.
  저장소 장애는 `SERVICE_UNAVAILABLE`(503), 문서가 스키마를 어기면 500.
- **쓰기** `mutate(name, fn)`: 캐시 없이 읽기 → `fn` → 변경 없으면 생략 → **쓰기 전 zod 검증** →
  `version` 조건부 쓰기 → 캐시 무효화. CAS 실패 시 백오프 재시도(표 5회, 큐 10회) 후 `WRITE_CONFLICT`(409).
- **여러 테이블 쓰기는 원자적이지 않다.** 부작용이 큰 단계를 마지막에 두고, 각 단계를 멱등하게
  만든다 (`data/idempotency.ts`의 `ensureCreated`, 상태 CAS 선점).
- **감사 로그** `audit_log`: INSERT 전용(트리거가 UPDATE/DELETE 거부). `withdrawal.*` 기록 실패는 액션을 실패시킨다.
- `DATA_BACKEND=memory`는 전체 저장소를 `store-memory.ts`로 바꾼다 — 오프라인 개발과 테스트용.

## 🖼️ Assets

1. `POST /api/uploads/presign` — 관리자(또는 `seminar-poster`에 한해 참여 권한 회원)에게 `staging` 서명 업로드 URL.
2. 브라우저가 직접 업로드.
3. 레코드 저장 시 승격 — 크기·타입·매직바이트 검사 후 `assets`로 이동, `backups/assets-mirror/`에 사본.
4. 읽기는 `/media/<key>`만 — 요청마다 권한을 판정(`services/asset-access.ts`)해 5분 서명 URL로 302,
   거부는 전부 404. `assets` 버킷은 비공개여야 한다 (전환: `docs/OPERATOR-TODO.md` §3-1).
5. 파일은 어떤 레코드도 참조하지 않을 때만 지운다 (`services/asset-cleanup.ts`).

갤러리 썸네일은 Vercel 이미지 최적화로 요청 시 생성한다 — [PERFORMANCE](PERFORMANCE.md).

## ⏱️ Scheduled Jobs

| 엔드포인트              | 트리거                                   | 하는 일                                                                                                                                                                        |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/cron/sync-events` | cron-job.org(매시) + Vercel 일 1회(백업) | `expire` — 만료 이벤트 정리 (판정 자체는 읽을 때 `effectiveStatus`로). `generate-study-sessions` — 스터디 `schedule[]`로 회차 생성 (명세는 폐기로 결정했으나 코드에 남아 있다) |
| `/api/cron/maintenance` | cron-job.org 매일 04:00 KST              | keep-alive, 오래된 staging 삭제, 일요일 백업(버킷 + GitHub)                                                                                                                    |
| `/api/health`           | cron-job.org 매일 09:00 KST              | Bearer 인증 + DB SELECT                                                                                                                                                        |

모든 단계가 성공했을 때만 200과 Healthchecks 핑을 보낸다. 실패는 500.

## ✉️ Mail

`mail/events.ts`의 닫힌 이벤트 카탈로그 → `mail-rules` 테이블(없으면 코드 기본 규칙) →
`mail-templates`·`mail-variables` 오버라이드로 렌더 → Gmail API 전송(전체 공지는 Bcc 80명 배치).
전송 실패는 상태를 되돌리지 않는다 — 액션은 `mailFailed`로 알린다.

## 🎨 Visual Identity

LaTeX·학술지 문법 — 규칙선, 번호 단락, 각진 박스, 세리프. 전역 스타일은 `manuscript.css`,
규칙은 [DESIGN_BLUEPRINT](DESIGN_BLUEPRINT.md).
