import { redirect, fail } from '@sveltejs/kit';
import { getMemberByEmail } from '$lib/server/notion';
import { getApplications, isAdmin, updateApplication, type Application } from '$lib/server/admin';
import { normalizePhoneNumber } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.email) {
		throw redirect(302, '/');
	}

	const [member, apps] = await Promise.all([
		getMemberByEmail(session.user.email),
		getApplications()
	]);

	// Admins can view for testing, others must be non-members with pending app
	if (member && !isAdmin(session.user.email)) {
		throw redirect(302, '/');
	}

	const pending = apps.find((a: Application) => a.email === session.user?.email);

	if (!pending && !isAdmin(session.user.email)) {
		throw redirect(302, '/signup');
	}

	return {
		user: session.user,
		application: pending
	};
};

export const actions = {
	default: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email) return fail(401, { error: '로그인이 필요합니다.' });

		const data = await request.formData();
		const name = data.get('name') as string;
		const department = data.get('department') as string;
		const phone = normalizePhoneNumber(data.get('phone') as string);
		const background = data.get('background') as string;
		const appId = data.get('id') as string;

		if (!appId) {
			return fail(400, { error: '수정할 신청 내역을 찾을 수 없습니다.' });
		}

		if (!name || !department || !phone) {
			return fail(400, { error: '필수 정보를 모두 입력해주세요.' });
		}

		try {
			await updateApplication(appId, {
				name,
				department,
				phone,
				background
			});
			return { success: true };
		} catch (e) {
			console.error(e);
			return fail(500, { error: '정보 수정에 실패했습니다. 잠시 후 다시 시도해주세요.' });
		}
	}
};
