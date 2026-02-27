# Contributing to SNUMPS Automation

Thank you for your interest in improving the SNUMPS Automation platform. This guide outlines the standards and workflows required to maintain the project's quality and architectural integrity.

## 🛠️ Development Workflow

### Prerequisites
- **Node.js**: v18+ (LTS recommended)
- **npm**: v9+

### Quick Start
1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Environment Setup**:
   Copy `.env.example` to `.env` and fill in the required Notion and Google credentials.
   *(See [SETUP.md](docs/SETUP.md) for detailed credential generation)*
3. **Start Dev Server**:
   ```bash
   npm run dev
   ```

### Quality Assurance Scripts
Before committing, ensure your code passes all checks:

- **Type Check**:
  ```bash
  npm run check
  ```
- **Linting**:
  ```bash
  npm run lint
  ```
- **Formatting**:
  ```bash
  npm run format
  ```

---

## 📐 Coding Standards

### 1. Commenting & Documentation
We follow a strict "High-Signal" commenting policy.
- **DO NOT** explain *what* the code does (the code speaks for itself).
- **DO** explain *why*, *constraints*, and *architectural boundaries*.
- **Reference**: Read [**COMMENTING_RULES.md**](../COMMENTING_RULES.md) before writing any comments.

### 2. Svelte 5 Runes
This project uses Svelte 5.
- Use `$state`, `$derived`, `$props`, and `$effect` exclusively.
- Avoid legacy `export let` or `$:`.

### 3. CSS & Design
- **Strict Token Usage**: Do not use hardcoded hex values. Use CSS variables defined in `src/lib/theme.ts` / `app.css`.
- **Design Blueprint**: Adhere to the LaTeX/arXiv aesthetic guidelines in [**DESIGN_BLUEPRINT.md**](docs/DESIGN_BLUEPRINT.md).

---

## 📦 Git Conventions

We enforce a rigorous commit history to ensure traceability.

### 1. Atomic Commits
Commit changes by **functional unit**, not by file or session.
- ✅ Good: "feat: implement seminar approval logic"
- ❌ Bad: "update server files", "fix stuff"

### 2. Commit Message Format
Use the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Formatting, missing semi colons, etc; no code change
- `refactor:` Refactoring production code
- `test:` Adding missing tests, refactoring tests; no production code change
- `chore:` Updating build tasks, package manager configs, etc; no production code change

---

## 🧪 Testing

*Currently, the project does not have a comprehensive automated test suite.*
- **Manual Verification**: Verify critical flows (Signup, Login, Attendance) manually in the local environment.
- **Static Analysis**: Rely heavily on `npm run check` (TypeScript) to catch structural errors.
