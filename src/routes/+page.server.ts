import {
  getMemberByEmail,
  getActivities,
  getUserActivities,
  getPrivateInfo,
  updatePrivateInfo,
  getUserSeminars,
  updateSeminar,
} from "$lib/server/notion";
import { getSeminarRequests } from "$lib/server/seminars";
import { getApplications, type Application } from "$lib/server/admin";
import {
  getSemesterInfo,
  getSemesterKeyFromDate,
  normalizePhoneNumber,
} from "$lib/utils";
import { fail } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

interface DashboardActivity {
  id: string;
  name: string;
  date: string;
  type: string;
  attendees: string[];
  url: string;
}

interface UserAttendedActivity {
  id: string;
  name: string;
  date: string;
  type: string;
  url: string;
}

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  const semester = getSemesterInfo();
  const skipCache = event.url.searchParams.has("refresh");

  if (!session?.user?.email) {
    return {
      semester: semester.name,
      currentSemesterKey: semester.key,
      streamed: {
        dashboard: Promise.resolve(null),
      },
    };
  }

  try {
    const member = await getMemberByEmail(session.user.email, skipCache);
    let userApplication = null;
    if (!member) {
      const apps = await getApplications(skipCache);
      userApplication = apps.find(
        (a: Application) => a.email === session.user?.email,
      );
    }

    const dashboardPromise = async () => {
      if (!member) {
        return null; // Local handled
      }

      try {
        const [
          rawCurrentActivities,
          allAttendedActivities,
          allSeminarRequests,
          privateInfo,
          approvedSeminars,
        ] = await Promise.all([
          getActivities(semester.startDate, semester.endDate, skipCache),
          getUserActivities(member.memberId, skipCache),
          getSeminarRequests(skipCache),
          getPrivateInfo(member.privateInfoId),
          getUserSeminars(member.memberId),
        ]);

        // Combine and Deduplicate Seminars
        const requests = allSeminarRequests.filter((req) =>
          req.speakerIds.includes(member.memberId),
        );

        const currentActivities = (
          rawCurrentActivities as DashboardActivity[]
        ).map((act) => ({
          id: act.id,
          name: act.name,
          date: act.date,
          type: act.type,
          attended: act.attendees.includes(member.memberId),
          url: act.url,
          semester: semester.key,
        }));

        const attendedCount = currentActivities.filter(
          (a) => a.attended,
        ).length;

        const semesters = Array.from(
          new Set(
            (allAttendedActivities as UserAttendedActivity[]).map((a) =>
              getSemesterKeyFromDate(a.date),
            ),
          ),
        );
        if (!semesters.includes(semester.key)) semesters.push(semester.key);
        semesters.sort().reverse();

        const pastAttended = (allAttendedActivities as UserAttendedActivity[])
          .filter((a) => getSemesterKeyFromDate(a.date) !== semester.key)
          .map((a) => ({
            ...a,
            attended: true,
            semester: getSemesterKeyFromDate(a.date),
            url: a.url,
          }));

        return {
          activities: [...currentActivities, ...pastAttended],
          seminarRequests: requests,
          approvedSeminars,
          myAttendanceStats: {
            total: currentActivities.length,
            attended: attendedCount,
          },
          profile: {
            phone: privateInfo?.phone || "",
            background: privateInfo?.background || "",
          },
          semesters,
        };
      } catch (e) {
        console.error("[Dashboard Load] Promise Error:", e);
        return { error: "데이터를 처리하는 중 오류가 발생했습니다." };
      }
    };

    return {
      semester: semester.name,
      currentSemesterKey: semester.key,
      isMember: !!member,
      application: userApplication,
      streamed: {
        dashboard: dashboardPromise(),
      },
    };
  } catch (e) {
    console.error("[Dashboard Load] Member Lookup Error:", e);
    // Return basic info so the page doesn't 500
    return {
      semester: semester.name,
      currentSemesterKey: semester.key,
      streamed: {
        dashboard: Promise.resolve({
          error: "회원 정보를 확인할 수 없습니다. (Notion API 오류)",
        }),
      },
    };
  }
};

export const actions = {
  updateProfile: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email)
      return fail(401, { error: "로그인이 필요합니다." });

    const data = await request.formData();
    const phone = normalizePhoneNumber(data.get("phone") as string);
    const background = data.get("background") as string;

    try {
      const member = await getMemberByEmail(session.user.email);
      if (!member) return fail(404, { error: "회원 정보를 찾을 수 없습니다." });

      await updatePrivateInfo(member.privateInfoId, { phone, background });
      return { success: true };
    } catch (e) {
      console.error("[Action UpdateProfile] Error:", e);
      return fail(500, { error: "프로필 업데이트에 실패했습니다." });
    }
  },

  updateSeminar: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email)
      return fail(401, { error: "로그인이 필요합니다." });

    const data = await request.formData();
    const id = data.get("id") as string;
    const title = data.get("title") as string;
    const remarks = data.get("remarks") as string;

    if (!id) return fail(400, { error: "요청 ID가 누락되었습니다." });

    try {
      await updateSeminar(id, { title, remarks });
      return { success: true };
    } catch (e) {
      console.error("[Action UpdateSeminar] Error:", e);
      return fail(500, { error: "세미나 정보 업데이트에 실패했습니다." });
    }
  },
};
