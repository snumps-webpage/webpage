import { redirect } from '@sveltejs/kit';
import { getAllActivities } from '$lib/server/notion';
import { createEvent } from '$lib/server/events';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const activities = await getAllActivities();
    
    // Extract unique semesters for the toggle
    const semesters = Array.from(new Set(activities.map(a => {
        if (!a.date) return 'Unknown';
        const date = new Date(a.date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        if (month >= 3 && month <= 8) return `${year}-1`;
        if (month >= 9) return `${year}-2`;
        return `${year - 1}-2`;
    }))).sort().reverse();

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
