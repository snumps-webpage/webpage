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
| `CACHE.md`            | Performance  | Backend Devs    | HTTP no-store policy, table cache tiers and TTLs.          |
| `schema.md`           | Database     | Backend Devs    | Summary of the zod table schemas and storage format.       |
| `DESIGN_BLUEPRINT.md` | UI/UX        | Designers/Devs  | Authoritative rules for LaTeX/Academic visual style.       |
| `PERFORMANCE.md`      | Performance  | Engineers       | Applied optimizations — what, how, why, how to revert.     |
| `OPERATOR-TODO.md`    | Operations   | Operators       | Setup and runbook tasks a person must do (living list).    |
| `spec/`               | Specs        | Engineers       | Functional/API/implementation/migration specs & decisions. |
| `code-audit/`         | Audit        | Engineers       | In-progress code audit; deleted when the audit closes.     |

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

- **When to update**: When introducing, renaming or removing an environment variable (also update `.env.example`).
- **How to extend**: Update the environment variable list and provide clear instructions on how to obtain the new values.

### `schema.md`

- **When to update**: When a zod schema in `src/lib/server/data/schemas/` gains, loses or changes a field, or a table is added to `TABLES`.
- **How to extend**: Update the corresponding table with the field name, meaning and any invariant. The zod file stays authoritative.

### `DESIGN_BLUEPRINT.md`

- **When to update**: When introducing a new global UI pattern (e.g., a new type of list or input style).
- **How to extend**: Define strict implementation rules (fonts, colors, alignment) to ensure future consistency.
