import { fail, redirect } from "@sveltejs/kit";
import { ensureAdmin } from "$lib/server/auth-guards";
import { ACTIVITY_TYPES } from "$lib/server/data/schemas";
import { kstInputToIso } from "$lib/server/core/time";
import { createEventWithActivity } from "$lib/server/services/events";
import type { Activity } from "$lib/server/data/schemas";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  return { activityTypes: [...ACTIVITY_TYPES] };
};

export const actions = {
  default: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    await ensureAdmin(locals, { silent: true });

    const data = await request.formData();
    const title = data.get("title") as string;
    const dateRaw = data.get("date") as string; // YYYY-MM-DDTHH:mm (KST)
    const type = data.get("type") as string;

    if (!title || !dateRaw || !type) {
      return fail(400, { error: "Missing required fields" });
    }
    if (!(ACTIVITY_TYPES as readonly string[]).includes(type)) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }

    await createEventWithActivity({
      title,
      startIso: kstInputToIso(dateRaw),
      type: type as Activity["type"],
    });

    throw redirect(302, "/admin");
  },
};
