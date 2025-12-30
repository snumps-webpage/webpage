import { redirect } from '@sveltejs/kit';
import { getMemberByEmail } from '$lib/server/notion';
import type { PageServerLoad } from './$types';
import { getApplications, isAdmin } from '$lib/server/admin';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.email) {
		throw redirect(302, '/login');
	}

	// Check if already registered
	const member = await getMemberByEmail(session.user.email);
	if (member && !isAdmin(session.user.email)) {
		// Also check if they have a pending application to avoid confusion?
		// But if they are a member, they shouldn't be here.
		throw redirect(302, '/');
	}

	const apps = await getApplications();
	const pending = apps.find(a => a.email === session.user?.email);

	return {
		user: session.user,
		pending: !!pending
	};
};

export const actions = {
	default: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email) return { error: 'Unauthorized' };

		const data = await request.formData();
		const name = data.get('name') as string;
		const department = data.get('department') as string;
		const phone = data.get('phone') as string;
		const bio = data.get('bio') as string;
		const background = data.get('background') as string;
		const agreement = data.get('agreement');

		if (!agreement) {
			return { error: '개인정보 수집 및 이용에 동의해야 합니다.' };
		}

		if (!name || !department || !phone) {
			return { error: '필수 정보를 모두 입력해주세요.' };
		}

		const { addApplication } = await import('$lib/server/admin');
		
		await addApplication({
			email: session.user.email,
			name,
			department,
			phone,
			bio,
			background
		});

		return { success: true };
	}
};
