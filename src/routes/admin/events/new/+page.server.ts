import { fail, redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createEvent } from '$lib/server/events';
import { createActivityPage, getDatabaseSchema, type DatabasePropertySchema } from '$lib/server/notion';
import { isAdmin } from '$lib/server/admin';
import { ACTIVITY_TYPES } from '$lib/constants';
import { getIsoStringWithOffset } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
        throw error(404, 'Not Found');
    }

    const dbId = env.NOTION_DB_ACTIVITIES;
    let activityTypes: string[] = [...ACTIVITY_TYPES];
    
    if (dbId) {
        try {
            const schema = await getDatabaseSchema(dbId);
            const typeProp = schema['활동 종류'] as DatabasePropertySchema;
            if (typeProp?.options) {
                activityTypes = typeProp.options;
            }
        } catch (e) {
            console.error('Failed to fetch activity types from Notion:', e);
        }
    }

    return { activityTypes };
};

export const actions = {
    default: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !isAdmin(session.user.email)) return fail(401, { error: 'Unauthorized' });

        const data = await request.formData();
        const title = data.get('title') as string;
        const dateRaw = data.get('date') as string; // YYYY-MM-DDTHH:mm
        const timezone = data.get('timezone') as string; // IANA e.g. 'Asia/Seoul'
        const type = data.get('type') as string;

        if (!title || !dateRaw || !type) {
            return fail(400, { error: 'Missing required fields' });
        }

        // Calculate offset for the specific date and timezone
        try {
            const date = getIsoStringWithOffset(dateRaw, timezone);

            // 1. Create Notion Page
            const page = await createActivityPage({
                title,
                date,
                type,
                timeZone: timezone
            });

            // 2. Create Local Event
            await createEvent({
                title,
                date,
                type,
                timeZone: timezone,
                notionPageId: page.id
            });

            throw redirect(302, '/admin');
        } catch (e) {
            if (e && typeof e === 'object' && 'status' in e && e.status === 302) throw e;
            console.error(e);
            return fail(500, { error: 'Creation failed' });
        }
    }
};
