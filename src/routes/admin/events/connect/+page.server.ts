import { redirect, error } from '@sveltejs/kit';
import { getAllActivities } from '$lib/server/notion';
import { createEvent } from '$lib/server/events';
import { getSemesterKeyFromDate } from '$lib/utils';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
        throw error(404, 'Not Found');
    }

    const activities = await getAllActivities();
    
    // Extract unique semesters using shared utility
    const semesters = Array.from(new Set(activities.map(a => getSemesterKeyFromDate(a.date)))).sort().reverse();

    return { activities, semesters };
};

export const actions = {
    publish: async ({ request }) => {
        const data = await request.formData();
        const notionPageId = data.get('notionPageId') as string;
        const title = data.get('title') as string;
        const date = data.get('date') as string;
        const type = data.get('type') as string;

        if (!notionPageId) return { error: '이벤트를 선택해주세요.' };

        await createEvent({ title, date, type, notionPageId });
        throw redirect(302, '/admin');
    }
};
