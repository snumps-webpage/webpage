import { redirect } from '@sveltejs/kit';
import { getApplications, isAdmin, removeApplication, getWithdrawalRequests, removeWithdrawalRequest } from '$lib/server/admin';
import { createMember, getAllMembers, withdrawMember, getMemberByEmail } from '$lib/server/notion';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.email || !isAdmin(session.user.email)) {
		throw redirect(302, '/');
	}

	const [apps, members, withdrawalRequests] = await Promise.all([
		getApplications(),
		getAllMembers(),
		getWithdrawalRequests()
	]);

	return {
		applications: apps,
		members: members,
		withdrawalRequests: withdrawalRequests
	};
};

export const actions = {
	approve: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const id = data.get('id') as string;
		
		const apps = await getApplications();
		const app = apps.find(a => a.id === id);

		if (!app) return { error: 'Application not found' };

		try {
			await createMember({
				name: app.name,
				email: app.email,
				phone: app.phone,
				department: app.department,
				bio: app.bio,
				background: app.background
			});
			
			await removeApplication(id);
			return { success: true };
		} catch (e) {
			console.error(e);
			return { error: 'Notion creation failed: ' + (e as Error).message };
		}
	},

	reject: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const id = data.get('id') as string;

		await removeApplication(id);
		return { success: true };
	},

	withdraw: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const id = data.get('id') as string;

		try {
			await withdrawMember(id);
			return { success: true };
		} catch (e) {
			console.error(e);
			return { error: 'Withdrawal failed: ' + (e as Error).message };
		}
	},

	approveWithdraw: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const email = data.get('email') as string;

		try {
			const member = await getMemberByEmail(email);
			if (!member) throw new Error('Member not found for email: ' + email);

			await withdrawMember(member.memberId);
			await removeWithdrawalRequest(email);
			return { success: true };
		} catch (e) {
			console.error(e);
			return { error: 'Withdrawal failed: ' + (e as Error).message };
		}
	},

	rejectWithdraw: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !isAdmin(session.user.email)) {
			return { error: 'Forbidden' };
		}

		const data = await request.formData();
		const email = data.get('email') as string;

		await removeWithdrawalRequest(email);
		return { success: true };
	}
};
