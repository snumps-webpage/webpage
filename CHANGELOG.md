# Changelog

All notable changes to this project will be documented in this file.

## [2026-09-27] — `chore/code-audit-v2`

> The first entry since the move from Notion to Supabase. Deploy order matters:
> apply the two new migrations **before** deploying this code (docs/OPERATOR-TODO.md §2-2).

### Changed

- **Multi-document writes run in one transaction.** Seminar publish/cancel/reschedule/delete,
  check-in, attendance decisions, event delete, application and request approvals, study
  sessions, withdrawal (with its audit row) and record deletes are plpgsql functions
  (`supabase/migrations/20260928000000_atomic_flows.sql`, docs/spec/ATOMIC-FLOWS.md). This
  closes races the tests reproduced on the old code — among them a rejected applicant left as
  a member, a withdrawn request that still got its seminar, duplicate study session numbers,
  and a withdrawal without its audit record.
- **Local data backend is PGlite**, an in-process Postgres running the same migrations, so
  tests and `DATA_BACKEND=memory` execute the production SQL.
- **Every form action validates with its domain schema** and answers per-field issues
  (signup, seminar/study requests, account settings, study management, admin dashboard,
  record editors, event forms, upload presign).
- **Seminar requests**: the form starts with the requester as presenter; the request stores
  its kind; a deleted cancelled seminar keeps its request, shown as 취소됨.
- **Login** admits only verified addresses issued by the SNU Workspace (`hd=snu.ac.kr`).
- **Announcements** go to this term's registered members and alumni only.
- `publicationStatus` is stored explicitly on every seminar (migration
  `20260928000100_seminar_publication_status.sql`); the schema default is gone.
- Tooling: pnpm, Prettier over the whole repo (CI checks it), zod ^3.25.

### Fixed

- `?redirect=` after login stays on this site (dot-segment open redirect).
- A member re-applying for the term reaches `/wait`.
- The dashboard ledger and profile panel answer with what they render; a refused apply says why.
- Deleting a cancelled seminar no longer resurfaces its activity; bare 010XXXXXXXX phones display hyphenated.
- Guard refusals carry `no-store`; admin notices no longer show raw error codes; an unknown
  study status answers 400 instead of 500.
- Terms are derived by one KST rule everywhere (`$lib/domain/term`) — the page helper
  mis-filed UTC instants near a term boundary.

### Removed

- The dev fixture data layer (about 4,300 lines) the backend loads superseded, the
  frontend branch's unused page-data types, helpers the flows replaced, and study session
  auto-generation.

### Added

- `scripts/measure`: an end-to-end measurement harness (isolated copy + memory backend,
  scenarios, parallel races, real-backup crawl, a browser check over CDP).

## [2026-03-02]

### Added

- **Robust Admin Approval Flow**:
- **Instant Throttling**: The "Accept" button for membership applications and seminar requests now disables immediately upon the first click to prevent accidental duplicate actions and race conditions.
- **State-Driven Verification**: Integrated a robust backend verification step during approval that confirms successful Notion record creation and status updates before returning success.
- **Code Centralization & Optimization**: Refactored redundant logic across the server-side code into shared utilities:
  - Centralized **Google account name parsing** into `$lib/utils.ts`.
  - Unified **searchable member list generation** and **actual name resolution** (Member DB with fallback) into `$lib/server/admin.ts`.
  - Streamlined all seminar and signup routes to use these helpers, significantly reducing code duplication and improving maintainability.
- **Centralized Action Components**: Refactored all administrative buttons into a reusable `ActionButton` component. This centralizes the logic for instant throttling, loading indicators, confirmation dialogs, and automated state refreshing, significantly improving code maintainability.
- **Dual-Database Seminar Records**: Approving a seminar now automatically creates records in both the **Activity DB** (for attendance tracking) and the **Seminar DB** (for historical cataloging), ensuring cross-referenced data integrity.
- **Accurate Poster Naming**: Updated the seminar application and edit flows to retrieve the user's actual registered name from the Member database for posters, replacing the previous reliance on Google account names.
- **Seamless UI Sync**: Implemented automatic, non-disruptive background refreshing of the application list after successful approval, ensuring the UI accurately reflects the real-time state in Notion. - **Comprehensive Feedback**: Improved error handling with descriptive toast notifications for both success and failure states, including specific error messages from the backend.
- **Mobile Consistency**: Extended the same robust approval and rejection logic to the mobile card-based views, ensuring a uniform experience across all devices.

## [2026-02-28]

### Changed

- **Dynamic Executive Information**: Replaced hardcoded "회장" (President) and "부회장" (Vice President) names and phone numbers on the main page with live data fetched from the Notion DB.
- **Executive Retrieval Logic**: Enhanced the Notion service to automatically identify the latest executives by semester score and retrieve their contact details from the linked private info database.
- **Global Layout Integration**: Updated the site-wide footer and dashboard components to use the centralized executive data for consistent information display.
- **Abstract Section Styling**: Enhanced the visual prominence of the Abstract section on the landing page with a decorative drop cap and section marker (∫) to reinforce the academic manuscript aesthetic.
- **Visual Scroll Bridge**: Added a vertical "Section Guide" connector and a viewport-peeking effect to the cover page to naturally lead users from the front matter into the Abstract.

