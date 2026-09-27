import { fail, redirect, type ActionFailure } from "@sveltejs/kit";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { ACTIVITY_TYPES } from "$lib/server/data/schemas";
import { kstInputToIso } from "$lib/server/core/time";
import { createEventWithActivity } from "$lib/server/services/events";
import {
  adminEventInputSchema,
  adminFormIssues,
} from "$lib/domain/admin-dashboard";
import { formText } from "$lib/domain/form-data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  return { activityTypes: [...ACTIVITY_TYPES] };
};

export const actions = {
  default: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    const result = await handleAdminAction(locals, async () => {
      // The form posts one `date` (YYYY-MM-DDTHH:mm, KST) and no end; the
      // schema's issue keys (title, type, startsAtLocal) feed its error slots.
      const values = {
        title: formText(data, "title"),
        type: formText(data, "type"),
        startsAtLocal: formText(data, "date"),
        endsAtLocal: "",
      };
      const parsed = adminEventInputSchema.safeParse(values);
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          message: "제목·일시·종류를 확인해 주세요.",
          issues: adminFormIssues(parsed.error),
          values,
        });
      }
      await createEventWithActivity({
        title: parsed.data.title,
        startIso: kstInputToIso(parsed.data.startsAtLocal),
        type: parsed.data.type,
      });
      return {};
    });
    // 303: a POST answered with a redirect must turn into a GET (audit W-26).
    if ("success" in result && result.success) throw redirect(303, "/admin");
    // Failures out of the wrapper always carry { error, message? } (§1-2);
    // the wrapper's Record<string, unknown> generic would erase ActionData keys.
    // `issues?` keeps the validation fail() above from being subsumed.
    return result as ActionFailure<{
      error: string;
      message?: string;
      issues?: Record<string, string>;
    }>;
  },
};
