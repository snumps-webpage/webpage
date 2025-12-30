import { getMemberByEmail, withdrawMember } from '$lib/server/notion';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();
	if (!session?.user?.email) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const member = await getMemberByEmail(session.user.email);
		if (!member) {
			return json({ error: 'Member not found' }, { status: 404 });
		}

		await withdrawMember(member.memberId);
		
		// Note: The client should handle signOut after this succeeds
		return json({ success: true });
	} catch (e) {
		console.error(e);
		return json({ error: 'Failed to withdraw' }, { status: 500 });
	}
};
