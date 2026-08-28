import { redirect } from "@sveltejs/kit";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
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
    const data = await request.formData();
    const result = await handleAdminAction(locals, async () => {
      const title = (data.get("title") as string)?.trim();
      const dateRaw = data.get("date") as string; // YYYY-MM-DDTHH:mm (KST)
      const type = data.get("type") as string;

      if (!title || !dateRaw || !type) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "제목·일시·종류는 필수 입력 항목입니다.",
        });
      }
      if (!(ACTIVITY_TYPES as readonly string[]).includes(type)) {
        throw new AppError("VALIDATION_FAILED");
      }

      await createEventWithActivity({
        title,
        startIso: kstInputToIso(dateRaw),
        type: type as Activity["type"],
      });
      return {};
    });
    if ("success" in result && result.success) throw redirect(302, "/admin");
    return result;
  },
};
