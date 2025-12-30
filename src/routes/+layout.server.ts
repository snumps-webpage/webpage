import { redirect, fail } from '@sveltejs/kit';
import { getMemberByEmail, getPresidentName } from '$lib/server/notion';
import { isAdmin } from '$lib/server/admin';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	// Calculate Semester for Global Context (e.g. Footer)
	const today = new Date();
	const month = today.getMonth() + 1;
	const year = today.getFullYear();
	let shortSemester = '';
	if (month >= 3 && month <= 8) shortSemester = `${(year % 100).toString()}-1`;
	else if (month >= 9) shortSemester = `${(year % 100).toString()}-2`;
	else shortSemester = `${((year - 1) % 100).toString()}-2`;

	// Parallelize session and global context fetching
	const [session, presidentName] = await Promise.all([
		event.locals.auth(),
		getPresidentName(shortSemester).catch(e => {
			console.error('Failed to fetch president name:', e);
			return '공석';
		})
	]);

	const isUserAdmin = session?.user?.email ? isAdmin(session.user.email) : false;

	if (session?.user?.email) {
		const isSignupPage = event.url.pathname === '/signup';
		const isLoginPage = event.url.pathname === '/login';
		const isApi = event.url.pathname.startsWith('/api');
		const isAuth = event.url.pathname.startsWith('/auth');
		const isSignOut = event.url.pathname.includes('signout');

		// Prevent infinite loops and redundant checks during authentication flows
		if (!isSignupPage && !isLoginPage && !isApi && !isAuth && !isSignOut && !isUserAdmin) {
			try {
				const member = await getMemberByEmail(session.user.email);
				if (!member) {
					throw redirect(302, '/signup');
				}
			} catch (e) {
				// Re-throw redirects to ensure SvelteKit handles them correctly
				if (e && typeof e === 'object' && 'status' in e && e.status === 302) throw e;
				console.error('Layout Membership Verification Error:', e);
			}
		}
	}

	return {
		session,
		isAdmin: isUserAdmin,
		presidentName
	};
};