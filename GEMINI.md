# Project Context: SNUMPS Webpage

## 1. Project Overview

**SNUMPS Webpage** is a SvelteKit application that runs the SNUMPS club: membership with per-term registration, seminars, studies, attendance, withdrawal, admin tools and a public archive. Data lives in **Supabase** (Postgres + Storage); it was migrated from Notion in 2026-09, and Notion is now read only by migration/repair scripts. See `docs/ARCHITECTURE.md`.

### Key Features

- **Membership:** Google OAuth (`@snu.ac.kr` only), signup → admin approval → term registration; capabilities derive from this term's registration.
- **Seminars:** proposal → approval → schedule → publish (activity + attendance event + one all-member announcement) → optional cancel.
- **Studies & Attendance:** organizer tools, session creation, obfuscated check-in links, admin attendance queue.
- **Admin:** member records, roles, record editors, mail templates/rules, all audited where required.

### Tech Stack

- **Framework:** SvelteKit 2 (Svelte 5 Runes), TypeScript strict
- **Data:** Supabase Postgres as a version-CAS JSONB document store, validated with zod; Supabase Storage behind `/media/<key>`
- **Cache:** in-memory table cache + optional Redis; HTTP responses are always `no-store`
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

- `src/routes/`: route groups are access zones — `(public)`, `(applicant)`, `(member)`, `(admin)`, plus `api/`.
- `src/lib/domain/`: pure, browser-safe logic, view types and input schemas.
- `src/lib/server/`:
  - `guards/`: zone decisions (`zone.ts`) and session → member resolution.
  - `data/`: `store.ts` (the only Supabase data access), `tables.ts` (`getTable`/`mutate`), `schemas/` (zod).
  - `services/`: membership, seminars, studies, events, uploads, withdrawal, admin records.
  - `mail/`: Gmail transport, event catalog, rule/template resolution.

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

- **Obscurity**: Non-admins get `404 Not Found` in the `(admin)` zone, never a redirect. The `(member)` zone redirects to `/login`, `/signup` or `/wait`.
- **Data Safety**: Validate inputs with the domain zod schemas; every table write goes through `mutate` (schema-checked). Public loads return projected views only — never raw rows or PII.
- **Production Hardening**: Source maps are disabled; every SSR response is `no-store` (no ISR, no prerender).

#### 4. Caching

- **Table cache only**: `getTable` caches `table_<name>` keys and `mutate` invalidates them. Do not add derived cache keys.
- **Ephemeral Nature**: Caches are per-instance (local TTL ≤ 15 s for tables). Never rely on them for consistency.

#### 5. Development Performance

- **Up to date**: Ensure that all the modules used are up to date, checked for deprecations, updates, and API changes.
- **Optimization**: Use the modules and patterns that best optimize performance (e.g., streaming, caching).

### Coding Style

- **Svelte 5**: Use Runes (`$state`, `$derived`, `$props`) exclusively. Avoid legacy `export let` or `$:`.
- **Styling**: Use CSS variables (`var(--bg-primary)`, etc.) for all colors to ensure Dark Mode compatibility.
- **UX**: Ensure all interactive elements have `user-select: none` for a native app feel. Use Skeleton loaders for async data.
