# SNUMPS Automation

A secure SvelteKit web application designed to automate membership management and activity tracking for SNUMPS, utilizing Notion as the primary database.

## Features

### 🔐 Authentication & Security
- **Google OAuth**: Secure login via Auth.js, restricted strictly to `@snu.ac.kr` domains.
- **Role-Based Access**: Distinguishes between regular Members and Admins.
- **Obfuscated Attendance Links**: Generates unique, randomized URLs (e.g., `/events/[id]/[random_code]`) for "Attend" and "Leave" actions to prevent unauthorized attendance logging.
- **Input Validation**: Server-side checks prevent IDOR attacks and unauthorized data manipulation.

### 👥 Membership System
- **Signup Flow**: New users are redirected to a registration form. Upon submission, an **automated email notification** containing the applicant's name is sent to all admins via the Google Gmail API. Applications are then queued locally for review.
- **User Profile**: Members can view their full activity history (with semester filtering) and manage personal details (Phone, Bio, Background).
- **Search & Filtering**: Admins can search the full member database by **Name** or **Department** with an intuitive toggle.

### 📅 Event & Attendance System
- **Event Lifecycle**: Admins can Create (Draft), Activate (Publish), Expire, and Delete events.
- **Attendance Tracking**:
  - Users check in/out via time-sensitive, obfuscated links.
  - Records are queued locally (`data/attendance_queue.json`) for review.
  - **Admin Review**: Admins can approve (syncs to Notion), reject, or **manually edit timestamps** if corrections are needed.

### 📝 Notion Integration & UI
- **Smart Paging**: Handles large member lists via recursive fetching (bypassing the 100-record limit).
- **Automatic Linking**: Activity titles in the user dashboard automatically link to their published Notion pages.
- **Global Navigation**:
  - **Header**: Includes quick-access circle buttons for **Admin** and **DB** management (visible to admins only).
  - **Universal Footer**: Displays current semester information, the Club President's name, and contact links (Email, Instagram).

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
│       ├── events.ts    # Event state & attendance queue management (JSON)
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

## Data Architecture

The application uses a hybrid storage model:

1.  **Notion (Primary Source of Truth)**:
    *   **Members DB**: Official member status, join dates, and roles.
    *   **Activities DB**: Published events and linked attendance records.
    *   **Private Info DB**: Sensitive PII (Phone, Bio).

2.  **Local JSON (Transactional/Temporary)**:
    *   Stored in `data/` (gitignored).
    *   `applications.json`: Pending signup requests.
    *   `events.json`: Event configurations, codes, and draft states.
    *   `attendance_queue.json`: Raw timestamp logs waiting for Admin approval.

## Tech Stack

- **Frontend**: **Svelte 5** & **SvelteKit** for a reactive and efficient user interface.
- **Styling**: Standard **CSS** with a focus on modern, responsive design.
- **Authentication**: **Auth.js** (@auth/sveltekit) with **Google OAuth**.
- **Integration**: **Notion API** (@notionhq/client) for robust club data management.
- **Backend/Storage**: **SvelteKit Server Routes**, **Notion**, and **Local JSON**.

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