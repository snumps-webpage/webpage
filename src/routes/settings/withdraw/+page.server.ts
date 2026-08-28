import { fail, redirect } from "@sveltejs/kit";
import { validateWithdrawalRequestForm } from "$lib/domain/account";
import { requireDevAccount } from "$lib/server/account-preview";
import { requestDevMemberWithdrawal } from "$lib/server/dev-member-fixtures";
import { getDevOrganizedStudyTitles } from "$lib/server/dev-study-fixtures";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  const { account } = await requireDevAccount(locals, url, cookies);
  return {
    account,
    organizedStudies: getDevOrganizedStudyTitles(account.memberId),
  };
};

export const actions: Actions = {
  requestWithdrawal: async ({ request, locals, url, cookies }) => {
    const { role, account } = await requireDevAccount(locals, url, cookies);
    const parsed = validateWithdrawalRequestForm(
      await request.formData(),
      account.name,
    );
    if (!parsed.success) return fail(400, parsed.failure);

    const organizedStudies = getDevOrganizedStudyTitles(account.memberId);
    if (organizedStudies.length > 0) {
      return fail(409, {
        error: "STUDY_ORGANIZER_CONFLICT",
        organizedStudies,
        values: parsed.data,
      });
    }

    if (!requestDevMemberWithdrawal(role)) {
      return fail(409, { error: "CONFLICT", values: parsed.data });
    }
    throw redirect(303, "/withdraw/pending");
  },
};
