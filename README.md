# SNUMPS Automation

A secure SvelteKit web application designed to automate membership management and activity tracking for SNUMPS, utilizing Notion as the primary database.

## Features

### 🔐 Authentication & Security
- **Google OAuth**: Secure login via Auth.js, restricted strictly to `@snu.ac.kr` domains.
- **Role-Based Access**: Distinguishes between regular Members and Admins.
- **Obfuscated Attendance Links**: Generates unique, randomized URLs (e.g., `/events/[id]/[random_code]`) for "Attend" and "Leave" actions to prevent unauthorized attendance logging.
- **Input Validation**: Server-side checks prevent IDOR attacks and unauthorized data manipulation.

### 👥 Membership System
- **Signup Flow**: New users are redirected to a registration form. Applications are queued locally for Admin approval before being synced to Notion.
- **User Profile**: Members can view their cumulative activity history and manage personal details (Phone, Bio, Background).
- **Managed Withdrawal**: Users can request withdrawal via the footer; Admins review and execute these requests to update the Notion database.

### 📅 Event & Attendance System
- **Event Lifecycle**: Admins can Create (Draft), Activate (Publish), Expire, and Delete events.
- **Attendance Tracking**:
  - Users check in/out via time-sensitive links.
  - Records are queued in a local database (`data/attendance_queue.json`).
  - **Admin Review**: Admins can approve (syncs to Notion) or reject records, and **edit timestamps** manually if corrections are needed.

### 📝 Notion Integration
- **Two-Way Sync**: Fetches member data and activity logs; pushes new members and attendance records.
- **Smart Pagination**: Handles large member lists via recursive fetching.
- **Dynamic Context**: Automatically calculates the current semester and fetches the current Club President's name from the "Executives" property in Notion.

## Project Structure

```text
src/
├── auth.ts              # Auth.js configuration & Google Provider
├── lib/
│   ├── assets/          # Static assets (favicon)
│   └── server/
│       ├── admin.ts     # Membership application & withdrawal queue logic (JSON)
│       ├── events.ts    # Event state & attendance queue management (JSON)
│       └── notion.ts    # Notion API Wrapper (Client, Pagers, Type Parsers)
└── routes/
    ├── +layout.server.ts # Global Gatekeeper (Redirects non-members to /signup)
    ├── +layout.svelte    # Global UI (Navigation, Logo)
    ├── +page.svelte      # User Dashboard (Stats, Summary)
    ├── admin/            # Admin Dashboard (Applications, Events, Attendance Review)
    ├── events/           # Public Event Pages (Attend/Leave actions)
    ├── login/            # Custom styled login page
    ├── notion/           # Raw Database Viewer (Admin only)
    ├── profile/          # Member Profile & Edit Form
    └── signup/           # Application Form
```

## Data Architecture

The application uses a hybrid storage model:

1.  **Notion (Primary Source of Truth)**:
    *   **Members DB**: Stores official member status, join dates, and roles.
    *   **Activities DB**: Stores published events and linked attendance records.
    *   **Private Info DB**: Stores sensitive PII (Phone, Bio).

2.  **Local JSON (Transactional/Temporary)**:
    *   Stored in `data/` (gitignored).
    *   `applications.json`: Pending signup requests.
    *   `events.json`: Event configurations, codes, and draft states.
    *   `attendance_queue.json`: Raw timestamp logs waiting for Admin approval.
    *   `withdrawal_requests.json`: Pending withdrawal requests.

## Tech Stack

- **Frontend**: **Svelte 5** & **SvelteKit** for a reactive and efficient user interface.
- **Styling**: Standard **CSS** with a focus on modern, responsive design.
- **Authentication**: **Auth.js** (@auth/sveltekit) with **Google OAuth** for secure, domain-restricted access.
- **Integration**: **Notion API** (@notionhq/client) for robust club data management.
- **Backend/Storage**: **SvelteKit Server Routes** for logic, **Notion** as the primary DB, and **Local JSON** for temporary transactional queuing.

## Setup & Installation

### 1. Prerequisites
*   Node.js (LTS)
*   A Notion Integration Token
*   Google Cloud OAuth Credentials

### 2. Installation
```bash
git clone <repository-url>
cd snumps-automation-fork
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:

```env
# Auth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
AUTH_SECRET=your_generated_secret

# Access Control
ADMINS_EMAILS=admin@snu.ac.kr,president@snu.ac.kr

# Notion
NOTION_API_KEY=your_integration_token
NOTION_DB_MEMBERS=id_of_members_db
NOTION_DB_ACTIVITIES=id_of_activities_db
NOTION_DB_PRIVATE_INFO=id_of_private_info_db
```

### 4. Running Locally
```bash
npm run dev
```

## Deployment

```bash
npm run build
```
*Note: Ensure the deployment environment allows writing to the `data/` directory for the local JSON databases to function.*
