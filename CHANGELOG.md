# Changelog

All notable changes to this project will be documented in this file.

## [2026-02-09]

### Added

- **Global Toast System**: Implemented a non-blocking notification system to replace traditional `alert()` calls for better UX.

- **Resilient Dashboard**: Enhanced dashboard to handle Notion API failures gracefully by showing structured "Empty Slots".

- **Dashboard Refresh**: Integrated a manual refresh button to bypass cache.

- **Accessible Navigation**: Replaced hover-based dropdowns with accessible `<details>/<summary>` components.



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
