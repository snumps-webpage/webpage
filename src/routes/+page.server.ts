import { 
	getMemberByEmail, getActivities, getUserActivities, 
	getPrivateInfo, updatePrivateInfo, getUserSeminars, updateSeminar 
} from '$lib/server/notion';
import { getSeminarRequests } from '$lib/server/seminars';
import { getSemesterInfo, getSemesterKeyFromDate, normalizePhoneNumber } from '$lib/utils';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	const semester = getSemesterInfo();

	if (!session?.user?.email) {
		return {
			semester: semester.name,
			currentSemesterKey: semester.key,
			streamed: {
				dashboard: Promise.resolve(null)
			}
		};
	}

	const member = await getMemberByEmail(session.user.email);
	
	const dashboardPromise = async () => {
		if (!member) {
			return { error: '회원 DB에서 이메일을 찾을 수 없습니다.' };
		}

		try {
			const [
				rawCurrentActivities, 
				allAttendedActivities, 
				allSeminarRequests, 
				privateInfo,
				approvedSeminars
			] = await Promise.all([
				getActivities(semester.startDate, semester.endDate),
				getUserActivities(member.memberId),
				getSeminarRequests(),
				getPrivateInfo(member.privateInfoId),
				getUserSeminars(member.memberId)
			]);

			// Combine and Deduplicate Seminars
			// 1. Pending/Rejected requests where I am applicant or speaker
			const requests = allSeminarRequests.filter(req => 
				req.speakerIds.includes(member.memberId)
			);

			const currentActivities = rawCurrentActivities.map(act => ({
				id: act.id,
				name: act.name,
				date: act.date,
				type: act.type,
				attended: act.attendees.includes(member.memberId),
				url: act.url,
				semester: semester.key
			}));

			const attendedCount = currentActivities.filter(a => a.attended).length;

			const semesters = Array.from(new Set(allAttendedActivities.map(a => getSemesterKeyFromDate(a.date))));
			if (!semesters.includes(semester.key)) semesters.push(semester.key);
			semesters.sort().reverse();

			const pastAttended = allAttendedActivities
				.filter(a => getSemesterKeyFromDate(a.date) !== semester.key)
				.map(a => ({
					...a,
					attended: true,
					semester: getSemesterKeyFromDate(a.date),
					url: a.url
				}));

			return {
				activities: [...currentActivities, ...pastAttended],
				seminarRequests: requests,
				approvedSeminars,
				myAttendanceStats: {
					total: currentActivities.length,
					attended: attendedCount
				},
				profile: {
					phone: privateInfo?.phone || '',
					background: privateInfo?.background || ''
				},
				semesters
			};
		} catch (e) {
			console.error('Error loading dashboard data:', e);
			return { error: '데이터를 불러오는 중 오류가 발생했습니다.' };
		}
	};

	return {
		semester: semester.name,
		currentSemesterKey: semester.key,
		streamed: {
			dashboard: dashboardPromise()
		}
	};
};

export const actions = {
	updateProfile: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email) return fail(401);
		
		const data = await request.formData();
		const phone = normalizePhoneNumber(data.get('phone') as string);
		const background = data.get('background') as string;
		
		const member = await getMemberByEmail(session.user.email);
		if (!member) return fail(404, { error: 'Member not found' });
		
		try {
			await updatePrivateInfo(member.privateInfoId, { phone, background });
			return { success: true };
		} catch (e) {
			console.error(e);
			return fail(500, { error: 'Failed to update profile' });
		}
	},

	updateSeminar: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email) return fail(401);

		const data = await request.formData();
		const id = data.get('id') as string;
		const title = data.get('title') as string;
		const remarks = data.get('remarks') as string;

		if (!id) return fail(400, { error: 'ID is required' });

		try {
			await updateSeminar(id, { title, remarks });
			return { success: true };
		} catch (e) {
			console.error(e);
			return fail(500, { error: 'Seminar update failed' });
		}
	}
};
