# SNUMPS Webpage

서울대학교 수학문제연구회(SNUMPS)의 운영 사이트 — 회원 가입·학기별 등록, 세미나 신청과 공개,
스터디, 출석, 탈퇴, 관리자 도구, 공개 아카이브를 한 SvelteKit 앱으로 다룬다.

데이터는 **Supabase**(Postgres + Storage)에 있다. 2026-09에 Notion에서 이주했고, Notion은 이제
이주·복구 스크립트만 읽는다 (앱 런타임은 쓰지 않는다).

## 기술 스택

| 영역       | 사용                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 프레임워크 | SvelteKit 2 + Svelte 5 (runes 전용), TypeScript strict                                                                      |
| 인증       | Auth.js — Google OAuth, SNU Workspace 계정만 (`@snu.ac.kr` + `email_verified` + `hd`)                                       |
| 데이터     | Supabase Postgres — 테이블당 JSONB 문서 1개, version CAS 쓰기, zod 검증. 여러 문서를 바꾸는 흐름은 plpgsql 함수 한 트랜잭션 |
| 파일       | Supabase Storage — `staging` → 검증 후 `assets` 승격, `/media/<key>` 프록시로만 서빙                                        |
| 캐시       | 인스턴스 메모리 + 선택적 Redis (`REDIS_URL`)                                                                                |
| 메일       | Gmail API (이벤트 → 규칙 → 템플릿 3층, 관리자 화면에서 편집)                                                                |
| 배포       | Vercel (`adapter-vercel`, nodejs22.x) + cron-job.org + Healthchecks.io                                                      |
| 테스트     | Vitest (jsdom), 데이터 계층은 `store-memory` — PGlite가 같은 마이그레이션을 적용한 Postgres                                 |
| 도구       | pnpm (`packageManager`), prettier(저장소 전체, CI에서 검사)                                                                 |

## 빠른 시작

```bash
pnpm install
cp .env.example .env     # dev Supabase 프로젝트 값을 채운다 — prod 키 금지
npx tsx scripts/seed-dev.ts
pnpm dev
```

자세한 절차는 [SETUP](docs/SETUP.md). 품질 게이트는 CI와 같다:

```bash
./node_modules/.bin/prettier --check --ignore-unknown .
./node_modules/.bin/eslint .
./node_modules/.bin/vitest run
./node_modules/.bin/svelte-kit sync && ./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json
./node_modules/.bin/vite build
```

## 문서

**현재 상태를 설명하는 문서**

- [Architecture](docs/ARCHITECTURE.md) — 요청 흐름, 접근 존, 데이터 계층, 자산, 크론
- [Features](docs/FEATURES.md) — 사용자·관리자 기능 요약
- [Setup](docs/SETUP.md) — 환경변수, 로컬 개발, 메일 발신 설정
- [Auth Variables](docs/AUTH_VARS.md) — 인증·권한 관련 env
- [Database Schema](docs/schema.md) — 테이블(zod 스키마) 요약
- [Caching](docs/CACHE.md) — 캐시 계층과 HTTP 캐시 금지 정책
- [Components](docs/COMPONENTS.md) — 컴포넌트·공용 유틸
- [Design Blueprint](docs/DESIGN_BLUEPRINT.md) — LaTeX/논문형 시각 규칙
- [Performance](docs/PERFORMANCE.md) — 적용된 최적화 기록
- [Operator TODO](docs/OPERATOR-TODO.md) — 사람이 해야 하는 셋업·운영 작업
- [Maintaining Docs](docs/MAINTAINING_DOCS.md) — 문서 분류와 갱신 규칙

**명세·감사**

- [`docs/spec/`](docs/spec) — 기능·API·구현·Supabase 이주 명세. 문서 간 불일치가 있다 —
  최신은 `FUNCTIONAL-SPEC`·`API-SPEC`·`SUPABASE-MIGRATION-SPEC`, 확정 결정은 `FRONTEND-DECISIONS`,
  여러 문서 쓰기의 트랜잭션 흐름은 `ATOMIC-FLOWS`
- [`docs/code-audit/`](docs/code-audit) — 진행 중인 코드 감사 (감사 종료 시 삭제 예정)
- [`scripts/ops/README.md`](scripts/ops/README.md) · [`scripts/migration/README.md`](scripts/migration/README.md) — 운영·이주 스크립트
- [`scripts/measure/README.md`](scripts/measure/README.md) — 실측 하네스 (격리 서버를 띄워 HTTP·브라우저로 끝-끝 검증, HEAD 대조)
