import { fail, redirect } from "@sveltejs/kit";
import { isStudyClosed } from "$lib/domain/studies";
import { validateWithdrawalRequestForm } from "$lib/domain/account";
import { handleUserAction } from "$lib/server/auth-guards";
import { requestWithdrawal } from "$lib/server/services/withdrawal";
import { getTable } from "$lib/server/data/tables";
import type { PageServerLoad } from "./$types";
import { notifyExecutivesOfWithdrawal } from "$lib/server/mail/announcements";

/** MEM-07: the withdrawal request page (triple confirmation). */
export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.member!.memberId;
  // Mirrors the organizer check in flow_request_withdrawal so the UI can warn
  // upfront — including studies that list the member by their legacy id.
  const [studies, members] = await Promise.all([
    getTable("studies"),
    getTable("members"),
  ]);
  const legacyId = members.find((m) => m.id === memberId)?.legacyMemberId;
  const ids = new Set([memberId, ...(legacyId ? [legacyId] : [])]);
  const organizedStudies = studies
    .filter(
      (s) =>
        s.organizerIds.some((id) => ids.has(id)) && !isStudyClosed(s.status),
    )
    .map((s) => s.title);
  return { memberName: locals.member!.name, organizedStudies };
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

      // Every bad confirmation at once, per field; the service re-verifies
      // all three atomically — client steps are UX.
      const parsed = validateWithdrawalRequestForm(data, locals.member!.name);
      if (!parsed.success) return fail(400, parsed.failure);
      // A member who still organizes a study gets CONFLICT from the service.
      await requestWithdrawal(memberId, parsed.data);

      // Notification failure must not undo the withdrawal itself.
      const sent = await notifyExecutivesOfWithdrawal(locals.member!.name);
      if (!sent) console.error("[Withdrawal] executive notice failed");

      throw redirect(303, "/withdraw/pending");
    });
  },
};
