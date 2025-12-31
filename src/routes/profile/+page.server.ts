import { fail } from '@sveltejs/kit';
import { getMemberByEmail, getUserActivities, getPrivateInfo, updatePrivateInfo } from '$lib/server/notion';
import { getSemesterKeyFromDate } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.email) return { activities: [], profile: null, semesters: [] };

	try {
		const memberLinks = await getMemberByEmail(session.user.email);
		if (!memberLinks) return { activities: [], profile: null, semesters: [] };

		const [activities, profile] = await Promise.all([
			getUserActivities(memberLinks.memberId),
			getPrivateInfo(memberLinks.privateInfoId)
		]);

		// Extract unique semesters using utility function
		const semesters = Array.from(new Set(activities.map(a => getSemesterKeyFromDate(a.date)))).sort().reverse();

		return {
			activities,
			profile: { ...profile, ...memberLinks }, // Combine basic info with IDs
			semesters
		};

	} catch (e) {
		console.error(e);
		return { error: 'Failed to load profile', activities: [], profile: null, semesters: [] };
	}
};

export const actions = {
	update: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email) return fail(401);

		const data = await request.formData();
		const phone = data.get('phone') as string;
		const bio = data.get('bio') as string;
		const background = data.get('background') as string;
		
		// Security Fix: Do not trust 'privateInfoId' from client.
		// Re-fetch member links to ensure user owns the record.
		const memberLinks = await getMemberByEmail(session.user.email);
		if (!memberLinks) return fail(404, { error: 'Profile not found' });
		
		const pageId = memberLinks.privateInfoId;

		try {
			await updatePrivateInfo(pageId, { phone, bio, background });
			return { success: true };
		} catch (e) {
			console.error(e);
			return fail(500, { error: 'Update failed' });
		}
	}
};
