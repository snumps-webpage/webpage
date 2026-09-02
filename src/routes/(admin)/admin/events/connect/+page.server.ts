import { redirect } from "@sveltejs/kit";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { connectActivity } from "$lib/server/services/events";
import { termOf } from "$lib/server/core/semester";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });

  const activities = (await getTable("activities")).map((a) => ({
    id: a.id,
    name: a.title,
    date: a.date.start,
    type: a.type,
    attendeeCount: a.attendeeIds.length,
  }));

  const semesters = Array.from(
    new Set(activities.map((a) => termOf(new Date(a.date)))),
  )
    .sort()
    .reverse();

  return { activities, semesters };
};

export const actions = {
  publish: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    // §7-5: the session copies title/date/type from the activity — the id is
    // the only client input we trust.
    const activityId = (data.get("activityId") ?? data.get("notionPageId")) as string;
    if (!activityId) {
      const { fail } = await import("@sveltejs/kit");
      return fail(400, { error: "VALIDATION_FAILED", message: "이벤트를 선택해주세요." });
    }

    const result = await handleAdminAction(locals, async () => {
      await connectActivity(activityId);
      return {};
    });
    if ("success" in result && result.success) throw redirect(302, "/admin");
    return result;
  },
};
