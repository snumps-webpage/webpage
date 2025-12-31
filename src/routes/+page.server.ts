import { getMemberByEmail, getActivities, getUserActivities } from '$lib/server/notion';
import { getSemesterInfo, getSemesterKeyFromDate } from '$lib/utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	const semester = getSemesterInfo();

	if (!session?.user?.email) {
		return {
			activities: [],
			semester: semester.name,
			myAttendanceStats: { total: 0, attended: 0 },
			semesters: []
		};
	}

	try {
		const member = await getMemberByEmail(session.user.email);
		if (!member) {
			return { 
				error: '회원 DB에서 이메일을 찾을 수 없습니다.', 
				semester: semester.name,
				activities: [],
				myAttendanceStats: { total: 0, attended: 0 },
				semesters: []
			};
		}

		// Fetch current semester activities (to show stats and absences)
		// AND fetch all-time attended activities
		const [rawCurrentActivities, allAttendedActivities] = await Promise.all([
			getActivities(semester.startDate, semester.endDate),
			getUserActivities(member.memberId)
		]);

		// Map current semester activities with attendance status
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

		// Extract unique semesters from all-time attended activities
		const semesters = Array.from(new Set(allAttendedActivities.map(a => getSemesterKeyFromDate(a.date))));
		
		// Ensure current semester is in the list even if no participation yet
		if (!semesters.includes(semester.key)) {
			semesters.push(semester.key);
		}
		semesters.sort().reverse();

		// For other semesters, we only show attended activities
		const pastAttended = allAttendedActivities
			.filter(a => getSemesterKeyFromDate(a.date) !== semester.key)
			.map(a => ({
				...a,
				attended: true,
				semester: getSemesterKeyFromDate(a.date),
				url: a.url
			}));

		return {
			semester: semester.name,
			currentSemesterKey: semester.key,
			activities: [...currentActivities, ...pastAttended],
			myAttendanceStats: {
				total: currentActivities.length,
				attended: attendedCount
			},
			semesters
		};

	} catch (e) {
		console.error('Error loading dashboard:', e);
		return { 
			error: '데이터를 불러오는 중 오류가 발생했습니다.', 
			semester: semester.name,
			activities: [],
			myAttendanceStats: { total: 0, attended: 0 },
			semesters: []
		};
	}
};
