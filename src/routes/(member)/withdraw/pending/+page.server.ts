import { redirect } from "@sveltejs/kit";
import { handleUserAction } from "$lib/server/auth-guards";
import { cancelWithdrawal, getWithdrawalState } from "$lib/server/services/withdrawal";
import type { PageServerLoad } from "./$types";

/** MEM-07: the grace-period landing page — status, deletion date, cancel button. */
export const load: PageServerLoad = async ({ locals }) => {
  const state = await getWithdrawalState(locals.member!.memberId);
  if (!state) throw redirect(303, "/"); // not withdrawn (cancelled elsewhere)
  return { state, memberName: locals.member!.name };
};

export const actions = {
  cancelWithdrawal: async ({ locals }: { locals: App.Locals }) => {
    return handleUserAction(locals, async () => {
      await cancelWithdrawal(locals.member!.memberId);
      throw redirect(303, "/");
    });
  },
};
