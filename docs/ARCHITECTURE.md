# System Architecture

> 코드 기준 요약이다. 결정의 근거는 `docs/spec/`(특히 `API-SPEC`, `SUPABASE-MIGRATION-SPEC`, `ATOMIC-FLOWS`)에 있다.

## 📂 Project Structure

```text
src/
├── auth.ts                  # Auth.js — Google, 판정은 core/sign-in.ts
├── hooks.server.ts          # cacheShield → auth → devPreview → zoneGuard, handleError
├── routes/
│   ├── (public)/            # 공개 존 — 랜딩/대시보드(/), about, archive, members, login, media
│   ├── (applicant)/         # 신청 존 — signup, wait
│   ├── (member)/            # 회원 존 — seminar, study, events, settings, withdraw
│   ├── (admin)/             # 관리자 존 — admin/**
│   └── api/                 # REST — cron, health, admin 큐 폴링, 업로드 presign
└── lib/
    ├── domain/              # 순수 로직·뷰 타입·입력 스키마 (브라우저 안전, $lib/server 금지)
    │   ├── term.ts          # 학기 규칙의 단일 정의 (termOf, termOfDateString, termLabel)
    │   └── form-data.ts     # formText(필드 읽기), fieldIssues(zod 실패 → 필드별 메시지)
    ├── client/              # 브라우저 전용 — REST 호출, 관리자 큐 폴러
    ├── components/          # UI (Svelte 5 runes)
    ├── manuscript.css       # 전역 LaTeX/논문형 스타일
    └── server/
        ├── core/            # 에러 코드, HTTP 헬퍼, 학기, 시간, id, capability, sign-in(로그인 허용 판정)
        ├── guards/          # zone.ts(순수 판정), resolve-member.ts(세션 → 회원)
        ├── auth-guards.ts   # 액션·로드 가드와 runAction 래퍼
        ├── data/            # store(Supabase 경계), tables(getTable/mutate), flows(callFlow), schemas, storage, audit
        │                    #   store-memory + pglite-*(메모리 백엔드 = PGlite)
        ├── services/        # 도메인 서비스 — membership, seminars, studies, events, uploads …
        ├── mail/            # Gmail 전송, 이벤트 카탈로그, 규칙·템플릿 해석
        ├── public/          # 공개 아카이브 읽기 모델
        └── cache.ts         # 2단 캐시 (메모리 + 선택적 Redis)
supabase/migrations/         # 문서 테이블 + flow_* 함수 — 운영과 PGlite가 같은 파일을 적용
```

서버 모듈은 정적으로 import한다. 호출 지점의 `await import()`는 의존 관계를 읽는 사람과 도구에게서 숨길 뿐이라
걷어냈다. 남은 지연 로드는 포스터를 내려받을 때만 필요한 브라우저 번들(`html-to-image`)과, 메모리 백엔드일 때만
여는 PGlite다.

## 🔁 Request Lifecycle

`handle = sequence(cacheShield, authHandle, devPreviewHandle, zoneGuard)`

1. **cacheShield** — 모든 SSR 응답에 `private, no-store` + Vercel/CDN no-store. 2026-09-01 엣지가
   개인화 페이지를 다른 사용자에게 재생한 사고 이후의 규칙이다. ISR·프리렌더는 쓰지 않는다.
2. **authHandle** — Auth.js. DB 어댑터 없는 JWT 세션.
3. **devPreviewHandle** — `dev`에서만. `?dev_preview=member|admin`으로 가짜 회원 컨텍스트.
4. **zoneGuard** — 라우트 그룹이 곧 접근 존이다 (`guards/zone.ts`의 `decide()`).

