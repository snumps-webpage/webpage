import { dev } from "$app/environment";
import { fail } from "@sveltejs/kit";
import { handleUserAction } from "$lib/server/auth-guards";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import { getTable, mutate } from "$lib/server/data/tables";
import { getActivitiesBetween, getActivitiesOf, getPrivateInfoOf } from "$lib/server/data/repos";
import { currentTerm, termRange } from "$lib/server/core/semester";
import { AppError } from "$lib/server/core/errors";
import { getSemesterInfo, getSemesterKeyFromDate, normalizePhoneNumber } from "$lib/utils";
import type { PageServerLoad } from "./$types";

function buildDevDashboardPreview(semesterKey: string) {
  const today = new Date();
  const toDate = (offsetDays: number) =>
    new Date(today.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const activities = [
    {
      id: "preview-activity-1",
      name: "조합론 세미나",
      date: toDate(-9),
      type: "세미나",
      attended: true,
      url: "https://example.com/preview/seminar-1",
      semester: semesterKey,
    },
    {
      id: "preview-activity-2",
      name: "기하학 문제풀이",
      date: toDate(-4),
      type: "문제풀이",
      attended: false,
      url: "https://example.com/preview/geometry",
      semester: semesterKey,
    },
    {
      id: "preview-activity-3",
      name: "수리논리 학습회",
      date: toDate(-1),
      type: "스터디",
      attended: true,
      url: "https://example.com/preview/logic",
      semester: semesterKey,
    },
  ];

  return {
    activities,
    seminarRequests: [
      {
        id: "preview-req-1",
        status: "pending",
        title: "대수적 위상수학 입문",
        submittedAt: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    approvedSeminars: [
      {
        id: "preview-approved-1",
        title: "정수론과 암호",
        semester: semesterKey,
        remarks: "격주 진행",
      },
    ],
    myAttendanceStats: {
      total: activities.length,
      attended: activities.filter((activity) => activity.attended).length,
    },
    profile: {
      phone: "010-1234-5678",
      background: "대수학, 해석학, 조합론에 관심이 있습니다.",
    },
    semesters: [semesterKey],
  };
}

export const load: PageServerLoad = async (event) => {
  const devPreviewRole = resolveDevPreviewRole(event.url, event.cookies);
  let session = null;
  try {
    session = await event.locals.auth();
  } catch (error) {
    console.error("[Dashboard Load] Failed to resolve auth session:", error);
  }
  const semester = getSemesterInfo();

  if (dev && devPreviewRole) {
    return {
      session,
      isAdmin: devPreviewRole === "admin",
      semester: semester.name,
      currentSemesterKey: semester.key,
      isMember: true,
      application: null,
      streamed: { dashboard: Promise.resolve(buildDevDashboardPreview(semester.key)) },
    };
  }

  if (!session?.user?.email) {
    return {
      session: null,
      isAdmin: false,
      semester: semester.name,
      currentSemesterKey: semester.key,
      streamed: { dashboard: Promise.resolve(null) },
    };
  }

  const member = event.locals.member ?? null;

  const dashboardPromise = async () => {
    if (!member) return null;

    try {
      const range = termRange(currentTerm());
      const [currentRaw, attendedRaw, allRequests, privateInfo, allSeminars] =
        await Promise.all([
          getActivitiesBetween(range.start, range.end),
          getActivitiesOf(member.memberId),
          getTable("seminar-requests"),
          getPrivateInfoOf(member.memberId),
          getTable("seminars"),
        ]);

      const requests = allRequests
        .filter(
          (r) =>
            r.presenterIds.includes(member.memberId) ||
            r.requesterId === member.memberId,
        )
        .map((r) => ({ ...r, speakerIds: r.presenterIds, submittedAt: r.createdAt }));

      const currentActivities = currentRaw.map((a) => ({
        id: a.id,
        name: a.title,
        date: a.date.start,
        type: a.type,
        attended: a.attendeeIds.includes(member.memberId),
        url: "",
        semester: semester.key,
      }));

      const semesters = Array.from(
        new Set(attendedRaw.map((a) => getSemesterKeyFromDate(a.date.start))),
      );
      if (!semesters.includes(semester.key)) semesters.push(semester.key);
      semesters.sort().reverse();

      const pastAttended = attendedRaw
        .filter((a) => getSemesterKeyFromDate(a.date.start) !== semester.key)
        .map((a) => ({
          id: a.id,
          name: a.title,
          date: a.date.start,
          type: a.type,
          attended: true,
          url: "",
          semester: getSemesterKeyFromDate(a.date.start),
        }));

      return {
        activities: [...currentActivities, ...pastAttended],
        seminarRequests: requests,
        approvedSeminars: allSeminars
          .filter((s) => s.presenterIds.includes(member.memberId))
          .map((s) => ({ id: s.id, title: s.title, semester: s.semester, remarks: s.note })),
        myAttendanceStats: {
          total: currentActivities.length,
          attended: currentActivities.filter((a) => a.attended).length,
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
    session,
    isAdmin: member?.isAdmin ?? false,
    semester: semester.name,
    currentSemesterKey: semester.key,
    isMember: !!member,
    application: null,
    streamed: { dashboard: dashboardPromise() },
  };
};

export const actions = {
  updateProfile: async ({
    request,
    locals,
    url,
    cookies,
  }: {
    request: Request;
    locals: App.Locals;
    url: URL;
    cookies: import("@sveltejs/kit").Cookies;
  }) => {
    const devPreviewRole = resolveDevPreviewRole(url, cookies);
    if (dev && devPreviewRole) return { success: true, preview: true };

    const data = await request.formData();
    const phone = normalizePhoneNumber(data.get("phone") as string);
    const background = (data.get("background") as string) ?? "";

    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");
      // MEM-04: own row only — resolved from the session, never from the form.
      await mutate("private-info", (rows) => {
        const idx = rows.findIndex((p) => p.memberId === member.memberId);
        if (idx === -1) throw new AppError("NOT_FOUND");
        rows[idx] = { ...rows[idx], phone, background };
        return rows;
      });
      return {};
    });
  },

  updateSeminar: async ({
    request,
    locals,
    url,
    cookies,
  }: {
    request: Request;
    locals: App.Locals;
    url: URL;
    cookies: import("@sveltejs/kit").Cookies;
  }) => {
    const devPreviewRole = resolveDevPreviewRole(url, cookies);
    if (dev && devPreviewRole) return { success: true, preview: true };

    const data = await request.formData();
    const id = data.get("id") as string;
    const title = data.get("title") as string;
    const remarks = (data.get("remarks") as string) ?? "";
    if (!id) return fail(400, { error: "요청 ID가 누락되었습니다." });

    return handleUserAction(locals, async () => {
      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");
      await mutate("seminars", (rows) => {
        const idx = rows.findIndex((s) => s.id === id);
        if (idx === -1) throw new AppError("NOT_FOUND");
        if (!rows[idx].presenterIds.includes(member.memberId) && !member.isAdmin) {
          throw new AppError("FORBIDDEN");
        }
        rows[idx] = { ...rows[idx], title: title || rows[idx].title, note: remarks };
        return rows;
      });
      return {};
    });
  },
};
