import { getMemberByEmail, getActivities, getUserActivities, getPrivateInfo, updatePrivateInfo } from '$lib/server/notion';
import { getSeminarRequests } from '$lib/server/seminars';
import { getSemesterInfo, getSemesterKeyFromDate } from '$lib/utils';
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
			const [rawCurrentActivities, allAttendedActivities, allSeminarRequests, privateInfo] = await Promise.all([
				getActivities(semester.startDate, semester.endDate),
				getUserActivities(member.memberId),
				getSeminarRequests(),
				getPrivateInfo(member.privateInfoId)
			]);

			// Filter Seminars: My Applications OR Seminars where I am a speaker
			const mySeminars = allSeminarRequests.filter(req => 
				req.applicantEmail === session.user?.email || 
				req.speakerIds.includes(member.memberId)
			).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
			
			if (!semesters.includes(semester.key)) {
				semesters.push(semester.key);
			}
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
				mySeminars,
				myAttendanceStats: {
					total: currentActivities.length,
					attended: attendedCount
				},
				profile: {
					phone: privateInfo?.phone || ''
				},
				semesters
			};
		} catch (e) {
			console.error('Error loading dashboard:', e);
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
	updatePhone: async ({ request, locals }) => {
		const session = await locals.auth();
		if (!session?.user?.email) return { error: 'Unauthorized' };
		
		const data = await request.formData();
		const phone = data.get('phone') as string;
		
		const member = await getMemberByEmail(session.user.email);
		if (!member) return { error: 'Member not found' };
		
		try {
			await updatePrivateInfo(member.privateInfoId, { phone });
			return { success: true };
		} catch (e) {
			console.error(e);
			return { error: 'Failed to update phone' };
		}
	}
};
