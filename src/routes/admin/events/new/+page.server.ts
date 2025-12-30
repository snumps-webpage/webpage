import { redirect } from '@sveltejs/kit';
import { createEvent } from '$lib/server/events';
import { getDatabaseSchema, type DatabasePropertySchema } from '$lib/server/notion';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const dbId = env.NOTION_DB_ACTIVITIES;
    let activityTypes: string[] = ["문제 창작", "문제 풀이", "회식", "세미나", "스터디", "회의", "기타"];
    
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
	default: async ({ request }) => {
		const data = await request.formData();
		const title = data.get('title') as string;
		const date = data.get('date') as string; // needs to be ISO-ish or at least YYYY-MM-DD
		const type = data.get('type') as string;

        // Ensure date includes time if missing, or just pass as is (Notion accepts ISO)
        // Let's assume input type="datetime-local" gives "YYYY-MM-DDTHH:MM"
        
		await createEvent({ title, date, type });
		throw redirect(302, '/admin');
	}
};
