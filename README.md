# SNUMPS Automation

A secure SvelteKit web application designed to automate membership management and activity tracking for SNUMPS, utilizing Notion as the primary database.

## Features

### 🔐 Authentication & Security
- **Google OAuth**: Secure login via Auth.js, restricted strictly to `@snu.ac.kr` domains.
- **Role-Based Access**: Distinguishes between regular Members and Admins.
- **Obfuscated Attendance Links**: Generates unique, randomized URLs (e.g., `/events/[id]/[random_code]`) for "Attend" and "Leave" actions.
- **Input Validation**: Server-side checks prevent IDOR attacks and unauthorized data manipulation.

### 👥 Membership System
- **Signup Flow**: New users must apply for membership. Applications are queued locally for Admin approval.
- **User Profile**: Members can view their full activity history (with semester filtering) and manage personal details.
- **Automated Alerts**: Admins receive instant email notifications for new signups and completed attendance requests.

### 📅 Event & Attendance System
- **Event Lifecycle**: Admins can Create (Draft), Activate (Publish), Expire, and Delete events.
- **Attendance Tracking**: Users check in/out via time-sensitive, obfuscated links.
- **Admin Review**: Admins review, edit, and approve attendance timestamps before they are synced to Notion.

### 📝 Notion Integration & UI
- **Smart Paging**: Handles large member lists via recursive fetching (bypassing the 100-record limit).
- **Dynamic Context**: Automatically calculates the current semester and fetches the current Club President's name for the universal footer.
- **Search & Filtering**: Real-time search by Name or Department in both Admin and DB views.

## Project Structure

```text
src/
├── app.d.ts             # Type definitions (App.Locals, App.PageData)
├── auth.ts              # Auth.js configuration & Google Provider
├── hooks.server.ts      # Auth.js handler hook
├── lib/
│   ├── assets/          # Static assets (favicon, instagram logo)
│   └── server/
│       ├── admin.ts     # Membership application queue logic (JSON)
│       ├── cache.ts     # In-memory server-side caching utility
│       ├── events.ts    # Event state & attendance queue management (JSON)
│       ├── mail.ts      # Google Gmail API service for notifications
│       └── notion.ts    # Notion API Wrapper (Client, Pagers, Type Parsers)
└── routes/
    ├── +layout.server.ts # Global Context (President info, Admin status)
    ├── +layout.svelte    # Global UI (Header with Logo/Profile/Admin, Footer)
    ├── +page.server.ts   # Dashboard data fetching
    ├── +page.svelte      # User Dashboard (Stats, Linked Activity Summary)
    ├── admin/            # Admin Dashboard (Applications, Events, Attendance Review)
    ├── events/           # Public Event Pages (Attend/Leave actions)
    ├── login/            # Custom styled login page
    ├── notion/           # Raw Database Viewer with Search (Admin only)
    ├── profile/          # Member Profile with Semester Filtering
    └── signup/           # Application Form
```

## Setup & Installation

### 1. Prerequisites
*   **Node.js**: Version 18 or higher.
*   **Notion Integration**: Create an internal integration at [developers.notion.com](https://developers.notion.com/) and share your databases with it.
*   **Google Cloud Credentials**: Create an OAuth 2.0 Client ID at [console.cloud.google.com](https://console.cloud.google.com/).

### 2. Installation
```bash
git clone <repository-url>
cd snumps-automation-fork
npm install
```

### 3. Automated Email Setup (Critical)
To enable the system to send automated alerts to admins from a preset Gmail account:

1.  **Enable Gmail API**: In your Google Cloud Project, enable the "Gmail API".
2.  **Set to Production**: On the "OAuth consent screen" page, change the Publishing Status from **Testing** to **In Production**. (This prevents the Refresh Token from expiring every 7 days).
3.  **Generate Refresh Token**:
    *   Open the [Google OAuth2 Playground](https://developers.google.com/oauthplayground/).
    *   Click the **Settings cog** (top right) and check **"Use your own OAuth credentials"**.
    *   Enter your `Client ID` and `Client Secret`.
    *   In **Step 1**, enter `https://www.googleapis.com/auth/gmail.send` and click **Authorize APIs**.
    *   Sign in with the Admin Gmail account you wish to send from.
    *   In **Step 2**, click **Exchange authorization code for tokens**.
    *   Copy the **Refresh Token** provided.

### 4. Environment Configuration
Create a `.env` file in the root directory:

```env
# Auth.js Secret (Generate via `openssl rand -base64 32`)
AUTH_SECRET=your_secret

# Google OAuth (App Credentials)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Gmail API (From Step 3 above)
ADMIN_REFRESH_TOKEN=your_generated_refresh_token

# Access Control (Comma-separated admin emails)
ADMINS_EMAILS=admin1@snu.ac.kr,admin2@snu.ac.kr

# Notion Database IDs
NOTION_API_KEY=your_integration_token
NOTION_DB_MEMBERS=id_of_members_db
NOTION_DB_ACTIVITIES=id_of_activities_db
NOTION_DB_PRIVATE_INFO=id_of_private_info_db
```

### 5. Running Locally
```bash
npm run dev
```

## Deployment

```bash
npm run build
```
**Important**: The application stores transactional data (signups, attendance queue) in the `data/` directory as JSON files. Ensure your server has persistent write permissions for this directory. If using a serverless environment like Vercel, you may need to migrate the `lib/server/admin.ts` and `lib/server/events.ts` to use a database like MongoDB or Supabase.

## Tech Stack

- **Frontend**: **Svelte 5** (Runes) & **SvelteKit**.
- **Backend**: SvelteKit Server Routes with **In-memory Caching**.
- **Authentication**: **Auth.js** with Google OAuth.
- **Storage**: **Notion** (Primary) + **Local JSON** (Transactional Queue).
- **Communication**: **Google Gmail API** (REST).
