import { fail } from '@sveltejs/kit';
import { getMemberByEmail, getUserActivities, getPrivateInfo, updatePrivateInfo } from '$lib/server/notion';
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

		// Extract unique semesters
		const semesters = Array.from(new Set(activities.map(a => {
			if (!a.date) return 'Unknown';
			const date = new Date(a.date);
			const year = date.getFullYear();
			const month = date.getMonth() + 1;
			// Simple semester logic: Mar-Aug = 1, Sep-Feb = 2 (belongs to year started in Sep)
			// Actually, typical academic year:
			// 1st Sem: Mar 1 - Aug 31
			// 2nd Sem: Sep 1 - Feb 28 (next year)
			
			if (month >= 3 && month <= 8) return `${year}-1`;
			if (month >= 9) return `${year}-2`;
			return `${year - 1}-2`; // Jan/Feb
		}))).sort().reverse();

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
