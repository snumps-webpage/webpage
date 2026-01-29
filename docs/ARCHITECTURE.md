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
│       ├── admin.ts     # Membership application workflow logic
│       ├── cache.ts     # In-memory server-side caching utility
│       ├── events.ts    # Event state & attendance queue management
│       ├── mail.ts      # Google Gmail API service for notifications
│       └── notion.ts    # Centralized Notion API Service (CRUD Helpers, Parsers)
│   ├── constants.ts     # Centralized property names and type constants
│   ├── theme.ts         # Light/Dark mode state logic
│   └── utils.ts         # Shared semester, phone normalization, and date utilities
└── routes/
    ├── +layout.server.ts # Global Context (President info, Admin status)
    ├── +layout.svelte    # Global UI (Footer with Theme Selector, Header)
    ├── +page.server.ts   # Dashboard logic (Profile & Seminar management)
    ├── +page.svelte      # User Dashboard (Stats, Linked Activity Summary)
    ├── admin/            # Admin Dashboard (Applications, Events, Attendance Review)
    ├── events/           # Public Event Pages (Attend actions)
    ├── login/            # Custom styled login page
    ├── notion/           # Raw Database Viewer (Admin only)
    ├── seminar/          # Seminar application/proposal flow
    └── signup/           # Membership Application Form
```

## 💾 Hybrid Storage & Scalability
- **Notion Primary (Source of Truth)**: 
  - **Members & Private Info**: Centralized club registry.
  - **Applications (Signups)**: Membership requests are stored directly in Notion for administrative processing.
  - **Seminar Requests**: Member-led proposals are persisted in Notion until approval.
- **In-Memory Caching (Performance)**: Server-side `Map` cache with TTL is used to reduce Notion API calls for frequent reads (Members, Events). Note: This cache is ephemeral (per-lambda).
- **Sustainability**: All Notion interactions use centralized generic helpers (`notionQuery`, `notionCreate`, `notionUpdate`) with explicit headers and official SDK support for maximum reliability.

## 🛡️ Operations & Error Handling
- **Membership Enforcement**: `+layout.server.ts` verifies membership status globally.
- **Standardized Status Codes**: Actions return detailed HTTP status codes (400, 401, 403, 404, 409, 500) for precise error reporting.
- **NFC Normalization**: Korean property names are normalized to NFC standard to ensure reliable API matching across different operating systems.
- **In-Memory Caching**: Leverages a TTL-based cache to reduce API load and improve dashboard performance.
