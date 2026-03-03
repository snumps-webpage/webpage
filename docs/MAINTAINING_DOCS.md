# Documentation Maintenance Guide (Meta-Docs)

This document explains the purpose of each documentation file in this project, how they are structured, and the protocols for extending or modifying them. Maintaining synchronized and high-signal documentation is a core mandate of this project.

## 1. Document Taxonomy

| File                  | Category     | Target Audience | Purpose                                                    |
| :-------------------- | :----------- | :-------------- | :--------------------------------------------------------- |
| `README.md`           | Entry Point  | All Developers  | High-level overview, quick links, and tech stack summary.  |
| `ARCHITECTURE.md`     | System       | Engineers       | System structure, data flow, and operational patterns.     |
| `COMPONENTS.md`       | Dev-Manual   | Frontend Devs   | Reusable UI component library and utility usage.           |
| `FEATURES.md`         | User-Facing  | Product/Users   | Comprehensive list of application capabilities.            |
| `SETUP.md`            | Installation | New Developers  | Environment variables, local setup, and API configuration. |
| `AUTH_VARS.md`        | Security     | Admins/Devs     | Guidance on Admin and Authorized user lists.               |
| `CACHE.md`            | Performance  | Backend Devs    | Caching strategy, TTL values, and cache key patterns.      |
| `schema.md`           | Database     | Backend Devs    | Notion database properties and relation mappings.          |
| `DESIGN_BLUEPRINT.md` | UI/UX        | Designers/Devs  | Authoritative rules for LaTeX/Academic visual style.       |

---

## 2. Core Maintenance Principles

1.  **Synchronization**: Documentation MUST be updated in the same session as the code change. A feature is not "complete" until its corresponding docs are updated.
2.  **Explain "Why," Not "What"**: Documentation should explain the rationale behind architectural decisions rather than just describing the implementation.
3.  **Atomic Updates**: Commit documentation changes alongside the feature changes they describe (or in separate atomic commits immediately following).
4.  **Language Consistency**: Use Korean for user-facing instructions and headers if appropriate, but keep technical documentation and English subtitles consistent with the "Academic Manuscript" theme.

---

## 3. How to Extend Each Document

### `ARCHITECTURE.md`

- **When to update**: When creating a new service file in `src/lib/server`, adding a new core utility, or changing the data flow pattern.
- **How to extend**: Update the "Project Structure" tree and add/modify sections under "Shared Logic" or "Operations".

### `COMPONENTS.md`

- **When to update**: When creating a new reusable component in `src/lib/components` or a new shared utility in `src/lib/utils.ts`.
- **How to extend**: Describe the item's **Purpose**, **Functionality**, and **Usage (Code Snippet)**.

### `FEATURES.md`

- **When to update**: When a new user-facing capability is implemented or an existing one is significantly enhanced.
- **How to extend**: Add bullet points under the appropriate category (Auth, Membership, Events, UI/UX).

### `SETUP.md` & `AUTH_VARS.md`

- **When to update**: When introducing a new environment variable or changing the required Notion database structure.
- **How to extend**: Update the environment variable list and provide clear instructions on how to obtain the new values.

### `schema.md`

- **When to update**: When adding a new property or relation to any Notion database.
- **How to extend**: Update the corresponding table with the property name, type, and purpose.

### `DESIGN_BLUEPRINT.md`

- **When to update**: When introducing a new global UI pattern (e.g., a new type of list or input style).
- **How to extend**: Define strict implementation rules (fonts, colors, alignment) to ensure future consistency.
