# SNUMPS Automation

A secure SvelteKit web application designed to automate membership management and activity tracking for SNUMPS, utilizing Notion as the primary database.

## 🚀 Quick Links
- **[Features Overview](./docs/FEATURES.md)**: Explore the authentication, membership, and attendance systems.
- **[Setup & Installation](./docs/SETUP.md)**: Instructions for local development and Gmail API configuration.
- **[System Architecture](./docs/ARCHITECTURE.md)**: Detailed breakdown of the project structure and hybrid storage model.

## 🌟 Key Highlights
- **Academic Aesthetic**: Custom "Prestigious Heritage" theme featuring professional bilingual typography (Playfair Display, Nanum Myeongjo) and data clarity with monospaced identifiers.
- **High Performance**: Optimized backend actions using parallelized Notion requests and intelligent token caching, ensuring sub-second response times.
- **Smart Integration**: Two-way sync with multiple Notion databases for members and activities.

## 🛠️ Tech Stack
- **Frontend**: Svelte 5 (Runes) & SvelteKit.
- **Backend**: SvelteKit Server Routes with In-memory Caching.
- **Authentication**: Auth.js with Google OAuth.
- **Storage**: Notion (Primary) + In-Memory Cache.
- **Communication**: Google Gmail API.

---
*   [**Setup Guide**](docs/SETUP.md) - Environment variables and initial configuration.
*   [**Architecture**](docs/ARCHITECTURE.md) - System design and operational protocols.
*   [**Features**](docs/FEATURES.md) - Detailed breakdown of application capabilities.
*   [**Caching Policy**](docs/CACHE.md) - Cache durations and management strategy.
*   [**Database Schema**](docs/schema.md) - Notion database structures and property mappings.