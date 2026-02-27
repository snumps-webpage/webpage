# Codebase Commenting Standards (SNUMPS Automation)

This document defines the strict rules for documentation within the SNUMPS Automation codebase. These rules prioritize high-signal architectural clarity over line-by-line explanation.

## 1. Core Principles

- **Explain "Why", Not "What"**: Assume the reader can read TypeScript/Svelte code. Do not restate logic.
- **Decision Documentation**: Document non-obvious decisions, trade-offs, and rejected alternatives.
- **Boundary Clarity**: Clearly mark responsibility boundaries between modules (e.g., Notion wrapper vs. Business logic).
- **Security & Performance First**: Explicitly label blocks that handle sensitive data or performance-critical caching.

## 2. Comment Removal Policy

The following must be removed during any maintenance pass:
- **Redundant Logic Restatements**: e.g., `// Initialize x to zero` above `let x = 0;`.
- **Vibe-coding Artifacts**: Speculative TODOs, "I'm not sure if this works", or conversational notes.
- **Commented-out Code**: Use Git history for historical tracking; do not leave dead code in files.
- **Mechanism Explanations**: Descriptions of standard framework behavior (e.g., Svelte Rune mechanics).

## 3. Structural Labels

Use standardized headers for file organization:
- `/** --- DATA ORCHESTRATION --- */`: For modules managing primary database state.
- `/** --- PERFORMANCE LAYER --- */`: For caching and optimization logic.
- `/** --- DOMAIN LOGIC --- */`: For business rules and validation.
- `/** --- EXTERNAL INTEGRATIONS --- */`: For side effects involving third-party APIs (Gmail, Notion).

## 4. Constraint & Boundary Markers

When logic depends on external constraints:
- **[Constraint: API Rate Limit]**: Mark logic designed to stay within Notion's 3req/s limit.
- **[Boundary: Trust]**: Mark the transition from untrusted user input to sanitized server state.
- **[Performance: TTL]**: Document why specific cache durations were chosen.

## 5. Automation & extraction

Comments should be formatted to support automated extraction for higher-level architectural documentation where feasible.
