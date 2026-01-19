import { env } from '$env/dynamic/private';
import { building } from '$app/environment';

if (!building && !env.AUTH_SECRET) {
    console.error('FATAL: AUTH_SECRET is not set. Authentication will fail.');
}

export { handle } from './auth';

// NOTE: Event status sync is now handled by Vercel Cron via /api/cron/sync-events

