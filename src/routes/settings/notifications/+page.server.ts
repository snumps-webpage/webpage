import { fail } from "@sveltejs/kit";
import { validateMailPreferenceForm } from "$lib/domain/account";
import { requireDevAccount } from "$lib/server/account-preview";
import { setDevAnnouncementPreference } from "$lib/server/dev-member-fixtures";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  const { account } = await requireDevAccount(locals, url, cookies);
  return { account };
};

export const actions: Actions = {
  setMailPref: async ({ request, locals, url, cookies }) => {
    const { role } = await requireDevAccount(locals, url, cookies);
    const parsed = validateMailPreferenceForm(await request.formData());
    if (!parsed.success) return fail(400, parsed.failure);

    const enabled = setDevAnnouncementPreference(role, parsed.data.enabled);
    if (enabled === null) return fail(409, { error: "CONFLICT" });
    return {
      success: true,
      operation: "mailPreferenceUpdated" as const,
      announcementsEnabled: enabled,
    };
  },
};
