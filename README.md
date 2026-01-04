# SNUMPS Automation

A secure SvelteKit web application designed to automate membership management and activity tracking for SNUMPS, utilizing Notion as the primary database.

## 🚀 Quick Links
- **[Features Overview](./docs/FEATURES.md)**: Explore the authentication, membership, and attendance systems.
- **[Setup & Installation](./docs/SETUP.md)**: Instructions for local development and Gmail API configuration.
- **[System Architecture](./docs/ARCHITECTURE.md)**: Detailed breakdown of the project structure and hybrid storage model.

## 🌟 Key Highlights
- **Smart Integration**: Two-way sync with multiple Notion databases for members and activities.
- **Security First**: Google OAuth strictly for SNU domains and obfuscated, time-sensitive attendance links.
- **Modern UX**: Svelte 5 (Runes), Dark Mode support, and automatic semester-based filtering.
- **Automation**: Instant email alerts for admins using the Google Gmail REST API.

## 🛠️ Tech Stack
- **Frontend**: Svelte 5 (Runes) & SvelteKit.
- **Backend**: SvelteKit Server Routes with In-memory Caching.
- **Authentication**: Auth.js with Google OAuth.
- **Storage**: Notion (Primary) + Local JSON Cache.
- **Communication**: Google Gmail API.

---
*For more detailed information, please refer to the files in the [docs/](./docs/) directory.*