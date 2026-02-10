# Changelog

All notable changes to this project will be documented in this file.

## [2026-02-09]

### Added
- **Global Utilities**: Implemented `.no-sel` global CSS class in `+layout.svelte` for reusable text-selection disabling.
- **Resilient Dashboard**: Enhanced dashboard to handle Notion API failures gracefully by showing structured "Empty Slots" and informative retry messages instead of crashing.
- **Dashboard Refresh**: Integrated a manual refresh button to bypass cache and force data synchronization.
- **Admin App Privacy**: Moved sensitive details (email, phone number) into a collapsible "View More" dropdown in the registration application view.
- **UI Refinement**: Moved "New Seminar Application" button to the top of the seminar management card for better accessibility.
- **Submission Feedback**: Added a skeleton-based loading state to the seminar application form to provide visual feedback during submission.
- **Layout Fix**: Resolved button alignment issues in the seminar application success message by correcting box-model calculations.

### Changed
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
