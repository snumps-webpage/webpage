# Project Context: SNUMPS Automation

## 1. Project Overview
**SNUMPS Automation** is a secure SvelteKit web application designed to automate membership management, activity tracking, and seminar organization for the SNUMPS club. It utilizes **Notion** as the primary persistent database while employing a local JSON caching layer for performance and reliability.

### Key Features
*   **Membership System:** Google OAuth login (restricted to `@snu.ac.kr`), automated signup flow, and profile management.
*   **Event & Attendance:** Admin-managed events with automated activation/expiration based on IANA timezones. One-click attendance tracking for members.
*   **Seminar System:** Member-led seminar proposals with a full approval workflow, including automated Notion page creation and email notifications.
*   **Hybrid Storage:** "JSON-First, Notion-Fallback" architecture ensures high availability and resilience against Notion API limits or downtime.

### Tech Stack
*   **Framework:** SvelteKit (Svelte 5 Runes)
*   **Language:** TypeScript
*   **Database:** Notion API (Primary), Local JSON (Cache)
*   **Auth:** Auth.js (Google Provider)
*   **Styling:** Custom CSS with CSS Variables (Dark Mode supported)

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
*   `src/routes/`: SvelteKit file-based routing.
    *   `admin/`: Restricted administrative dashboard (returns 404 for unauthorized users).
    *   `events/`: Public attendance check-in pages.
    *   `seminar/`: Seminar application flow.
*   `src/lib/server/`: Server-side business logic.
    *   `notion.ts`: Low-level Notion API wrapper and type parsers.
    *   `events.ts`: Event lifecycle and attendance queue logic.
    *   `seminars.ts`: Seminar request queue logic.
    *   `admin.ts`: Membership application logic.
    *   `mail.ts`: Gmail API integration for notifications.
*   `data/`: Local JSON storage for transactional data (Signups, Attendance, Seminars).

### Operational Protocols

#### 0. Action
*   **Plan**: When prompted, always write the to-do list before implementation.

#### 1. Version Control (Git)
*   **Integrity Checks**: Always check for errors (e.g., `npm run check`), and only keep versions if all the errors were handled.
*   **Atomic Commits**: Commit changes by **functional unit** or **feature**, not by file or session end.
*   **Frequency**: Execute `git add` and `git commit` frequently to maintain a granular, industry-standard history.
*   **Messages**: Use explicit, descriptive commit messages that clearly explain the context of the change.
*   **Workflow**: Complete a specific functionality -> Commit immediately -> Proceed to next task.
*   **Statements**: Don't use words like "finalize", which can be redundant or overstating/oversimplifying the stage. Always use direct words, explicit explanations that allows easy tracking of the project.

#### 2. Documentation
*   **Continuous Updates**: Ensure `README.md` is **always** synchronized with the current codebase.
*   **Feature Reflection**: Update documentation immediately after implementing any new feature, architectural change, or setup requirement.
*   **Schema Reference**: Refer to `docs/schema.md` for the latest Notion database property definitions.

#### 3. Security
*   **Obscurity**: Unauthorized access to admin routes must return `404 Not Found`, not a redirect (except for `events/*` and `seminar/*`).
*   **Data Safety**: Always sanitize inputs and use strict typing for Notion interactions.
*   **Production Hardening**: Source maps are disabled; `robots.txt` blocks crawling.

#### 4. Hybrid Storage
*   **Dual-Write**: All write operations must attempt to write to Notion *first*, then update the local JSON cache.
*   **Fallback-Read**: Read operations prioritize the local cache but automatically fall back to Notion and sync the cache if it is empty.

#### 5. Development Performance
*   **Up to date**: Ensure that all the modules used are up to date, checked for deprecations, updates, and API changes.
*   **Optimization**: Use the modules and patterns that best optimize performance (e.g., streaming, caching).

### Coding Style
*   **Svelte 5**: Use Runes (`$state`, `$derived`, `$props`) exclusively. Avoid legacy `export let` or `$:`.
*   **Styling**: Use CSS variables (`var(--bg-primary)`, etc.) for all colors to ensure Dark Mode compatibility.
*   **UX**: Ensure all interactive elements have `user-select: none` for a native app feel. Use Skeleton loaders for async data.
