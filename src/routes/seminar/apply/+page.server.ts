import { fail, redirect } from '@sveltejs/kit';
import { createSeminarRequest } from '$lib/server/seminars';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    const session = await locals.auth();
    if (!session?.user) throw redirect(302, '/login');
    return { user: session.user };
};

export const actions: Actions = {
    default: async ({ request, locals }) => {
        const session = await locals.auth();
        if (!session?.user?.email || !session.user.name) return fail(401, { error: 'Unauthorized' });

        const data = await request.formData();
        const title = data.get('title') as string;
        const date = data.get('date') as string;

        if (!title || !date) {
            return fail(400, { error: 'Missing required fields' });
        }

        try {
            await createSeminarRequest({
                title,
                date,
                applicantEmail: session.user.email,
                applicantName: session.user.name
            });
            return { success: true };
        } catch (e) {
            console.error(e);
            return fail(500, { error: 'Application failed' });
        }
    }
};
