import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createEvent } from '$lib/server/events';
import { createActivityPage, getDatabaseSchema, type DatabasePropertySchema } from '$lib/server/notion';
import { isAdmin } from '$lib/server/admin';
import { NOTION_PROPS, ACTIVITY_TYPES } from '$lib/constants';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
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
            // Create a date object (context-free)
            const dateObj = new Date(dateRaw);
            
            // Get the offset string (e.g., "GMT+9" or "GMT+09:00")
            // Note: dateObj is interpreted as UTC here just to get a valid date instance for the formatter
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                timeZoneName: 'longOffset'
            }).formatToParts(dateObj);
            
            const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value; // "GMT+09:00"
            const offset = offsetPart ? offsetPart.replace('GMT', '') : '+00:00'; // "+09:00"

            // Handle short offsets like "+9" -> "+09:00" if necessary, 
            // but Intl usually returns "+09:00" or "GMT" (which is Z).
            // Let's ensure strict ISO format.
            let isoOffset = offset === 'GMT' ? '+00:00' : offset;
            
            // Construct ISO string
            const date = `${dateRaw}:00${isoOffset}`;

            // 1. Create Notion Page
            const page = await createActivityPage({
                title,
                date,
                type
            });

            // 2. Create Local Event
            await createEvent({
                title,
                date,
                type,
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
