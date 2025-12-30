import { redirect, fail } from '@sveltejs/kit';
import { getMemberByEmail } from '$lib/server/notion';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await event.locals.auth();
	
	if (session?.user?.email) {
		const isSignupPage = event.url.pathname === '/signup';
		const isApi = event.url.pathname.startsWith('/api');
		const isSignOut = event.url.pathname.includes('signout'); // Auth.js default path

		if (!isSignupPage && !isApi && !isSignOut) {
			const member = await getMemberByEmail(session.user.email);
			if (!member) {
				throw redirect(302, '/signup');
			}
		}
	}

	return {
		session
	};
};