import { redirect, fail } from '@sveltejs/kit';
import { getMemberByEmail } from '$lib/server/notion';
import { isAdmin } from '$lib/server/admin';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const session = await event.locals.auth();
	const isUserAdmin = session?.user?.email ? isAdmin(session.user.email) : false;
	
	if (session?.user?.email) {
		const isSignupPage = event.url.pathname === '/signup';
		const isLoginPage = event.url.pathname === '/login';
		const isApi = event.url.pathname.startsWith('/api');
		const isAuth = event.url.pathname.startsWith('/auth');
		const isSignOut = event.url.pathname.includes('signout');

		if (!isSignupPage && !isLoginPage && !isApi && !isAuth && !isSignOut && !isUserAdmin) {
			try {
				const member = await getMemberByEmail(session.user.email);
				if (!member) {
					throw redirect(302, '/signup');
				}
			} catch (e) {
				// If it's a redirect, re-throw it
				if (e && typeof e === 'object' && 'status' in e && e.status === 302) throw e;
				console.error('Layout Notion Check Error:', e);
				// Don't block the site if Notion is down, but maybe the user won't see their data
			}
		}
	}

	return {
		session,
		isAdmin: isUserAdmin
	};
};