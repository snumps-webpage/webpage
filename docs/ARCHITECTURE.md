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
- **JSON First, Notion Fallback**: Transactional data (applications and attendance requests) is stored locally in JSON files for low-latency access but mirrored to Notion databases for persistence and serverless scalability.
- **Self-Healing Cache**: If local JSON files are lost or empty (e.g., after a server redeploy), the system automatically restores the cache by fetching the source of truth from Notion.
- **Robust Source Sync**: The system verifies the existence of linked Notion pages in real-time. If a page is deleted or archived in Notion, the local record is automatically purged.
- **Dual-Write Consistency**: Every creation or update action attempts to write to Notion first, followed by a local cache update.

## 🛡️ Operations & Error Handling
- **Membership Enforcement**: `+layout.server.ts` verifies membership on every request. Non-members are redirected to `/signup`.
- **In-Memory Caching**: Frequent queries (President name, Database Schema, Member lookups) are cached server-side to reduce latency and Notion API load.
- **Resilience**: API checks are wrapped in `try-catch` blocks to prevent service outages during Notion API downtimes.
- **Admin Security**: Unauthorized attempts to access `/admin` or `/notion` result in a silent `302 Redirect` to the homepage, concealing administrative paths.
