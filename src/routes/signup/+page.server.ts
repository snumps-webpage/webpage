import { redirect, fail } from '@sveltejs/kit';
import { getMemberByEmail } from '$lib/server/notion';
import type { PageServerLoad } from './$types';
import { getApplications, isAdmin } from '$lib/server/admin';
import { normalizePhoneNumber } from '$lib/utils';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user?.email) {
		throw redirect(302, `/login?redirect=${encodeURIComponent(event.url.pathname)}`);
	}

	// Check if already registered
	const member = await getMemberByEmail(session.user.email);
	if (member && !isAdmin(session.user.email)) {
		throw redirect(302, '/');
	}

	const apps = await getApplications();
	const pending = apps.find(a => a.email === session.user?.email);

	// Parse "Name / Status / Department"
	const fullName = session.user.name || '';
	const parts = fullName.split('/').map(p => p.trim());
	const parsedName = parts[0] || '';
	const parsedDept = parts[2] || '';

	return {
		user: session.user,
		parsedName,
		parsedDept,
		pending: !!pending
	};
};

export const actions = {
	default: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email || !session.user.name) {
			return fail(401, { error: 'Authentication required to submit application.' });
		}

		// Re-parse from session for security (do not trust form input for name/dept)
		const parts = session.user.name.split('/').map(p => p.trim());
		const name = parts[0];
		const department = parts[2] || 'Unknown';

		const data = await request.formData();
		const phone = normalizePhoneNumber(data.get('phone') as string);
		const background = data.get('background') as string;
		const agreement = data.get('agreement');

		if (!agreement) {
			return fail(400, { error: '개인정보 수집 및 이용에 동의해야 합니다.' });
		}

		if (!phone || phone.length < 10) {
			return fail(400, { error: '유효한 전화번호를 입력해주세요.' });
		}

		try {
			const { addApplication } = await import('$lib/server/admin');
			const { sendSignupNotification } = await import('$lib/server/mail');
			
			await addApplication({
				email: session.user.email,
				name,
				department,
				phone,
				background,
				accepted: false
			});

			// Notify admins via the automated admin email account
			await sendSignupNotification(name);

			return { success: true };
		} catch (e) {
			console.error('[Signup] Action failed:', e);
			return fail(500, { error: '가입 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
		}
	}
};
