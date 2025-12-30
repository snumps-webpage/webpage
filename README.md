# SNUMPS Automation

A secure SvelteKit web application designed to automate and visualize data from a Notion database, specifically tailored for SNUMPS.

## Features

- **Framework**: Built with **SvelteKit** (Svelte 5) and **Vite** for high performance.
- **Authentication**: Secure login using **Google OAuth** via Auth.js.
  - **Restriction**: Access is strictly limited to users with a `@snu.ac.kr` email address.
- **Membership System**:
  - **Signup Flow**: New users must apply for membership. Applications are stored temporarily and require Admin approval.
  - **User Profile**: Members can view their full activity history and update their personal details (Phone, Bio, Background).
  - **Managed Withdrawal**: Users can request withdrawal through a subtle footer link; Admins then review and approve the request to finalize it in Notion.
- **Event & Attendance System**:
  - **Event Creation**: Admins can create activity events with specific types and dates.
  - **Obfuscated Links**: Generates unique, randomized URLs for "Attend" and "Leave" actions to prevent unauthorized logging.
  - **Attendance Review**: Admins review attendance timestamps (Start/End) submitted by users before sync to Notion.
- **Notion Integration**:
  - Connects securely to multiple Notion Databases (Members, Activities, Private Info).
  - **Dashboard**: Shows personal attendance statistics and activity summary for the current semester.
  - **Admin View**: Admins can view the raw Notion database tables directly within the app.
- **Dynamic Information**:
  - Automatically determines the current semester.
  - Fetches the current club president's name from Notion based on the semester.

## Project Structure

```text
src/
├── auth.ts              # Auth.js configuration (Google Provider & Callbacks)
├── lib/
│   └── server/
│       ├── admin.ts     # Admin logic & local JSON DB for applications
│       ├── events.ts    # Event & Attendance management logic
│       └── notion.ts    # Notion API integration (fetch wrapper & parsers)
└── routes/
    ├── +layout.server.ts # Global auth & admin checks
    ├── +page.svelte      # User Dashboard (Stats, Summary)
    ├── admin/            # Admin Dashboard (Users, Events, Attendance)
    ├── events/           # Dynamic Event Pages (Attend/Leave)
    ├── profile/          # User Profile & Activity History
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

## Tech Stack
- **Frontend**: SvelteKit, Svelte 5, CSS
- **Backend**: SvelteKit Server Routes, Notion API
- **Auth**: @auth/sveltekit, @auth/core
- **Storage**: Notion (Primary), local JSON (Temporary Queue)