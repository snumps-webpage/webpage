import { fail, redirect } from "@sveltejs/kit";
import { requireDevAccount } from "$lib/server/account-preview";
import { cancelDevMemberWithdrawal } from "$lib/server/dev-member-fixtures";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  const { account } = await requireDevAccount(locals, url, cookies, {
    allowWithdrawn: true,
  });
  if (account.status !== "withdrawn" || !account.withdrawal) {
    throw redirect(303, "/");
  }
  return { account, withdrawal: account.withdrawal };
};

export const actions: Actions = {
  cancelWithdrawal: async ({ locals, url, cookies }) => {
    const { role, account } = await requireDevAccount(locals, url, cookies, {
      allowWithdrawn: true,
    });
    if (account.status !== "withdrawn" || !account.withdrawal) {
      return fail(404, { error: "NOT_FOUND" });
    }
    if (!cancelDevMemberWithdrawal(role)) {
      return fail(404, { error: "NOT_FOUND" });
    }
    throw redirect(303, "/");
  },
};
