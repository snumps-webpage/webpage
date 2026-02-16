# Changelog

All notable changes to this project will be documented in this file.

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
