# Component & Utility Guide

This document explains the reusable components and utility functions implemented to ensure consistency, security, and maintainability across the SNUMPS platform.

## 1. UI Components

### `ActionButton.svelte`
*   **Purpose**: Standardizes administrative and member actions.
*   **Functionality**: Wraps a SvelteKit form with `use:enhance`. Handles instant button disabling (throttling) to prevent double-clicks, and provides standard feedback via toasts.
*   **When to use**: Any button that triggers a server-side action (e.g., Approve, Reject, Delete, Activate).
*   **How to use**:
    ```svelte
    <ActionButton 
        action="?/approve" 
        params={{ id: item.id }} 
        label="Approve" 
        confirmMessage="Are you sure?"
    />
    ```

### `CopyButton.svelte`
*   **Purpose**: Provides a one-click clipboard utility.
*   **Functionality**: Copies the provided `text` to the system clipboard and shows a temporary success state.
*   **When to use**: Displaying IDs, email addresses, or obfuscated attendance links.

### `Skeleton.svelte`
*   **Purpose**: Enhances perceived performance during async data loading.
*   **Functionality**: Renders a shimmering placeholder block with customizable width and height.
*   **When to use**: In `{#await}` blocks or during initial page loads for data streamed from the server.

### `Toasts.svelte`
*   **Purpose**: Universal notification system.
*   **Functionality**: Consumes the `toasts` store to display non-intrusive success, error, or info messages.
*   **When to use**: Automatically included in the global layout.

---

## 2. Shared Utilities (`utils.ts`)

### `getSemesterInfo`
*   **Purpose**: Centralizes the club's academic calendar logic.
*   **Functionality**: Calculates the current academic semester (e.g., "2025년 1학기") and its date range based on SNU's standards (Mar-Aug = Sem 1, Sep-Feb = Sem 2).
*   **Constraint**: Jan/Feb are correctly attributed to the previous year's 2nd semester.

### `getKSTDate`
*   **Purpose**: Enforces Korean Standard Time (KST) project-wide.
*   **Functionality**: Returns ISO or YYYY-MM-DD strings adjusted for `Asia/Seoul`, regardless of where the server is hosted (e.g., Vercel's UTC environments).
*   **When to use**: Every time a date is saved to Notion or compared against "today".

### `parseGoogleName`
*   **Purpose**: Extracts structured data from the SNU Google Workspace account string.
*   **Functionality**: Splits the standard `"Name / Status / Dept"` string into individual fields.
*   **When to use**: Resolving user identity during signup or dashboard display.

### `normalizePhoneNumber`
*   **Purpose**: Standardizes contact information.
*   **Functionality**: Converts various raw inputs (e.g., `01012345678`, `010 1234 5678`) into the official `010-XXXX-XXXX` format.
*   **When to use**: Formatting phone numbers before saving to the database.
