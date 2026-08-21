# Deployment Guide

The project targets **Vercel** as its primary runtime. A **Docker** path also exists in the
repository, but it is not currently usable without changes — see [§3](#3-docker-current-state).

Both paths build with **pnpm** on **Node 22** (`package.json` declares `"engines": ">=22"`, and
`svelte.config.js` pins the Vercel runtime to `nodejs22.x`).

---

## 1. Vercel (primary)

1. **Connect Repository**: Link the GitHub repository to a new Vercel project.
2. **Framework Preset**: Vercel detects **SvelteKit**. The project uses
   `@sveltejs/adapter-vercel`, so no adapter override is needed.
   - Install Command: `pnpm install`
   - Build Command: `pnpm run build`
3. **Environment Variables**:
   - Settings → Environment Variables.
   - Copy every variable from your local `.env`. [SETUP.md](./SETUP.md) is the authoritative
     list — `.env.example` is a starting point and does **not** cover `ADMINS_EMAILS`,
     `AUTHORIZED_USERS`, `CRON_SECRET`, `REDIS_URL`, or the per-database `NOTION_DB_*` ids.
   - Make sure `NOTION_API_KEY`, the Google credentials, `AUTH_SECRET`, `ADMINS_EMAILS`, and
     `CRON_SECRET` are all present in the **Production** environment.

---

## 2. Cron Jobs

Event lifecycle transitions are driven by Vercel Cron, defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-events",
      "schedule": "0 15 */2 * *"
    }
  ]
}
```

- **Schedule**: 15:00 UTC every other day — i.e. **00:00 KST**. Vercel Cron always interprets the
  expression as UTC, so the KST midnight alignment is deliberate, not incidental.
- **Target**: `/api/cron/sync-events` activates and expires events based on the current date.
  See [API.md](./API.md) for the contract.
- **Authentication**: the endpoint requires `Authorization: Bearer <CRON_SECRET>` whenever
  `CRON_SECRET` is set. Vercel injects this header automatically for its own cron invocations.
  **If `CRON_SECRET` is unset, the endpoint is open to anyone.**

**Verification**: after deployment, check the **Cron Jobs** tab in the Vercel dashboard.

---

## 3. Docker (current state)

`Dockerfile` (multi-stage, non-root `svelteuser`, healthcheck) and `docker-compose.yml`
(app + `redis:7.4-alpine` with a persistent volume) are committed and are the intended path for
self-hosting with the Redis tier of the hybrid cache in `src/lib/server/cache.ts`, which activates
whenever `REDIS_URL` is set.

> ⚠️ **The Docker path does not currently build or run as committed.** Two blockers:
>
> 1. **Wrong adapter.** `svelte.config.js` uses `@sveltejs/adapter-vercel`, whose output is
>    `.vercel/output`. The `Dockerfile` copies `/app/build` and runs `CMD ["node", "build"]`,
>    which is `@sveltejs/adapter-node` output. One of the two has to change — most likely by
>    selecting the adapter from an environment variable.
> 2. **Missing lockfile.** Every stage runs `pnpm install --frozen-lockfile` against
>    `pnpm-lock.yaml`, but `.gitignore` excludes lockfiles, so a fresh clone has no lockfile to
>    copy and the `COPY` fails.
>
> Fix both before relying on this path. Do not treat the presence of these files as a working
> deployment target.

Once the blockers are resolved, the intended flow is:

```bash
cp .env.example .env   # then fill it in
docker compose up --build
```

The app listens on `3000`; `REDIS_URL` is wired to the compose-internal `redis` service.

---

## 4. Production Security Checklist

- **`AUTH_SECRET`**: high-entropy random string. Never reuse the development value.
- **`ADMINS_EMAILS`**: everyone on this comma-separated list has full control over the Notion
  databases. Audit it on every deploy. See [AUTH_VARS.md](./AUTH_VARS.md).
- **`CRON_SECRET`**: required, or `/api/cron/sync-events` is publicly callable.
- **Logs**: monitor Vercel **Runtime Logs** for `[Notion Service]`, `[Cron]`, and `[Action Error]`
  entries.
