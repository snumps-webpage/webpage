import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { session, isMember, application, isAdmin } = await event.parent();

	if (!session?.user) {
		throw redirect(302, '/');
	}

    // If already a member, no need to be on the wait page (Admins can stay for preview)
	if (isMember && !isAdmin) {
		throw redirect(302, '/');
	}

    // If no application at all, go to signup (Admins can skip this)
    if (!application && !isAdmin) {
        throw redirect(302, '/signup');
    }

	return {
		user: session.user
	};
};
