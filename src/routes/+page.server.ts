import { getMemberByEmail, getActivities, getUserActivities } from '$lib/server/notion';
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
			const [rawCurrentActivities, allAttendedActivities] = await Promise.all([
				getActivities(semester.startDate, semester.endDate),
				getUserActivities(member.memberId)
			]);

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
				myAttendanceStats: {
					total: currentActivities.length,
					attended: attendedCount
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