## [2026-02-16]

### Added

- **Double-Click Prevention**: Implemented state-based submission tracking (`submitting`/`processing`) for all registration and seminar application forms to prevent duplicate database entries.
- **Responsive Card Views**: Fully refactored the Notion DB and Admin dashboards to automatically switch from dense tables to touch-friendly, card-based layouts on mobile devices.
- **DB Page Enhancements**: Added multi-column sorting (Ascending/Descending/Neutral) with arrow indicators and streamlined the displayed information to name, department, registration date, and direct Notion links.
- **Admin Notifications**: Automated email notifications to admins when new membership applications are submitted and integrated automated welcome emails for approved members.
- **Mobile Menu Compliance**: Implemented a sticky hamburger menu for the global header with full dark-mode support for the menu icon.

### Changed

- **Semantic Line Breaking**: Global implementation of `word-break: keep-all` and phrase-wrapping spans across landing, dashboard, and application pages to prevent awkward mid-word breaks and improve readability.
- **Responsive Scaling**: Integrated `clamp()` and `box-sizing: border-box` across all main containers and components to eliminate horizontal overflow and blank space on varying screen sizes.
- **President Retrieval**: Refactored the footer logic to automatically detect the latest president based on semester tags (e.g., "25-2") instead of relying on the current date.
- **URL Cleanup**: Automated the removal of the `?refresh=` cache-busting timestamp from the browser's address bar after a manual dashboard refresh.
- **Global Layout**: Standardized header heights using shared CSS variables and implemented `min-height: 100dvh` to ensure full viewport coverage.

### Fixed

- **Sticky Header Occlusion**: Resolved layout bugs where sticky search bars and controls were hidden behind the global navigation header.
- **Viewport Background Gap**: Fixed a persistent gap issue at the bottom of mobile browsers by stabilizing the background gradient on the `html` element.
- **Type Safety**: Improved TypeScript definitions for dashboard data and resolved various linting warnings regarding unique keys and reactive state.

## [2026-02-10]

### Added

- **"Math Journal" Aesthetic**: A deep UI overhaul moving beyond generic distribution to a distinctive academic look.
  - **Typography**: Replaced generic fonts with `Crimson Pro` (Body), `Newsreader` (Headers), and `Gowun Batang` (Korean Serif) for an editorial, prestigious feel.
  - **Atmospheric Background**: Implemented a layered radial gradient mimicking textured paper depth.
  - **Staggered Animations**: Added orchestrated entrance animations (`slide-up-fade`) for dashboard cards and list items.
  - **Technical Micro-interactions**: Minimal, monospaced pill buttons with sharp hover states for an "academic tool" feel.
- **Deploy Script**: Added `npm run deploy:preview` for quick Vercel staging builds.

### Changed

- **Layout Integrity**: Restored structural CSS and navigation logic accidentally omitted during aesthetic updates.
- **Navigation UX**: Reverted to pure CSS `:hover` based dropdowns for snappier interaction.
- **Form Aesthetics**: Updated all input fields, buttons, and badges to match the Journal theme with refined borders and focus states.

## [2026-02-09]

### Added

- **Global Toast System**: Implemented a non-blocking notification system to replace traditional `alert()` calls for better UX.

- **Resilient Dashboard**: Enhanced dashboard to handle Notion API failures gracefully by showing structured "Empty Slots".

- **Dashboard Refresh**: Integrated a manual refresh button to bypass cache.

### Changed

- **Admin UX**: Replaced the recruitment application carousel with a structured, paginated table for better efficiency.

- **Performance**: Optimized dashboard activity filtering and seminar speaker search using `$derived` and `Set` lookups.

- **Attendance UX**: Added a visual loading state and success confirmation screen to the event attendance page.

- **Validation**: Implemented consistent phone number pattern validation on the signup page.

- **Layout Fix**: Resolved button alignment and box-model calculation issues.

- **Server Caching**: Extended `withCache` wrapper to `getApplications` and `getSeminarRequests` to improve admin dashboard performance.
- **Project Maintenance**: Resolved several ESLint warnings regarding unused variables and missing Svelte loop keys.

## [2026-02-08]

### Added

- **Prestigious Heritage Theme**: A complete UI overhaul implementing an "Ivy League" academic aesthetic.
  - New typography: Playfair Display & Nanum Myeongjo for headers, Inter & Noto Sans KR for body.
  - Bilingual optimization: Balanced font weights for English and Korean.
  - Data Clarity: JetBrains Mono applied to emails, phone numbers, dates, and IDs to eliminate character ambiguity (e.g., 0 vs o).
  - Refined Color Palette: Warm paper backgrounds, deep academic navy/teal accents, and flattened "print-like" UI components.

### Fixed

- **Performance Latency**: Reduced action delays by up to 50% through:
  - In-memory caching of Google OAuth Access Tokens (Mail Service).
  - Parallelizing independent Notion API requests in admin actions.
  - Implementing a self-cleaning caching mechanism to prevent memory leaks.
- **UI Consistency**: Standardized status badges, button shapes, and card headers across all routes.
