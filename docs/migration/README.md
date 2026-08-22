# Migration Working Documents

Transient specifications for work that is planned but not yet done.

These files sit **outside** the documentation taxonomy in
[`../MAINTAINING_DOCS.md`](../MAINTAINING_DOCS.md). That taxonomy governs the permanent
documentation set — documents that describe the system as it is. A migration spec describes
work that has not happened yet, so it does not belong there.

## Lifecycle

1. A spec is added here before the work starts, once the target has been read against the
   current implementation rather than from memory.
2. It is updated as the work proceeds, so that a handoff mid-migration is possible.
3. When the migration lands, **the file is deleted.** Anything worth keeping moves into the
   permanent set: user-facing capability into `FEATURES.md`, Notion properties into
   `schema.md`, structural consequences into `ARCHITECTURE.md`.

A stale file in this directory is a bug. If the work described here is already done, delete it.

## Current

| File | Describes | Status |
| :--- | :--- | :--- |
| [`seminar-events.md`](./seminar-events.md) | Porting event sign-up, presenter-side attendance management, and seminar announcement mail from the `seminar` branch (`fd7e482`) | Not started |
| [`notion-site-inventory.md`](./notion-site-inventory.md) | What is publicly published at snumps.notion.site: 20 nodes, 5 databases / 351 rows, 85 attachments. Shared input to the two plans below | Survey complete |
| [`notion-pages-to-web.md`](./notion-pages-to-web.md) | Moving the public Notion pages into this app as real routes | Not started |
| [`notion-db-to-s3.md`](./notion-db-to-s3.md) | Moving attachments to S3, and what can and cannot follow them | Not started |