| 존             | 규칙                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(public)`     | 익명은 세션 조회 없이 통과. `/`는 하이브리드 — 로그인한 비회원은 `/signup`·`/wait`로. `/`의 액션은 회원 존 POST 게이트 밖이라 각자 capability를 확인한다 |
| `(applicant)`  | 세션 필요. 이번 학기 등록 회원은 `/`로, 탈퇴 유예 회원은 `/withdraw/pending`으로                                                                         |
| `(member)`     | 세션 + 회원 행 + `member.view` capability. POST는 라우트별 capability(`MEMBER_POST_CAPABILITY`) 필요                                                     |
| `(admin)`      | `isAdmin`이 아니면 **404** — 존재 자체를 숨긴다                                                                                                          |
| `api`          | 존은 통과시키고 핸들러가 직접 인증 (Bearer `CRON_SECRET`, `requireAdminRest` 등)                                                                         |
| 어느 존도 아님 | 500 (fail closed). 라우트 id는 로그에만 남기고 브라우저에는 보내지 않는다                                                                                |

가드의 거부(404·403·500)와 리디렉션(303)은 throw하지 않고 **직접 응답을 만들어 `no-store`를 붙인다**. handle에서
throw한 오류는 Kit의 치명 오류 경로로 나가 cacheShield를 건너뛰기 때문이다(W-23). 데이터·JSON 요청에는 JSON,
그 밖에는 단순 오류 페이지로 답한다.

`handleError`는 예외 원문을 로그로만 남기고 클라이언트에는 코드만 보낸다.

**로그인 허용** (`core/sign-in.ts`): 이메일이 `@snu.ac.kr`이고, Google 프로필의 `email_verified`가 참이며,
`hd`(계정을 발급한 Workspace 도메인)가 `snu.ac.kr`이어야 한다. 접미사만으로는 SNU Workspace 계정이라는 증거가 아니다.

## 🔐 Identity & Capabilities (결정 S9)

매 요청 `email → private-info → members → registrations(현재 학기)`를 읽어 `MemberContext`를 만든다.
권한은 지위가 아니라 파생된 capability로 판정한다 (`core/capabilities.ts`).

| 상태            | capability                                         |
| --------------- | -------------------------------------------------- |
| 이번 학기 등록  | `member.view`, `member.participate`, `member.self` |
| 미등록 + 동문   | `member.view`, `member.self` (열람 + 본인 관리)    |
| 미등록 + 비동문 | 없음 — 재가입 신청 필요                            |

- 관리자 권한의 유일한 원천은 `members.isAdmin` (결정 D4). `ADMINS_EMAILS`는 회원 행이 생기기 전
  부트스트랩, 승인 때의 `isAdmin` 스탬프, 운영 알림 수신에 쓴다.
- **스탬프는 재등록마다 다시 찍힌다** — `flow_approve_application`은 기존 회원의 학기 재등록 승인에서도
  명단에 있는 사람의 `isAdmin`을 `true`로 쓴다(내리지는 않는다). 그래서 env에 남은 관리자를 회원 관리
  화면에서 해제하면 다음 재등록 승인 때 되살아난다. **관리자를 회수하려면 화면에서 해제하고
  `ADMINS_EMAILS`에서도 그 주소를 뺀다** (결정 #17, audit LA01-3 — 문서로 정한 계약, 코드는 그대로).
- Notion 이주분은 `legacy-members`·`legacy-private-info`(읽기 전용)에 있고 로그인에 쓰지 않는다.
  재가입 회원은 `legacyMemberId`로 과거 기록과 이어진다 (`data/directory.ts`).

## ✅ Input Validation

규칙의 원천은 `src/lib/domain/*`의 zod 스키마 하나다. 입력을 받는 폼 액션(가입, 세미나·스터디 신청, 대시보드
프로필, 알림·탈퇴 설정, 스터디 주최자 도구, 관리자 회원·기록 편집기·이벤트)은 `formText`로 필드를 읽어 도메인
스키마로 파싱하고, 실패하면 **쓰기·감사 기록 전에** `fail(400, { error: "VALIDATION_FAILED", issues, values })`로
틀린 필드를 한 번에 돌려준다(`fieldIssues`, `domain/form-data.ts`). 권한 가드가 먼저 돌므로 권한 없는 사람은
규칙을 볼 수 없다. 관리자 대시보드·이벤트 관리·대시보드 참가 신청 액션은 id도 읽기 전에 id 스키마로 거른다 —
잘못된 id는 400, 형식은 맞지만 없는 id는 `NOT_FOUND`. 저장 직전에는 테이블 스키마(쓰기 게이트)가 한 번 더 검증한다.

## 💾 Data Layer

- **저장 형식**: Postgres `app_tables(name, version, doc jsonb)` — 테이블당 문서 1개
  `{schemaVersion: 1, rows: [...]}`. 출석 큐만 이벤트별 `app_queues(event_id, …)`. 약 600행 규모에서
  의도한 선택이며, 정규화는 별도 과제다.
- **경계**: Supabase 클라이언트는 `data/supabase.ts`에서만 만들고, 데이터 접근은 `data/store.ts`,
  파일은 `data/storage.ts`만 한다. RLS는 켜져 있고 정책 0개(deny-all) — 서버의 `sb_secret` 키가 유일한 경로.
- **읽기** `getTable(name)`: 캐시 → version 조회 → 바뀐 경우에만 문서 읽기 → zod 검증.
  저장소 장애는 `SERVICE_UNAVAILABLE`(503), 문서가 스키마를 어기면 500.
- **쓰기(문서 하나)** `mutate(name, fn)`: 캐시 없이 읽기 → `fn` → 변경 없으면 생략 → **쓰기 전 zod 검증** →
  `version` 조건부 쓰기 → 캐시 무효화. 저장·캐시하는 것은 게이트가 파싱한 행이다(기본값이 채워진 모양 —
  다른 인스턴스가 디코드하는 모양과 같다). CAS 실패 시 백오프 재시도(표 5회, 큐 10회) 후 `WRITE_CONFLICT`(409).
- **쓰기(문서 여러 개)** — `callFlow(fn, args)`(`data/flows.ts`) → `store.rpc` → plpgsql 함수 `flow_*(p jsonb)`
  ([ATOMIC-FLOWS](spec/ATOMIC-FLOWS.md)). PostgREST 요청 하나가 트랜잭션 하나라서, 여러 문서를 차례로 `mutate`하면
  읽기·판정·쓰기 사이에 다른 커밋이 끼어든다(취소된 세미나에 살아 있는 출석 링크, 반려된 신청자가 회원으로
  남는 등 실측으로 재현됨). 함수는 필요한 문서를 잠그고(표는 이름순 `FOR UPDATE`, 읽기만 하면 `FOR SHARE`)
  **지금 저장된 상태로** 판정해 한 트랜잭션에서 끝낸다. 세미나 게시·일정·취소·삭제, 체크인·출석 결정·이벤트 삭제,
  가입·신청 승인, 스터디 회차 생성·정정, 탈퇴 수명주기, 활동·스터디 기록 삭제가 이 경로다.
  - 규칙 위반은 `RAISE EXCEPTION '<ERR 코드>'`(+ 사용자 문구가 필요하면 `DETAIL`) → `callFlow`가 `AppError`로 바꾼다.
  - 함수가 `touched`/`touchedQueues`로 알려 준 표·큐의 캐시를 `callFlow`가 비운다.
  - id·시각은 TS가 만들어 넘기고(형식이 같도록), 메일·Storage 정리는 **커밋 뒤** 호출자가 한다.
  - 기록을 만드는 흐름은 같은 락 아래서 `sourceRequestId` 앵커로 이미 만든 기록을 찾아 재사용한다(멱등).
  - 학기·상태 규칙의 SQL 미러(`app_term_of`, `app_event_open` 등)는 `flow-rules.test.ts`가 TS 원본과 대조한다.
- **감사 로그** `audit_log`: INSERT 전용(트리거가 UPDATE/DELETE 거부). 파기 증거인 `withdrawal.*`는 흐름 안에서
  상태 변경과 같은 트랜잭션으로 쓴다 — 감사 실패는 액션을 실패시킨다. 나머지는 TS `audit()`(best-effort).
- `DATA_BACKEND=memory`는 전체 저장소를 `store-memory.ts`로 바꾼다 — **PGlite**(인프로세스 Postgres)가 운영과
  같은 마이그레이션 파일을 적용하므로, 흐름 함수가 테스트·로컬 개발·`scripts/measure`에서 운영과 똑같이 돈다.
  데이터는 프로세스와 함께 사라진다. vitest는 실행당 한 번 만든 스냅숏을 불러온다(`pglite-snapshot.setup.ts`).

## 🖼️ Assets

1. `POST /api/uploads/presign` — 관리자(또는 `seminar-poster`에 한해 참여 권한 회원)에게 `staging` 서명 업로드 URL.
   권한 확인 뒤 본문을 도메인 스키마(`presignBodySchema`)로 검증하고, 어긋나면 서명 없이 400 `VALIDATION_FAILED`.
2. 브라우저가 직접 업로드.
3. 레코드 저장 시 승격 — 크기·타입·매직바이트 검사 후 `assets`로 이동, `backups/assets-mirror/`에 사본.
4. 읽기는 `/media/<key>`만 — 요청마다 권한을 판정(`services/asset-access.ts`)해 5분 서명 URL로 302,
   거부는 전부 404. `assets` 버킷은 비공개여야 한다 (전환: `docs/OPERATOR-TODO.md` §3-1).
5. 파일은 어떤 레코드도 참조하지 않을 때만 지운다 (`services/asset-cleanup.ts`).

갤러리 썸네일은 Vercel 이미지 최적화로 요청 시 생성한다 — [PERFORMANCE](PERFORMANCE.md).

## ⏱️ Scheduled Jobs

| 엔드포인트              | 트리거                                   | 하는 일                                                                                                                   |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/api/cron/sync-events` | cron-job.org(매시) + Vercel 일 1회(백업) | `expire` — 만료 이벤트 정리 (판정 자체는 읽을 때 `effectiveStatus`로). 스터디 회차는 주최자가 직접 만든다(자동 생성 없음) |
| `/api/cron/maintenance` | cron-job.org 매일 04:00 KST              | keep-alive, 오래된 staging 삭제, 일요일 백업(버킷 + GitHub)                                                               |
| `/api/health`           | cron-job.org 매일 09:00 KST              | Bearer 인증 + DB SELECT                                                                                                   |

모든 단계가 성공했을 때만 200과 Healthchecks 핑을 보낸다. 실패는 500.

## ✉️ Mail

`mail/events.ts`의 닫힌 이벤트 카탈로그 → `mail-rules` 테이블(없으면 코드 기본 규칙) →
`mail-templates`·`mail-variables` 오버라이드로 렌더 → Gmail API 전송(전체 공지는 Bcc 80명 배치).
전송 실패는 상태를 되돌리지 않는다 — 액션은 `mailFailed`로 알린다. 메일은 트랜잭션 안에서 보내지 않는다:
세미나 공개 흐름이 `announcedAt`을 선점하고, 커밋 뒤 이긴 쪽만 보내며 전송이 실패하면 선점을 푼다.

전체 공지 수신자는 **이번 학기 등록 회원과 동문** 중 수신에 동의한 사람이다. 탈퇴 유예 중인 회원과 미등록
비동문은 동의 여부와 무관하게 받지 않는다(결정 2026-09-27).

## ⚠️ Known Risks (accepted, recorded)

- **알림 메일 폭주** (결정 2026-09-27: 기록만): 가입 신청 → 철회를 반복하거나 세미나·스터디 신청을
  연달아 내면 제출마다 관리자 알림 메일이 나간다. 발송 빈도 제한이 없어, `@snu.ac.kr` 계정 하나로
  Gmail 일일 발송 한도(소비자 500명 / Workspace 2,000명)를 소진시켜 공지·환영 메일을 막을 수 있다.
  완화책 후보: 같은 사람·같은 종류 알림을 24시간에 한 통으로 묶기, 신청 횟수 제한(429).

## 🎨 Visual Identity

LaTeX·학술지 문법 — 규칙선, 번호 단락, 각진 박스, 세리프. 전역 스타일은 `manuscript.css`,
규칙은 [DESIGN_BLUEPRINT](DESIGN_BLUEPRINT.md).
