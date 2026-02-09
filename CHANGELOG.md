# Changelog

All notable changes to this project will be documented in this file.

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
