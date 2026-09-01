import { redirect, isActionFailure } from "@sveltejs/kit";
import { getAllActivities } from "$lib/server/notion";
import { createEvent } from "$lib/server/events";
import { getSemesterKeyFromDate } from "$lib/utils";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals);

  const activities = await getAllActivities();

  // Extract unique semesters using shared utility
  const semesters = Array.from(
    new Set(activities.map((a) => getSemesterKeyFromDate(a.date))),
  )
    .sort()
    .reverse();

  return { activities, semesters };
};

export const actions = {
  publish: async ({ request, locals }) => {
    const data = await request.formData();
    const notionPageId = data.get("notionPageId") as string;
    const title = data.get("title") as string;
    const date = data.get("date") as string;
    const type = data.get("type") as string;

    const result = await handleAdminAction(
      locals,
      async () => {
        if (!notionPageId) throw new Error("이벤트를 선택해주세요.");
        await createEvent({ title, date, type, notionPageId });
        return {};
      },
      { invalidate: "all_events" },
    );

    // Denial (403) or a failed write comes back as an ActionFailure; surface it
    // instead of redirecting as if the publish had succeeded.
    if (isActionFailure(result)) return result;

    throw redirect(302, "/admin");
  },
};
