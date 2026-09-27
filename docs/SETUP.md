# Setup & Installation

## 🛠️ Prerequisites

- **Node.js**: 22 이상 (`package.json` `engines`, Vercel 런타임 `nodejs22.x`).
- **Supabase**: dev 프로젝트 접근 권한 (아래 "로컬 개발"). prod 키는 로컬에 두지 않는다.
- **Google Cloud Credentials**: OAuth 2.0 Client ID ([console.cloud.google.com](https://console.cloud.google.com/)) — 로그인과 Gmail 발송에 같이 쓴다.
- **Notion Integration** (선택): 이주 원본을 조회·복구하는 스크립트에만 필요하다. 앱은 Notion을 읽지 않는다.

## 📥 Installation

```bash
git clone <repository-url>
cd webpage
pnpm install      # Vercel·CI와 같은 pnpm-lock.yaml 기준
```

## ✉️ Automated Email Setup

To enable the system to send automated alerts from a preset Gmail account:

1.  **Enable Gmail API**: In your Google Cloud Project, enable the "Gmail API".
2.  **Set to Production**: On the "OAuth consent screen" page, change the Publishing Status to **In Production**.
3.  **Generate Refresh Token**:
    - Open the [Google OAuth2 Playground](https://developers.google.com/oauthplayground/).
    - Click the **Settings cog** (top right) and check **"Use your own OAuth credentials"**.
    - Enter your `Client ID` and `Client Secret`.
    - In **Step 1**, enter `https://www.googleapis.com/auth/gmail.send` and click **Authorize APIs**.
    - Sign in with the Admin Gmail account.
    - In **Step 2**, click **Exchange authorization code for tokens**.
    - Copy the **Refresh Token** provided.

## ⚙️ Environment Configuration

`.env.example`을 `.env`로 복사해 아래 값을 채운다 (`.env`는 gitignore 대상). See [**Authentication Variables**](AUTH_VARS.md) for detailed information on how `ADMINS_EMAILS` and `AUTHORIZED_USERS` are used.

```env
# 인증 (없으면 로그인 자체가 뜨지 않는다 — hooks.server.ts가 FATAL을 남긴다)
AUTH_SECRET=              # openssl rand -base64 32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMINS_EMAILS=            # 콤마 구분. 관리자 부트스트랩 (docs/AUTH_VARS.md)
ADMIN_REFRESH_TOKEN=      # Gmail API 발송용 (docs/AUTH_VARS.md)

# Notion — 이주 원본 조회·복구 스크립트 전용 (앱 런타임은 쓰지 않는다)
NOTION_API_KEY=your_integration_token
NOTION_DB_MEMBERS=id_of_members_db
NOTION_DB_PRIVATE_INFO=id_of_private_info_db
NOTION_DB_ACTIVITIES=id_of_activities_db
NOTION_DB_SEMINARS=id_of_seminars_db
NOTION_DB_APPLICATIONS=id_of_applications_db
NOTION_DB_SEMINAR_REQUESTS=id_of_seminar_proposals_db
NOTION_DB_SETTINGS=id_of_site_settings_db # optional
NOTION_DB_EVENTS=id_of_events_db
NOTION_DB_ATTENDANCE_QUEUE=id_of_attendance_queue_db

# Supabase data layer (see docs/spec/SUPABASE-MIGRATION-SPEC.md §6)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxxx   # 신 체계 sb_secret_... 키 (server-only, never commit)
SUPABASE_ASSETS_BUCKET=assets
SUPABASE_STAGING_BUCKET=staging
SUPABASE_BACKUPS_BUCKET=backups
ASSETS_CDN_URL=https://xxxx.supabase.co/storage/v1/object/public/assets   # ASSETS_ACCESS=public 일 때만 쓰인다
ASSETS_ACCESS=            # 비워 두면 /media 프록시(기본·권장). public = 옛 방식(공개 버킷 직접 링크)

HEALTHCHECKS_PING_URL=   # Healthchecks.io dead-man's switch (스펙 §5-3)
GITHUB_BACKUP_REPO=snumps-webpage/snumps-backups   # 주간 백업 off-platform 사본 (§7 B2)
GITHUB_BACKUP_TOKEN=     # fine-grained PAT, 해당 repo contents:write 한정
DATA_BACKEND=supabase    # supabase | memory (memory = dev 오프라인 보조, 재시작 시 소멸)

CRON_SECRET=             # required — /api/cron/* returns 501 when unset
REDIS_URL=               # optional — memory-only cache without it
SITE_ORIGIN=https://snumps.vercel.app          # links inside outgoing mail (no PUBLIC_ prefix — Kit strips it from private env)
```

> **vercel.json의 일 1회 크론은 의도적으로 존치한다** — cron-job.org 3잡이 공통 모드(배포 사고 등)로
> 전멸해도 살아남는, 자동 비활성이 없는 최후 심장이며(스펙 S1), `CRON_SECRET` env가 있으면 Vercel이
> Bearer 헤더를 자동 첨부하므로 코드가 필요 없다. (vercel.json은 JSON이라 주석을 지원하지 않아
> 사유를 여기에 기록한다.)

## 로컬 개발

로컬 개발은 **2번째 무료 Supabase 프로젝트(dev)** 를 사용한다 (스펙 결정 S4 — prod와 완전 분리).

1. Supabase에서 dev 프로젝트를 생성하고 `supabase/migrations/20260901000000_documents.sql`을 적용한다.
   (2026-08-30 완료 — dev 프로젝트 `snumps-dev`, ref `gcahkryexewswzvtfltj`. 재구축 시 `scripts/ops/` 스크립트 참조.)
2. `.env`에 **dev 프로젝트의** `SUPABASE_URL` / `SUPABASE_SECRET_KEY`를 넣는다 (prod 키 금지).
3. 시드 데이터 주입: `npx tsx scripts/seed-dev.ts`
4. 오프라인 보조로는 `DATA_BACKEND=memory`를 쓸 수 있다 — 단 **프로세스 재시작 시 데이터가 소멸**하고
   가짜(인메모리) 데이터임에 주의. 평상시 기본은 `DATA_BACKEND=supabase` + dev 프로젝트다.

> The Gmail sender must be a **Google Workspace** account: consumer Gmail's
> 500-recipients/day cap is nearly exhausted by two full-member announcements.

## 🔍 Utilities

운영·점검 스크립트는 `scripts/ops/`에 있다 — 무엇이 필요한지와 어떤 것이 데이터를 바꾸는지는
[`scripts/ops/README.md`](../scripts/ops/README.md). 예:

- `node scripts/ops/ops-env-names.mjs SUPABASE` — `.env`에 어떤 키가 있는지 (값은 출력하지 않음)
- `node scripts/ops/ops-notion-inspect.mjs` — Notion 원본 조회
- `node scripts/ops/ops-backup-db.mjs` — DB 스냅숏 (`backups/`, 개인정보 포함)

## 🚀 Running & Building

```bash
pnpm dev         # 개발 서버 (?dev_preview=member|admin 으로 로그인 없이 화면 확인)
pnpm build       # 프로덕션 빌드
pnpm test        # vitest
pnpm check       # svelte-check
```

CI(`.github/workflows/ci.yml`)는 prettier → eslint → vitest → svelte-check → vite build를 비밀값 없이 실행한다.
