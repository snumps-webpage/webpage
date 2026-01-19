import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { syncEventStatuses } from '$lib/server/events';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
    // Basic security check for Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[Cron] Syncing event statuses...');
        await syncEventStatuses();
        return json({ success: true });
    } catch (e) {
        console.error('[Cron] Sync failed:', e);
        return json({ error: 'Sync failed' }, { status: 500 });
    }
};
