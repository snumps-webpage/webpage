import { fail, redirect, type ActionFailure } from "@sveltejs/kit";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { connectActivity } from "$lib/server/services/events";
import { termOf } from "$lib/server/core/semester";
import { adminDashboardIdSchema } from "$lib/domain/admin-dashboard";
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
  publish: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    const result = await handleAdminAction(locals, async () => {
      // §7-5: the session copies title/date/type from the activity — the id is
      // the only client input we trust.
      const raw = data.get("activityId") ?? data.get("notionPageId");
      const parsed = adminDashboardIdSchema.safeParse(
        typeof raw === "string" ? raw : "",
      );
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          message: "이벤트를 선택해주세요.",
          issues: { activityId: parsed.error.issues[0].message },
        });
      }
      await connectActivity(parsed.data);
      return {};
    });
    // 303: a POST answered with a redirect must turn into a GET (audit W-26).
    if ("success" in result && result.success) throw redirect(303, "/admin");
    return result as ActionFailure<{
      error: string;
      message?: string;
      issues?: Record<string, string>;
    }>;
  },
};
