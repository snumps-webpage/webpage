# Project Context: SNUMPS Automation

## 1. Project Overview

**SNUMPS Automation** is a secure SvelteKit web application designed to automate membership management, activity tracking, and seminar organization for the SNUMPS club. It utilizes **Notion** as the primary persistent database while employing a local JSON caching layer for performance and reliability.

### Key Features

- **Membership System:** Google OAuth login (restricted to `@snu.ac.kr`), automated signup flow, and profile management.
- **Event & Attendance:** Admin-managed events with automated activation/expiration. One-click attendance tracking for members.
- **Seminar System:** Member-led seminar proposals with a full approval workflow, including automated Notion page creation and email notifications.
- **Performance Caching:** In-memory caching layer reduces Notion API load and improves dashboard responsiveness.

### Tech Stack

- **Framework:** SvelteKit (Svelte 5 Runes)
- **Language:** TypeScript
- **Database:** Notion API (Primary), In-Memory Cache
- **Auth:** Auth.js (Google Provider)
- **Styling:** Custom CSS with CSS Variables (Dark Mode supported)

## 2. Building and Running

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Production

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### Quality Assurance

```bash
# Run type checks and svelte-check
npm run check

# Lint code
npm run lint
```

## 3. Architecture & Conventions

### Directory Structure

- `src/routes/`: SvelteKit file-based routing.
  - `admin/`: Restricted administrative dashboard (returns 404 for unauthorized users).
  - `events/`: Public attendance check-in pages.
  - `seminar/`: Seminar application flow.
- `src/lib/server/`: Server-side business logic.
  - `notion.ts`: Low-level Notion API wrapper and type parsers.
  - `events.ts`: Event lifecycle and attendance queue logic.
  - `seminars.ts`: Seminar request queue logic.
  - `admin.ts`: Membership application logic.
  - `mail.ts`: Gmail API integration for notifications.

### Operational Protocols

#### 0. Action

- **Plan**: When prompted, always write the to-do list before implementation.

#### 1. Version Control (Git)

- **Integrity Checks**: Always check for errors (e.g., `npm run check`), and only keep versions if all the errors were handled.
- **Atomic Commits**: Commit changes by **functional unit** or **feature**, not by file or session end.
- **Frequency**: Execute `git add` and `git commit` frequently to maintain a granular, industry-standard history.
- **Messages**: Use explicit, descriptive commit messages that clearly explain the context of the change.
- **Workflow**: Complete a specific functionality -> Commit immediately -> Proceed to next task.
- **Statements**: Don't use words like "finalize", which can be redundant or overstating/oversimplifying the stage. Always use direct words, explicit explanations that allows easy tracking of the project.

#### 2. Documentation

- **Synchronized State**: Ensure `README.md` and all modular documentation within the `docs/` directory are **always** synchronized with the current codebase.
- **Modular Updates**: Update the appropriate specific document (e.g., `docs/FEATURES.md` for feature changes, `docs/ARCHITECTURE.md` for system changes, `docs/SETUP.md` for configuration changes) immediately after implementation.
- **Quick Links**: Ensure the main `README.md` maintains accurate summaries and links to the detailed modular documents.

#### 3. Security

- **Obscurity**: Unauthorized access to admin routes must return `404 Not Found`, not a redirect (except for `events/*` and `seminar/*`).
- **Data Safety**: Always sanitize inputs and use strict typing for Notion interactions.
- **Production Hardening**: Source maps are disabled; `robots.txt` blocks crawling.

#### 4. In-Memory Caching

- **Ephemeral Nature**: Caches are per-instance and ephemeral. Do not rely on them for persistent storage or critical data consistency.
- **TTL Strategy**: Use short TTLs (e.g. 1-5 minutes) for frequent reads to balance performance with data freshness.

#### 5. Development Performance

- **Up to date**: Ensure that all the modules used are up to date, checked for deprecations, updates, and API changes.
- **Optimization**: Use the modules and patterns that best optimize performance (e.g., streaming, caching).

### Coding Style

- **Svelte 5**: Use Runes (`$state`, `$derived`, `$props`) exclusively. Avoid legacy `export let` or `$:`.
- **Styling**: Use CSS variables (`var(--bg-primary)`, etc.) for all colors to ensure Dark Mode compatibility.
- **UX**: Ensure all interactive elements have `user-select: none` for a native app feel. Use Skeleton loaders for async data.
