import { fail } from "@sveltejs/kit";
import { handleUserAction } from "$lib/server/auth-guards";
import { currentTerm } from "$lib/server/core/semester";
import { validateStudyRequestForm } from "$lib/domain/studies";
import { getTable } from "$lib/server/data/tables";
import { studyRequestView } from "$lib/server/data/views";
import {
  submitStudyRequest,
  withdrawStudyRequest,
} from "$lib/server/services/studies";
import type { PageServerLoad } from "./$types";
import { sendStudyApplicationNotification } from "$lib/server/mail";

/** STU-01: study proposal — approval-gated (ADM-16). */
export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.member!.memberId;
  const requests = await getTable("study-requests");
  return {
    defaultSemester: currentTerm(),
    myRequests: requests
      .filter((r) => r.requesterId === memberId)
      .map(studyRequestView)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
  };
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
    return handleUserAction(locals, async () => {
      const parsed = validateStudyRequestForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const { title, textbook, description, semester } = parsed.data;

      await submitStudyRequest({
        title,
        textbook,
        description,
        semester,
        requesterId: locals.member!.memberId,
      });

      await sendStudyApplicationNotification(locals.member!.name, title);
      return {};
    });
  },

  withdraw: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const id = (await request.formData()).get("id") as string;
    return handleUserAction(locals, async () => {
      await withdrawStudyRequest(id, locals.member!.memberId);
      return {};
    });
  },
};
