import { getMemberByEmail, getActivities, getUserActivities } from '$lib/server/notion';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();
	
	const today = new Date();
	const month = today.getMonth() + 1;
	const year = today.getFullYear();

	let semesterName = '';
	let startDate = '';
	let endDate = '';
	let currentSemesterKey = '';

	if (month >= 3 && month <= 8) {
		semesterName = `${year}년 1학기`;
		startDate = `${year}-03-01`;
		endDate = `${year}-08-31`;
		currentSemesterKey = `${year}-1`;
	} else if (month >= 9) {
		semesterName = `${year}년 2학기`;
		startDate = `${year}-09-01`;
		endDate = `${year + 1}-02-28`;
		currentSemesterKey = `${year}-2`;
	} else {
		semesterName = `${year - 1}년 2학기`;
		startDate = `${year - 1}-09-01`;
		endDate = `${year}-02-28`;
		currentSemesterKey = `${year - 1}-2`;
	}

	if (!session?.user?.email) {
		return {
			activities: [],
			semester: semesterName,
			myAttendanceStats: { total: 0, attended: 0 },
			semesters: []
		};
	}

	try {
		const member = await getMemberByEmail(session.user.email);
		if (!member) {
			return { 
				error: '회원 DB에서 이메일을 찾을 수 없습니다.', 
				semester: semesterName,
				activities: [],
				myAttendanceStats: { total: 0, attended: 0 },
				semesters: []
			};
		}

		// Fetch current semester activities (to show stats and absences)
		// AND fetch all-time attended activities
		const [rawCurrentActivities, allAttendedActivities] = await Promise.all([
			getActivities(startDate, endDate),
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
			semester: currentSemesterKey
		}));

		const attendedCount = currentActivities.filter(a => a.attended).length;

		// Extract unique semesters from all-time attended activities
		const semesters = Array.from(new Set(allAttendedActivities.map(a => {
			if (!a.date) return 'Unknown';
			const date = new Date(a.date);
			const y = date.getFullYear();
			const m = date.getMonth() + 1;
			return (m >= 3 && m <= 8) ? `${y}-1` : (m >= 9 ? `${y}-2` : `${y - 1}-2`);
		})));
		
		// Ensure current semester is in the list even if no participation yet
		if (!semesters.includes(currentSemesterKey)) {
			semesters.push(currentSemesterKey);
		}
		semesters.sort().reverse();

		// For other semesters, we only show attended activities
		const pastAttended = allAttendedActivities
			.filter(a => {
				const d = new Date(a.date);
				const y = d.getFullYear();
				const m = d.getMonth() + 1;
				const sem = (m >= 3 && m <= 8) ? `${y}-1` : (m >= 9 ? `${y}-2` : `${y - 1}-2`);
				return sem !== currentSemesterKey;
			})
			.map(a => ({
				...a,
				attended: true,
				semester: (() => {
					const d = new Date(a.date);
					const y = d.getFullYear();
					const m = d.getMonth() + 1;
					return (m >= 3 && m <= 8) ? `${y}-1` : (m >= 9 ? `${y}-2` : `${y - 1}-2`);
				})(),
				url: a.url
			}));

		return {
			semester: semesterName,
			currentSemesterKey,
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
			semester: semesterName,
			activities: [],
			myAttendanceStats: { total: 0, attended: 0 },
			semesters: []
		};
	}
};
