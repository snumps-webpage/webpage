import { handleUserAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import { currentTerm, TERM_PATTERN } from "$lib/server/core/semester";
import { getTable } from "$lib/server/data/tables";
import { studyRequestView } from "$lib/server/data/views";
import {
  submitStudyRequest,
  withdrawStudyRequest,
} from "$lib/server/services/studies";
import type { PageServerLoad } from "./$types";

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
  default: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleUserAction(locals, async () => {
      const title = (data.get("title") as string)?.trim();
      const semester = (data.get("semester") as string)?.trim();
      if (!title) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "분야명은 필수 입력 항목입니다.",
        });
      }
      if (!TERM_PATTERN.test(semester)) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "학기 형식이 올바르지 않습니다. 예: 26-2",
        });
      }

      await submitStudyRequest({
        title,
        textbook: (data.get("textbook") as string) ?? "",
        description: (data.get("description") as string) ?? "",
        semester,
        requesterId: locals.member!.memberId,
      });

      const { sendStudyApplicationNotification } = await import("$lib/server/mail");
      await sendStudyApplicationNotification(locals.member!.name, title);
      return {};
    });
  },

  withdraw: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const id = (await request.formData()).get("id") as string;
    return handleUserAction(locals, async () => {
      await withdrawStudyRequest(id, locals.member!.memberId);
      return {};
    });
  },
};
