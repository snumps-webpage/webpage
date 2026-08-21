# Contributing to SNUMPS Webpage

This guide covers the standards and workflows for changing this project. It deliberately does
**not** repeat setup instructions — see [docs/SETUP.md](docs/SETUP.md) for prerequisites,
credentials, and getting a local server running.

## 🛠️ Before You Commit

The project uses **pnpm** on **Node 22+**. Run all three:

```bash
pnpm run check    # svelte-kit sync + svelte-check (TypeScript/Svelte)
pnpm run lint     # prettier --check + eslint
pnpm test         # vitest
```

`pnpm run format` applies Prettier in place if `lint` complains about formatting.

---

## 📐 Coding Standards

### 1. Commenting & Documentation

High-signal commenting policy: explain *why*, constraints, and architectural boundaries — never
*what* the code does.

**Read [docs/COMMENTING_RULES.md](docs/COMMENTING_RULES.md) before writing any comment.**

### 2. Svelte 5 Runes

- Use `$state`, `$derived`, `$props`, and `$effect` exclusively.
- Do not introduce legacy `export let` or `$:` reactive statements.

### 3. CSS & Design

- **Strict token usage**: no hardcoded hex values. Every colour comes from the CSS custom
  properties declared on `:root` in `src/lib/manuscript.css`, which is the single global
  stylesheet (imported once from `src/routes/+layout.svelte`).
  `src/lib/theme.ts` handles light/dark/system *selection*; it does not define tokens.
- **Design blueprint**: follow the LaTeX/arXiv rules in
  [docs/DESIGN_BLUEPRINT.md](docs/DESIGN_BLUEPRINT.md).

### 4. Reuse Before Adding

Check [docs/COMPONENTS.md](docs/COMPONENTS.md) first. Shared UI (`ActionButton`, `StatusBadge`,
`Pagination`, `SectionHeader`, `CopyButton`, …) and shared helpers in `src/lib/utils.ts` exist so
that behaviour is defined once. Extending an existing component beats adding a near-duplicate.

---

## 📦 Git Conventions

### 1. Atomic Commits

Commit by **functional unit**, not by file or by session.

- ✅ `feat: implement seminar approval logic`
- ❌ `update server files`, `fix stuff`

### 2. Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
| :--- | :--- |
| `feat:` | New features |
| `fix:` | Bug fixes |
| `docs:` | Documentation only |
| `style:` | Formatting; no behaviour change |
| `refactor:` | Restructuring; no behaviour change |
| `perf:` | Performance work |
| `test:` | Tests only |
| `chore:` | Build tasks, dependencies, tooling |

---

## 🧪 Testing

Automated coverage is **partial**, not absent. `vitest` is configured (`vitest.config.ts`,
jsdom environment) and picks up `src/**/*.{test,spec}.{js,ts}`.

- **Add tests for pure logic.** Parsers, validators, and date/semester maths in
  `src/lib/utils.ts` and `src/lib/server/notion/utils.ts` are cheap to cover and are where
  regressions hide. Existing examples: `src/lib/utils.test.ts`,
  `src/lib/server/notion/utils.test.ts`.
- **Notion-backed services are not unit-tested.** They talk to a live workspace; verify those
  paths manually.
- **Manual verification** is still required for the critical flows: signup, login, seminar
  application, admin approval, and attendance.
- **Static analysis carries real weight here.** `pnpm run check` is the main structural safety
  net — do not let its error count grow.

---

## 📚 Documentation

Documentation updates ship in the same change as the code. Which file to touch, and how, is
defined in [docs/MAINTAINING_DOCS.md](docs/MAINTAINING_DOCS.md).
