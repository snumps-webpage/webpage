import { redirect } from "@sveltejs/kit";
import { handleUserAction } from "$lib/server/auth-guards";
import { requestWithdrawal } from "$lib/server/services/withdrawal";
import type { PageServerLoad } from "./$types";

/** MEM-07: the withdrawal request page (triple confirmation). */
export const load: PageServerLoad = async ({ locals }) => {
  return { memberName: locals.member!.name };
};

export const actions = {
  requestWithdrawal: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    return handleUserAction(locals, async () => {
      const memberId = locals.member!.memberId;

      // The server verifies all three factors atomically — client steps are UX.
      await requestWithdrawal(memberId, {
        ackInfo: data.get("ackInfo") === "on",
        ackDataPolicy: data.get("ackDataPolicy") === "on",
        confirmName: (data.get("confirmName") as string) ?? "",
      });

      // Notification failure must not undo the withdrawal itself.
      const { notifyExecutivesOfWithdrawal } = await import(
        "$lib/server/mail/announcements"
      );
      const sent = await notifyExecutivesOfWithdrawal(locals.member!.name);
      if (!sent) console.error("[Withdrawal] executive notice failed");

      throw redirect(303, "/withdraw/pending");
    });
  },
};
