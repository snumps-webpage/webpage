# SNUMPS Automation

A secure SvelteKit web application designed to automate and visualize data from a Notion database, specifically tailored for SNUMPS.

## Features

- **Framework**: Built with **SvelteKit** (Svelte 5) and **Vite** for high performance.
- **Authentication**: Secure login using **Google OAuth** via Auth.js.
  - **Restriction**: Access is strictly limited to users with a `@snu.ac.kr` email address.
- **Membership System**:
  - **Signup Flow**: New users must apply for membership. Applications are stored temporarily and require Admin approval.
  - **Admin Dashboard**: Admins can view, approve, or reject membership applications.
  - **Withdrawal**: Users can voluntarily withdraw their membership, which updates their status in the database and logs them out.
- **Notion Integration**:
  - Connects securely to multiple Notion Databases (Members, Activities, Private Info).
  - Dynamically fetches schema and rows to render a data table.
  - **Dashboard**: Shows personal attendance statistics and activity history for the current semester.

## Project Structure

```text
src/
├── auth.ts              # Auth.js configuration (Google Provider & Callbacks)
├── lib/
│   └── server/
│       ├── admin.ts     # Admin logic & local JSON DB for applications
│       └── notion.ts    # Notion API integration (fetch wrapper & parsers)
└── routes/
    ├── +layout.server.ts # Global auth & admin checks
    ├── +page.svelte      # User Dashboard (Stats, Activities, Withdraw)
    ├── admin/            # Admin Dashboard (Approve/Reject users)
    ├── login/            # Custom login page
    ├── notion/           # Full Database View
    └── signup/           # New User Application Form
```

## Setup & Installation

### 1. Clone & Install
```bash
git clone <repository-url>
cd snumps-automation-fork
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory with the following variables:

```env
# Google OAuth (Obtain from Google Cloud Console)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Auth.js Secret (Generate via `npx auth secret` or openssl)
AUTH_SECRET=your_generated_secret

# Admins (Comma-separated emails)
ADMINS_EMAILS=admin@snu.ac.kr,another@snu.ac.kr

# Notion API (Obtain from Notion Developers)
NOTION_API_KEY=your_notion_integration_token
NOTION_DB_MEMBERS=id_of_members_db
NOTION_DB_ACTIVITIES=id_of_activities_db
NOTION_DB_PRIVATE_INFO=id_of_private_info_db
```

### 3. Running Locally
Start the development server:
```bash
npm run dev
```
Visit `http://localhost:5173` in your browser.

## Deployment

To create a production build:

```bash
npm run build
```

You can preview the production build locally:
```bash
npm run preview
```

## Tech Stack
- **Frontend**: SvelteKit, Svelte 5, CSS
- **Backend**: SvelteKit Server Routes, Notion API
- **Auth**: @auth/sveltekit, @auth/core
- **Data**: Notion (Primary), JSON (Temporary for applications)
