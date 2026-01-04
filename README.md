# SNUMPS Automation

A secure SvelteKit web application designed to automate membership management and activity tracking for SNUMPS, utilizing Notion as the primary database.

## Features

### 🔐 Authentication & Security
- **Google OAuth**: Secure login via Auth.js, restricted strictly to `@snu.ac.kr` domains.
- **Role-Based Access**: Distinguishes between regular Members and Admins.
- **Obfuscated Attendance Links**: Generates unique, randomized URLs (e.g., `/events/[id]/[random_code]`) for "Attend" and "Leave" actions to prevent unauthorized logging.
- **Input Validation**: Server-side checks prevent IDOR attacks and enforce strict membership rules.

### 👥 Membership System
- **Signup Flow**: New users are redirected to a registration form. Applications are queued locally for Admin approval.
- **User Profile**: Members can view their full activity history (with semester filtering) and manage personal details (Phone, Bio, Background).
- **Automated Alerts**: Admins receive instant email notifications from a preset Gmail account for new signups and completed attendance requests.

### 📅 Event & Attendance System
- **Event Lifecycle**: Admins can Create (Draft), Activate (Publish), Expire, and Delete events.
- **Reactivation**: Expired events can be reactivated to resume attendance.
- **Existing Event Connection**: Admins can link new attendance sessions to already existing Notion activity records.
- **Attendance Tracking**: Users check in and out via time-sensitive links. Admins review and edit timestamps before syncing to Notion.

### 🎨 UI & UX
- **Light/Dark Mode**: Full support for Light, Dark, and System themes with persistence and a dedicated toggle button.
- **Universal Navigation**: Globally accessible header with a logo and profile button, plus a universal footer with club information.
- **Search & Filtering**: Real-time Name/Department search in both Admin and Notion Database views.
- **Automatic Linking**: Activity titles in the user dashboard automatically link to their corresponding published Notion pages.

## System Operations & Error Handling

### 🛡️ Global Access Control
- **Membership Enforcement**: `+layout.server.ts` verifies membership on every request. Non-members are redirected to `/signup`.
- **Flow Protection**: Logic explicitly excludes `/auth` and `/login` paths to prevent interference with authentication handshakes.
- **Resilience**: API checks are wrapped in `try-catch` blocks to prevent service outages during Notion API downtimes.

### 📝 Notion Integration
- **Smart Paging**: Implements recursive fetching with `next_cursor` to retrieve 100% of database records, bypassing Notion's 100-item limit.
- **In-Memory Caching**: Frequent queries (President name, Database Schema, Member lookups) are cached server-side to reduce latency and Notion API load.
- **Schema Safety**: Property parsers handle missing or improperly configured fields gracefully.

### ✉️ Notification System
- **Automated Refresh**: The system handles OAuth refresh tokens autonomously, ensuring the admin alert email account never loses access.
- **Sequence Validation**: The system blocks "Leave" actions if no "Attend" record exists and prevents duplicate submissions.

## Project Structure

```text
src/
├── app.d.ts             # Type definitions
├── auth.ts              # Auth.js configuration
├── hooks.server.ts      # Auth.js handler hook
├── lib/
│   ├── assets/          # Favicon, Instagram, and other SVGs
│   ├── server/
│       ├── admin.ts     # Membership queue logic (JSON)
│       ├── cache.ts     # Server-side caching utility
│       ├── events.ts    # Event & attendance management (JSON)
│       ├── mail.ts      # Gmail API notification service
│       └── notion.ts    # Notion API Wrapper
│   ├── constants.ts     # Centralized property and type constants
│   ├── theme.ts         # Light/Dark mode state logic
│   └── utils.ts         # Shared semester and date utilities
└── routes/
    ├── +layout.server.ts # Global Gatekeeper
    ├── +layout.svelte    # Global UI & Theme provider
    ├── +page.svelte      # User Dashboard
    ├── admin/            # Admin Dashboards (Users, Events, Review)
    ├── events/           # Attendance pages
    ├── profile/          # Member Profile
    └── signup/           # Application Form
```

## Setup & Installation

### 1. Prerequisites
*   **Node.js**: Version 18+ (Tested on v25).
*   **Notion Token**: Create at [developers.notion.com](https://developers.notion.com/).
*   **Google OAuth**: Create a Client ID at [console.cloud.google.com](https://console.cloud.google.com/).

### 2. Installation
```bash
git clone <repository-url>
npm install
```

### 3. Automated Email Setup
1.  **Enable Gmail API** in Google Cloud Console.
2.  Set project to **"In Production"** on the OAuth consent screen.
3.  Generate an **Admin Refresh Token** via the [Google OAuth2 Playground](https://developers.google.com/oauthplayground/) using the `https://www.googleapis.com/auth/gmail.send` scope.

### 4. Utilities
**Schema Inspector**: Check any Notion database structure:
```bash
node --env-file=.env inspect-db.js <database_id>
```

### 5. Environment Configuration (.env)
```env
AUTH_SECRET=your_secret
GOOGLE_CLIENT_ID=your_id
GOOGLE_CLIENT_SECRET=your_secret
ADMIN_REFRESH_TOKEN=your_token
ADMINS_EMAILS=admin@snu.ac.kr
NOTION_API_KEY=your_key
NOTION_DB_MEMBERS=id
NOTION_DB_ACTIVITIES=id
NOTION_DB_PRIVATE_INFO=id
```

## Tech Stack
- **Frontend**: Svelte 5 (Runes), SvelteKit.
- **Backend**: SvelteKit Server Routes, In-memory Caching.
- **Storage**: Notion (Primary), local JSON (Queue).
- **Theme**: CSS Variables with Dark Mode support.
