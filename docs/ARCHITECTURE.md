# System Architecture

## 📂 Project Structure

```text
src/
├── app.d.ts             # Type definitions (App.Locals, App.PageData)
├── auth.ts              # Auth.js configuration & Google Provider
├── hooks.server.ts      # Auth.js handler hook
├── lib/
│   ├── assets/          # Static assets (favicon, instagram logo)
│   └── server/
│       ├── admin.ts     # Membership application queue logic
│       ├── cache.ts     # In-memory server-side caching utility
│       ├── events.ts    # Event state & attendance queue management
│       ├── mail.ts      # Google Gmail API service for notifications
│       └── notion.ts    # Notion API Wrapper (Client, Pagers, Type Parsers)
│   ├── constants.ts     # Centralized property and type constants
│   ├── theme.ts         # Light/Dark mode state logic
│   └── utils.ts         # Shared semester and date utilities
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

## 💾 Hybrid Storage & Scalability
- **Notion Primary (Source of Truth)**: 
  - **Members & Private Info**: Centralized member registry.
  - **Applications (Signups)**: All membership requests are stored directly in the `APPLICATIONS` database.
  - **Seminar Requests**: Member-led proposals are persisted in the `SEMINAR_REQUESTS` database.
- **Local JSON (Transactional Queue)**:
  - **Events & Attendance**: Attendance timestamps are captured locally in `data/attendance_queue.json` for low-latency recording during high-traffic events. Once an admin approves a record, it is synced to the official `ACTIVITIES` database in Notion.
- **Dual-Write Consistency**: Every creation or update action attempts to write to Notion first, ensuring data persistence and auditability across all club operations.

## 🛡️ Operations & Error Handling
- **Membership Enforcement**: `+layout.server.ts` verifies membership on every request. Non-members are redirected to `/signup`.
- **In-Memory Caching**: Frequent queries (President name, Database Schema, Member lookups) are cached server-side to reduce latency and Notion API load.
- **Resilience**: API checks are wrapped in `try-catch` blocks to prevent service outages during Notion API downtimes.
- **Admin Security**: Unauthorized attempts to access `/admin` or `/notion` result in a silent `302 Redirect` to the homepage, concealing administrative paths.
