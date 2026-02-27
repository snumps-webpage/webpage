# Deployment Guide (Vercel)

SNUMPS Automation is designed to be deployed on **Vercel** as a serverless application.

## 🚀 Deployment Steps

1.  **Connect Repository**: Link your GitHub repository to a new Vercel Project.
2.  **Framework Preset**: Vercel should automatically detect **SvelteKit**.
    - Build Command: `npm run build`
    - Output Directory: `.svelte-kit` (or default)
3.  **Environment Variables**:
    - Go to **Settings > Environment Variables**.
    - Copy all variables from your local `.env`.
    - **Important**: Ensure `NOTION_API_KEY` and Google Credentials are set for the **Production** environment.

## ⏰ Cron Jobs

The application relies on Vercel Cron to manage event states automatically.

### Configuration
The cron job is defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-events",
      "schedule": "0 0 * * *"
    }
  ]
}
```

- **Schedule**: Runs daily at midnight (UTC).
- **Target**: Calls the `/api/cron/sync-events` endpoint to activate/expire events based on the current date.

### Verification
After deployment, verify cron execution in the Vercel Dashboard under the **Cron Jobs** tab.

## 🔒 Production Security

- **Auth.js Secret**: Ensure `AUTH_SECRET` is set to a high-entropy random string in production.
- **Admin Emails**: Double-check `ADMINS_EMAILS`. Anyone in this list has full control over the database.
- **Logs**: Monitor **Runtime Logs** in Vercel for any `[Notion Service]` errors or critical failures.
