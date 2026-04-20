# System Architecture

## 📂 Project Structure

```text
src/
├── app.d.ts             # Global Type definitions (Locals, PageData)
├── auth.ts              # Auth.js config (Google Provider)
├── hooks.server.ts      # Server middleware (Auth, Membership Guard)
├── lib/
│   ├── components/      # UI Components (Svelte 5 Runes)
│   ├── server/
│   │   ├── notion/      # Modular Notion Service (Schemas, Client, Domain Modules)
│   │   ├── repositories/# Repository Pattern implementation
│   │   ├── cache.ts     # Hybrid Redis/Memory Cache
│   │   └── mail/        # Gmail Notification Service
│   ├── constants.ts     # Centralized property names & manuscript data
│   └── utils.ts         # Logic & Date utilities
└── routes/              # SvelteKit File-based Routing
```

## 💾 Data Layer & Reliability

- **Notion Source of Truth**: Primary persistent store for all club data.
- **Repository Pattern**: Business logic interacts with `repositories/` (e.g., `MemberRepository`) rather than raw API helpers, decoupling the database implementation.
- **Strict Validation (Zod)**: All Notion payloads are validated via `schema.ts` to ensure runtime type safety.
- **Hybrid Caching**:
  - **L1 (Local)**: Fast in-memory map (per-instance).
  - **L2 (Distributed)**: Redis shared across all serverless instances.

## 🛡️ Security & Middleware

- **Centralized Guard**: `hooks.server.ts` handles global authentication and membership verification.
- **Request Memoization**: Pre-fetched member data is stored in `event.locals` to prevent redundant API calls during the same request lifecycle.

## 🎨 Visual Identity: Math Journal Aesthetic

- **Design Philosophy**: Emulates the visual language of LaTeX and academic journals.
- **Core Tokens**: High-contrast serif typography, horizontal rules, mathematical figure labeling, and symbolic empty states.
- **Styling**: Centralized in `manuscript.css` for performance and consistency.
