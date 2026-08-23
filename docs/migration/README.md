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

> **처음 이 디렉터리를 보는 사람은 [`HANDOFF.md`](./HANDOFF.md)부터 읽을 것.**

## Current

| File | Describes | Status |
| :--- | :--- | :--- |
| [`REFERENCES.md`](./REFERENCES.md) | What to consult: repo files, AWS documentation by title, the Notion endpoints used for the survey, and which skills are worth reaching for | Current |
| [`HANDOFF.md`](./HANDOFF.md) | Onboarding for anyone picking this branch up: branch stack, environment gaps, toolchain traps, what is startable today and what is blocked on whom | Current |
| [`seminar-events.md`](./seminar-events.md) | Porting event sign-up, presenter-side attendance management, and seminar announcement mail from the `seminar` branch (`fd7e482`) | Not started |
| [`design-concept.html`](./design-concept.html) | Visual concept for the public zone — presented as a paper, one figure per new route. Explicitly not a port of Notion's look | Draft |
| [`notion-site-inventory.md`](./notion-site-inventory.md) | What is publicly published at snumps.notion.site: 22 public nodes, 5 public databases / 351 rows (9 databases / 605 rows in total), 90 attachments. Shared input to the two plans below | Survey complete |
| [`notion-pages-to-web.md`](./notion-pages-to-web.md) | Moving the public Notion pages into this app as real routes | Not started |
| [`notion-replacement-tasks.md`](./notion-replacement-tasks.md) | The consolidated task list for replacing Notion — decisions, blockers, tracks A/B/P/C/D, dependency graph. Start here | Not started |
| [`notion-db-to-s3.md`](./notion-db-to-s3.md) | Replacing Notion outright — 9 databases / 605 rows and 90 attachments to S3, plus the editing UI and upload path that have to be built to make that possible | Not started |
