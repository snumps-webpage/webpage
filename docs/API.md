# Internal API Documentation

This document describes the server-side API endpoints used by the frontend and external automation services.

> **Note**: All API routes are located in `src/routes/api/`. Most endpoints require authentication or administrative privileges.

---

## 📅 Cron Jobs

### `GET /api/cron/sync-events`

**Purpose**: Automates the event lifecycle management.
- Activates `draft` events when their scheduled date arrives.
- Expires `active` events when their scheduled date passes.
- Validates that linked Notion pages still exist (to prevent broken links).

**Access**: Publicly accessible, but intended for Vercel Cron usage.
**Response**:
- `200 OK`: Sync completed successfully.
- `500 Internal Server Error`: Sync failed.

---

## 🛡️ Admin Utilities

### `GET /api/admin/applications`

**Purpose**: Fetches the list of pending and processed membership applications.
**Access**: **Admin Only** (Checked against `ADMINS_EMAILS`).
**Response**: `JSON` array of application objects.

```typescript
[
  {
    "id": "page-id",
    "email": "user@snu.ac.kr",
    "name": "Hong Gil-dong",
    "phone": "010-1234-5678",
    "department": "Department of Mathematics",
    "background": "...",
    "accepted": false,
    "submittedAt": "ISO-8601-Date"
  }
]
```

### `GET /api/admin/seminar-requests`

**Purpose**: Fetches pending seminar proposals submitted by members.
**Access**: **Admin Only** (Checked against `ADMINS_EMAILS`).
**Response**: `JSON` array of seminar request objects with resolved speaker names.

```typescript
[
  {
    "id": "page-id",
    "title": "Intro to Topology",
    "speakerNames": ["Kim Geon-ho"],
    "status": "pending",
    "submittedAt": "ISO-8601-Date"
    // ...other fields
  }
]
```

---

## 🎨 Asset Generation

### `GET /api/posters/seminar/png`

**Purpose**: Dynamically generates a PNG poster for a specific seminar.
**Query Parameters**:
- `id` (required): The Notion Page ID of the seminar request or activity.
- `template`: (optional) Selector for different poster designs (default: `modern`).

**Mechanism**:
1. Fetches seminar details from Notion.
2. Renders a headless HTML/CSS template server-side.
3. Snapshots the rendered HTML to PNG using `html-to-image` (via headless browser emulation or similar tech).

**Response**:
- `200 OK`: Binary PNG image data (`Content-Type: image/png`).
- `400 Bad Request`: Missing ID.
- `404 Not Found`: Seminar not found.
