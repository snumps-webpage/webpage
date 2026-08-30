# Setup & Installation

## 🛠️ Prerequisites

- **Node.js**: Version 18 or higher (Tested on v25).
- **Notion Integration**: Create an internal integration at [developers.notion.com](https://developers.notion.com/) and share your databases with it.
- **Google Cloud Credentials**: Create an OAuth 2.0 Client ID at [console.cloud.google.com](https://console.cloud.google.com/).

## 📥 Installation

```bash
git clone <repository-url>
cd snumps-webpage-fork
npm install
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

Rename `.env.example` to `.env.safe` or `.env` and configure the following variables. See [**Authentication Variables**](AUTH_VARS.md) for detailed information on how `ADMINS_EMAILS` and `AUTHORIZED_USERS` are used.

```env
# Notion
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
ASSETS_CDN_URL=https://xxxx.supabase.co/storage/v1/object/public/assets   # assets 버킷 public URL 베이스

HEALTHCHECKS_PING_URL=   # Healthchecks.io dead-man's switch (스펙 §5-3)
GITHUB_BACKUP_REPO=snumps-webpage/snumps-backups   # 주간 백업 off-platform 사본 (§7 B2)
GITHUB_BACKUP_TOKEN=     # fine-grained PAT, 해당 repo contents:write 한정
DATA_BACKEND=supabase    # supabase | memory (memory = dev 오프라인 보조, 재시작 시 소멸)

CRON_SECRET=             # required — /api/cron/* returns 501 when unset
REDIS_URL=               # optional — memory-only cache without it
PUBLIC_SITE_ORIGIN=https://snumps.vercel.app   # links inside outgoing mail
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

- **Schema Inspector**: `node --env-file=.env.safe inspect-db.js <database_id>`
- **Data Querier**: `node --env-file=.env.safe query-db.js <database_id>`

## 🚀 Running & Building

```bash
npm run dev    # Development server
npm run build  # Production build
```
