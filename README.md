# SNUMPS Automation

A secure SvelteKit web application designed to automate membership management and activity tracking for SNUMPS, utilizing Notion as the primary database.

## 🚀 Quick Links

### For Users & Admins
- **[Features Overview](docs/FEATURES.md)**: Explore authentication, membership, and attendance systems.
- **[Setup & Installation](docs/SETUP.md)**: Instructions for local development and API keys.
- **[Design Blueprint](docs/DESIGN_BLUEPRINT.md)**: UI/UX principles (LaTeX/arXiv style).

### For Developers
- **[Contributing Guide](CONTRIBUTING.md)**: Dev workflow, code standards, and git conventions.
- **[System Architecture](docs/ARCHITECTURE.md)**: High-level system design and hybrid storage.
- **[API Documentation](docs/API.md)**: Internal API endpoints and Cron jobs.
- **[Deployment Guide](docs/DEPLOYMENT.md)**: Vercel deployment and production configuration.
- **[Commenting Rules](COMMENTING_RULES.md)**: Standards for high-signal code documentation.

## 🌟 Key Highlights

- **Math Journal Aesthetic**: A distinctive editorial UI overhaul using `Crimson Pro`, `Newsreader`, and `Gowun Batang`.
- **High Performance**: Optimized backend actions using parallelized Notion requests and intelligent token caching.
- **Smart Integration**: Two-way sync with multiple Notion databases for members and activities.

## 🛠️ Tech Stack

- **Frontend**: Svelte 5 (Runes) & SvelteKit.
- **Backend**: SvelteKit Server Routes with In-memory Caching.
- **Authentication**: Auth.js with Google OAuth (restricted to `@snu.ac.kr`).
- **Storage**: Notion (Primary) + In-Memory Cache (Performance).
- **Communication**: Google Gmail API.

## 📂 Documentation Index

| Doc | Description |
| :-- | :-- |
| [**SETUP.md**](docs/SETUP.md) | Env vars and initial config. |
| [**AUTH_VARS.md**](docs/AUTH_VARS.md) | Admin authorization logic. |
| [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) | System design & storage model. |
| [**FEATURES.md**](docs/FEATURES.md) | Detailed capability breakdown. |
| [**DESIGN_BLUEPRINT.md**](docs/DESIGN_BLUEPRINT.md) | Design rules and guardrails. |
| [**CACHE.md**](docs/CACHE.md) | Server-side caching policy. |
| [**schema.md**](docs/schema.md) | Notion database schemas. |
| [**API.md**](docs/API.md) | Internal API endpoints. |
| [**DEPLOYMENT.md**](docs/DEPLOYMENT.md) | Vercel & Cron setup. |
