import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();

	if (session?.user && !isAdmin(session.user.email)) {
		throw redirect(302, '/');
	}
};
