import { u as updateSeminar, b as getMemberByEmail, c as updatePrivateInfo, d as getActivities, e as getUserActivities, f as getPrivateInfo, h as getUserSeminars } from "../../chunks/notion.js";
import { g as getSeminarRequests } from "../../chunks/seminars.js";
import { getApplications } from "../../chunks/admin.js";
import { n as normalizePhoneNumber, g as getSemesterInfo, a as getSemesterKeyFromDate } from "../../chunks/utils3.js";
import { fail } from "@sveltejs/kit";
const load = async (event) => {
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
  try {
    const member = await getMemberByEmail(session.user.email);
    let userApplication = null;
    if (!member) {
      const apps = await getApplications();
      userApplication = apps.find((a) => a.email === session.user?.email);
    }
    const dashboardPromise = async () => {
      if (!member) {
        return null;
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
        const requests = allSeminarRequests.filter(
          (req) => req.speakerIds.includes(member.memberId)
        );
        const currentActivities = rawCurrentActivities.map((act) => ({
          id: act.id,
          name: act.name,
          date: act.date,
          type: act.type,
          attended: act.attendees.includes(member.memberId),
          url: act.url,
          semester: semester.key
        }));
        const attendedCount = currentActivities.filter((a) => a.attended).length;
        const semesters = Array.from(new Set(allAttendedActivities.map((a) => getSemesterKeyFromDate(a.date))));
        if (!semesters.includes(semester.key)) semesters.push(semester.key);
        semesters.sort().reverse();
        const pastAttended = allAttendedActivities.filter((a) => getSemesterKeyFromDate(a.date) !== semester.key).map((a) => ({
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
            phone: privateInfo?.phone || "",
            background: privateInfo?.background || ""
          },
          semesters
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
        dashboard: dashboardPromise()
      }
    };
  } catch (e) {
    console.error("[Dashboard Load] Member Lookup Error:", e);
    return {
      semester: semester.name,
      currentSemesterKey: semester.key,
      streamed: {
        dashboard: Promise.resolve({ error: "회원 정보를 확인할 수 없습니다. (Notion API 오류)" })
      }
    };
  }
};
const actions = {
  updateProfile: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email) return fail(401, { error: "로그인이 필요합니다." });
    const data = await request.formData();
    const phone = normalizePhoneNumber(data.get("phone"));
    const background = data.get("background");
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
    if (!session?.user?.email) return fail(401, { error: "로그인이 필요합니다." });
    const data = await request.formData();
    const id = data.get("id");
    const title = data.get("title");
    const remarks = data.get("remarks");
    if (!id) return fail(400, { error: "요청 ID가 누락되었습니다." });
    try {
      await updateSeminar(id, { title, remarks });
      return { success: true };
    } catch (e) {
      console.error("[Action UpdateSeminar] Error:", e);
      return fail(500, { error: "세미나 정보 업데이트에 실패했습니다." });
    }
  }
};
export {
  actions,
  load
};
