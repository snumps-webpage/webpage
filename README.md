# SNUMPS Webpage

A secure SvelteKit web application designed to manage membership, activity tracking, and academic records for SNUMPS, utilizing Notion as the primary database.

## 🚀 Quick Links

- **[Features Overview](./docs/FEATURES.md)**: Explore the authentication, membership, and attendance systems.
- **[Setup & Installation](./docs/SETUP.md)**: Instructions for local development and Gmail API configuration.
- **[System Architecture](./docs/ARCHITECTURE.md)**: Detailed breakdown of the project structure and hybrid storage model.
- **[Design Blueprint](./docs/DESIGN_BLUEPRINT.md)**: Guest landing LaTeX/arXiv design rules and implementation constraints.
- **[Contributing](./CONTRIBUTING.md)**: Workflow, coding standards, and git conventions.

## 🌟 Key Highlights

- **Math Journal Aesthetic**: A distinctive editorial UI overhaul using `Crimson Pro`, `Newsreader`, and `Gowun Batang` typography. Features atmospheric paper-like backgrounds and staggered entrance animations for a refined academic experience.
- **Robust Admin Approval**: Enhanced approval workflows with instant button disabling, backend verification, and real-time state synchronization to prevent duplicate entries and ensure data integrity.
- **High Performance**: Optimized backend actions using parallelized Notion requests and intelligent token caching, ensuring sub-second response times.
- **Smart Integration**: Two-way sync with multiple Notion databases for members and activities.

## 🛠️ Tech Stack

- **Frontend**: Svelte 5 (Runes) & SvelteKit.
- **Backend**: SvelteKit Server Routes with In-memory Caching.
- **Authentication**: Auth.js with Google OAuth.
- **Storage**: Notion (Primary) + In-Memory Cache.
- **Communication**: Google Gmail API.

---

- [**Setup Guide**](docs/SETUP.md) - Environment variables and initial configuration.
- [**Auth Variables**](docs/AUTH_VARS.md) - Usage of Admin and Authorized user lists.
- [**Architecture**](docs/ARCHITECTURE.md) - System design and operational protocols.
- [**Features**](docs/FEATURES.md) - Detailed breakdown of application capabilities.
- [**Component Guide**](docs/COMPONENTS.md) - Documentation for reusable UI components and utilities.
- [**Maintenance Guide**](docs/MAINTAINING_DOCS.md) - Guidelines for documentation and system maintenance.
- [**Design Blueprint**](docs/DESIGN_BLUEPRINT.md) - Pre-login landing design principles and guardrails.
- [**Caching Policy**](docs/CACHE.md) - Cache durations and management strategy.
- [**Database Schema**](docs/schema.md) - Notion database structures and property mappings.
- [**Internal API**](docs/API.md) - Endpoints under `src/routes/api/`, their guards and responses.
- [**Deployment**](docs/DEPLOYMENT.md) - Vercel deploy, cron schedule, and production checklist.
- [**Commenting Rules**](docs/COMMENTING_RULES.md) - Standards for comments in the codebase.
