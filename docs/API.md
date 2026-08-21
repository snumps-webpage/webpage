# Internal API Documentation

This document describes the server-side HTTP endpoints under `src/routes/api/`. These are the
only routes that respond outside the normal SvelteKit page/action flow — everything else the UI
needs is served through `+page.server.ts` loaders and form actions.

> Every endpoint here is guarded. None of them are safe to expose to anonymous callers.

---

## 📅 Cron Jobs

### `GET /api/cron/sync-events`

**Purpose**: Drives the event lifecycle so nobody has to flip statuses by hand.
Delegates to `syncEventStatuses()` in `src/lib/server/events.ts`, which activates `draft` events
once their date arrives, expires `active` events once it passes, and drops records whose linked
Notion page has disappeared.

**Access**: Bearer token. When `CRON_SECRET` is set, the request must carry
`Authorization: Bearer <CRON_SECRET>`; anything else is rejected.

> **Caveat**: if `CRON_SECRET` is unset the check is skipped entirely and the endpoint becomes
> publicly callable. Always set it in production.

**Responses**:

| Status | Body | When |
| :--- | :--- | :--- |
| `200` | `{ "success": true }` | Sync completed |
| `401` | `{ "error": "Unauthorized" }` | Missing or wrong bearer token |
| `500` | `{ "error": "Sync failed" }` | `syncEventStatuses()` threw |

---

## 🛡️ Admin Utilities

Both endpoints authenticate the Auth.js session and then check it against `isAdmin()`
(`src/lib/server/admin.ts`), which reads the comma-separated `ADMINS_EMAILS` list.
See [AUTH_VARS.md](./AUTH_VARS.md). A failed check returns `401`, not `403`.

### `GET /api/admin/applications`

**Purpose**: Full list of membership applications, pending and processed alike.
**Ordering**: Ascending by `submittedAt` (oldest first).
**Response**: `200` with a JSON array.

```jsonc
[
  {
    "id": "page-id",
    "email": "user@snu.ac.kr",
    "name": "홍길동",
    "phone": "010-1234-5678",
    "department": "수리과학부",
    "background": "...",
    "accepted": false,
    "submittedAt": "ISO-8601-Date"
  }
]
```

### `GET /api/admin/seminar-requests`

**Purpose**: Seminar proposals awaiting a decision.
**Filtering**: **Pending only** — `approved` and `rejected` requests are excluded.
**Ordering**: Ascending by `submittedAt`.
**Enrichment**: `speakerIds` are resolved against the Members DB into a `speakerNames` array.
An id with no matching member resolves to `"Unknown"` rather than failing the request.
**Response**: `200` with a JSON array.

```jsonc
[
  {
    "id": "page-id",
    "title": "Intro to Topology",
    "description": "...",
    "prerequisites": "...",
    "duration": "...",
    "speakerIds": ["member-page-id"],
    "speakerNames": ["김건호"],
    "status": "pending",
    "submittedAt": "ISO-8601-Date"
  }
]
```

---

## 🎨 Asset Generation

### `POST /api/posters/seminar/png`

**Status**: **Retired.** The route still exists so that stale clients get a clear answer instead
of a 404, but it always responds `410 Gone`:

```json
{
  "error": "Server-side poster rendering is disabled. Use the seminar form preview download button instead."
}
```

**Why**: Poster rendering moved to the client. `SeminarPoster.svelte` renders the poster in the
browser and `SeminarPosterDownloadPanel.svelte` exports it, which removes a headless-browser
dependency from the serverless runtime.

**Note**: There is no `GET` handler. A `GET` request 405s.
