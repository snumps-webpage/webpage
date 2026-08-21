# Codebase Commenting Standards

Rules for comments in the SNUMPS Webpage codebase. They prioritize high-signal architectural
clarity over line-by-line explanation, and they exist so that a maintenance pass has an objective
basis for deleting a comment rather than leaving it "just in case".

## 1. Core Principles

- **Explain "Why", Not "What"**: Assume the reader can read TypeScript/Svelte. Do not restate logic.
- **Decision Documentation**: Document non-obvious decisions, trade-offs, and rejected alternatives.
- **Boundary Clarity**: Mark responsibility boundaries between modules — e.g. the Notion client
  wrapper (`src/lib/server/notion/client.ts`) versus the domain services that call it.
- **Security & Performance First**: Explicitly label blocks that handle sensitive data or
  performance-critical caching.

## 2. Comment Removal Policy

Remove the following during any maintenance pass:

- **Redundant logic restatements**: e.g. `// Initialize x to zero` above `let x = 0;`.
- **Vibe-coding artifacts**: speculative TODOs, "I'm not sure if this works", conversational notes.
- **Commented-out code**: git history is the archive; dead code does not stay in files.
- **Mechanism explanations**: descriptions of standard framework behaviour (e.g. how Svelte runes
  work). Link to the docs instead if it genuinely matters.

## 3. Structural Labels

When a server module is long enough that its sections stop being obvious, separate them with a
standard header rather than an ad-hoc one:

- `/** --- DATA ORCHESTRATION --- */` — modules managing primary database state.
- `/** --- PERFORMANCE LAYER --- */` — caching and optimization logic.
- `/** --- DOMAIN LOGIC --- */` — business rules and validation.
- `/** --- EXTERNAL INTEGRATIONS --- */` — side effects against third-party APIs (Gmail, Notion).

## 4. Constraint & Boundary Markers

When logic exists only because of an external constraint, say so inline with a bracketed marker,
so the next reader does not "simplify" the constraint away:

- `[Constraint: API Rate Limit]` — logic shaped by Notion's request throttling.
- `[Boundary: Trust]` — the transition from untrusted user input to sanitized server state.
- `[Performance: TTL]` — why a specific cache duration was chosen. See [CACHE.md](./CACHE.md).

> §3 and §4 are the target convention for code written from here on. Existing modules predate
> them; adopt the markers as you touch those files, not in a sweeping rename pass.

## 5. Automation & Extraction

Format comments so they can be extracted into higher-level architectural documentation where
feasible — that is the reason the labels above are fixed strings rather than prose.
