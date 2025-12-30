import { getMemberByEmail, getActivities, getPresidentName } from '$lib/server/notion';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	
	// Calculate Semester
	const today = new Date();
	const month = today.getMonth() + 1; // 1-12
	const year = today.getFullYear();

	let semesterName = '';
	let startDate = '';
	let endDate = '';
	let shortSemester = '';

	if (month >= 3 && month <= 8) {
		semesterName = `${year}년 1학기`;
		startDate = `${year}-03-01`;
		endDate = `${year}-08-31`;
		shortSemester = `${(year % 100).toString()}-1`;
	} else if (month >= 9) {
		semesterName = `${year}년 2학기`;
		startDate = `${year}-09-01`;
		endDate = `${year + 1}-02-28`;
		shortSemester = `${(year % 100).toString()}-2`;
	} else {
		// Jan, Feb -> belong to previous year's 2nd semester
		semesterName = `${year - 1}년 2학기`;
		startDate = `${year - 1}-09-01`;
		endDate = `${year}-02-28`;
		shortSemester = `${((year - 1) % 100).toString()}-2`;
	}

	let presidentName = '공석';
	try {
		const name = await getPresidentName(shortSemester);
		if (name) presidentName = name;
	} catch (e) {
		console.error('Failed to fetch president name:', e);
	}

	if (!session?.user?.email) {
		return {
			activities: [],
			semester: semesterName,
			myAttendanceStats: { total: 0, attended: 0 },
			presidentName
		};
	}

	try {
		const member = await getMemberByEmail(session.user.email);
		
		// If member not found (maybe manual entry required), return empty
		if (!member) {
			return { 
				error: '회원 DB에서 이메일을 찾을 수 없습니다.', 
				semester: semesterName,
				activities: [],
				myAttendanceStats: { total: 0, attended: 0 },
				presidentName
			};
		}

		const rawActivities = await getActivities(startDate, endDate);

		const activities = rawActivities.map(act => ({
			id: act.id,
			name: act.name,
			date: act.date,
			type: act.type,
			attended: act.attendees.includes(member.memberId)
		}));

		const attendedCount = activities.filter(a => a.attended).length;

		return {
			semester: semesterName,
			activities,
			myAttendanceStats: {
				total: activities.length,
				attended: attendedCount
			},
			presidentName
		};

	} catch (e) {
		console.error('Error loading dashboard:', e);
		return { 
			error: '데이터를 불러오는 중 오류가 발생했습니다.', 
			semester: semesterName,
			activities: [],
			myAttendanceStats: { total: 0, attended: 0 },
			presidentName
		};
	}
};
