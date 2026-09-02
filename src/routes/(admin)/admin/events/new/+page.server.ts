import { fail, redirect, type ActionFailure } from "@sveltejs/kit";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
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
    const title = (data.get("title") as string)?.trim();
    const dateRaw = data.get("date") as string; // YYYY-MM-DDTHH:mm (KST)
    const type = data.get("type") as string;

    // Per-field issues feed the form's inline error slots; the CODE stays
    // VALIDATION_FAILED (§1-2 contract).
    const issues: { title?: string; date?: string; type?: string } = {};
    if (!title) issues.title = "이벤트 제목을 입력해주세요.";
    if (!dateRaw) issues.date = "일시를 입력해주세요.";
    if (!type) issues.type = "활동 종류를 선택해주세요.";
    else if (!(ACTIVITY_TYPES as readonly string[]).includes(type)) {
      issues.type = "지원하지 않는 활동 종류입니다.";
    }
    if (issues.title || issues.date || issues.type) {
      return fail(400, {
        error: "VALIDATION_FAILED",
        message: "제목·일시·종류는 필수 입력 항목입니다.",
        issues,
      });
    }

    const result = await handleAdminAction(locals, async () => {
      await createEventWithActivity({
        title,
        startIso: kstInputToIso(dateRaw),
        type: type as Activity["type"],
      });
      return {};
    });
    if ("success" in result && result.success) throw redirect(302, "/admin");
    // Failures out of the wrapper always carry { error, message? } (§1-2);
    // the wrapper's Record<string, unknown> generic would erase ActionData keys.
    // `issues?` keeps the validation fail() above from being subsumed.
    return result as ActionFailure<{
      error: string;
      message?: string;
      issues?: { title?: string; date?: string; type?: string };
    }>;
  },
};
