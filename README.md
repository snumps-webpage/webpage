# SNUMPS Automation

A secure SvelteKit web application designed to automate and visualize data from a Notion database, specifically tailored for SNUMPS.

## Features

- **Framework**: Built with **SvelteKit** (Svelte 5) and **Vite** for high performance.
- **Authentication**: Secure login using **Google OAuth** via Auth.js.
  - **Restriction**: Access is strictly limited to users with a `@snu.ac.kr` email address.
- **Notion Integration**:
  - Connects securely to a Notion Database.
  - Dynamically fetches schema and rows to render a data table.
  - Supports various property types (Text, Select, Dates, People, etc.).

## Project Structure

```text
src/
├── auth.ts              # Auth.js configuration (Google Provider & Callbacks)
├── hooks.server.ts      # Server hooks for authentication handling
├── lib/
│   └── server/
│       └── notion.ts    # Notion API integration (fetch wrapper & parsers)
└── routes/
    ├── +layout.server.ts # Loads session data for the app
    ├── +page.svelte      # Home landing page
    ├── login/            # Custom login page
    └── notion/           # Protected Notion database view
```

## Setup & Installation

### 1. Clone & Install
```bash
git clone <repository-url>
cd snumps-automation-fork
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory with the following variables:

```env
# Google OAuth (Obtain from Google Cloud Console)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Auth.js Secret (Generate via `npx auth secret` or openssl)
AUTH_SECRET=your_generated_secret

# Notion API (Obtain from Notion Developers)
NOTION_API_KEY=your_notion_integration_token
NOTION_DATABASE_ID=your_database_id
```

### 3. Running Locally
Start the development server:
```bash
npm run dev
```
Visit `http://localhost:5173` in your browser.

## Deployment

To create a production build:

```bash
npm run build
```

You can preview the production build locally:
```bash
npm run preview
```

**Note on Adapters**: By default, this project uses `@sveltejs/adapter-auto`. Depending on your deployment target (Vercel, Netlify, Node.js server, etc.), you may need to install the appropriate adapter (e.g., `@sveltejs/adapter-node` or `@sveltejs/adapter-vercel`) and update `svelte.config.js`.

## Tech Stack
- **Frontend**: SvelteKit, Svelte 5, CSS
- **Backend/Server**: SvelteKit Server Routes, Notion API
- **Auth**: @auth/sveltekit, @auth/core