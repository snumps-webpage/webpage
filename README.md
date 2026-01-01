# SNUMPS Automation

A secure SvelteKit web application designed to automate membership management and activity tracking for SNUMPS, utilizing Notion as the primary database.

## Features

### 🔐 Authentication & Security
- **Google OAuth**: Secure login via Auth.js, restricted strictly to `@snu.ac.kr` domains.
- **Role-Based Access**: Distinguishes between regular Members and Admins.
- **Obfuscated Attendance Links**: Generates unique, randomized URLs (e.g., `/events/[id]/[random_code]`) for simplified check-in.
- **Input Validation**: Server-side checks prevent IDOR attacks and unauthorized data manipulation.

### 👥 Membership System
- **Signup Flow**: New users must apply for membership. Applications are stored in a hybrid system (Notion primary, Local JSON cache) for Admin approval.
- **User Profile**: Members can view their full activity history (with standardized semester filtering) and manage personal details.
- **Seminar Application**: Members can propose and organize their own seminars directly through the web interface.
- **Automated Alerts**: Admins receive instant email notifications for new signups and completed attendance requests.

### 📅 Event & Attendance System
- **Event Lifecycle**: Admins can Create (Draft), Activate (Publish), Expire, and Delete events.
- **Seminar Approval**: Admins review member-submitted seminar proposals. Approved seminars are automatically converted into official Activities in Notion.
- **Global Timezone Support**: Full IANA timezone database integration (e.g., `Asia/Seoul`, `America/New_York`) for both event creation and seminar applications, ensuring accurate scheduling across regions.
- **Attendance Tracking**: Users check in via a single, time-sensitive, obfuscated link.
- **One-Click Completion**: Clicking the attendance button immediately records both start and end times, generating a complete request for admin review.

### 📝 Notion Integration & UI
- **Smart Paging**: Handles large member lists via recursive fetching (bypassing the 100-record limit).
- **Dynamic Context**: Automatically calculates the current semester and fetches the current Club President's name for the universal footer.
- **Search & Filtering**: Real-time search by Name or Department in both Admin and DB views.
- **Native UI Feel**: Interactive elements (buttons, links, tags) use `user-select: none` to prevent accidental text highlighting and mimic a native application experience.
- **Fluid Transitions**: Utilizes the native View Transitions API for smooth, app-like page navigation.
- **Skeleton Loaders**: Implements shimmering placeholder UI during asynchronous data streaming, providing immediate visual feedback and better perceived performance.

## System Operations & Error Handling

### 💾 Hybrid Storage & Scalability
- **JSON First, Notion Fallback**: Transactional data (applications and attendance requests) is stored locally in JSON files for low-latency access but mirrored to Notion databases for persistence and serverless scalability.
- **Self-Healing Cache**: If local JSON files are lost or empty (e.g., after a server redeploy), the system automatically restores the cache by fetching the source of truth from Notion.
- **Robust Source Sync**: The system verifies the existence of linked Notion pages in real-time and during background syncs. If a page is deleted or archived in Notion, the local record is automatically purged to maintain data integrity.
- **Dual-Write Consistency**: Every creation or update action attempts to write to Notion first, followed by a local cache update, ensuring data is never trapped on a single server instance.

### 🛡️ Global Access Control (+layout.server.ts)
- **Membership Enforcement**: For every request, the layout verifies the user's existence in the Notion database. If not found, the user is forcefully redirected to `/signup`.
- **Flow Protection**: Routes like `/login`, `/auth/*`, and `/api/*` are explicitly excluded from the membership check to prevent infinite redirect loops and allow authentication to complete.
- **Resilience**: The Notion check is wrapped in a `try-catch` block. If the API is unreachable, the system logs the error and allows navigation to continue (without user-specific data) rather than crashing the entire site.

### 📝 Notion Integration (notion.ts)
- **Pagination Logic**: The `queryDatabase` function uses a recursive `while` loop with `next_cursor` to ensure the application retrieves 100% of database records, overcoming Notion's default 100-item response limit.
- **Property Safety**: Property parsers include defensive checks (e.g., `?.type`, `length > 0`) to handle cases where a Notion property might be empty or improperly configured in the dashboard.
- **Data Integrity**: During member creation, the system ensures both the `Private Info` and `Member` records are created and cross-linked successfully. If one step fails, an explicit error is thrown to prevent partial/broken records.

### 📅 Attendance Validation (events.ts)
- **One-Step Logic**: The system records a complete attendance event in a single user action, reducing friction and ensuring data completeness.
- **Duplicate Prevention**: Users are blocked from submitting multiple attendance records for the same event. Explicit alerts are returned to inform the user of their current status.
- **State Management**: Events in `draft` or `expired` states are inaccessible to regular users via randomized links, throwing a `403 Forbidden` error.

### ✉️ Notification Reliability (mail.ts)
- **Token Refreshing**: The system automatically exchanges the `ADMIN_REFRESH_TOKEN` for a fresh `accessToken` on every notification trigger.
- **Critical Failure Logging**: If the refresh token expires (e.g., due to account security changes), the system logs a `CRITICAL` error with instructions for manual intervention, while allowing the core user action (like signing up) to proceed silently to avoid a total service outage.

### 🛡️ Admin Security & Obscurity
- **Silent Redirects**: Unauthorized attempts to access `/admin` or `/notion` result in a silent `302 Redirect` to the homepage rather than a `403 Forbidden` page, concealing the existence of administrative paths from malicious actors.
- **Server-Side Verification**: Every administrative action (Approving, Editing, Deleting) re-verifies the user's email against the `ADMINS_EMAILS` environment variable strictly on the server side.

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
│       ├── notion.ts    # Notion API Wrapper (Client, Pagers, Type Parsers)
│       └── seminars.ts  # Seminar request queue logic (JSON)
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
    ├── seminar/          # Seminar Application Flow
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
NOTION_DB_APPLICATIONS=id_of_applications_mirror_db
NOTION_DB_ATTENDANCE_QUEUE=id_of_attendance_mirror_db
NOTION_DB_SEMINAR_REQUESTS=id_of_seminar_requests_db
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
- **Storage**: **Notion** (Primary) + **Local JSON Cache** (Hybrid Persistence).
- **Communication**: **Google Gmail API** (REST).